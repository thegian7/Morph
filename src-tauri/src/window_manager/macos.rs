//! macOS border: layout, display preferences, and the color-engine webview.
//!
//! The border itself is drawn natively by [`super::macos_render`]. The
//! `border-top` webview stays alive only to run the TypeScript color engine
//! (it emits `border-render` for the native renderer and
//! `border-state-update` for the tray); it is parked on screen as an
//! invisible 1pt window because WebKit throttles hidden webviews' timers.

use super::layout::{
    appkit_to_cg, compute_layout, for_fullscreen, for_opaque_menu_bar, has_fullscreen_window,
    reserved_edges, shapes, BorderMode, Edges, Layout, Rect, LEVEL_STATUS,
};
use super::{macos_render, macos_reserve, DisplayPrefs, MonitorInfo};
use objc2::rc::Retained;
use objc2_app_kit::{NSApplication, NSScreen, NSWindow, NSWindowCollectionBehavior, NSWorkspace};
use objc2_foundation::{MainThreadMarker, NSPoint, NSRect, NSSize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// Label of the webview that runs the color engine.
pub const ENGINE_LABEL: &str = "border-top";

/// Everything needed to lay the border out; derived from settings.
#[derive(Debug, Clone, PartialEq)]
pub struct LayoutConfig {
    pub mode: BorderMode,
    pub edges: Edges,
    pub thickness: f64,
    pub monitor_id: String,
}

/// The last config applied and the geometry it produced, so the screen
/// watcher can re-apply only when something actually changed.
static LAST_APPLIED: Mutex<Option<(LayoutConfig, Layout)>> = Mutex::new(None);

/// Last display preferences seen, so changes can be broadcast once.
static LAST_PREFS: Mutex<Option<DisplayPrefs>> = Mutex::new(None);

/// Set once the engine webview has finished loading. Configuring its
/// NSWindow before that stops WKWebView from ever running its JavaScript.
static ENGINE_LOADED: AtomicBool = AtomicBool::new(false);

/// Monitor enumeration for the settings UI.
pub struct MacOSOverlayManager;

impl MacOSOverlayManager {
    /// Enumerate all connected monitors and return their info.
    pub fn get_available_monitors() -> Vec<MonitorInfo> {
        // SAFETY: Tauri setup and sync commands run on the main thread.
        let mtm = unsafe { MainThreadMarker::new_unchecked() };
        NSScreen::screens(mtm)
            .iter()
            .enumerate()
            .map(|(i, screen)| {
                let frame = screen.frame();
                let is_primary = i == 0;
                MonitorInfo {
                    id: monitor_id(&screen, is_primary),
                    name: screen.localizedName().to_string(),
                    width: frame.size.width,
                    height: frame.size.height,
                    x: frame.origin.x,
                    y: frame.origin.y,
                    is_primary,
                }
            })
            .collect()
    }
}

/// The display that owns the menu bar. Its AppKit frame origin is (0, 0) and
/// global CoreGraphics coordinates are measured from its top-left corner.
fn primary_screen(mtm: MainThreadMarker) -> Option<Retained<NSScreen>> {
    NSScreen::screens(mtm).firstObject()
}

fn monitor_id(screen: &NSScreen, is_primary: bool) -> String {
    if is_primary {
        return "primary".to_string();
    }
    let frame = screen.frame();
    format!(
        "{}:{}x{}",
        screen.localizedName(),
        frame.origin.x as i64,
        frame.origin.y as i64
    )
}

/// Find the screen for a monitor ID, falling back to the primary display
/// (e.g. when the saved monitor was disconnected).
fn screen_for_id(mtm: MainThreadMarker, id: &str) -> Option<Retained<NSScreen>> {
    if id != "primary" {
        for (i, screen) in NSScreen::screens(mtm).iter().enumerate() {
            if monitor_id(&screen, i == 0) == id {
                return Some(screen);
            }
        }
    }
    primary_screen(mtm)
}

fn to_rect(r: NSRect) -> Rect {
    Rect::new(r.origin.x, r.origin.y, r.size.width, r.size.height)
}

fn to_ns(r: Rect) -> NSRect {
    NSRect::new(NSPoint::new(r.x, r.y), NSSize::new(r.w, r.h))
}

/// Edges macOS reserves (menu bar, Dock) on the display `monitor_id`.
/// Main thread only.
pub fn reserved_edges_for(mtm: MainThreadMarker, monitor_id: &str) -> Edges {
    match screen_for_id(mtm, monitor_id) {
        Some(screen) => reserved_edges(to_rect(screen.frame()), to_rect(screen.visibleFrame())),
        None => Edges::ALL,
    }
}

/// Read the system display preferences. Main thread only.
pub fn display_prefs(mtm: MainThreadMarker) -> DisplayPrefs {
    let ws = NSWorkspace::sharedWorkspace();
    let appearance = NSApplication::sharedApplication(mtm).effectiveAppearance();
    DisplayPrefs {
        reduce_motion: ws.accessibilityDisplayShouldReduceMotion(),
        reduce_transparency: ws.accessibilityDisplayShouldReduceTransparency(),
        increase_contrast: ws.accessibilityDisplayShouldIncreaseContrast(),
        dark: appearance.name().to_string().contains("Dark"),
    }
}

/// Whether another app is fullscreen on the display with AppKit `frame`.
fn display_is_fullscreen(mtm: MainThreadMarker, frame: Rect) -> bool {
    let Some(primary_h) = primary_screen(mtm).map(|s| s.frame().size.height) else {
        return false;
    };
    let display = appkit_to_cg(frame, primary_h);
    let own_pid = std::process::id() as i64;
    let windows: Vec<Rect> = macos_reserve::on_screen_windows()
        .into_iter()
        .filter(|w| w.layer == 0 && w.pid != own_pid && w.alpha > 0.0)
        .map(|w| w.bounds)
        .collect();
    has_fullscreen_window(&windows, display)
}

/// The layout for `config` on `screen` right now, including the opaque-menu
/// bar and fullscreen adjustments.
fn current_layout(mtm: MainThreadMarker, screen: &NSScreen, config: &LayoutConfig) -> Layout {
    let frame = to_rect(screen.frame());
    let visible = to_rect(screen.visibleFrame());
    let mut layout = compute_layout(config.mode, frame, visible, config.thickness, config.edges);
    if config.mode == BorderMode::Fit && display_prefs(mtm).reduce_transparency {
        layout = for_opaque_menu_bar(layout, frame, visible, config.thickness);
    }
    if config.mode != BorderMode::Overlay && display_is_fullscreen(mtm, frame) {
        layout = for_fullscreen(layout, config.mode, frame, config.thickness);
    }
    layout
}

/// Lay the border out for `config` and draw it. Main thread only.
pub fn configure_and_apply(app: &tauri::AppHandle, config: &LayoutConfig) {
    // SAFETY: callers run on the main thread (setup / run_on_main_thread).
    let mtm = unsafe { MainThreadMarker::new_unchecked() };
    let Some(screen) = screen_for_id(mtm, &config.monitor_id) else {
        eprintln!("[overlay] no screen for {}", config.monitor_id);
        return;
    };
    let frame = to_rect(screen.frame());
    let visible = to_rect(screen.visibleFrame());
    let layout = current_layout(mtm, &screen, config);

    macos_render::set_shapes(mtm, &shapes(&layout, config.edges, config.thickness));

    // Hand the reserved area (if any) to the Accessibility enforcer in
    // CoreGraphics coordinates.
    let target = layout.reserved.and_then(|area| {
        let primary_h = primary_screen(mtm)?.frame().size.height;
        Some(macos_reserve::Target {
            area: appkit_to_cg(area, primary_h),
            outer: appkit_to_cg(visible, primary_h),
            display: appkit_to_cg(frame, primary_h),
        })
    });
    macos_reserve::set_target(target);

    park_engine_window(app, frame);

    if let Ok(mut last) = LAST_APPLIED.lock() {
        *last = Some((config.clone(), layout));
    }
}

/// Mark the engine webview as loaded and park it. Main thread only.
pub fn engine_loaded(app: &tauri::AppHandle) {
    ENGINE_LOADED.store(true, Ordering::SeqCst);
    // SAFETY: called via run_on_main_thread.
    let mtm = unsafe { MainThreadMarker::new_unchecked() };
    let config = LAST_APPLIED
        .lock()
        .ok()
        .and_then(|l| l.clone())
        .map(|(c, _)| c);
    let id = config
        .map(|c| c.monitor_id)
        .unwrap_or_else(|| "primary".into());
    if let Some(screen) = screen_for_id(mtm, &id) {
        park_engine_window(app, to_rect(screen.frame()));
    }
}

/// Keep the engine webview on screen as a click-through 1pt window in the
/// display's top-left corner. It draws nothing (the overlay script knows the
/// native renderer is in charge); it only has to stay visible to WebKit so
/// its 1 Hz timer isn't throttled. No-op until the page has loaded.
fn park_engine_window(app: &tauri::AppHandle, display: Rect) {
    if !ENGINE_LOADED.load(Ordering::SeqCst) {
        return;
    }
    let Some(window) = app.get_webview_window(ENGINE_LABEL) else {
        return;
    };
    let Ok(ptr) = window.ns_window() else {
        return;
    };
    // SAFETY: valid NSWindow owned by the WebviewWindow; main thread.
    let ns_window: &NSWindow = unsafe { &*(ptr as *const NSWindow) };
    ns_window.setLevel(LEVEL_STATUS);
    ns_window.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::Stationary
            | NSWindowCollectionBehavior::IgnoresCycle
            | NSWindowCollectionBehavior::FullScreenAuxiliary
            | NSWindowCollectionBehavior::CanJoinAllApplications,
    );
    ns_window.setIgnoresMouseEvents(true);
    ns_window.setHasShadow(false);
    let speck = Rect::new(display.x, display.max_y() - 1.0, 1.0, 1.0);
    ns_window.setFrame_display(to_ns(speck), false);
    // Not Tauri's show(): that goes through makeKeyAndOrderFront and would
    // steal focus from the user's app.
    ns_window.orderFrontRegardless();
}

/// Re-apply the last config if the target display's geometry changed (Dock
/// moved, resized or auto-hide toggled; menu bar auto-hide; display
/// rearranged; an app entered or left fullscreen; Reduce Transparency
/// toggled), and broadcast display-preference changes. Cheap enough to call
/// every couple of seconds. Main thread only.
pub fn refresh_if_geometry_changed(app: &tauri::AppHandle) {
    // SAFETY: called via run_on_main_thread.
    let mtm = unsafe { MainThreadMarker::new_unchecked() };

    // Broadcast accessibility / appearance changes to the engine.
    let prefs = display_prefs(mtm);
    if let Ok(mut last) = LAST_PREFS.lock() {
        if *last != Some(prefs) {
            *last = Some(prefs);
            let _ = app.emit("display-prefs-changed", prefs);
        }
    }

    let Some((config, previous)) = LAST_APPLIED.lock().ok().and_then(|l| l.clone()) else {
        return;
    };
    let Some(screen) = screen_for_id(mtm, &config.monitor_id) else {
        return;
    };
    if current_layout(mtm, &screen, &config) != previous {
        configure_and_apply(app, &config);
    }
}
