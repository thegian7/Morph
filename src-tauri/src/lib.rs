pub mod calendar;
pub mod window_manager;

use std::path::PathBuf;
use tauri::webview::WebviewWindowBuilder;
use tauri::WebviewUrl;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Create border overlay windows dynamically
            if let Err(e) = create_border_windows(app.handle()) {
                eprintln!("Failed to create border windows: {}", e);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
