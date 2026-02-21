pub mod border_state;
pub mod calendar;
pub mod settings;
pub mod tick;
pub mod tray;
pub mod window_manager;

use std::sync::{Arc, Mutex};
use tauri::{Emitter, Listener, Manager, RunEvent};
use tauri_plugin_sql::{Migration, MigrationKind};

use calendar::aggregator::CalendarAggregator;
#[cfg(target_os = "macos")]
use calendar::apple::AppleCalendarProvider;
use calendar::google::GoogleCalendarProvider;
use calendar::microsoft::MicrosoftCalendarProvider;
use calendar::poller::CalendarPoller;
use calendar::provider::CalendarProvider;

use border_state::BorderState;

#[cfg(target_os = "macos")]
use window_manager::macos::MacOSOverlayManager;
#[cfg(target_os = "macos")]
use window_manager::OverlayManager;

/// Default border thickness in logical pixels (maps to "medium").
const DEFAULT_THICKNESS: f64 = 16.0;

/// Convert a thickness setting name to logical pixels.
fn thickness_to_px(name: &str) -> f64 {
    match name {
        "thin" => 8.0,
        "medium" => 16.0,
        "thick" => 28.0,
        _ => DEFAULT_THICKNESS,
    }
}

/// Tracks when the border overlay is paused until.
#[derive(Debug, Clone, serde::Serialize)]
pub struct PauseState {
    /// If `Some`, the border is paused until this time. If `None`, the border is active.
    pub paused_until: Option<chrono::DateTime<chrono::Utc>>,
}

impl Default for PauseState {
    fn default() -> Self {
        Self { paused_until: None }
    }
}

/// Timer state emitted to the overlay as `timer-state-update`.
/// Matches the TypeScript `TimerState` interface exactly.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerState {
    pub status: String,
    pub duration_seconds: u32,
    pub started_at: Option<String>,
    pub paused_at: Option<String>,
    pub elapsed_before_pause: f64,
}

impl Default for TimerState {
    fn default() -> Self {
        Self {
            status: "idle".to_string(),
            duration_seconds: 0,
            started_at: None,
            paused_at: None,
            elapsed_before_pause: 0.0,
        }
    }
}

/// Manually emit a border state update. Useful for testing and debugging.
/// Updates the shared state so the tick emitter picks up the change.
#[tauri::command]
fn emit_border_state(app: tauri::AppHandle, state: BorderState) -> Result<(), String> {
    // Update the shared state so the tick emitter will continue emitting this state
    let managed = app.state::<Mutex<BorderState>>();
    {
        let mut current = managed.lock().map_err(|e| e.to_string())?;
        *current = state.clone();
    }
    app.emit("border-state-update", &state)
        .map_err(|e| e.to_string())
}

/// Connect a calendar provider by name ("google", "microsoft", or "apple").
/// Runs the provider's authenticate flow and adds it to the aggregator.
#[tauri::command]
async fn connect_provider(app: tauri::AppHandle, provider: String) -> Result<(), String> {
    let aggregator = app.state::<Arc<tokio::sync::Mutex<CalendarAggregator>>>();

    let account_name = match provider.as_str() {
        "google" => {
            let mut p = GoogleCalendarProvider::new();
            p.authenticate().await.map_err(|e| e.to_string())?;
            let name = p.account_name().to_string();
            let mut agg = aggregator.lock().await;
            agg.add_provider(Box::new(p));
            name
        }
        "microsoft" => {
            let mut p = MicrosoftCalendarProvider::new();
            p.authenticate().await.map_err(|e| e.to_string())?;
            let name = p.account_name().to_string();
            let mut agg = aggregator.lock().await;
            agg.add_provider(Box::new(p));
            name
        }
        #[cfg(target_os = "macos")]
        "apple" => {
            let mut p = AppleCalendarProvider::new("Apple Calendar");
            p.authenticate().await.map_err(|e| e.to_string())?;
            let name = p.account_name().to_string();
            let mut agg = aggregator.lock().await;
            agg.add_provider(Box::new(p));
            name
        }
        other => return Err(format!("unknown provider: {other}")),
    };

    let _ = app.emit(
        "provider-status-update",
        ProviderStatusPayload {
            provider,
            status: ProviderStatusInner {
                connected: true,
                account_name: Some(account_name),
                error: None,
            },
        },
    );

    Ok(())
}

