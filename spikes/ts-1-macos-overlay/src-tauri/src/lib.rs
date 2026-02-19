#[cfg(target_os = "macos")]
mod macos {
    use objc2_app_kit::{NSScreen, NSWindow, NSWindowCollectionBehavior};
    use objc2_foundation::{MainThreadMarker, NSRect};
    use tauri::WebviewWindow;

    /// Configure the overlay window for macOS:
    /// - Cover the entire main screen
    /// - Set window level above all other windows
    /// - Make it non-activating (won't steal focus)
    /// - Ignore mouse events at the NSWindow level as a fallback
    pub fn configure_overlay(window: &WebviewWindow) {
        // We're guaranteed to be on the main thread in Tauri's setup
        let mtm = unsafe { MainThreadMarker::new_unchecked() };

        // Get the main screen frame
        let screen = NSScreen::mainScreen(mtm).expect("no main screen");
        let frame: NSRect = screen.frame();

        // Access the underlying NSWindow to set advanced properties
        let ns_window_ptr = window.ns_window().expect("failed to get NSWindow");
        let ns_window: &NSWindow = unsafe { &*(ns_window_ptr as *const NSWindow) };

        // Set the window frame directly using NSWindow API to avoid
        // coordinate system conversion issues between macOS (bottom-left origin)
        // and Tauri (top-left origin). This places the window exactly on the screen.
        ns_window.setFrame_display_animate(frame, true, false);

        // kCGOverlayWindowLevel = 25 — above normal windows but below screen saver
        ns_window.setLevel(25);

        // Make the window appear on all Spaces and not show in Expose/Mission Control
        ns_window.setCollectionBehavior(
            NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::Stationary
                | NSWindowCollectionBehavior::IgnoresCycle,
        );

        // Ignore mouse events at the NSWindow level (belt and suspenders
        // with the Tauri setIgnoreCursorEvents call in the frontend)
        ns_window.setIgnoresMouseEvents(true);

        // No shadow since it's a transparent overlay
        ns_window.setHasShadow(false);

        // Now show the window
        window.show().expect("failed to show window");

        println!(
            "Overlay configured: {}x{} at ({}, {}), level=25",
            frame.size.width, frame.size.height, frame.origin.x, frame.origin.y
        );
    }
}

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                let window = app.get_webview_window("overlay").expect("overlay window not found");
                macos::configure_overlay(&window);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
