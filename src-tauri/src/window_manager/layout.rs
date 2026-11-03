//! Pure border-layout geometry, shared by the platform window managers.
//!
//! Everything here is platform-independent so it can be unit-tested on any
//! OS. Rects use AppKit conventions (bottom-left origin, y grows upward)
//! unless a function says otherwise.

/// A rectangle in logical points.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl Rect {
    pub const fn new(x: f64, y: f64, w: f64, h: f64) -> Self {
        Self { x, y, w, h }
    }

    pub fn max_x(&self) -> f64 {
        self.x + self.w
    }

    pub fn max_y(&self) -> f64 {
        self.y + self.h
    }

    /// Equal within `tol` points on every component.
    pub fn approx_eq(&self, other: &Rect, tol: f64) -> bool {
        (self.x - other.x).abs() <= tol
            && (self.y - other.y).abs() <= tol
            && (self.w - other.w).abs() <= tol
            && (self.h - other.h).abs() <= tol
    }

    pub fn contains_point(&self, px: f64, py: f64) -> bool {
        px >= self.x && px < self.max_x() && py >= self.y && py < self.max_y()
    }
}

/// How the border relates to the rest of the screen.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BorderMode {
    /// Draw only in space macOS already reserves (menu bar, Dock edge).
    /// Never covers app content. Default.
    Fit,
    /// Draw inside the usable area and keep other apps' windows out of it
    /// (needs Accessibility permission).
    Reserve,
    /// Classic: draw at the physical screen edges, on top of content.
    Overlay,
}

impl BorderMode {
    pub fn from_setting(value: &str) -> Self {
        match value {
            "reserve" => Self::Reserve,
            "overlay" => Self::Overlay,
            _ => Self::Fit,
        }
    }
}

/// Which edges the user has enabled (`border_position` setting).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Edges {
    pub top: bool,
    pub bottom: bool,
    pub left: bool,
    pub right: bool,
}

impl Edges {
    pub const ALL: Edges = Edges {
        top: true,
        bottom: true,
        left: true,
        right: true,
    };

    /// Mirrors `isWindowActiveForPosition` in `src/overlay/overlay.ts`.
    pub fn from_position(value: &str) -> Self {
        let (top, bottom, left, right) = match value {
            "top" => (true, false, false, false),
            "bottom" => (false, true, false, false),
            "sides" => (false, false, true, true),
            "top-sides" => (true, false, true, true),
            "bottom-sides" => (false, true, true, true),
            _ => (true, true, true, true),
        };
        Self {
            top,
            bottom,
            left,
            right,
        }
    }
}

/// Window level just below the menu bar (`NSMainMenuWindowLevel` = 24), so
/// the tint sits behind menu titles and status items.
pub const LEVEL_MENU_TINT: isize = 23;
/// Window level just below the Dock (`kCGDockWindowLevel` = 20).
pub const LEVEL_DOCK_TINT: isize = 19;
/// `NSStatusWindowLevel`: above normal and floating windows and the menu bar,
/// below pop-up menus, Spotlight and Notification Center.
pub const LEVEL_STATUS: isize = 25;

/// Height of the top strip when the menu bar is set to auto-hide (so there is
/// no reserved band to fill). Kept tiny so it barely touches content.
pub const AUTOHIDE_MENU_FALLBACK: f64 = 3.0;

/// Bands narrower than this are treated as absent (float noise).
const MIN_BAND: f64 = 0.5;

/// One border window's frame and window level.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Strip {
    pub rect: Rect,
    pub level: isize,
}

/// The computed layout for one display.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Layout {
    pub top: Option<Strip>,
    pub bottom: Option<Strip>,
    pub left: Option<Strip>,
    pub right: Option<Strip>,
    /// In `Reserve` mode, the area other windows must stay inside
    /// (AppKit coordinates). `None` in other modes.
    pub reserved: Option<Rect>,
}

/// Compute the four border strips for a display.
///
/// * `frame` — the full display frame (`NSScreen.frame`).
/// * `visible` — the usable area (`NSScreen.visibleFrame`), i.e. minus the
///   menu bar and Dock.
pub fn compute_layout(
    mode: BorderMode,
    frame: Rect,
    visible: Rect,
    thickness: f64,
    edges: Edges,
) -> Layout {
    match mode {
        BorderMode::Fit => fit_layout(frame, visible, thickness),
        BorderMode::Reserve => reserve_layout(visible, thickness, edges),
        BorderMode::Overlay => overlay_layout(frame, thickness),
    }
}

