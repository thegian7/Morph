//! Native macOS border rendering with Core Animation.
//!
//! Each [`Shape`] becomes a borderless, transparent, click-through NSWindow
//! whose content layer hosts one `CAShapeLayer`: a plain fill for the
//! menu-bar / Dock strips, or a picture frame with rounded inner corners
//! (even-odd fill) for `Reserve` / `Overlay`. Color fades and the pulse are
//! Core Animation animations, so the GPU does the work and no JavaScript
//! runs per frame.
//!
//! Everything here must run on the main thread.

use super::layout::{Rect, Shape, ShapeKind};
use objc2::rc::{Allocated, Retained};
use objc2::runtime::{AnyClass, AnyObject, ClassBuilder, Sel};
use objc2::{msg_send, sel, ClassType};
use objc2_app_kit::{
    NSBackingStoreType, NSColor, NSWindow, NSWindowCollectionBehavior, NSWindowStyleMask,
};
use objc2_core_foundation::{CGPoint, CGRect, CGSize};
use objc2_core_graphics::{CGColor, CGMutablePath};
use objc2_foundation::{MainThreadMarker, NSNumber, NSPoint, NSRect, NSSize, NSString};
use objc2_quartz_core::{
    kCAFillRuleEvenOdd, kCAFillRuleNonZero, kCAMediaTimingFunctionEaseInEaseOut, CABasicAnimation,
    CAMediaTiming, CAMediaTimingFunction, CAShapeLayer, CATransaction,
};
use std::cell::RefCell;
use std::sync::OnceLock;

/// How far the pulse swings opacity either side of its base (matches the
/// former CSS animation).
pub const PULSE_AMPLITUDE: f64 = 0.15;
/// Duration of color and opacity cross-fades, in seconds.
pub const FADE_SECONDS: f64 = 2.0;

/// What the border should look like right now (from `border-render`).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RenderState {
    pub r: f64,
    pub g: f64,
    pub b: f64,
    pub opacity: f64,
    /// Full pulse cycle in milliseconds; 0 = no pulse.
    pub pulse_ms: f64,
}

impl RenderState {
    pub const HIDDEN: RenderState = RenderState {
        r: 0.0,
        g: 0.0,
        b: 0.0,
        opacity: 0.0,
        pulse_ms: 0.0,
    };

    /// Build from the overlay's payload (`#rrggbb`, 0–1 opacity, ms).
    pub fn from_payload(color: &str, opacity: f64, pulse_ms: f64) -> Option<Self> {
        let hex = color.strip_prefix('#')?;
        if hex.len() != 6 {
            return None;
        }
        let n = u32::from_str_radix(hex, 16).ok()?;
        let ch = |shift: u32| f64::from((n >> shift) & 0xff) / 255.0;
        Some(Self {
            r: ch(16),
            g: ch(8),
            b: ch(0),
            opacity: opacity.clamp(0.0, 1.0),
            pulse_ms: pulse_ms.max(0.0),
        })
    }

    fn same_color(&self, other: &RenderState) -> bool {
        self.r == other.r && self.g == other.g && self.b == other.b
    }
}

/// Opacity range the pulse animates between for a base opacity.
pub fn pulse_range(opacity: f64) -> (f64, f64) {
    (
        (opacity - PULSE_AMPLITUDE).max(0.0),
        (opacity + PULSE_AMPLITUDE).min(1.0),
    )
}

/// Clamp a corner radius so `CGPathAddRoundedRect`'s precondition holds
/// (2 × radius must fit in both dimensions).
pub fn safe_radius(radius: f64, w: f64, h: f64) -> f64 {
    radius.min(w / 2.0).min(h / 2.0).max(0.0)
}

struct NativeStrip {
    window: Retained<NSWindow>,
    layer: Retained<CAShapeLayer>,
}

thread_local! {
    static STRIPS: RefCell<Vec<NativeStrip>> = const { RefCell::new(Vec::new()) };
    static CURRENT: RefCell<RenderState> = const { RefCell::new(RenderState::HIDDEN) };
}

/// `constrainFrameRect:toScreen:` override: keep the frame we set. AppKit
/// otherwise pushes windows below menu-bar level out from under the menu
/// bar, which is exactly where the menu-bar tint has to sit.
extern "C" fn keep_frame(
    _this: &AnyObject,
    _cmd: Sel,
    frame: NSRect,
    _screen: *mut AnyObject,
) -> NSRect {
    frame
}

fn border_window_class() -> &'static AnyClass {
    static CLASS: OnceLock<&'static AnyClass> = OnceLock::new();
    CLASS.get_or_init(|| {
        if let Some(existing) = AnyClass::get(c"MorphBorderWindow") {
            return existing;
        }
        let mut builder = ClassBuilder::new(c"MorphBorderWindow", NSWindow::class())
            .expect("MorphBorderWindow class name is free");
        // SAFETY: matches -[NSWindow constrainFrameRect:toScreen:].
        unsafe {
            builder.add_method(
                sel!(constrainFrameRect:toScreen:),
                keep_frame as extern "C" fn(_, _, _, _) -> _,
            );
        }
        builder.register()
    })
}

