pub mod border_state;
pub mod calendar;
pub mod settings;
pub mod tick;
pub mod tray;
pub mod window_manager;

use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, RunEvent};
use tauri_plugin_sql::{Migration, MigrationKind};

use calendar::aggregator::CalendarAggregator;
use calendar::poller::CalendarPoller;

use border_state::BorderState;

#[cfg(target_os = "macos")]
use window_manager::macos::MacOSOverlayManager;
#[cfg(target_os = "macos")]
use window_manager::OverlayManager;

/// Default border thickness in logical pixels.
const DEFAULT_THICKNESS: f64 = 6.0;

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
                let thickness = DEFAULT_THICKNESS;
                tauri::async_runtime::spawn(async move {
                    // Give webviews time to load HTML and initialize JS
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;

                    // NSWindow ops must run on the main thread
                    let handle2 = handle.clone();
                    let _ = handle.run_on_main_thread(move || {
                        let mut overlay_mgr = MacOSOverlayManager::new();
                        if let Err(e) = overlay_mgr.create_overlay_windows(&handle2) {
                            eprintln!("Failed to configure macOS overlay: {e}");
                        } else {
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

            // Start the 1-second tick emitter for border state updates
            tick::start_tick_emitter(app.handle().clone());

            // Start the calendar polling service
            let agg = app.state::<Arc<tokio::sync::Mutex<CalendarAggregator>>>();
            CalendarPoller::start(app.handle().clone(), agg.inner().clone());

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
