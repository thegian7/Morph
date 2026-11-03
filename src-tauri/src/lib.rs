pub mod border_state;
pub mod calendar;
pub mod settings;
pub mod tray;
pub mod window_manager;

use sqlx::Row;
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

/// Default border thickness in logical pixels (maps to "medium").
#[cfg(target_os = "macos")]
const DEFAULT_THICKNESS: f64 = 16.0;

/// Convert a thickness setting name to logical pixels.
#[cfg(target_os = "macos")]
fn thickness_to_px(name: &str) -> f64 {
    match name {
        "thin" => 8.0,
        "medium" => 16.0,
        "thick" => 28.0,
        _ => DEFAULT_THICKNESS,
    }
}

/// Tracks when the border overlay is paused until.
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct PauseState {
    /// If `Some`, the border is paused until this time. If `None`, the border is active.
    pub paused_until: Option<chrono::DateTime<chrono::Utc>>,
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
            {
                let mut agg = aggregator.lock().await;
                agg.add_provider(Box::new(p));
            }
            save_provider_to_db(&app, "google", &name).await;
            name
        }
        "microsoft" => {
            let mut p = MicrosoftCalendarProvider::new();
            p.authenticate().await.map_err(|e| e.to_string())?;
            let name = p.account_name().to_string();
            {
                let mut agg = aggregator.lock().await;
                agg.add_provider(Box::new(p));
            }
            save_provider_to_db(&app, "microsoft", &name).await;
            name
        }
        #[cfg(target_os = "macos")]
        "apple" => {
            let mut p = AppleCalendarProvider::new("Apple Calendar");
            p.authenticate().await.map_err(|e| e.to_string())?;
            let name = p.account_name().to_string();
            {
                let mut agg = aggregator.lock().await;
                agg.add_provider(Box::new(p));
            }
            save_provider_to_db(&app, "apple", &name).await;
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

    match provider.as_str() {
        "google" => {
            {
                let mut agg = aggregator.lock().await;
                agg.remove_providers_by_prefix("google-");
            }
            clear_keyring_entries("com.morph.google-oauth");
            remove_provider_from_db(&app, "google").await;
        }
        "microsoft" => {
            {
                let mut agg = aggregator.lock().await;
                agg.remove_providers_by_prefix("microsoft-");
                agg.remove_providers_by_type(calendar::types::ProviderType::Microsoft);
            }
            clear_keyring_entries("com.morph.microsoft-oauth");
            remove_provider_from_db(&app, "microsoft").await;
        }
        #[cfg(target_os = "macos")]
        "apple" => {
            {
                let mut agg = aggregator.lock().await;
                agg.remove_provider("apple-calendar");
            }
            remove_provider_from_db(&app, "apple").await;
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

/// Return the list of calendars for the connected Google provider.
#[tauri::command]
async fn get_calendar_list(
    app: tauri::AppHandle,
) -> Result<Vec<calendar::google::CalendarInfo>, String> {
    let aggregator = app.state::<Arc<tokio::sync::Mutex<CalendarAggregator>>>();
    let agg = aggregator.lock().await;

    // Try to get the Google provider and fetch its calendar list
    match agg.google_provider() {
        Some(provider) => provider
            .fetch_calendar_list()
            .await
            .map_err(|e| e.to_string()),
        None => Ok(vec![]),
    }
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
/// - `duration_minutes < 0`: pause until the next calendar event begins.
///   The expiry is event-driven, so the overlay owns it; `paused_until`
///   stays `None` here.
#[tauri::command]
fn pause_border(app: tauri::AppHandle, duration_minutes: i32) -> Result<(), String> {
    let managed = app.state::<Mutex<PauseState>>();
    let mut state = managed.lock().map_err(|e| e.to_string())?;

    if duration_minutes > 0 {
        state.paused_until =
            Some(chrono::Utc::now() + chrono::Duration::minutes(duration_minutes as i64));
    } else {
        state.paused_until = None;
    }

    // Emit the minutes value so the overlay can compute expiry locally.
    // A value of 0 means "resume".
    app.emit(
        "border-paused",
        serde_json::json!({ "minutes": duration_minutes }),
    )
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
    for key in &[
        "refresh_token",
        "access_token",
        "token_expiry",
        "account_email",
    ] {
        if let Ok(entry) = keyring::Entry::new(service, key) {
            let _ = entry.delete_credential();
        }
    }
}

/// Save a connected provider record to the database so it survives app restarts.
async fn save_provider_to_db(app: &tauri::AppHandle, provider_type: &str, account_name: &str) {
    let db = app.state::<tauri_plugin_sql::DbInstances>();
    let instances = db.0.read().await;
    if let Some(tauri_plugin_sql::DbPool::Sqlite(pool)) = instances.get("sqlite:morph.db") {
        let id = format!("{provider_type}-{account_name}");
        if let Err(e) = sqlx::query(
            "INSERT OR REPLACE INTO calendar_providers (id, provider_type, account_name, connected_at, status)
             VALUES (?1, ?2, ?3, datetime('now'), 'connected')",
        )
        .bind(&id)
        .bind(provider_type)
        .bind(account_name)
        .execute(pool)
        .await
        {
            eprintln!("[providers] Failed to save provider to DB: {e}");
        }
    }
}

/// Remove provider records of a given type from the database.
async fn remove_provider_from_db(app: &tauri::AppHandle, provider_type: &str) {
    let db = app.state::<tauri_plugin_sql::DbInstances>();
    let instances = db.0.read().await;
    if let Some(tauri_plugin_sql::DbPool::Sqlite(pool)) = instances.get("sqlite:morph.db") {
        if let Err(e) = sqlx::query("DELETE FROM calendar_providers WHERE provider_type = ?1")
            .bind(provider_type)
            .execute(pool)
            .await
        {
            eprintln!("[providers] Failed to remove provider from DB: {e}");
        }
    }
}

/// Restore previously-connected calendar providers from the database on startup.
/// Loads stored tokens from the OS keyring and adds providers to the aggregator.
async fn restore_providers(
    app: &tauri::AppHandle,
    aggregator: &Arc<tokio::sync::Mutex<CalendarAggregator>>,
) {
    let rows = {
        let db = app.state::<tauri_plugin_sql::DbInstances>();
        let instances = db.0.read().await;
        let pool = match instances.get("sqlite:morph.db") {
            Some(tauri_plugin_sql::DbPool::Sqlite(pool)) => pool.clone(),
            _ => return,
        };
        drop(instances);
        match sqlx::query(
            "SELECT provider_type, account_name FROM calendar_providers WHERE status = 'connected'",
        )
        .fetch_all(&pool)
        .await
        {
            Ok(rows) => rows,
            Err(e) => {
                eprintln!("[restore] Failed to load saved providers: {e}");
                return;
            }
        }
    };

    if rows.is_empty() {
        return;
    }

    let mut agg = aggregator.lock().await;
    for row in &rows {
        let provider_type: String = row.get("provider_type");
        let account_name: String = row.get("account_name");

        match provider_type.as_str() {
            "google" => match GoogleCalendarProvider::try_restore_session(&account_name) {
                Ok(Some(provider)) => {
                    eprintln!("[restore] Restored Google provider: {account_name}");
                    agg.add_provider(Box::new(provider));
                }
                Ok(None) => {
                    eprintln!("[restore] No stored tokens for Google: {account_name}");
                }
                Err(e) => {
                    eprintln!("[restore] Failed to restore Google {account_name}: {e}");
                }
            },
            "microsoft" => {
                let mut p = MicrosoftCalendarProvider::new();
                if let Err(e) = p.load_stored_tokens() {
                    eprintln!("[restore] Failed to load Microsoft tokens: {e}");
                    continue;
                }
                if p.has_refresh_token() {
                    eprintln!("[restore] Restored Microsoft provider: {account_name}");
                    agg.add_provider(Box::new(p));
                } else {
                    eprintln!("[restore] No stored tokens for Microsoft: {account_name}");
                }
            }
            #[cfg(target_os = "macos")]
            "apple" => {
                let p = AppleCalendarProvider::new(&account_name);
                eprintln!("[restore] Restored Apple Calendar provider");
                agg.add_provider(Box::new(p));
            }
            _ => {
                eprintln!("[restore] Unknown provider type: {provider_type}");
            }
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
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:morph.db", migrations)
                .build(),
        )
        .on_page_load(|webview, payload| {
            #[cfg(target_os = "macos")]
            if webview.label() == window_manager::macos::ENGINE_LABEL
                && matches!(payload.event(), tauri::webview::PageLoadEvent::Finished)
            {
                let handle = webview.app_handle().clone();
                let h = handle.clone();
                let _ = handle.run_on_main_thread(move || {
                    window_manager::macos::engine_loaded(&h);
                });
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (webview, payload);
        })
        .invoke_handler(tauri::generate_handler![
            settings::get_setting,
            settings::set_setting,
            settings::get_all_settings,
            emit_border_state,
            connect_provider,
            disconnect_provider,
            get_provider_statuses,
            get_calendar_list,
            force_sync,
            pause_border,
            get_available_monitors,
            accessibility_status,
            request_accessibility,
            get_display_prefs,
            uses_native_border,
        ])
        .setup(|app| {
            // Menu-bar (agent) app: no Dock icon, and its windows may join
            // other apps' fullscreen Spaces. The bundle's Info.plist sets
            // LSUIElement too; setting it here makes `tauri dev` and the bare
            // binary behave the same as the shipped app.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // macOS draws the border natively (window_manager::macos_render).
            // Of the four border webviews declared in tauri.conf.json only
            // `border-top` is kept, to run the color engine; the other three
            // are destroyed. No startup delay: the native windows don't
            // depend on any webview, and the engine window is configured
            // from on_page_load once its page has loaded.
            #[cfg(target_os = "macos")]
            {
                for label in ["border-bottom", "border-left", "border-right"] {
                    if let Some(w) = app.get_webview_window(label) {
                        if let Err(e) = w.destroy() {
                            eprintln!("Failed to destroy '{label}': {e}");
                        }
                    }
                }
                if let Some(w) = app.get_webview_window(window_manager::macos::ENGINE_LABEL) {
                    if let Err(e) = w.show() {
                        eprintln!("Failed to show color engine window: {e}");
                    }
                }

                // The engine's computed look → native renderer.
                let render_handle = app.handle().clone();
                app.listen("border-render", move |event| {
                    #[derive(serde::Deserialize)]
                    #[serde(rename_all = "camelCase")]
                    struct Render {
                        color: String,
                        opacity: f64,
                        pulse_speed: f64,
                    }
                    let Ok(r) = serde_json::from_str::<Render>(event.payload()) else {
                        return;
                    };
                    let Some(state) = window_manager::macos_render::RenderState::from_payload(
                        &r.color,
                        r.opacity,
                        r.pulse_speed,
                    ) else {
                        return;
                    };
                    let _ = render_handle.run_on_main_thread(move || {
                        // SAFETY: run_on_main_thread.
                        let mtm = unsafe { objc2_foundation::MainThreadMarker::new_unchecked() };
                        window_manager::macos_render::set_state(mtm, state);
                    });
                });

                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    relayout_borders(&handle).await;

                    // Follow the Dock and menu bar: when they move, resize or
                    // auto-hide, the usable area changes and the border must too.
                    let mut tick = tokio::time::interval(std::time::Duration::from_secs(2));
                    loop {
                        tick.tick().await;
                        let h = handle.clone();
                        let _ = handle.run_on_main_thread(move || {
                            window_manager::macos::refresh_if_geometry_changed(&h);
                        });
                    }
                });
            }

            // Set up system tray / menu bar icon
            if let Err(e) = tray::setup_tray(app) {
                eprintln!("Failed to set up system tray: {e}");
            }

            // Restore previously connected calendar providers from the database.
            // Spawned before the poller so providers are available by the first poll cycle.
            let agg = app.state::<Arc<tokio::sync::Mutex<CalendarAggregator>>>();
            let restore_handle = app.handle().clone();
            let restore_agg = agg.inner().clone();
            tauri::async_runtime::spawn(async move {
                restore_providers(&restore_handle, &restore_agg).await;
            });

            // Start the calendar polling service
            CalendarPoller::start(app.handle().clone(), agg.inner().clone());

            // Listen for frontend events and forward to commands.
            // The Settings UI currently uses emit() rather than invoke().
            setup_event_listeners(app);

            // Seed default settings (INSERT OR IGNORE) then check onboarding state.
            let onboarding_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Seed defaults so new settings (like onboarding_complete) exist
                // even if the migration SQL didn't include them.
                {
                    let db = onboarding_handle.state::<tauri_plugin_sql::DbInstances>();
                    let instances = db.0.read().await;
                    if let Some(tauri_plugin_sql::DbPool::Sqlite(pool)) =
                        instances.get("sqlite:morph.db")
                    {
                        if let Err(e) = settings::seed_defaults_from_pool(pool).await {
                            eprintln!("[startup] Failed to seed defaults: {e}");
                        }
                    }
                }

                let show_onboarding = {
                    let db = onboarding_handle.state::<tauri_plugin_sql::DbInstances>();
                    let instances = db.0.read().await;
                    if let Some(tauri_plugin_sql::DbPool::Sqlite(pool)) =
                        instances.get("sqlite:morph.db")
                    {
                        let val = sqlx::query_scalar::<_, String>(
                            "SELECT value FROM settings WHERE key = 'onboarding_complete'",
                        )
                        .fetch_optional(pool)
                        .await
                        .ok()
                        .flatten()
                        .unwrap_or_else(|| "false".to_string());
                        val != "true"
                    } else {
                        false
                    }
                };

                if show_onboarding {
                    let inner_handle = onboarding_handle.clone();
                    let _ = onboarding_handle.run_on_main_thread(move || {
                        let window = match inner_handle.get_webview_window("settings") {
                            Some(w) => w,
                            None => {
                                match tauri::WebviewWindowBuilder::new(
                                    &inner_handle,
                                    "settings",
                                    tauri::WebviewUrl::App("src/settings/index.html".into()),
                                )
                                .title("Morph Settings")
                                .inner_size(680.0, 560.0)
                                .decorations(true)
                                .resizable(true)
                                .build()
                                {
                                    Ok(w) => w,
                                    Err(e) => {
                                        eprintln!(
                                            "[onboarding] Failed to create settings window: {e}"
                                        );
                                        return;
                                    }
                                }
                            }
                        };
                        let _ = window.show();
                        let _ = window.set_focus();
                    });
                }
            });

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

    // pause-timer: pause the active timer
    let handle = app.handle().clone();
    app.listen("pause-timer", move |_event| {
        if let Ok(mut state) = handle.state::<Mutex<TimerState>>().lock() {
            if state.status == "running" {
                state.status = "paused".to_string();
                state.paused_at = Some(chrono::Utc::now().to_rfc3339());
                let _ = handle.emit("timer-state-update", &*state);
            }
        }
    });

    // resume-timer: resume a paused timer
    let handle = app.handle().clone();
    app.listen("resume-timer", move |_event| {
        if let Ok(mut state) = handle.state::<Mutex<TimerState>>().lock() {
            if state.status == "paused" {
                if let Some(paused_at_str) = &state.paused_at {
                    if let Ok(paused_at) = chrono::DateTime::parse_from_rfc3339(paused_at_str) {
                        let pause_elapsed =
                            (chrono::Utc::now() - paused_at.to_utc()).num_seconds() as f64;
                        state.elapsed_before_pause += pause_elapsed;
                    }
                }
                state.status = "running".to_string();
                state.started_at = Some(chrono::Utc::now().to_rfc3339());
                state.paused_at = None;
                let _ = handle.emit("timer-state-update", &*state);
            }
        }
    });

    // settings-changed: re-lay out the border when geometry-affecting settings change
    #[cfg(target_os = "macos")]
    {
        let handle = app.handle().clone();
        app.listen("settings-changed", move |event| {
            #[derive(serde::Deserialize)]
            struct SettingChanged {
                key: String,
            }
            if let Ok(payload) = serde_json::from_str::<SettingChanged>(event.payload()) {
                if matches!(
                    payload.key.as_str(),
                    "border_thickness" | "selected_display" | "border_mode" | "border_position"
                ) {
                    let h = handle.clone();
                    tauri::async_runtime::spawn(async move {
                        relayout_borders(&h).await;
                    });
                }
            }
        });
    }
}

/// Read the layout-affecting settings from the database.
#[cfg(target_os = "macos")]
async fn read_layout_config(handle: &tauri::AppHandle) -> window_manager::macos::LayoutConfig {
    use window_manager::layout::{BorderMode, Edges};

    let db = handle.state::<tauri_plugin_sql::DbInstances>();
    let instances = db.0.read().await;
    let pool = match instances.get("sqlite:morph.db") {
        Some(tauri_plugin_sql::DbPool::Sqlite(pool)) => Some(pool),
        _ => None,
    };
    let get = |key: &'static str| async move {
        match pool {
            Some(pool) => {
                sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?1")
                    .bind(key)
                    .fetch_optional(pool)
                    .await
                    .ok()
                    .flatten()
            }
            None => None,
        }
    };

    window_manager::macos::LayoutConfig {
        mode: BorderMode::from_setting(&get("border_mode").await.unwrap_or_default()),
        edges: Edges::from_position(&get("border_position").await.unwrap_or_default()),
        thickness: get("border_thickness")
            .await
            .map(|v| thickness_to_px(&v))
            .unwrap_or(DEFAULT_THICKNESS),
        monitor_id: get("selected_display")
            .await
            .unwrap_or_else(|| "primary".to_string()),
    }
}

/// Re-read layout settings and re-apply the border layout on the main thread
/// (NSWindow operations must run there).
#[cfg(target_os = "macos")]
async fn relayout_borders(handle: &tauri::AppHandle) {
    let config = read_layout_config(handle).await;
    let h = handle.clone();
    let _ = handle.run_on_main_thread(move || {
        window_manager::macos::configure_and_apply(&h, &config);
    });
}

/// Current system display preferences (Reduce Motion, Reduce Transparency,
/// Increase Contrast, dark appearance). Sync command: runs on the main thread.
#[tauri::command]
fn get_display_prefs() -> window_manager::DisplayPrefs {
    #[cfg(target_os = "macos")]
    {
        // SAFETY: synchronous Tauri commands run on the main thread.
        let mtm = unsafe { objc2_foundation::MainThreadMarker::new_unchecked() };
        window_manager::macos::display_prefs(mtm)
    }
    #[cfg(not(target_os = "macos"))]
    {
        window_manager::DisplayPrefs::default()
    }
}

/// Whether the border is drawn natively (macOS). When true the overlay
/// webview only runs the color engine and emits `border-render`.
#[tauri::command]
fn uses_native_border() -> bool {
    cfg!(target_os = "macos")
}

/// Whether the app has macOS Accessibility access (needed by "Reserve space").
#[tauri::command]
fn accessibility_status() -> bool {
    #[cfg(target_os = "macos")]
    {
        window_manager::macos_reserve::is_trusted()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// Prompt for Accessibility access and open the matching System Settings pane.
#[tauri::command]
fn request_accessibility() -> bool {
    #[cfg(target_os = "macos")]
    {
        let trusted = window_manager::macos_reserve::request_trust();
        if !trusted {
            let _ = open::that(
                "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
            );
        }
        trusted
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_timer_state_default_is_idle() {
        let state = TimerState::default();
        assert_eq!(state.status, "idle");
        assert_eq!(state.duration_seconds, 0);
        assert!(state.started_at.is_none());
        assert!(state.paused_at.is_none());
        assert_eq!(state.elapsed_before_pause, 0.0);
    }

    #[test]
    fn test_timer_pause_sets_status() {
        let mut state = TimerState {
            status: "running".to_string(),
            started_at: Some(chrono::Utc::now().to_rfc3339()),
            ..Default::default()
        };
        // Simulate pause
        state.status = "paused".to_string();
        state.paused_at = Some(chrono::Utc::now().to_rfc3339());
        assert_eq!(state.status, "paused");
        assert!(state.paused_at.is_some());
    }

    #[test]
    fn test_timer_resume_clears_paused_at() {
        let mut state = TimerState {
            status: "paused".to_string(),
            paused_at: Some(chrono::Utc::now().to_rfc3339()),
            ..Default::default()
        };
        // Simulate resume
        state.status = "running".to_string();
        state.started_at = Some(chrono::Utc::now().to_rfc3339());
        state.paused_at = None;
        assert_eq!(state.status, "running");
        assert!(state.paused_at.is_none());
    }

    #[test]
    fn test_timer_pause_preserves_duration() {
        let mut state = TimerState {
            status: "running".to_string(),
            duration_seconds: 1500,
            started_at: Some(chrono::Utc::now().to_rfc3339()),
            paused_at: None,
            elapsed_before_pause: 0.0,
        };
        // Simulate pause
        state.status = "paused".to_string();
        state.paused_at = Some(chrono::Utc::now().to_rfc3339());
        assert_eq!(state.duration_seconds, 1500);
    }
}