fn to_ns(r: Rect) -> NSRect {
    NSRect::new(NSPoint::new(r.x, r.y), NSSize::new(r.w, r.h))
}

fn cg_rect(x: f64, y: f64, w: f64, h: f64) -> CGRect {
    CGRect::new(CGPoint::new(x, y), CGSize::new(w, h))
}

fn ns_str(s: &str) -> Retained<NSString> {
    NSString::from_str(s)
}

fn make_strip(mtm: MainThreadMarker, frame: Rect) -> Option<NativeStrip> {
    let _ = mtm;
    // SAFETY: allocating an instance of an NSWindow subclass and running the
    // designated initializer on it; main thread.
    let window: Retained<NSWindow> = unsafe {
        let alloc: Allocated<NSWindow> = msg_send![border_window_class(), alloc];
        NSWindow::initWithContentRect_styleMask_backing_defer(
            alloc,
            to_ns(frame),
            NSWindowStyleMask::Borderless,
            NSBackingStoreType::Buffered,
            false,
        )
    };
    // SAFETY: we hold the only strong reference; AppKit must not release it
    // on close.
    unsafe { window.setReleasedWhenClosed(false) };
    window.setOpaque(false);
    window.setBackgroundColor(Some(&NSColor::clearColor()));
    window.setHasShadow(false);
    window.setIgnoresMouseEvents(true);
    window.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::Stationary
            | NSWindowCollectionBehavior::IgnoresCycle
            | NSWindowCollectionBehavior::FullScreenAuxiliary
            | NSWindowCollectionBehavior::CanJoinAllApplications,
    );

    let view = window.contentView()?;
    view.setWantsLayer(true);
    let root = view.layer()?;
    let layer = CAShapeLayer::new();
    layer.setOpacity(0.0);
    root.addSublayer(&layer);
    Some(NativeStrip { window, layer })
}

fn configure_strip(strip: &NativeStrip, shape: &Shape) {
    let f = shape.frame;
    strip.window.setLevel(shape.level);
    strip.window.setFrame_display(to_ns(f), true);

    let bounds = cg_rect(0.0, 0.0, f.w, f.h);
    let path = CGMutablePath::new();
    // SAFETY: a null transform is allowed; `path` is a valid mutable path.
    unsafe { CGMutablePath::add_rect(Some(&path), std::ptr::null(), bounds) };
    let even_odd = match shape.kind {
        ShapeKind::Fill => false,
        ShapeKind::Frame { inner, radius } => {
            // Inner rect in window-local coordinates (may extend past the
            // window on disabled edges; the layer clips nothing, but the
            // window bounds do).
            let local = cg_rect(inner.x - f.x, inner.y - f.y, inner.w, inner.h);
            let r = safe_radius(radius, inner.w, inner.h);
            if inner.w > 0.0 && inner.h > 0.0 {
                // SAFETY: as above; radius satisfies 2r <= w, h.
                unsafe {
                    CGMutablePath::add_rounded_rect(Some(&path), std::ptr::null(), local, r, r)
                };
            }
            true
        }
    };

    CATransaction::begin();
    CATransaction::setDisableActions(true);
    strip.layer.setFrame(bounds);
    strip.layer.setPath(Some(&path));
    // SAFETY: reading framework string constants.
    strip.layer.setFillRule(unsafe {
        if even_odd {
            kCAFillRuleEvenOdd
        } else {
            kCAFillRuleNonZero
        }
    });
    CATransaction::commit();

    strip.window.orderFrontRegardless();
}

/// Replace the set of border windows with `shapes`, reusing windows where
/// possible, and paint them with the current state (no fade).
pub fn set_shapes(mtm: MainThreadMarker, shapes: &[Shape]) {
    let state = CURRENT.with(|c| *c.borrow());
    STRIPS.with(|strips| {
        let mut strips = strips.borrow_mut();
        while strips.len() > shapes.len() {
            if let Some(extra) = strips.pop() {
                extra.window.orderOut(None);
            }
        }
        while strips.len() < shapes.len() {
            match make_strip(mtm, shapes[strips.len()].frame) {
                Some(s) => strips.push(s),
                None => {
                    eprintln!("[render] failed to create border window");
                    return;
                }
            }
        }
        for (strip, shape) in strips.iter().zip(shapes) {
            configure_strip(strip, shape);
            paint(&strip.layer, None, state);
        }
    });
}

/// Move every border window to `state`, cross-fading color and opacity.
pub fn set_state(_mtm: MainThreadMarker, state: RenderState) {
    let previous = CURRENT.with(|c| c.replace(state));
    if previous == state {
        return;
    }
    STRIPS.with(|strips| {
        for strip in strips.borrow().iter() {
            paint(&strip.layer, Some(previous), state);
        }
    });
}

