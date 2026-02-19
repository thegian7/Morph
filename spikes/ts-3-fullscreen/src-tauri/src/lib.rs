use std::sync::Mutex;
use tauri::Manager;

#[cfg(target_os = "macos")]
mod macos {
    use objc2_app_kit::{NSScreen, NSWindow, NSWindowCollectionBehavior, NSWindowLevel};
    use objc2_foundation::{MainThreadMarker, NSRect};
    use tauri::WebviewWindow;

    // macOS CoreGraphics window level constants
    pub const LEVEL_STATUS: NSWindowLevel = 25;          // kCGStatusWindowLevel
    pub const LEVEL_POP_UP_MENU: NSWindowLevel = 101;    // kCGPopUpMenuWindowLevel
    pub const LEVEL_SCREEN_SAVER: NSWindowLevel = 1000;  // kCGScreenSaverWindowLevel
    pub const LEVEL_MAXIMUM: NSWindowLevel = isize::MAX;  // kCGMaximumWindowLevel

    pub fn configure_overlay(window: &WebviewWindow, level: NSWindowLevel) {
        let mtm = unsafe { MainThreadMarker::new_unchecked() };

        let screen = NSScreen::mainScreen(mtm).expect("no main screen");
        let frame: NSRect = screen.frame();

        window
            .set_position(tauri::LogicalPosition::new(frame.origin.x, frame.origin.y))
            .expect("failed to set position");
        window
            .set_size(tauri::LogicalSize::new(frame.size.width, frame.size.height))
            .expect("failed to set size");

        let ns_window_ptr = window.ns_window().expect("failed to get NSWindow");
        let ns_window: &NSWindow = unsafe { &*(ns_window_ptr as *const NSWindow) };

        ns_window.setLevel(level);

        // FullScreenAuxiliary is the key addition for TS-3:
        // it allows this window to appear alongside fullscreen apps
        // without being hidden when a Space with a fullscreen app is active.
        ns_window.setCollectionBehavior(
            NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::Stationary
                | NSWindowCollectionBehavior::IgnoresCycle
                | NSWindowCollectionBehavior::FullScreenAuxiliary,
        );

        ns_window.setIgnoresMouseEvents(true);
        ns_window.setHasShadow(false);

        window.show().expect("failed to show window");

        println!(
            "Overlay configured: {}x{} at ({}, {}), level={} ({})",
            frame.size.width, frame.size.height, frame.origin.x, frame.origin.y,
            level, level_name(level)
        );
    }

    pub fn set_window_level(window: &WebviewWindow, level: NSWindowLevel) {
        let ns_window_ptr = window.ns_window().expect("failed to get NSWindow");
        let ns_window: &NSWindow = unsafe { &*(ns_window_ptr as *const NSWindow) };
        ns_window.setLevel(level);
        println!("Window level changed to {} ({})", level, level_name(level));
    }

    pub fn level_name(level: NSWindowLevel) -> &'static str {
        match level {
            0 => "kCGNormalWindowLevel (0)",
            3 => "kCGFloatingWindowLevel (3)",
            8 => "kCGModalPanelWindowLevel (8)",
            19 => "kCGUtilityWindowLevel (19)",
            20 => "kCGDockWindowLevel (20)",
            24 => "kCGMainMenuWindowLevel (24)",
            25 => "kCGStatusWindowLevel (25)",
            101 => "kCGPopUpMenuWindowLevel (101)",
            1000 => "kCGScreenSaverWindowLevel (1000)",
            _ if level == isize::MAX => "kCGMaximumWindowLevel (MAX)",
            _ => "custom",
        }
    }
}

struct AppState {
    current_level: Mutex<isize>,
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn set_level(level: i64, app: tauri::AppHandle) -> String {
    let window = app.get_webview_window("overlay").expect("overlay window not found");
    let ns_level = level as isize;
    macos::set_window_level(&window, ns_level);

    let state = app.state::<AppState>();
    *state.current_level.lock().unwrap() = ns_level;

    let name = macos::level_name(ns_level);
    format!("Level set to {}", name)
}

#[tauri::command]
fn get_level(app: tauri::AppHandle) -> String {
    let state = app.state::<AppState>();
    let level = *state.current_level.lock().unwrap();

    #[cfg(target_os = "macos")]
    {
        macos::level_name(level).to_string()
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = level;
        "N/A (not macOS)".to_string()
    }
}

#[tauri::command]
fn list_levels() -> Vec<serde_json::Value> {
    #[cfg(target_os = "macos")]
    {
        use macos::*;
        vec![
            serde_json::json!({"level": LEVEL_STATUS, "name": level_name(LEVEL_STATUS)}),
            serde_json::json!({"level": LEVEL_POP_UP_MENU, "name": level_name(LEVEL_POP_UP_MENU)}),
            serde_json::json!({"level": LEVEL_SCREEN_SAVER, "name": level_name(LEVEL_SCREEN_SAVER)}),
            serde_json::json!({"level": LEVEL_MAXIMUM, "name": level_name(LEVEL_MAXIMUM)}),
        ]
    }
    #[cfg(not(target_os = "macos"))]
    {
        vec![]
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "macos")]
    let initial_level: isize = macos::LEVEL_SCREEN_SAVER;
    #[cfg(not(target_os = "macos"))]
    let initial_level: isize = 0;

    tauri::Builder::default()
        .manage(AppState {
            current_level: Mutex::new(initial_level),
        })
        .invoke_handler(tauri::generate_handler![set_level, get_level, list_levels])
        .setup(move |app| {
            #[cfg(target_os = "macos")]
            {
                let window = app
                    .get_webview_window("overlay")
                    .expect("overlay window not found");
                macos::configure_overlay(&window, initial_level);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
