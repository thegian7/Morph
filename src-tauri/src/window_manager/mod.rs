#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(target_os = "windows")]
pub mod windows;

/// Border window labels used for dynamic window creation.
pub const BORDER_LABELS: [&str; 4] = ["border-top", "border-bottom", "border-left", "border-right"];

/// Manages overlay border windows across the screen edges.
///
/// Each platform provides its own implementation that handles
/// native window configuration (window level, click-through, etc.).
pub trait OverlayManager {
    /// Create the four border overlay windows dynamically.
    fn create_overlay_windows(
        &mut self,
        app: &tauri::AppHandle,
    ) -> Result<(), Box<dyn std::error::Error>>;

    /// Position and size the four border windows around a screen region.
    ///
    /// Uses the inset side-window layout to avoid corner overlap:
    /// - Top:    x=0,              y=0,                  w=screen_w,           h=thickness
    /// - Bottom: x=0,              y=screen_h-thickness, w=screen_w,           h=thickness
    /// - Left:   x=0,              y=thickness,          w=thickness,          h=screen_h-2*thickness
    /// - Right:  x=screen_w-thick, y=thickness,          w=thickness,          h=screen_h-2*thickness
    fn position_borders(
        &self,
        screen_x: f64,
        screen_y: f64,
        screen_w: f64,
        screen_h: f64,
        thickness: f64,
    );

    /// Show all border windows.
    fn show(&self);

    /// Hide all border windows.
    fn hide(&self);

    /// Update the border thickness (resize windows).
    fn set_thickness(&self, thickness: f64);
}
