use super::OverlayManager;
use objc2_app_kit::{NSScreen, NSWindow, NSWindowCollectionBehavior, NSWindowLevel};
use objc2_foundation::{MainThreadMarker, NSPoint, NSRect, NSSize};
use tauri::Manager;
use tauri::WebviewWindow;

/// macOS CoreGraphics window level: above fullscreen apps.
const WINDOW_LEVEL: NSWindowLevel = 1000; // kCGScreenSaverWindowLevel

/// macOS overlay manager using NSWindow APIs for window level,
/// collection behavior, and click-through configuration.
pub struct MacOSOverlayManager {
    pub top: Option<WebviewWindow>,
    pub bottom: Option<WebviewWindow>,
    pub left: Option<WebviewWindow>,
    pub right: Option<WebviewWindow>,
}

impl MacOSOverlayManager {
    pub fn new() -> Self {
        Self {
            top: None,
            bottom: None,
            left: None,
            right: None,
        }
    }

    /// Apply NSWindow-level overlay configuration to a single window.
    ///
    /// Sets window level, collection behavior, click-through, and removes shadow.
    fn configure_ns_window(window: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
        let ns_window_ptr = window
            .ns_window()
            .map_err(|e| format!("failed to get NSWindow: {e}"))?;

        // SAFETY: ns_window() returns a valid NSWindow pointer and we are on the main thread
        // (Tauri setup runs on main thread).
        let ns_window: &NSWindow = unsafe { &*(ns_window_ptr as *const NSWindow) };

        // Window level 1000 (kCGScreenSaverWindowLevel) — appears above fullscreen apps
        ns_window.setLevel(WINDOW_LEVEL);

        // Collection behavior: appear on all Spaces, persist through Mission Control,
        // excluded from Cmd+Tab, and allowed alongside fullscreen apps.
        ns_window.setCollectionBehavior(
            NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::Stationary
                | NSWindowCollectionBehavior::IgnoresCycle
                | NSWindowCollectionBehavior::FullScreenAuxiliary,
        );

        // Click-through at the NSWindow level (belt-and-suspenders with Tauri's click-through)
        ns_window.setIgnoresMouseEvents(true);

        // No shadow for transparent overlay
        ns_window.setHasShadow(false);

        Ok(())
    }

    /// Get the main screen frame in macOS native coordinates (bottom-left origin).
    fn main_screen_frame() -> Option<NSRect> {
        // SAFETY: Tauri setup and commands run on the main thread.
        let mtm = unsafe { MainThreadMarker::new_unchecked() };
        let screen = NSScreen::mainScreen(mtm)?;
        Some(screen.frame())
    }

    /// Set an NSWindow's frame directly using native coordinates.
    fn set_window_frame(
        window: &WebviewWindow,
        x: f64,
        y: f64,
        w: f64,
        h: f64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let ns_window_ptr = window
            .ns_window()
            .map_err(|e| format!("failed to get NSWindow: {e}"))?;
        let ns_window: &NSWindow = unsafe { &*(ns_window_ptr as *const NSWindow) };

        let rect = NSRect::new(NSPoint::new(x, y), NSSize::new(w, h));
        ns_window.setFrame_display_animate(rect, true, false);
        Ok(())
    }

    /// Helper: get all stored windows as a slice of references.
    fn windows(&self) -> Vec<&WebviewWindow> {
        [&self.top, &self.bottom, &self.left, &self.right]
            .iter()
            .filter_map(|opt| opt.as_ref())
            .collect()
    }
}

impl Default for MacOSOverlayManager {
    fn default() -> Self {
        Self::new()
    }
}

impl OverlayManager for MacOSOverlayManager {
    fn create_overlay_windows(
        &mut self,
        app: &tauri::AppHandle,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Get the border windows that were already created in lib.rs setup()
        self.top = app.get_webview_window("border-top");
        self.bottom = app.get_webview_window("border-bottom");
        self.left = app.get_webview_window("border-left");
        self.right = app.get_webview_window("border-right");

        // Verify all four windows exist
        if self.top.is_none()
            || self.bottom.is_none()
            || self.left.is_none()
            || self.right.is_none()
        {
            return Err("one or more border windows not found".into());
        }

        // Apply NSWindow configuration to each border window
        for window in self.windows() {
            if let Err(e) = Self::configure_ns_window(window) {
                eprintln!("Failed to configure NSWindow for '{}': {e}", window.label());
            }
        }

        Ok(())
    }

    fn position_borders(
        &self,
        screen_x: f64,
        screen_y: f64,
        screen_w: f64,
        screen_h: f64,
        thickness: f64,
    ) {
        // macOS uses bottom-left origin. NSWindow setFrame handles this natively.
        // Layout with inset side windows to avoid corner overlap:
        //   Top:    full width, at the top edge
        //   Bottom: full width, at the bottom edge
        //   Left:   inset vertically by thickness on both ends
        //   Right:  inset vertically by thickness on both ends

        if let Some(ref w) = self.top {
            if let Err(e) = Self::set_window_frame(
                w,
                screen_x,
                screen_y + screen_h - thickness,
                screen_w,
                thickness,
            ) {
                eprintln!("Failed to position border-top: {e}");
            }
        }

        if let Some(ref w) = self.bottom {
            if let Err(e) = Self::set_window_frame(w, screen_x, screen_y, screen_w, thickness) {
                eprintln!("Failed to position border-bottom: {e}");
            }
        }

        if let Some(ref w) = self.left {
            if let Err(e) = Self::set_window_frame(
                w,
                screen_x,
                screen_y + thickness,
                thickness,
                screen_h - 2.0 * thickness,
            ) {
                eprintln!("Failed to position border-left: {e}");
            }
        }

        if let Some(ref w) = self.right {
            if let Err(e) = Self::set_window_frame(
                w,
                screen_x + screen_w - thickness,
                screen_y + thickness,
                thickness,
                screen_h - 2.0 * thickness,
            ) {
                eprintln!("Failed to position border-right: {e}");
            }
        }
    }

    fn show(&self) {
        // Apply NSWindow config and show each window
        for window in self.windows() {
            if let Err(e) = Self::configure_ns_window(window) {
                eprintln!(
                    "Failed to configure NSWindow for '{}': {e}",
                    window.label()
                );
            }
            if let Err(e) = window.show() {
                eprintln!("Failed to show '{}': {e}", window.label());
            }
        }
    }

    fn hide(&self) {
        for window in self.windows() {
            if let Err(e) = window.hide() {
                eprintln!("Failed to hide '{}': {e}", window.label());
            }
        }
    }

    fn set_thickness(&self, thickness: f64) {
        // Get the current main screen frame and reposition with new thickness
        if let Some(frame) = Self::main_screen_frame() {
            self.position_borders(
                frame.origin.x,
                frame.origin.y,
                frame.size.width,
                frame.size.height,
                thickness,
            );
        } else {
            eprintln!("Failed to get main screen frame for set_thickness");
        }
    }
}