fn as_object<T: AsRef<AnyObject> + ?Sized>(o: &T) -> &AnyObject {
    o.as_ref()
}

/// Apply `state` to `layer`. With `from`, color and opacity changes fade
/// over [`FADE_SECONDS`]; without it they apply instantly.
fn paint(layer: &CAShapeLayer, from: Option<RenderState>, state: RenderState) {
    let color = CGColor::new_srgb(state.r, state.g, state.b, 1.0);

    if let Some(prev) = from {
        if !prev.same_color(&state) {
            let old = CGColor::new_srgb(prev.r, prev.g, prev.b, 1.0);
            let anim = CABasicAnimation::animationWithKeyPath(Some(&ns_str("fillColor")));
            // SAFETY: CGColor is toll-free bridged to an Objective-C object.
            unsafe {
                anim.setFromValue(Some(&*(&*old as *const CGColor as *const AnyObject)));
                anim.setToValue(Some(&*(&*color as *const CGColor as *const AnyObject)));
            }
            anim.setDuration(FADE_SECONDS);
            layer.addAnimation_forKey(&anim, Some(&ns_str("fade-color")));
        }
        if prev.opacity != state.opacity {
            let anim = CABasicAnimation::animationWithKeyPath(Some(&ns_str("opacity")));
            let from_v = NSNumber::new_f64(prev.opacity);
            let to_v = NSNumber::new_f64(state.opacity);
            // SAFETY: NSNumber values for an opacity animation.
            unsafe {
                anim.setFromValue(Some(as_object(&*from_v)));
                anim.setToValue(Some(as_object(&*to_v)));
            }
            anim.setDuration(FADE_SECONDS);
            layer.addAnimation_forKey(&anim, Some(&ns_str("fade-opacity")));
        }
    }

    CATransaction::begin();
    CATransaction::setDisableActions(true);
    layer.setFillColor(Some(&color));
    layer.setOpacity(state.opacity as f32);
    CATransaction::commit();

    let pulse_key = ns_str("pulse");
    if state.pulse_ms > 0.0 && state.opacity > 0.0 {
        let (lo, hi) = pulse_range(state.opacity);
        let anim = CABasicAnimation::animationWithKeyPath(Some(&ns_str("opacity")));
        let lo_v = NSNumber::new_f64(lo);
        let hi_v = NSNumber::new_f64(hi);
        // SAFETY: NSNumber values for an opacity animation.
        unsafe {
            anim.setFromValue(Some(as_object(&*lo_v)));
            anim.setToValue(Some(as_object(&*hi_v)));
        }
        // One full cycle is lo → hi → lo.
        anim.setDuration(state.pulse_ms / 2000.0);
        anim.setAutoreverses(true);
        anim.setRepeatCount(f32::INFINITY);
        // SAFETY: reading a framework string constant.
        let ease = unsafe { kCAMediaTimingFunctionEaseInEaseOut };
        anim.setTimingFunction(Some(&CAMediaTimingFunction::functionWithName(ease)));
        layer.addAnimation_forKey(&anim, Some(&pulse_key));
    } else {
        layer.removeAnimationForKey(&pulse_key);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_hex_payloads() {
        let s = RenderState::from_payload("#4A9B6E", 0.6, 4000.0).unwrap();
        assert!((s.r - 0x4a as f64 / 255.0).abs() < 1e-9);
        assert!((s.g - 0x9b as f64 / 255.0).abs() < 1e-9);
        assert!((s.b - 0x6e as f64 / 255.0).abs() < 1e-9);
        assert_eq!(s.opacity, 0.6);
        assert_eq!(s.pulse_ms, 4000.0);
    }

    #[test]
    fn rejects_malformed_colors_and_clamps_values() {
        assert!(RenderState::from_payload("4A9B6E", 1.0, 0.0).is_none());
        assert!(RenderState::from_payload("#abc", 1.0, 0.0).is_none());
        assert!(RenderState::from_payload("#zzzzzz", 1.0, 0.0).is_none());
        let s = RenderState::from_payload("#000000", 3.0, -5.0).unwrap();
        assert_eq!(s.opacity, 1.0);
        assert_eq!(s.pulse_ms, 0.0);
    }

    #[test]
    fn pulse_range_stays_within_zero_and_one() {
        assert_eq!(pulse_range(0.5), (0.35, 0.65));
        assert_eq!(pulse_range(0.05).0, 0.0);
        assert_eq!(pulse_range(0.95).1, 1.0);
    }

    #[test]
    fn safe_radius_respects_rounded_rect_precondition() {
        assert_eq!(safe_radius(12.0, 100.0, 100.0), 12.0);
        assert_eq!(safe_radius(12.0, 10.0, 100.0), 5.0);
        assert_eq!(safe_radius(12.0, 0.0, 100.0), 0.0);
    }
}
