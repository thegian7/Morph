use std::sync::Mutex;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Listener, Manager, WebviewUrl, WebviewWindowBuilder};

/// Holds the tray icon handle so other parts of the app can update the menu.
pub struct TrayState {
    pub tray: tauri::tray::TrayIcon,
    /// The tray menu. On macOS it is *not* attached to the status item (an
    /// attached menu opens on every click, so the left-click popover never
    /// would); it's popped up on right-click instead.
    pub menu: Mutex<Menu<tauri::Wry>>,
}

/// Map a BorderState phase string to a human-readable status label.
pub fn phase_to_label(phase: &str) -> &str {
    match phase {
        "no-events" | "free-deep" => "Free time",
        "warning-far" => "Meeting in ~30 min",
        "warning-mid" => "Meeting in ~15 min",
        "warning-near" => "Meeting in ~5 min",
        "warning-imminent" => "Meeting in ~2 min",
        "overtime" => "Overtime",
        p if p.starts_with("in-session") => "In session",
        p if p.starts_with("gap-") => "Break",
        _ => "Free time",
    }
}

/// Map a BorderState phase string to the corresponding tray icon filename.
#[cfg(test)]
fn phase_to_icon_name(phase: &str) -> &str {
    match phase {
        "no-events" => "tray-none.png",
        "free-deep" => "tray-free.png",
        "overtime" => "tray-overtime.png",
        p if p.starts_with("warning") => "tray-warning.png",
        p if p.starts_with("in-session") => "tray-session.png",
        p if p.starts_with("gap-") => "tray-free.png",
        _ => "tray-none.png",
    }
}

/// Get an embedded tray icon Image for a given phase.
fn phase_to_icon(phase: &str) -> Option<Image<'static>> {
    let bytes: &[u8] = match phase {
        "no-events" => include_bytes!("../icons/tray/tray-none.png"),
        "free-deep" => include_bytes!("../icons/tray/tray-free.png"),
        "overtime" => include_bytes!("../icons/tray/tray-overtime.png"),
        p if p.starts_with("warning") => include_bytes!("../icons/tray/tray-warning.png"),
        p if p.starts_with("in-session") => include_bytes!("../icons/tray/tray-session.png"),
        p if p.starts_with("gap-") => include_bytes!("../icons/tray/tray-free.png"),
        _ => include_bytes!("../icons/tray/tray-none.png"),
    };
    Image::from_bytes(bytes).ok()
}

/// Build the tray context menu for the given status label.
fn build_menu(
    app: &AppHandle,
    status_label: &str,
) -> Result<Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let timer_submenu = Submenu::with_items(
        app,
        "Start Timer",
        true,
        &[
            &MenuItem::with_id(
                app,
                "timer_pomodoro",
                "Pomodoro (25 min)",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                app,
                "timer_short_break",
                "Short Break (5 min)",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                app,
                "timer_long_break",
                "Long Break (15 min)",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                app,
                "timer_focus_hour",
                "Focus Hour (60 min)",
                true,
                None::<&str>,
            )?,
        ],
    )?;

    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "status", status_label, false, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &timer_submenu,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "open_settings", "Open Settings", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "support", "Support Morph ♥", true, None::<&str>)?,
            &MenuItem::with_id(app, "quit", "Quit Morph", true, None::<&str>)?,
        ],
    )?;

    Ok(menu)
}

/// Handle menu events (settings, quit, timer starts).
fn handle_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    match event.id.as_ref() {
        "open_settings" => {
            let window = match app.get_webview_window("settings") {
                Some(w) => w,
                None => match WebviewWindowBuilder::new(
                    app,
                    "settings",
                    WebviewUrl::App("src/settings/index.html".into()),
                )
                .title("Morph Settings")
                .inner_size(680.0, 560.0)
                .decorations(true)
                .resizable(true)
                .build()
                {
                    Ok(w) => w,
                    Err(e) => {
                        eprintln!("Failed to create settings window: {e}");
                        return;
                    }
                },
            };
            let _ = window.show();
            let _ = window.set_focus();
        }
        "support" => {
            tauri::async_runtime::spawn(async {
                let _ = open::that("https://ko-fi.com/morphlight");
            });
        }
        "quit" => {
            app.exit(0);
        }
        "timer_pomodoro" => {
            app.emit("start-timer", 25u32 * 60).ok();
        }
        "timer_short_break" => {
            app.emit("start-timer", 5u32 * 60).ok();
        }
        "timer_long_break" => {
            app.emit("start-timer", 15u32 * 60).ok();
        }
        "timer_focus_hour" => {
            app.emit("start-timer", 60u32 * 60).ok();
        }
        _ => {}
    }
}

