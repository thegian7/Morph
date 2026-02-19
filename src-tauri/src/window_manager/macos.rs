use super::OverlayManager;
use tauri::WebviewWindow;

/// macOS overlay manager using NSWindow APIs for window level,
/// collection behavior, and click-through configuration.
#[derive(Default)]
pub struct MacOSOverlayManager {
    pub top: Option<WebviewWindow>,
    pub bottom: Option<WebviewWindow>,
    pub left: Option<WebviewWindow>,
    pub right: Option<WebviewWindow>,
}

impl MacOSOverlayManager {
    pub fn new() -> Self {
        Self::default()
    }
}

impl OverlayManager for MacOSOverlayManager {
    fn create_overlay_windows(
        &mut self,
        _app: &tauri::AppHandle,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Platform-specific window creation will be implemented in OE-3.
        // The generic window creation happens in lib.rs setup().
        // This method will apply macOS-specific NSWindow configuration:
        // - setLevel (above fullscreen apps)
        // - setCollectionBehavior (CanJoinAllSpaces + FullScreenAuxiliary)
        // - setIgnoresMouseEvents (click-through)
        Ok(())
    }

    fn position_borders(
        &self,
        _screen_x: f64,
        _screen_y: f64,
        _screen_w: f64,
        _screen_h: f64,
        _thickness: f64,
    ) {
        // Will be implemented in OE-3 with NSScreen frame queries.
    }

    fn show(&self) {
        // Will be implemented in OE-3.
    }

    fn hide(&self) {
        // Will be implemented in OE-3.
    }

    fn set_thickness(&self, _thickness: f64) {
        // Will be implemented in OE-3.
    }
}
