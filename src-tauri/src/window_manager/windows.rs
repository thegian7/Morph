use super::OverlayManager;
use tauri::WebviewWindow;

/// Windows overlay manager using Win32 APIs for TOPMOST,
/// WS_EX_TRANSPARENT, and WS_EX_LAYERED configuration.
#[derive(Default)]
pub struct WindowsOverlayManager {
    pub top: Option<WebviewWindow>,
    pub bottom: Option<WebviewWindow>,
    pub left: Option<WebviewWindow>,
    pub right: Option<WebviewWindow>,
}

impl WindowsOverlayManager {
    pub fn new() -> Self {
        Self::default()
    }
}

impl OverlayManager for WindowsOverlayManager {
    fn create_overlay_windows(
        &mut self,
        _app: &tauri::AppHandle,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Platform-specific window creation will be implemented in OE-4.
        // The generic window creation happens in lib.rs setup().
        // This method will apply Windows-specific Win32 configuration:
        // - WS_EX_TOPMOST
        // - WS_EX_TRANSPARENT + WS_EX_LAYERED (click-through)
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
        // Will be implemented in OE-4 with monitor info queries.
    }

    fn show(&self) {
        // Will be implemented in OE-4.
    }

    fn hide(&self) {
        // Will be implemented in OE-4.
    }

    fn set_thickness(&self, _thickness: f64) {
        // Will be implemented in OE-4.
    }
}
