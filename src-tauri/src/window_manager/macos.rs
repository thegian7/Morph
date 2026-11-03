use super::layout::{
    appkit_to_cg, compute_layout, for_fullscreen, for_opaque_menu_bar, has_fullscreen_window,
    BorderMode, Edges, Layout, Rect, Strip, LEVEL_DOCK_TINT, LEVEL_MENU_TINT,
};
use super::{macos_reserve, DisplayPrefs, MonitorInfo, OverlayManager};
use objc2::ffi::{class_addMethod, method_getImplementation, method_getTypeEncoding};
use objc2::rc::Retained;
use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};
use objc2::{sel, ClassType};
use objc2_app_kit::{NSApplication, NSScreen, NSWindow, NSWindowCollectionBehavior, NSWorkspace};
use objc2_foundation::{MainThreadMarker, NSPoint, NSRect, NSSize};
use std::sync::{Mutex, OnceLock};
use tauri::WebviewWindow;
use tauri::{Emitter, Manager};

/// Everything needed to lay the border out; derived from settings.
#[derive(Debug, Clone, PartialEq)]
pub struct LayoutConfig {
    pub mode: BorderMode,
    pub edges: Edges,
    pub thickness: f64,
    pub monitor_id: String,
}

/// The last config applied and the geometry it produced, so the screen
/// watcher can re-apply only when the Dock or menu bar actually moved.
static LAST_APPLIED: Mutex<Option<(LayoutConfig, Layout)>> = Mutex::new(None);

/// macOS overlay manager using NSWindow APIs for window level,
/// collection behavior, and click-through configuration.
pub struct MacOSOverlayManager {
    pub top: Option<WebviewWindow>,
    pub bottom: Option<WebviewWindow>,
    pub left: Option<WebviewWindow>,
    pub right: Option<WebviewWindow>,
    /// Which monitor to target: `"primary"` or a platform-derived ID.
    pub target_monitor: String,
    pub mode: BorderMode,
    pub edges: Edges,
}

type ConstrainFn = unsafe extern "C-unwind" fn(&NSWindow, Sel, NSRect, *mut AnyObject) -> NSRect;

/// NSWindow's own `constrainFrameRect:toScreen:`, used for every window that
/// isn't a tint strip.
static ORIGINAL_CONSTRAIN: OnceLock<ConstrainFn> = OnceLock::new();

/// `constrainFrameRect:toScreen:` for Tao windows.
///
/// AppKit pushes windows below `NSMainMenuWindowLevel` out from under the
/// menu bar (and keeps them clear of the Dock). The tint strips must sit
/// exactly there, so windows at a tint level keep the frame they were given;
/// all other windows (settings, popover) get AppKit's normal behavior.
unsafe extern "C-unwind" fn constrain_frame(
    this: &NSWindow,
    cmd: Sel,
    frame: NSRect,
    screen: *mut AnyObject,
) -> NSRect {
    let level = this.level();
    if level == LEVEL_MENU_TINT || level == LEVEL_DOCK_TINT {
        return frame;
    }
    match ORIGINAL_CONSTRAIN.get() {
        Some(original) => original(this, cmd, frame, screen),
        None => frame,
    }
}

/// Install [`constrain_frame`] on `TaoWindow` (once).
///
/// Added to the class rather than swapping individual windows' classes:
/// Tao's windows are KVO-observed (`NSKVONotifying_TaoWindow`), and
/// re-classing a KVO'd object crashes. `TaoWindow` doesn't implement this
/// selector itself, so `class_addMethod` adds an override that the KVO
/// subclass inherits.
fn install_constraint_override() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| {
        let sel = sel!(constrainFrameRect:toScreen:);
        let (Some(tao), Some(method)) = (
            AnyClass::get(c"TaoWindow"),
            NSWindow::class().instance_method(sel),
        ) else {
            eprintln!("[overlay] TaoWindow class not found; menu bar tint may be pushed down");
            return;
        };
        // SAFETY: `method` is NSWindow's implementation of this selector, so
        // its IMP has exactly the `ConstrainFn` signature, and we register
        // our replacement with NSWindow's own type encoding.
        unsafe {
            let method_ptr = method as *const objc2::runtime::Method;
            if let Some(imp) = method_getImplementation(method_ptr) {
                let _ = ORIGINAL_CONSTRAIN.set(std::mem::transmute::<Imp, ConstrainFn>(imp));
            }
            let added = class_addMethod(
                tao as *const AnyClass as *mut AnyClass,
                sel,
                std::mem::transmute::<ConstrainFn, Imp>(constrain_frame as ConstrainFn),
                method_getTypeEncoding(method_ptr),
            );
            if !added.as_bool() {
                eprintln!("[overlay] TaoWindow already overrides constrainFrameRect; tint may be pushed down");
            }
        }
    });
}