fn fit_layout(frame: Rect, visible: Rect, thickness: f64) -> Layout {
    let top_band = frame.max_y() - visible.max_y();
    let bottom_band = visible.y - frame.y;
    let left_band = visible.x - frame.x;
    let right_band = frame.max_x() - visible.max_x();

    // The menu bar band is filled completely: the tint shows behind the menu
    // bar's titles and status items. The top strip always exists, because
    // the overlay's top window is the leader that broadcasts state to the
    // tray and must stay on screen.
    let top = if top_band >= MIN_BAND {
        Rect::new(frame.x, visible.max_y(), frame.w, top_band)
    } else {
        let h = AUTOHIDE_MENU_FALLBACK.min(thickness);
        Rect::new(frame.x, frame.max_y() - h, frame.w, h)
    };

    // Dock edges get a strip at most `thickness` deep, at the outer edge,
    // tucked behind the Dock.
    let dock = |r: Rect| {
        Some(Strip {
            rect: r,
            level: LEVEL_DOCK_TINT,
        })
    };
    let bottom = (bottom_band >= MIN_BAND)
        .then(|| Rect::new(frame.x, frame.y, frame.w, bottom_band.min(thickness)));
    let left = (left_band >= MIN_BAND)
        .then(|| Rect::new(frame.x, visible.y, left_band.min(thickness), visible.h));
    let right = (right_band >= MIN_BAND).then(|| {
        let w = right_band.min(thickness);
        Rect::new(frame.max_x() - w, visible.y, w, visible.h)
    });

    Layout {
        top: Some(Strip {
            rect: top,
            level: LEVEL_MENU_TINT,
        }),
        bottom: bottom.and_then(dock),
        left: left.and_then(dock),
        right: right.and_then(dock),
        reserved: None,
    }
}

fn reserve_layout(visible: Rect, t: f64, edges: Edges) -> Layout {
    let v = visible;
    let strip = |r: Rect| Strip {
        rect: r,
        level: LEVEL_STATUS,
    };

    // Side strips run between the top and bottom strips when those exist,
    // so corners are never painted twice.
    let side_y0 = v.y + if edges.bottom { t } else { 0.0 };
    let side_y1 = v.max_y() - if edges.top { t } else { 0.0 };
    let side_h = (side_y1 - side_y0).max(0.0);

    let top = edges
        .top
        .then(|| strip(Rect::new(v.x, v.max_y() - t, v.w, t)));
    let bottom = edges.bottom.then(|| strip(Rect::new(v.x, v.y, v.w, t)));
    let left = edges
        .left
        .then(|| strip(Rect::new(v.x, side_y0, t, side_h)));
    let right = edges
        .right
        .then(|| strip(Rect::new(v.max_x() - t, side_y0, t, side_h)));

    let inset = |on: bool| if on { t } else { 0.0 };
    let rx = v.x + inset(edges.left);
    let ry = v.y + inset(edges.bottom);
    let reserved = Rect::new(
        rx,
        ry,
        (v.max_x() - inset(edges.right) - rx).max(0.0),
        (v.max_y() - inset(edges.top) - ry).max(0.0),
    );

    Layout {
        top,
        bottom,
        left,
        right,
        reserved: Some(reserved),
    }
}

fn overlay_layout(f: Rect, t: f64) -> Layout {
    let strip = |r: Rect| {
        Some(Strip {
            rect: r,
            level: LEVEL_STATUS,
        })
    };
    let side_h = (f.h - 2.0 * t).max(0.0);
    Layout {
        top: strip(Rect::new(f.x, f.max_y() - t, f.w, t)),
        bottom: strip(Rect::new(f.x, f.y, f.w, t)),
        left: strip(Rect::new(f.x, f.y + t, t, side_h)),
        right: strip(Rect::new(f.max_x() - t, f.y + t, t, side_h)),
        reserved: None,
    }
}

/// Whether any of `windows` covers the whole `display` — i.e. an app is in
/// native fullscreen (or borderless "windowed fullscreen") on it. Both in the
/// same coordinate system.
pub fn has_fullscreen_window(windows: &[Rect], display: Rect) -> bool {
    windows.iter().any(|w| w.approx_eq(&display, 2.0))
}

