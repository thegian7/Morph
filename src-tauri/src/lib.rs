pub mod border_state;
pub mod calendar;
pub mod settings;
pub mod tick;
pub mod tray;
pub mod window_manager;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::webview::WebviewWindowBuilder;
use tauri::{Emitter, Manager, WebviewUrl};
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

/// Create the four border overlay windows dynamically during app setup.
///
/// Windows are created hidden and transparent. Platform-specific
/// configuration (window level, click-through) is applied by the
/// OverlayManager implementations in OE-3 / OE-4.
fn create_border_windows(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let thickness = DEFAULT_THICKNESS;

    // Border window definitions: (label, x, y, w, h) using placeholder dimensions.
    // Platform window managers will reposition these using actual screen dimensions.
    let borders: [(&str, f64, f64, f64, f64); 4] = [
        ("border-top", 0.0, 0.0, 1920.0, thickness),
        ("border-bottom", 0.0, 1080.0 - thickness, 1920.0, thickness),
        (
            "border-left",
            0.0,
            thickness,
            thickness,
            1080.0 - 2.0 * thickness,
        ),
        (
            "border-right",
            1920.0 - thickness,
            thickness,
            thickness,
            1080.0 - 2.0 * thickness,
        ),
    ];

    // All border windows load the overlay HTML entry point
    let overlay_url = WebviewUrl::App(PathBuf::from("src/overlay/index.html"));

    for (label, x, y, w, h) in borders {
        WebviewWindowBuilder::new(app, label, overlay_url.clone())
            .title("")
            .transparent(true)
            .decorations(false)
            .skip_taskbar(true)
            .resizable(false)
            .visible(false)
            .inner_size(w, h)
            .position(x, y)
            .always_on_top(true)
            .build()?;
    }

    Ok(())
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
            // Create border overlay windows dynamically
            if let Err(e) = create_border_windows(app.handle()) {
                eprintln!("Failed to create border windows: {}", e);
            }

            // Apply platform-specific overlay configuration (macOS)
            #[cfg(target_os = "macos")]
            {
                let mut overlay_mgr = MacOSOverlayManager::new();
                if let Err(e) = overlay_mgr.create_overlay_windows(app.handle()) {
                    eprintln!("Failed to configure macOS overlay: {e}");
                } else {
                    // Position borders on the main screen with default thickness
                    overlay_mgr.set_thickness(DEFAULT_THICKNESS);
                    overlay_mgr.show();
                }
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
