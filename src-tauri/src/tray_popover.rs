//! The tray popover: the small window that opens from the menu-bar icon.
//!
//! On macOS it behaves like a native menu-bar extra:
//! - frosted (`Popover` vibrancy) with a shadow and rounded corners;
//! - centred under the icon and kept on screen;
//! - shown without activating Morph, so the app you were using keeps focus
//!   and its menu bar; a click anywhere else dismisses it (global mouse-down
//!   monitor, which needs no extra permission);
//! - if clicking inside it did activate Morph, focus goes back to the
//!   previous app when it closes;
//! - created once and hidden/shown after that, so it opens instantly.
//!
//! Other platforms keep the simple show/focus/close-on-blur behaviour.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "tray-popover";
/// Logical size of the popover.
pub const WIDTH: f64 = 320.0;
pub const HEIGHT: f64 = 400.0;
/// Logical gap between the menu bar icon and the popover.
pub const GAP: f64 = 6.0;
/// Logical minimum distance from the display edges.
pub const MARGIN: f64 = 8.0;
/// Corner radius of the vibrancy view.
pub const RADIUS: f64 = 10.0;

/// A rectangle in physical pixels (top-left origin, as Tauri reports them).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PhysRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// Where the popover's top-left corner goes, in physical pixels: centred
/// under the tray icon, `GAP` below it, clamped `MARGIN` inside the monitor.
pub fn popover_origin(icon: PhysRect, scale: f64, monitor: PhysRect) -> (f64, f64) {
    let w = WIDTH * scale;
    let h = HEIGHT * scale;
    let margin = MARGIN * scale;
    let mut x = icon.x + icon.w / 2.0 - w / 2.0;
    let min_x = monitor.x + margin;
    let max_x = monitor.x + monitor.w - margin - w;
    x = x.max(min_x).min(max_x.max(min_x));
    let mut y = icon.y + icon.h + GAP * scale;
    let max_y = monitor.y + monitor.h - margin - h;
    y = y.min(max_y.max(monitor.y));
    (x.round(), y.round())
}

fn build(app: &AppHandle) -> tauri::Result<tauri::WebviewWindow> {
    let builder =
        WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("src/tray/index.html".into()))
            .title("")
            .inner_size(WIDTH, HEIGHT)
            .decorations(false)
            .resizable(false)
            .skip_taskbar(true)
            .transparent(true)
            .shadow(true)
            .always_on_top(true)
            .visible(false)
            .focused(false);
    #[cfg(target_os = "macos")]
    let builder = builder
        // Clicks register even while Morph isn't the active app.
        .accept_first_mouse(true)
        .effects(
            tauri::window::EffectsBuilder::new()
                .effect(tauri::window::Effect::Popover)
                // Always vibrant: the popover is usually not the key window.
                .state(tauri::window::EffectState::Active)
                .radius(RADIUS)
                .build(),
        );
    builder.build()
}

/// Create the popover hidden ahead of time so the first click opens it
/// instantly and its page has loaded before any NSWindow configuration.
pub fn precreate(app: &AppHandle) {
    if app.get_webview_window(LABEL).is_none() {
        if let Err(e) = build(app) {
            eprintln!("Failed to create tray popover: {e}");
        }
    }
}