/// Adjust a layout for a display showing a fullscreen app.
///
/// The menu bar and Dock hide in fullscreen, so the bands `Fit` paints (and
/// the strips `Reserve` draws inside the usable area) would land on top of
/// the app's content — a video, a slide deck, a shared screen. Instead the
/// border shrinks to a hairline along the top edge, which keeps the ambient
/// time cue without covering anything that matters, and nothing is reserved.
/// `Overlay` is the explicit "always on top of everything" choice and is left
/// alone.
pub fn for_fullscreen(layout: Layout, mode: BorderMode, frame: Rect, thickness: f64) -> Layout {
    if mode == BorderMode::Overlay {
        return layout;
    }
    let h = AUTOHIDE_MENU_FALLBACK.min(thickness);
    Layout {
        top: Some(Strip {
            rect: Rect::new(frame.x, frame.max_y() - h, frame.w, h),
            level: LEVEL_MENU_TINT,
        }),
        bottom: None,
        left: None,
        right: None,
        reserved: None,
    }
}

/// Convert an AppKit rect (bottom-left origin) to CoreGraphics/Accessibility
/// global coordinates (top-left origin of the primary display).
///
/// `primary_height` is the height of the primary display (the one whose
/// AppKit frame origin is 0,0), not of the display `r` is on.
pub fn appkit_to_cg(r: Rect, primary_height: f64) -> Rect {
    Rect::new(r.x, primary_height - r.max_y(), r.w, r.h)
}

/// Tolerance for treating a window edge as snapped to the usable-area edge.
const SNAP_TOLERANCE: f64 = 2.0;

/// The frame `win` should have so it sits entirely inside `area`.
///
/// `outer` is the usable area before the border was reserved (the display's
/// `visibleFrame`). Per axis:
/// * an edge snapped to (or past) the `outer` edge — a maximized or
///   half-tiled window — is *trimmed* to the `area` edge, so side-by-side
///   tiling survives;
/// * a free-floating window that strays into the border *slides* back in,
///   keeping its size;
/// * anything still larger than `area` shrinks to fit.
///
/// Coordinate-system agnostic (all three rects must share one).
pub fn fit_into(win: Rect, area: Rect, outer: Rect) -> Rect {
    let (x, w) = fit_axis(
        win.x,
        win.max_x(),
        area.x,
        area.max_x(),
        outer.x,
        outer.max_x(),
    );
    let (y, h) = fit_axis(
        win.y,
        win.max_y(),
        area.y,
        area.max_y(),
        outer.y,
        outer.max_y(),
    );
    Rect::new(x, y, w, h)
}

/// One axis of [`fit_into`]: returns (origin, length).
fn fit_axis(lo: f64, hi: f64, a_lo: f64, a_hi: f64, o_lo: f64, o_hi: f64) -> (f64, f64) {
    let mut lo = lo;
    let mut hi = hi;
    if lo <= o_lo + SNAP_TOLERANCE {
        lo = lo.max(a_lo);
    }
    if hi >= o_hi - SNAP_TOLERANCE {
        hi = hi.min(a_hi);
    }
    let len = (hi - lo).min(a_hi - a_lo).max(0.0);
    let origin = lo.max(a_lo).min(a_hi - len);
    (origin, len)
}

#[cfg(test)]
mod tests {
    use super::*;

    // A 1512x982 MacBook Pro (notched) with a 37pt menu bar and a 64pt Dock
    // at the bottom.
    const FRAME: Rect = Rect::new(0.0, 0.0, 1512.0, 982.0);
    const VIS_DOCK_BOTTOM: Rect = Rect::new(0.0, 64.0, 1512.0, 881.0);

    fn approx(a: Rect, b: Rect) {
        assert!(a.approx_eq(&b, 0.001), "{a:?} != {b:?}");
    }

    #[test]
    fn mode_parsing_defaults_to_fit() {
        assert_eq!(BorderMode::from_setting("fit"), BorderMode::Fit);
        assert_eq!(BorderMode::from_setting("reserve"), BorderMode::Reserve);
        assert_eq!(BorderMode::from_setting("overlay"), BorderMode::Overlay);
        assert_eq!(BorderMode::from_setting(""), BorderMode::Fit);
        assert_eq!(BorderMode::from_setting("junk"), BorderMode::Fit);
    }