fn ns_window_of(window: &WebviewWindow) -> Option<&NSWindow> {
    let ptr = window.ns_window().ok()?;
    // SAFETY: Tauri returns a valid NSWindow pointer that lives as long as the
    // WebviewWindow; all callers run on the main thread.
    Some(unsafe { &*(ptr as *const NSWindow) })
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

fn to_rect(r: NSRect) -> Rect {
    Rect::new(r.origin.x, r.origin.y, r.size.width, r.size.height)
}

fn to_ns(r: Rect) -> NSRect {
    NSRect::new(NSPoint::new(r.x, r.y), NSSize::new(r.w, r.h))
}

/// Last display preferences seen, so changes can be broadcast once.
static LAST_PREFS: Mutex<Option<DisplayPrefs>> = Mutex::new(None);

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

/// The layout for `config` on `screen` right now, including the fullscreen
/// adjustment.
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

impl MacOSOverlayManager {
    pub fn new() -> Self {
        Self {
            top: None,
            bottom: None,
            left: None,
            right: None,
            target_monitor: "primary".to_string(),
            mode: BorderMode::Fit,
            edges: Edges::ALL,
        }
    }

    pub fn set_layout_options(&mut self, mode: BorderMode, edges: Edges) {
        self.mode = mode;
        self.edges = edges;
    }

    /// Apply NSWindow-level overlay configuration to a single window.
    ///
    /// Sets collection behavior, click-through and removes shadow, and makes
    /// sure tint-level windows aren't pushed out from under the menu bar.
    /// Window level is set per strip in [`Self::apply`].
    fn configure_ns_window(window: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
        let ns_window = ns_window_of(window).ok_or("failed to get NSWindow")?;

        install_constraint_override();

        // Appear on all Spaces (including other apps' fullscreen Spaces),
        // persist through Mission Control, excluded from Cmd+Tab.
        ns_window.setCollectionBehavior(
            NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::Stationary
                | NSWindowCollectionBehavior::IgnoresCycle
                | NSWindowCollectionBehavior::FullScreenAuxiliary
                // macOS 13+: also join *other* apps' fullscreen Spaces, so
                // the hairline shows over a fullscreen video or deck.
                | NSWindowCollectionBehavior::CanJoinAllApplications,
        );

        // Click-through at the NSWindow level (belt-and-suspenders with Tauri's click-through)
        ns_window.setIgnoresMouseEvents(true);
        ns_window.setHasShadow(false);

        Ok(())
    }

    /// Enumerate all connected monitors and return their info.
    pub fn get_available_monitors() -> Vec<MonitorInfo> {
        // SAFETY: Tauri setup and commands run on the main thread.
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

    /// Helper: the four border windows in `[top, bottom, left, right]` order.
    fn slots(&self) -> [Option<&WebviewWindow>; 4] {
        [
            self.top.as_ref(),
            self.bottom.as_ref(),
            self.left.as_ref(),
            self.right.as_ref(),
        ]
    }

    fn windows(&self) -> Vec<&WebviewWindow> {
        self.slots().into_iter().flatten().collect()
    }

    /// Compute and apply the layout for `config`. Must run on the main thread.
    pub fn apply(&self, config: &LayoutConfig) -> Option<Layout> {
        // SAFETY: callers run on the main thread (setup / run_on_main_thread).
        let mtm = unsafe { MainThreadMarker::new_unchecked() };
        let screen = Self::screen_for_id(mtm, &config.monitor_id)?;
        let frame = to_rect(screen.frame());
        let visible = to_rect(screen.visibleFrame());
        let layout = current_layout(mtm, &screen, config);

        let strips = [layout.top, layout.bottom, layout.left, layout.right];
        for (i, (window, strip)) in self.slots().into_iter().zip(strips).enumerate() {
            let Some(window) = window else { continue };
            let Some(ns_window) = ns_window_of(window) else {
                continue;
            };
            match strip {
                Some(Strip { rect, level }) => {
                    ns_window.setLevel(level);
                    ns_window.setFrame_display_animate(to_ns(rect), true, false);
                    // Not Tauri's show(): that goes through makeKeyAndOrderFront
                    // and would steal focus from the user's app on every relayout.
                    ns_window.orderFrontRegardless();
                }
                None if i == 0 => {
                    // The top window is the leader that broadcasts border state
                    // to the tray, and WebKit throttles timers in ordered-out
                    // windows — so park it as a 1pt speck instead of hiding it.
                    ns_window.setLevel(LEVEL_MENU_TINT);
                    let speck = Rect::new(frame.x, frame.max_y() - 1.0, 1.0, 1.0);
                    ns_window.setFrame_display_animate(to_ns(speck), true, false);
                    ns_window.orderFrontRegardless();
                }
                None => ns_window.orderOut(None),
            }
        }

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

        if let Ok(mut last) = LAST_APPLIED.lock() {
            *last = Some((config.clone(), layout));
        }
        Some(layout)
    }
}

impl Default for MacOSOverlayManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Configure the border windows and lay them out. Main thread only.
pub fn configure_and_apply(app: &tauri::AppHandle, config: &LayoutConfig) {
    let mut mgr = MacOSOverlayManager::new();
    if let Err(e) = mgr.create_overlay_windows(app) {
        eprintln!("Failed to configure macOS overlay: {e}");
        return;
    }
    mgr.set_target_monitor(&config.monitor_id);
    mgr.set_layout_options(config.mode, config.edges);
    mgr.apply(config);
}

/// Re-apply the last config if the target display's geometry changed (Dock
/// moved, resized or auto-hide toggled; menu bar auto-hide; display
/// rearranged; an app entered or left fullscreen; Reduce Transparency
/// toggled), and broadcast display-preference changes. Cheap enough to call
/// every couple of seconds. Main thread only.
pub fn refresh_if_geometry_changed(app: &tauri::AppHandle) {
    // SAFETY: called via run_on_main_thread.
    let mtm = unsafe { MainThreadMarker::new_unchecked() };

    // Broadcast accessibility / appearance changes to the overlay windows.
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
    let Some(screen) = MacOSOverlayManager::screen_for_id(mtm, &config.monitor_id) else {
        return;
    };
    let now = current_layout(mtm, &screen, &config);
    if now != previous {
        configure_and_apply(app, &config);
    }
}

impl OverlayManager for MacOSOverlayManager {
    fn create_overlay_windows(
        &mut self,
        app: &tauri::AppHandle,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Get the border windows that were already created in lib.rs setup()
        self.top = app.get_webview_window("border-top");
        self.bottom = app.get_webview_window("border-bottom");
        self.left = app.get_webview_window("border-left");
        self.right = app.get_webview_window("border-right");

        if self.slots().iter().any(Option::is_none) {
            return Err("one or more border windows not found".into());
        }

        for window in self.windows() {
            if let Err(e) = Self::configure_ns_window(window) {
                eprintln!("Failed to configure NSWindow for '{}': {e}", window.label());
            }
        }

        Ok(())
    }

    fn position_borders(
        &self,
        screen_x: f64,
        screen_y: f64,
        screen_w: f64,
        screen_h: f64,
        thickness: f64,
    ) {
        // Explicit-rect positioning only makes sense for the classic overlay
        // layout; the other modes derive geometry from the display itself.
        let frame = Rect::new(screen_x, screen_y, screen_w, screen_h);
        let layout = compute_layout(BorderMode::Overlay, frame, frame, thickness, Edges::ALL);
        let strips = [layout.top, layout.bottom, layout.left, layout.right];
        for (window, strip) in self.slots().into_iter().zip(strips) {
            if let (Some(ns_window), Some(strip)) = (window.and_then(ns_window_of), strip) {
                ns_window.setLevel(strip.level);
                ns_window.setFrame_display_animate(to_ns(strip.rect), true, false);
            }
        }
    }

    fn show(&self) {
        for window in self.windows() {
            if let Err(e) = Self::configure_ns_window(window) {
                eprintln!("Failed to configure NSWindow for '{}': {e}", window.label());
            }
            if let Err(e) = window.show() {
                eprintln!("Failed to show '{}': {e}", window.label());
            }
        }
    }

    fn hide(&self) {
        for window in self.windows() {
            if let Err(e) = window.hide() {
                eprintln!("Failed to hide '{}': {e}", window.label());
            }
        }
    }

    fn set_thickness(&self, thickness: f64) {
        let config = LayoutConfig {
            mode: self.mode,
            edges: self.edges,
            thickness,
            monitor_id: self.target_monitor.clone(),
        };
        if self.apply(&config).is_none() {
            eprintln!(
                "Failed to get screen for set_thickness (target: {})",
                self.target_monitor
            );
        }
    }

    fn set_target_monitor(&mut self, monitor_id: &str) {
        self.target_monitor = monitor_id.to_string();
    }
}
