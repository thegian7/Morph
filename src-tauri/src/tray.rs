use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// Holds the tray icon handle so other parts of the app can update the menu.
pub struct TrayState {
    pub tray: tauri::tray::TrayIcon,
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

/// Build the tray context menu for the given status label.
fn build_menu(app: &AppHandle, status_label: &str) -> Result<Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let timer_submenu = Submenu::with_items(
        app,
        "Start Timer",
        true,
        &[
            &MenuItem::with_id(app, "timer_pomodoro", "Pomodoro (25 min)", true, None::<&str>)?,
            &MenuItem::with_id(app, "timer_short_break", "Short Break (5 min)", true, None::<&str>)?,
            &MenuItem::with_id(app, "timer_long_break", "Long Break (15 min)", true, None::<&str>)?,
            &MenuItem::with_id(app, "timer_focus_hour", "Focus Hour (60 min)", true, None::<&str>)?,
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
                .inner_size(600.0, 500.0)
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
            let _ = tauri::async_runtime::spawn(async {
                let _ = open::that("https://ko-fi.com/christopherledbetter");
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

    let tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            handle_menu_event(app, event);
        })
        .build(app)?;

    app.manage(TrayState { tray });

    Ok(())
}

/// Update the tray menu to reflect a new phase. Call this when the phase changes.
pub fn update_tray_menu(app: &AppHandle, phase: &str) -> Result<(), Box<dyn std::error::Error>> {
    let label = phase_to_label(phase);
    let menu = build_menu(app, label)?;
    let tray_state = app.state::<TrayState>();
    tray_state.tray.set_menu(Some(menu))?;
    Ok(())
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
}
