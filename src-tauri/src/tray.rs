use std::sync::Mutex;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Listener, Manager, WebviewUrl, WebviewWindowBuilder};

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

/// Toggle the tray popover window. Creates it if it doesn't exist, otherwise
/// toggles visibility.
fn toggle_popover(app: &AppHandle, position: tauri::PhysicalPosition<f64>) {
    if let Some(window) = app.get_webview_window("tray-popover") {
        // Window exists — toggle visibility
        match window.is_visible() {
            Ok(true) => {
                let _ = window.hide();
            }
            Ok(false) => {
                // Reposition near tray icon before showing
                let _ = window.set_position(tauri::Position::Physical(
                    tauri::PhysicalPosition {
                        x: (position.x as i32).saturating_sub(160),
                        y: position.y as i32,
                    },
                ));
                let _ = window.show();
                let _ = window.set_focus();
            }
            Err(e) => {
                eprintln!("Failed to check popover visibility: {e}");
            }
        }
        return;
    }

    // Create new popover window
    let popover = WebviewWindowBuilder::new(
        app,
        "tray-popover",
        WebviewUrl::App("src/tray/index.html".into()),
    )
    .title("")
    .inner_size(320.0, 400.0)
    .position(
        (position.x - 160.0).max(0.0),
        position.y,
    )
    .decorations(false)
    .skip_taskbar(true)
    .transparent(true)
    .visible(true)
    .build();

    match popover {
        Ok(_window) => {
            // On macOS: defer NSWindow config so webview JS can load first
            // (same pattern as overlay windows in lib.rs)
            #[cfg(target_os = "macos")]
            {
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    // Wait for webview to load
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

                    let handle2 = handle.clone();
                    let _ = handle.run_on_main_thread(move || {
                        if let Some(w) = handle2.get_webview_window("tray-popover") {
                            if let Ok(ns_window_ptr) = w.ns_window() {
                                use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};

                                // SAFETY: ns_window() returns a valid NSWindow pointer
                                // and we are on the main thread via run_on_main_thread.
                                let ns_window: &NSWindow =
                                    unsafe { &*(ns_window_ptr as *const NSWindow) };

                                // NSFloatingWindowLevel (3) — above normal windows
                                ns_window.setLevel(3);
                                ns_window.setCollectionBehavior(
                                    NSWindowCollectionBehavior::CanJoinAllSpaces
                                        | NSWindowCollectionBehavior::IgnoresCycle,
                                );
                                ns_window.setHasShadow(false);
                            }
                        }
                    });
                });
            }
        }
        Err(e) => {
            eprintln!("Failed to create tray popover: {e}");
        }
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
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray_icon, event| {
            if let TrayIconEvent::Click { position, .. } = event {
                toggle_popover(tray_icon.app_handle(), position);
            }
        })
        .on_menu_event(|app, event| {
            handle_menu_event(app, event);
        })
        .build(app)?;

    app.manage(TrayState { tray });

    // Listen for border-state-update events to update the tray icon color
    let handle = app.handle().clone();
    app.listen("border-state-update", move |event| {
        if let Ok(state) =
            serde_json::from_str::<crate::border_state::BorderState>(event.payload())
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