/// Toggle the popover from a tray-icon click whose icon occupies `icon`.
pub fn toggle(app: &AppHandle, icon: PhysRect) {
    let window = match app.get_webview_window(LABEL) {
        Some(w) => w,
        None => match build(app) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("Failed to create tray popover: {e}");
                return;
            }
        },
    };
    if window.is_visible().unwrap_or(false) {
        hide(app);
        return;
    }

    let center = (icon.x + icon.w / 2.0, icon.y + icon.h / 2.0);
    if let Ok(Some(monitor)) = app.monitor_from_point(center.0, center.1) {
        let scale = monitor.scale_factor();
        let (mx, my) = (monitor.position().x as f64, monitor.position().y as f64);
        let (mw, mh) = (monitor.size().width as f64, monitor.size().height as f64);
        let (x, y) = popover_origin(
            icon,
            scale,
            PhysRect {
                x: mx,
                y: my,
                w: mw,
                h: mh,
            },
        );
        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
    }

    #[cfg(target_os = "macos")]
    macos::show(app, &window);
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Hide the popover (and on macOS hand focus back to the previous app if
/// opening/clicking it activated Morph).
pub fn hide(app: &AppHandle) {
    let Some(window) = app.get_webview_window(LABEL) else {
        return;
    };
    #[cfg(target_os = "macos")]
    {
        let _ = window.hide();
        macos::restore_focus(app);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window.close();
    }
}

/// Called by the popover itself (blur, Escape, after an action).
#[tauri::command]
pub fn hide_tray_popover(app: AppHandle) {
    hide(&app);
}

#[cfg(target_os = "macos")]
mod macos {
    use super::LABEL;
    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2_app_kit::{
        NSApplication, NSApplicationActivationOptions, NSEvent, NSEventMask, NSRunningApplication,
        NSWindow, NSWindowCollectionBehavior, NSWorkspace,
    };
    use objc2_foundation::MainThreadMarker;
    use std::cell::RefCell;
    use tauri::{AppHandle, Manager, WebviewWindow};

    /// `kCGPopUpMenuWindowLevel`: where real status-item menus sit.
    const POPUP_LEVEL: isize = 101;

    thread_local! {
        /// The app that was frontmost when the popover opened.
        static PREVIOUS_APP: RefCell<Option<Retained<NSRunningApplication>>> =
            const { RefCell::new(None) };
        /// Global mouse-down monitor that dismisses the popover.
        static MONITOR: RefCell<Option<Retained<AnyObject>>> = const { RefCell::new(None) };
    }

    pub fn show(app: &AppHandle, window: &WebviewWindow) {
        // SAFETY: tray events and commands are handled on the main thread.
        let mtm = unsafe { MainThreadMarker::new_unchecked() };

        let own_pid = std::process::id() as i32;
        let front = NSWorkspace::sharedWorkspace()
            .frontmostApplication()
            .filter(|a| a.processIdentifier() != own_pid);
        PREVIOUS_APP.with(|p| *p.borrow_mut() = front);

        let Ok(ptr) = window.ns_window() else {
            let _ = window.show();
            return;
        };
        // SAFETY: valid NSWindow owned by the WebviewWindow; main thread.
        let ns_window: &NSWindow = unsafe { &*(ptr as *const NSWindow) };
        ns_window.setLevel(POPUP_LEVEL);
        ns_window.setCollectionBehavior(
            NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::Transient
                | NSWindowCollectionBehavior::IgnoresCycle
                | NSWindowCollectionBehavior::FullScreenAuxiliary
                | NSWindowCollectionBehavior::CanJoinAllApplications,
        );
        ns_window.setHasShadow(true);
        // Show without activating Morph or making the popover key, so the
        // user's app keeps focus (no Tauri show()/set_focus()).
        ns_window.orderFrontRegardless();
        ns_window.invalidateShadow();

        install_dismiss_monitor(mtm, app);
    }

    /// Clicks in other apps (which a global monitor sees; clicks in Morph's
    /// own windows and its tray icon it doesn't) dismiss the popover.
    fn install_dismiss_monitor(_mtm: MainThreadMarker, app: &AppHandle) {
        MONITOR.with(|m| {
            if m.borrow().is_some() {
                return;
            }
            let handle = app.clone();
            let block = RcBlock::new(move |_event: std::ptr::NonNull<NSEvent>| {
                let visible = handle
                    .get_webview_window(LABEL)
                    .and_then(|w| w.is_visible().ok())
                    .unwrap_or(false);
                if visible {
                    super::hide(&handle);
                }
            });
            let monitor = NSEvent::addGlobalMonitorForEventsMatchingMask_handler(
                NSEventMask::LeftMouseDown | NSEventMask::RightMouseDown,
                &block,
            );
            *m.borrow_mut() = monitor;
        });
    }

    /// If Morph became the active app (the user clicked inside the popover)
    /// and no other Morph window needs it, give focus back to the app the
    /// user was in.
    pub fn restore_focus(app: &AppHandle) {
        // SAFETY: main thread (tray event, command, or event monitor).
        let mtm = unsafe { MainThreadMarker::new_unchecked() };
        let previous = PREVIOUS_APP.with(|p| p.borrow_mut().take());
        if !NSApplication::sharedApplication(mtm).isActive() {
            return;
        }
        let settings_open = app
            .get_webview_window("settings")
            .and_then(|w| w.is_visible().ok())
            .unwrap_or(false);
        if settings_open {
            return;
        }
        if let Some(previous) = previous {
            previous.activateWithOptions(NSApplicationActivationOptions::empty());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const G9: PhysRect = PhysRect {
        x: 0.0,
        y: 0.0,
        w: 5120.0,
        h: 1440.0,
    };

    #[test]
    fn centres_under_the_icon_with_a_gap() {
        let icon = PhysRect {
            x: 4000.0,
            y: 0.0,
            w: 30.0,
            h: 30.0,
        };
        assert_eq!(popover_origin(icon, 1.0, G9), (4015.0 - 160.0, 36.0));
    }

    #[test]
    fn scales_on_retina() {
        // 1512x982 @2x laptop.
        let mon = PhysRect {
            x: 0.0,
            y: 0.0,
            w: 3024.0,
            h: 1964.0,
        };
        let icon = PhysRect {
            x: 2000.0,
            y: 0.0,
            w: 60.0,
            h: 74.0,
        };
        // Centre 2030 - 320 (160pt @2x); 74 + 12 (6pt @2x).
        assert_eq!(popover_origin(icon, 2.0, mon), (1710.0, 86.0));
    }

    #[test]
    fn stays_on_screen_near_the_right_edge() {
        let icon = PhysRect {
            x: 5100.0,
            y: 0.0,
            w: 20.0,
            h: 30.0,
        };
        let (x, _) = popover_origin(icon, 1.0, G9);
        assert_eq!(x, 5120.0 - 8.0 - 320.0);
    }

    #[test]
    fn stays_on_screen_near_the_left_edge_of_a_secondary_display() {
        let mon = PhysRect {
            x: 5120.0,
            y: 0.0,
            w: 2560.0,
            h: 1440.0,
        };
        let icon = PhysRect {
            x: 5125.0,
            y: 0.0,
            w: 20.0,
            h: 25.0,
        };
        assert_eq!(popover_origin(icon, 1.0, mon).0, 5128.0);
    }
}