/// Disconnect a calendar provider. Removes it from the aggregator and clears
/// stored keyring tokens for Google/Microsoft.
#[tauri::command]
async fn disconnect_provider(app: tauri::AppHandle, provider: String) -> Result<(), String> {
    let aggregator = app.state::<Arc<tokio::sync::Mutex<CalendarAggregator>>>();
    let mut agg = aggregator.lock().await;

    match provider.as_str() {
        "google" => {
            // Remove any provider whose id starts with "google-"
            agg.remove_providers_by_prefix("google-");
            // Clear keyring tokens (best-effort)
            clear_keyring_entries("com.lighttime.google-oauth");
        }
        "microsoft" => {
            // Remove any provider whose id starts with "microsoft-" or is an email
            agg.remove_providers_by_prefix("microsoft-");
            // Also remove by type since MS provider_id can be the email itself
            agg.remove_providers_by_type(calendar::types::ProviderType::Microsoft);
            clear_keyring_entries("com.lighttime.microsoft-oauth");
        }
        #[cfg(target_os = "macos")]
        "apple" => {
            agg.remove_provider("apple-calendar");
        }
        other => return Err(format!("unknown provider: {other}")),
    }

    let _ = app.emit(
        "provider-status-update",
        ProviderStatusPayload {
            provider,
            status: ProviderStatusInner {
                connected: false,
                account_name: None,
                error: None,
            },
        },
    );

    Ok(())
}

/// Return the current connection status of all providers.
#[tauri::command]
async fn get_provider_statuses(
    app: tauri::AppHandle,
) -> Result<Vec<ProviderStatusPayload>, String> {
    let aggregator = app.state::<Arc<tokio::sync::Mutex<CalendarAggregator>>>();
    let agg = aggregator.lock().await;

    let statuses = agg
        .connected_providers()
        .into_iter()
        .map(|(ptype, name)| {
            let provider = match ptype {
                calendar::types::ProviderType::Google => "google",
                calendar::types::ProviderType::Microsoft => "microsoft",
                calendar::types::ProviderType::Apple => "apple",
            };
            ProviderStatusPayload {
                provider: provider.to_string(),
                status: ProviderStatusInner {
                    connected: true,
                    account_name: Some(name),
                    error: None,
                },
            }
        })
        .collect();

    Ok(statuses)
}

/// Trigger an immediate calendar sync by fetching events from the aggregator
/// and emitting the result.
#[tauri::command]
async fn force_sync(app: tauri::AppHandle) -> Result<(), String> {
    let aggregator = app.state::<Arc<tokio::sync::Mutex<CalendarAggregator>>>();
    let agg = aggregator.lock().await;

    let from = chrono::Utc::now();
    let to = from + chrono::Duration::hours(24);
    let result = agg.fetch_events(from, to).await;

    if !result.errors.is_empty() {
        for (provider_id, err) in &result.errors {
            eprintln!("[force_sync] Provider {provider_id} error: {err}");
        }
    }

    app.emit("calendar-events-update", &result.events)
        .map_err(|e| e.to_string())
}

/// Pause the border overlay for a given number of minutes.
/// - `duration_minutes > 0`: pause for that many minutes
/// - `duration_minutes == 0`: resume immediately (unpause)
#[tauri::command]
fn pause_border(
    app: tauri::AppHandle,
    duration_minutes: i32,
) -> Result<(), String> {
    let managed = app.state::<Mutex<PauseState>>();
    let mut state = managed.lock().map_err(|e| e.to_string())?;

    if duration_minutes <= 0 {
        // Resume: clear the pause
        state.paused_until = None;
    } else {
        state.paused_until =
            Some(chrono::Utc::now() + chrono::Duration::minutes(duration_minutes as i64));
    }

    // Emit the minutes value so the overlay can compute expiry locally.
    // A value of 0 means "resume".
    app.emit("border-paused", serde_json::json!({ "minutes": duration_minutes }))
        .map_err(|e| e.to_string())
}

/// Return the list of connected monitors/displays.
#[tauri::command]
fn get_available_monitors() -> Vec<window_manager::MonitorInfo> {
    #[cfg(target_os = "macos")]
    {
        window_manager::macos::MacOSOverlayManager::get_available_monitors()
    }
    #[cfg(target_os = "windows")]
    {
        window_manager::windows::WindowsOverlayManager::get_available_monitors()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        vec![]
    }
}