    #[test]
    fn edges_match_overlay_ts_positions() {
        assert_eq!(Edges::from_position("all"), Edges::ALL);
        let top = Edges::from_position("top");
        assert!(top.top && !top.bottom && !top.left && !top.right);
        let bs = Edges::from_position("bottom-sides");
        assert!(!bs.top && bs.bottom && bs.left && bs.right);
        assert_eq!(Edges::from_position("nonsense"), Edges::ALL);
    }

    #[test]
    fn fit_fills_menu_bar_band_and_tucks_strip_behind_bottom_dock() {
        let l = compute_layout(BorderMode::Fit, FRAME, VIS_DOCK_BOTTOM, 16.0, Edges::ALL);
        let top = l.top.unwrap();
        approx(top.rect, Rect::new(0.0, 945.0, 1512.0, 37.0));
        assert_eq!(top.level, LEVEL_MENU_TINT);

        let bottom = l.bottom.unwrap();
        approx(bottom.rect, Rect::new(0.0, 0.0, 1512.0, 16.0));
        assert_eq!(bottom.level, LEVEL_DOCK_TINT);

        assert!(l.left.is_none());
        assert!(l.right.is_none());
        assert!(l.reserved.is_none());
    }

    #[test]
    fn fit_never_overlaps_the_usable_area() {
        for vis in [
            VIS_DOCK_BOTTOM,
            Rect::new(70.0, 0.0, 1442.0, 945.0), // Dock left
            Rect::new(0.0, 0.0, 1442.0, 945.0),  // Dock right
            Rect::new(0.0, 4.0, 1512.0, 941.0),  // Dock auto-hidden
            Rect::new(0.0, 0.0, 1512.0, 982.0),  // everything auto-hidden
        ] {
            let l = compute_layout(BorderMode::Fit, FRAME, vis, 28.0, Edges::ALL);
            for s in [l.bottom, l.left, l.right].into_iter().flatten() {
                let r = s.rect;
                let overlaps = r.x < vis.max_x()
                    && r.max_x() > vis.x
                    && r.y < vis.max_y()
                    && r.max_y() > vis.y;
                assert!(!overlaps, "{r:?} overlaps usable area {vis:?}");
            }
        }
    }

    #[test]
    fn fit_dock_on_left_gets_a_left_strip_only() {
        let vis = Rect::new(70.0, 0.0, 1442.0, 945.0);
        let l = compute_layout(BorderMode::Fit, FRAME, vis, 16.0, Edges::ALL);
        approx(l.left.unwrap().rect, Rect::new(0.0, 0.0, 16.0, 945.0));
        assert!(l.bottom.is_none());
        assert!(l.right.is_none());
    }

    #[test]
    fn fit_dock_on_right_hugs_the_right_edge() {
        let vis = Rect::new(0.0, 0.0, 1442.0, 945.0);
        let l = compute_layout(BorderMode::Fit, FRAME, vis, 16.0, Edges::ALL);
        approx(l.right.unwrap().rect, Rect::new(1496.0, 0.0, 16.0, 945.0));
    }

    #[test]
    fn fit_autohidden_dock_uses_the_thin_reserved_sliver() {
        let vis = Rect::new(0.0, 4.0, 1512.0, 941.0);
        let l = compute_layout(BorderMode::Fit, FRAME, vis, 16.0, Edges::ALL);
        approx(l.bottom.unwrap().rect, Rect::new(0.0, 0.0, 1512.0, 4.0));
    }

    #[test]
    fn fit_autohidden_menu_bar_keeps_a_hairline_top_strip() {
        let vis = Rect::new(0.0, 64.0, 1512.0, 918.0);
        let l = compute_layout(BorderMode::Fit, FRAME, vis, 16.0, Edges::ALL);
        let top = l.top.expect("top strip must always exist (tray leader)");
        approx(
            top.rect,
            Rect::new(
                0.0,
                982.0 - AUTOHIDE_MENU_FALLBACK,
                1512.0,
                AUTOHIDE_MENU_FALLBACK,
            ),
        );
    }

    #[test]
    fn fit_on_secondary_display_with_offset_origin() {
        // External display to the right of the laptop, no Dock on it.
        let frame = Rect::new(1512.0, -200.0, 2560.0, 1440.0);
        let vis = Rect::new(1512.0, -200.0, 2560.0, 1415.0);
        let l = compute_layout(BorderMode::Fit, frame, vis, 16.0, Edges::ALL);
        approx(l.top.unwrap().rect, Rect::new(1512.0, 1215.0, 2560.0, 25.0));
        assert!(l.bottom.is_none() && l.left.is_none() && l.right.is_none());
    }

