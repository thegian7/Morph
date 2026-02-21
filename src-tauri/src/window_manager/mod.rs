#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(target_os = "windows")]
pub mod windows;

/// Border window labels used for dynamic window creation.
pub const BORDER_LABELS: [&str; 4] = ["border-top", "border-bottom", "border-left", "border-right"];

/// Information about a connected monitor/display.
#[derive(Debug, Clone, serde::Serialize)]
pub struct MonitorInfo {
    /// Unique identifier: `"primary"` for main screen, or platform-derived ID.
    pub id: String,
    /// Human-readable name (e.g., "DELL U2723QE").
    pub name: String,
    /// Width in logical pixels.
    pub width: f64,
    /// Height in logical pixels.
    pub height: f64,
    /// X origin in logical pixels.
    pub x: f64,
    /// Y origin in logical pixels.
    pub y: f64,
    /// Whether this is the primary monitor.
    pub is_primary: bool,
}

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

    /// Set the target monitor for the overlay.
    /// Pass `"primary"` to target the main screen for the primary display,
    /// or a platform-derived monitor ID for a specific display.
    /// Falls back to primary if the given ID is not found.
    fn set_target_monitor(&mut self, monitor_id: &str);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn monitor_info_serializes_to_json() {
        let info = MonitorInfo {
            id: "primary".to_string(),
            name: "Built-in Retina Display".to_string(),
            width: 1728.0,
            height: 1117.0,
            x: 0.0,
            y: 0.0,
            is_primary: true,
        };
        let json = serde_json::to_value(&info).expect("serialize MonitorInfo");
        assert_eq!(json["id"], "primary");
        assert_eq!(json["name"], "Built-in Retina Display");
        assert_eq!(json["width"], 1728.0);
        assert_eq!(json["height"], 1117.0);
        assert_eq!(json["x"], 0.0);
        assert_eq!(json["y"], 0.0);
        assert_eq!(json["is_primary"], true);
    }
}