/// Best-effort cleanup of keyring entries for a given service.
fn clear_keyring_entries(service: &str) {
    for key in &["refresh_token", "access_token", "token_expiry", "account_email"] {
        if let Ok(entry) = keyring::Entry::new(service, key) {
            let _ = entry.delete_credential();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create initial schema",
        sql: include_str!("../migrations/001_initial_schema.sql"),
        kind: MigrationKind::Up,
    }];

    let aggregator = Arc::new(tokio::sync::Mutex::new(CalendarAggregator::new()));

    tauri::Builder::default()
        .manage(Mutex::new(BorderState::default()))
        .manage(Mutex::new(PauseState::default()))
        .manage(Mutex::new(TimerState::default()))
        .manage(aggregator.clone())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:lighttime.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            settings::get_setting,
            settings::set_setting,
            settings::get_all_settings,
            emit_border_state,
            connect_provider,
            disconnect_provider,
            get_provider_statuses,
            force_sync,
            pause_border,
            get_available_monitors,
        ])
        .setup(|app| {
            // Border overlay windows are declared in tauri.conf.json.
            // Show them first so the webview loads and JS initializes,
            // then apply macOS NSWindow config after a delay.
            // (Applying NSWindow config before webview load kills JS execution.)
            #[cfg(target_os = "macos")]
            {
                // Show windows immediately so webview can load
                for label in ["border-top", "border-bottom", "border-left", "border-right"] {
                    if let Some(w) = app.get_webview_window(label) {
                        if let Err(e) = w.show() {
                            eprintln!("Failed to show '{label}': {e}");
                        }
                    }
                }

                // Apply NSWindow overlay config after webview has loaded
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    // Give webviews time to load HTML and initialize JS
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;

                    // Read saved thickness and selected display from settings
                    let (thickness, selected_display) = {
                        let db = handle.state::<tauri_plugin_sql::DbInstances>();
                        let instances = db.0.read().await;
                        if let Some(tauri_plugin_sql::DbPool::Sqlite(pool)) = instances.get("sqlite:lighttime.db") {
                            let t = sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = 'border_thickness'")
                                .fetch_optional(pool)
                                .await
                                .ok()
                                .flatten()
                                .map(|v| thickness_to_px(&v))
                                .unwrap_or(DEFAULT_THICKNESS);
                            let d = sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = 'selected_display'")
                                .fetch_optional(pool)
                                .await
                                .ok()
                                .flatten()
                                .unwrap_or_else(|| "primary".to_string());
                            (t, d)
                        } else {
                            (DEFAULT_THICKNESS, "primary".to_string())
                        }
                    };

                    // NSWindow ops must run on the main thread
                    let handle2 = handle.clone();
                    let _ = handle.run_on_main_thread(move || {
                        let mut overlay_mgr = MacOSOverlayManager::new();
                        if let Err(e) = overlay_mgr.create_overlay_windows(&handle2) {
                            eprintln!("Failed to configure macOS overlay: {e}");
                        } else {
                            overlay_mgr.set_target_monitor(&selected_display);
                            overlay_mgr.set_thickness(thickness);
                            // Don't call show() again — windows are already visible
                        }
                    });
                });
            }

            // Set up system tray / menu bar icon
            if let Err(e) = tray::setup_tray(app) {
                eprintln!("Failed to set up system tray: {e}");
            }

            // Start the calendar polling service
            let agg = app.state::<Arc<tokio::sync::Mutex<CalendarAggregator>>>();
            CalendarPoller::start(app.handle().clone(), agg.inner().clone());

            // Listen for frontend events and forward to commands.
            // The Settings UI currently uses emit() rather than invoke().
            setup_event_listeners(app);

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            // Prevent the app from exiting when all windows are hidden/closed.
            // The system tray keeps the app alive.
            if let RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}

/// Event payload for connect/disconnect-provider events from the frontend.
#[derive(Debug, Clone, serde::Deserialize)]
struct ProviderPayload {
    provider: String,
}