    #[test]
    fn reserve_draws_inside_visible_area_and_reserves_it() {
        let l = compute_layout(
            BorderMode::Reserve,
            FRAME,
            VIS_DOCK_BOTTOM,
            16.0,
            Edges::ALL,
        );
        approx(l.top.unwrap().rect, Rect::new(0.0, 929.0, 1512.0, 16.0));
        approx(l.bottom.unwrap().rect, Rect::new(0.0, 64.0, 1512.0, 16.0));
        approx(l.left.unwrap().rect, Rect::new(0.0, 80.0, 16.0, 849.0));
        approx(l.right.unwrap().rect, Rect::new(1496.0, 80.0, 16.0, 849.0));
        approx(l.reserved.unwrap(), Rect::new(16.0, 80.0, 1480.0, 849.0));
        assert_eq!(l.top.unwrap().level, LEVEL_STATUS);
    }

    #[test]
    fn reserve_only_insets_enabled_edges() {
        let l = compute_layout(
            BorderMode::Reserve,
            FRAME,
            VIS_DOCK_BOTTOM,
            16.0,
            Edges::from_position("top"),
        );
        approx(l.reserved.unwrap(), Rect::new(0.0, 64.0, 1512.0, 865.0));
        assert!(l.bottom.is_none() && l.left.is_none() && l.right.is_none());
    }

    #[test]
    fn reserve_sides_span_full_height_without_top_or_bottom() {
        let l = compute_layout(
            BorderMode::Reserve,
            FRAME,
            VIS_DOCK_BOTTOM,
            8.0,
            Edges::from_position("sides"),
        );
        approx(l.left.unwrap().rect, Rect::new(0.0, 64.0, 8.0, 881.0));
        approx(l.reserved.unwrap(), Rect::new(8.0, 64.0, 1496.0, 881.0));
        assert!(l.top.is_none());
    }

    #[test]
    fn overlay_matches_classic_full_frame_layout() {
        let l = compute_layout(
            BorderMode::Overlay,
            FRAME,
            VIS_DOCK_BOTTOM,
            16.0,
            Edges::ALL,
        );
        approx(l.top.unwrap().rect, Rect::new(0.0, 966.0, 1512.0, 16.0));
        approx(l.bottom.unwrap().rect, Rect::new(0.0, 0.0, 1512.0, 16.0));
        approx(l.left.unwrap().rect, Rect::new(0.0, 16.0, 16.0, 950.0));
        approx(l.right.unwrap().rect, Rect::new(1496.0, 16.0, 16.0, 950.0));
        assert!(l.reserved.is_none());
    }

    #[test]
    fn appkit_to_cg_flips_against_primary_height() {
        // Primary display: menu bar band in AppKit is at the top.
        approx(
            appkit_to_cg(Rect::new(0.0, 945.0, 1512.0, 37.0), 982.0),
            Rect::new(0.0, 0.0, 1512.0, 37.0),
        );
        // Secondary display below-right of primary has negative AppKit y and
        // a CG y greater than the primary height.
        approx(
            appkit_to_cg(Rect::new(1512.0, -1440.0, 2560.0, 1440.0), 982.0),
            Rect::new(1512.0, 982.0, 2560.0, 1440.0),
        );
    }

    // CG coordinates: a 5120x1440 display, 30pt menu bar, no Dock reserve,
    // 28pt border on all sides.
    const OUTER: Rect = Rect::new(0.0, 30.0, 5120.0, 1410.0);
    const AREA: Rect = Rect::new(28.0, 58.0, 5064.0, 1354.0);

    #[test]
    fn fit_trims_a_maximized_window_to_the_area() {
        approx(fit_into(OUTER, AREA, OUTER), AREA);
    }

    #[test]
    fn fit_trims_half_tiled_windows_without_overlapping_them() {
        let left = fit_into(Rect::new(0.0, 30.0, 2560.0, 1410.0), AREA, OUTER);
        let right = fit_into(Rect::new(2560.0, 30.0, 2560.0, 1410.0), AREA, OUTER);
        approx(left, Rect::new(28.0, 58.0, 2532.0, 1354.0));
        approx(right, Rect::new(2560.0, 58.0, 2532.0, 1354.0));
        assert!(left.max_x() <= right.x, "tiled halves must not overlap");
    }