/// Create the system tray with an initial menu based on current BorderState.
pub fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let phase = {
        let managed = app.state::<Mutex<crate::border_state::BorderState>>();
        let guard = managed.lock().map_err(|e| e.to_string())?;
        guard.phase.clone()
    };

    let label = phase_to_label(&phase);
    let menu = build_menu(app.handle(), label)?;

    let builder = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray_icon, event| {
            let TrayIconEvent::Click {
                rect,
                button,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } = event
            else {
                return;
            };
            let app = tray_icon.app_handle();
            let pos = rect.position.to_physical::<f64>(1.0);
            let size = rect.size.to_physical::<f64>(1.0);
            let icon = crate::tray_popover::PhysRect {
                x: pos.x,
                y: pos.y,
                w: size.width,
                h: size.height,
            };
            match button {
                // Left click toggles the popover.
                tauri::tray::MouseButton::Left => crate::tray_popover::toggle(app, icon),
                // Right click shows the menu (macOS: popped up by hand, see
                // TrayState::menu).
                #[cfg(target_os = "macos")]
                tauri::tray::MouseButton::Right => popup_menu_under(app, icon),
                _ => {}
            }
        });
    // Everywhere but macOS the menu is attached to the tray as usual.
    #[cfg(not(target_os = "macos"))]
    let builder = builder.menu(&menu).on_menu_event(|app, event| {
        handle_menu_event(app, event);
    });
    let tray = builder.build(app)?;

    // macOS: the menu isn't attached to the tray, so handle its events
    // app-wide.
    #[cfg(target_os = "macos")]
    app.handle().on_menu_event(|app, event| {
        handle_menu_event(app, event);
    });

    app.manage(TrayState {
        tray,
        menu: Mutex::new(menu),
    });

    // Listen for border-state-update events to update the tray icon color
    let handle = app.handle().clone();
    app.listen("border-state-update", move |event| {
        if let Ok(state) = serde_json::from_str::<crate::border_state::BorderState>(event.payload())
        {
            if let Some(icon) = phase_to_icon(&state.phase) {
                let tray_state = handle.state::<TrayState>();
                let _ = tray_state.tray.set_icon(Some(icon));
            }
        }
    });

    Ok(())
}

/// Update the tray menu to reflect a new phase. Call this when the phase changes.
pub fn update_tray_menu(app: &AppHandle, phase: &str) -> Result<(), Box<dyn std::error::Error>> {
    let label = phase_to_label(phase);
    let menu = build_menu(app, label)?;
    let tray_state = app.state::<TrayState>();
    #[cfg(not(target_os = "macos"))]
    tray_state.tray.set_menu(Some(menu.clone()))?;
    if let Ok(mut current) = tray_state.menu.lock() {
        *current = menu;
    }
    Ok(())
}

/// Pop the tray menu up just under the tray icon (macOS).
///
/// Shown on the color-engine webview, which always exists and sits at the
/// primary display's top-left corner, so the icon's global logical position
/// is also its position relative to that window.
#[cfg(target_os = "macos")]
fn popup_menu_under(app: &AppHandle, icon: crate::tray_popover::PhysRect) {
    use tauri::menu::ContextMenu;
    crate::tray_popover::hide(app);
    let Some(window) = app.get_webview_window(crate::window_manager::macos::ENGINE_LABEL) else {
        return;
    };
    let scale = app
        .monitor_from_point(icon.x, icon.y)
        .ok()
        .flatten()
        .map(|m| m.scale_factor())
        .unwrap_or(1.0);
    let at = tauri::LogicalPosition::new(icon.x / scale, (icon.y + icon.h) / scale);
    let menu = app.state::<TrayState>().menu.lock().ok().map(|m| m.clone());
    if let Some(menu) = menu {
        if let Err(e) = menu.popup_at(window.as_ref().window(), at) {
            eprintln!("Failed to show tray menu: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_events_maps_to_free_time() {
        assert_eq!(phase_to_label("no-events"), "Free time");
    }

    #[test]
    fn free_deep_maps_to_free_time() {
        assert_eq!(phase_to_label("free-deep"), "Free time");
    }

    #[test]
    fn warning_far_maps_correctly() {
        assert_eq!(phase_to_label("warning-far"), "Meeting in ~30 min");
    }

    #[test]
    fn warning_mid_maps_correctly() {
        assert_eq!(phase_to_label("warning-mid"), "Meeting in ~15 min");
    }

    #[test]
    fn warning_near_maps_correctly() {
        assert_eq!(phase_to_label("warning-near"), "Meeting in ~5 min");
    }

    #[test]
    fn warning_imminent_maps_correctly() {
        assert_eq!(phase_to_label("warning-imminent"), "Meeting in ~2 min");
    }

    #[test]
    fn in_session_early_maps_to_in_session() {
        assert_eq!(phase_to_label("in-session-early"), "In session");
    }

    #[test]
    fn in_session_mid_maps_to_in_session() {
        assert_eq!(phase_to_label("in-session-mid"), "In session");
    }

    #[test]
    fn in_session_late_maps_to_in_session() {
        assert_eq!(phase_to_label("in-session-late"), "In session");
    }

    #[test]
    fn overtime_maps_correctly() {
        assert_eq!(phase_to_label("overtime"), "Overtime");
    }

    #[test]
    fn gap_short_maps_to_break() {
        assert_eq!(phase_to_label("gap-short"), "Break");
    }

    #[test]
    fn gap_long_maps_to_break() {
        assert_eq!(phase_to_label("gap-long"), "Break");
    }

    #[test]
    fn unknown_phase_defaults_to_free_time() {
        assert_eq!(phase_to_label("something-unknown"), "Free time");
    }

    #[test]
    fn phase_to_icon_maps_no_events() {
        assert_eq!(phase_to_icon_name("no-events"), "tray-none.png");
    }

    #[test]
    fn phase_to_icon_maps_free_deep() {
        assert_eq!(phase_to_icon_name("free-deep"), "tray-free.png");
    }

    #[test]
    fn phase_to_icon_maps_warning() {
        assert_eq!(phase_to_icon_name("warning-far"), "tray-warning.png");
        assert_eq!(phase_to_icon_name("warning-imminent"), "tray-warning.png");
    }

    #[test]
    fn phase_to_icon_maps_session() {
        assert_eq!(phase_to_icon_name("in-session-early"), "tray-session.png");
    }

    #[test]
    fn phase_to_icon_maps_overtime() {
        assert_eq!(phase_to_icon_name("overtime"), "tray-overtime.png");
    }

    #[test]
    fn phase_to_icon_maps_gap() {
        assert_eq!(phase_to_icon_name("gap-short"), "tray-free.png");
    }
}