/// Event payload emitted back to the frontend as `provider-status-update`.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderStatusPayload {
    provider: String,
    status: ProviderStatusInner,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderStatusInner {
    connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    account_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// Event payload for pause-border events from the frontend.
#[derive(Debug, Clone, serde::Deserialize)]
struct PausePayload {
    minutes: i32,
}

/// Register event listeners that bridge frontend `emit()` calls to command logic.
fn setup_event_listeners(app: &tauri::App) {
    // connect-provider
    let handle = app.handle().clone();
    app.listen("connect-provider", move |event| {
        if let Ok(payload) = serde_json::from_str::<ProviderPayload>(event.payload()) {
            let h = handle.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = connect_provider(h.clone(), payload.provider.clone()).await {
                    eprintln!("[event] connect-provider error: {e}");
                    let _ = h.emit(
                        "provider-status-update",
                        ProviderStatusPayload {
                            provider: payload.provider,
                            status: ProviderStatusInner {
                                connected: false,
                                account_name: None,
                                error: Some(e),
                            },
                        },
                    );
                }
            });
        }
    });

    // disconnect-provider
    let handle = app.handle().clone();
    app.listen("disconnect-provider", move |event| {
        if let Ok(payload) = serde_json::from_str::<ProviderPayload>(event.payload()) {
            let h = handle.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = disconnect_provider(h.clone(), payload.provider.clone()).await {
                    eprintln!("[event] disconnect-provider error: {e}");
                    let _ = h.emit(
                        "provider-status-update",
                        ProviderStatusPayload {
                            provider: payload.provider,
                            status: ProviderStatusInner {
                                connected: true,
                                account_name: None,
                                error: Some(e),
                            },
                        },
                    );
                }
            });
        }
    });

    // force-sync
    let handle = app.handle().clone();
    app.listen("force-sync", move |_event| {
        let h = handle.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(e) = force_sync(h).await {
                eprintln!("[event] force-sync error: {e}");
            }
        });
    });

    // pause-border
    let handle = app.handle().clone();
    app.listen("pause-border", move |event| {
        if let Ok(payload) = serde_json::from_str::<PausePayload>(event.payload()) {
            if let Err(e) = pause_border(handle.clone(), payload.minutes) {
                eprintln!("[event] pause-border error: {e}");
            }
        }
    });

    // start-timer: tray menu emits "start-timer" with seconds as payload.
    // Convert to a TimerState and emit "timer-state-update" for the overlay.
    let handle = app.handle().clone();
    app.listen("start-timer", move |event| {
        if let Ok(seconds) = event.payload().parse::<u32>() {
            let now = chrono::Utc::now().to_rfc3339();
            let new_state = TimerState {
                status: "running".to_string(),
                duration_seconds: seconds,
                started_at: Some(now),
                paused_at: None,
                elapsed_before_pause: 0.0,
            };

            // Store in managed state
            let managed = handle.state::<Mutex<TimerState>>();
            if let Ok(mut state) = managed.lock() {
                *state = new_state.clone();
            }

            // Notify overlay
            let _ = handle.emit("timer-state-update", &new_state);
        }
    });

    // stop-timer: frontend or settings UI can stop the active timer
    let handle = app.handle().clone();
    app.listen("stop-timer", move |_event| {
        let new_state = TimerState::default();

        let managed = handle.state::<Mutex<TimerState>>();
        if let Ok(mut state) = managed.lock() {
            *state = new_state.clone();
        }

        let _ = handle.emit("timer-state-update", &new_state);
    });

    // settings-changed: handle border_thickness and selected_display changes
    #[cfg(target_os = "macos")]
    {
        let handle = app.handle().clone();
        app.listen("settings-changed", move |event| {
            #[derive(serde::Deserialize)]
            struct SettingChanged {
                key: String,
                #[allow(dead_code)]
                value: String,
            }
            if let Ok(payload) = serde_json::from_str::<SettingChanged>(event.payload()) {
                if payload.key == "border_thickness" || payload.key == "selected_display" {
                    // Re-read both values from DB and reposition
                    let h = handle.clone();
                    tauri::async_runtime::spawn(async move {
                        let (thickness, selected_display) = {
                            let db = h.state::<tauri_plugin_sql::DbInstances>();
                            let instances = db.0.read().await;
                            if let Some(tauri_plugin_sql::DbPool::Sqlite(pool)) = instances.get("sqlite:lighttime.db") {
                                let t = sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = 'border_thickness'")
                                    .fetch_optional(pool)
                                    .await
                                    .ok()
                                    .flatten()
                                    .map(|v| thickness_to_px(&v))
                                    .unwrap_or(DEFAULT_THICKNESS);
                                let d = sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = 'selected_display'")
                                    .fetch_optional(pool)
                                    .await
                                    .ok()
                                    .flatten()
                                    .unwrap_or_else(|| "primary".to_string());
                                (t, d)
                            } else {
                                (DEFAULT_THICKNESS, "primary".to_string())
                            }
                        };

                        let h2 = h.clone();
                        let _ = h.run_on_main_thread(move || {
                            let mut mgr = MacOSOverlayManager::new();
                            if mgr.create_overlay_windows(&h2).is_ok() {
                                mgr.set_target_monitor(&selected_display);
                                mgr.set_thickness(thickness);
                            }
                        });
                    });
                }
            }
        });
    }
}