    #[test]
    fn fit_slides_a_floating_window_out_of_the_border_keeping_its_size() {
        // Dragged so its left edge sits inside the 28pt left strip.
        approx(
            fit_into(Rect::new(10.0, 400.0, 800.0, 600.0), AREA, OUTER),
            Rect::new(28.0, 400.0, 800.0, 600.0),
        );
        // Nudged into the bottom strip.
        approx(
            fit_into(Rect::new(1000.0, 1000.0, 800.0, 430.0), AREA, OUTER),
            Rect::new(1000.0, 982.0, 800.0, 430.0),
        );
    }

    #[test]
    fn fit_leaves_a_window_already_inside_alone() {
        let win = Rect::new(100.0, 100.0, 400.0, 300.0);
        approx(fit_into(win, AREA, OUTER), win);
    }

    #[test]
    fn fit_trims_whatever_hangs_past_the_usable_area() {
        // Larger than the display and hanging off its right and bottom edges:
        // those edges are trimmed, the on-screen origin stays put.
        let win = Rect::new(500.0, 100.0, 6000.0, 1500.0);
        approx(
            fit_into(win, AREA, OUTER),
            Rect::new(500.0, 100.0, 4592.0, 1312.0),
        );
    }

    #[test]
    fn fit_shrinks_a_window_wider_than_the_area_even_when_unsnapped() {
        let win = Rect::new(10.0, 100.0, 5100.0, 300.0);
        approx(
            fit_into(win, AREA, OUTER),
            Rect::new(28.0, 100.0, 5064.0, 300.0),
        );
    }

    #[test]
    fn fit_handles_a_window_hanging_off_the_screen_edge() {
        // Pushed partly off the right edge of the display.
        approx(
            fit_into(Rect::new(4800.0, 200.0, 600.0, 400.0), AREA, OUTER),
            Rect::new(4800.0, 200.0, 292.0, 400.0),
        );
    }

    #[test]
    fn fullscreen_window_detected_only_when_it_covers_the_display() {
        let display = Rect::new(0.0, 0.0, 5120.0, 1440.0);
        assert!(has_fullscreen_window(
            &[Rect::new(10.0, 30.0, 800.0, 600.0), display],
            display
        ));
        assert!(!has_fullscreen_window(
            &[Rect::new(0.0, 30.0, 5120.0, 1410.0)], // maximized, not fullscreen
            display
        ));
        assert!(!has_fullscreen_window(&[], display));
    }

    #[test]
    fn fullscreen_fit_and_reserve_collapse_to_a_top_hairline() {
        for mode in [BorderMode::Fit, BorderMode::Reserve] {
            let base = compute_layout(mode, FRAME, VIS_DOCK_BOTTOM, 16.0, Edges::ALL);
            let l = for_fullscreen(base, mode, FRAME, 16.0);
            let top = l.top.expect("leader window stays resident");
            approx(
                top.rect,
                Rect::new(
                    0.0,
                    982.0 - AUTOHIDE_MENU_FALLBACK,
                    1512.0,
                    AUTOHIDE_MENU_FALLBACK,
                ),
            );
            assert_eq!(top.level, LEVEL_MENU_TINT);
            assert!(l.bottom.is_none() && l.left.is_none() && l.right.is_none());
            assert!(
                l.reserved.is_none(),
                "nothing to enforce in a fullscreen Space"
            );
        }
    }

    #[test]
    fn fullscreen_leaves_overlay_untouched() {
        let base = compute_layout(
            BorderMode::Overlay,
            FRAME,
            VIS_DOCK_BOTTOM,
            16.0,
            Edges::ALL,
        );
        assert_eq!(for_fullscreen(base, BorderMode::Overlay, FRAME, 16.0), base);
    }

    #[test]
    fn fullscreen_hairline_never_exceeds_a_thin_border() {
        let base = compute_layout(BorderMode::Fit, FRAME, VIS_DOCK_BOTTOM, 2.0, Edges::ALL);
        let l = for_fullscreen(base, BorderMode::Fit, FRAME, 2.0);
        assert_eq!(l.top.unwrap().rect.h, 2.0);
    }
}
