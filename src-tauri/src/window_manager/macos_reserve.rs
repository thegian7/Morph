//! "Reserve space" mode: keep other apps' windows out of the border strips.
//!
//! macOS has no public API for reserving a screen edge (Windows has
//! AppBars). Instead, like tiling managers' "outer gap", we watch on-screen
//! windows and slide or shrink any that intrude into the border, using the
//! Accessibility API. Requires the user to grant Accessibility access.
//!
//! The enforcer is a background thread polling at a few Hz. It does nothing
//! while the left mouse button is held, so the user can drag a window freely;
//! the window snaps inside the reserved area when released.

use super::layout::{fit_into, Rect};
use std::collections::HashMap;
use std::ffi::{c_void, CStr};
use std::sync::{Mutex, Once};
use std::time::Duration;

/// The area to keep windows inside, and the display it belongs to, both in
/// CoreGraphics global coordinates (top-left origin).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Target {
    /// Where windows must stay.
    pub area: Rect,
    /// The usable area before the border was reserved (`visibleFrame`);
    /// windows snapped to its edges are trimmed rather than slid.
    pub outer: Rect,
    /// The whole display.
    pub display: Rect,
}

static TARGET: Mutex<Option<Target>> = Mutex::new(None);
static START: Once = Once::new();

const POLL: Duration = Duration::from_millis(250);
const IDLE_POLL: Duration = Duration::from_millis(1000);
/// Give up on a window after this many attempts that didn't stick (apps
/// with a minimum size larger than the area, or that refuse AX moves).
const MAX_ATTEMPTS: u8 = 3;
/// Differences below this are float noise / rounding by the app.
const TOLERANCE: f64 = 1.5;
/// Windows smaller than this are panels/HUDs we leave alone.
const MIN_WINDOW: f64 = 40.0;

/// Set (or clear, with `None`) the area windows must stay inside. Starts the
/// enforcer thread the first time a target is set.
pub fn set_target(target: Option<Target>) {
    if let Ok(mut t) = TARGET.lock() {
        *t = target;
    }
    if target.is_some() {
        START.call_once(|| {
            if !is_trusted() {
                // Shows the system "would like to control this computer" prompt.
                request_trust();
            }
            std::thread::Builder::new()
                .name("morph-reserve".into())
                .spawn(enforce_loop)
                .ok();
        });
    }
}

fn current_target() -> Option<Target> {
    TARGET.lock().ok().and_then(|t| *t)
}

/// Whether Morph has Accessibility access.
pub fn is_trusted() -> bool {
    // SAFETY: plain C call with no arguments.
    unsafe { AXIsProcessTrusted() }
}

/// Ask for Accessibility access (system prompt) and return the current state.
pub fn request_trust() -> bool {
    // SAFETY: CF objects are created and released here; the dictionary
    // retains its key and value.
    unsafe {
        let keys = [kAXTrustedCheckOptionPrompt];
        let values = [kCFBooleanTrue];
        let options = CFDictionaryCreate(
            std::ptr::null(),
            keys.as_ptr(),
            values.as_ptr(),
            1,
            &kCFTypeDictionaryKeyCallBacks,
            &kCFTypeDictionaryValueCallBacks,
        );
        let trusted = AXIsProcessTrustedWithOptions(options);
        if !options.is_null() {
            CFRelease(options);
        }
        trusted
    }
}

fn enforce_loop() {
    let own_pid = std::process::id() as i64;
    let mut attempts: HashMap<i64, u8> = HashMap::new();
    let mut warned_untrusted = false;

    loop {
        let Some(target) = current_target() else {
            attempts.clear();
            std::thread::sleep(IDLE_POLL);
            continue;
        };
        if !is_trusted() {
            if !warned_untrusted {
                eprintln!("[reserve] Accessibility access not granted; windows won't be moved");
                warned_untrusted = true;
            }
            std::thread::sleep(IDLE_POLL);
            continue;
        }
        warned_untrusted = false;

        // Let the user finish dragging/resizing before correcting anything.
        // SAFETY: plain C call.
        if unsafe {
            CGEventSourceButtonState(K_CG_EVENT_SOURCE_STATE_COMBINED, K_CG_MOUSE_BUTTON_LEFT)
        } {
            std::thread::sleep(POLL);
            continue;
        }

        let mut seen = Vec::new();
        for win in on_screen_windows() {
            if win.pid == own_pid || win.layer != 0 || win.alpha <= 0.0 {
                continue;
            }
            let b = win.bounds;
            if b.w < MIN_WINDOW || b.h < MIN_WINDOW {
                continue;
            }
            // Only windows centred on the target display.
            if !target
                .display
                .contains_point(b.x + b.w / 2.0, b.y + b.h / 2.0)
            {
                continue;
            }
            // Native fullscreen windows live in their own Space and fill the
            // whole display; never touch them.
            if b.approx_eq(&target.display, TOLERANCE) {
                continue;
            }
            seen.push(win.number);

            let desired = fit_into(b, target.area, target.outer);
            if desired.approx_eq(&b, TOLERANCE) {
                attempts.remove(&win.number);
                continue;
            }
            let n = attempts.entry(win.number).or_insert(0);
            if *n >= MAX_ATTEMPTS {
                continue;
            }
            *n += 1;
            move_window(win.pid as i32, b, desired);
        }
        attempts.retain(|k, _| seen.contains(k));

        std::thread::sleep(POLL);
    }
}

struct WindowInfo {
    number: i64,
    pid: i64,
    layer: i64,
    alpha: f64,
    bounds: Rect,
}

/// Snapshot of on-screen windows (front to back), CG coordinates.
fn on_screen_windows() -> Vec<WindowInfo> {
    let mut out = Vec::new();
    // SAFETY: we own the returned array (Copy rule) and release it; values
    // read from it are borrowed for the duration of the loop.
    unsafe {
        let list = CGWindowListCopyWindowInfo(
            K_CG_WINDOW_LIST_ON_SCREEN_ONLY | K_CG_WINDOW_LIST_EXCLUDE_DESKTOP,
            0,
        );
        if list.is_null() {
            return out;
        }
        for i in 0..CFArrayGetCount(list) {
            let dict = CFArrayGetValueAtIndex(list, i);
            if dict.is_null() {
                continue;
            }
            let bounds_dict = CFDictionaryGetValue(dict, kCGWindowBounds);
            let mut rect = CGRect::default();
            if bounds_dict.is_null()
                || !CGRectMakeWithDictionaryRepresentation(bounds_dict, &mut rect)
            {
                continue;
            }
            out.push(WindowInfo {
                number: dict_i64(dict, kCGWindowNumber).unwrap_or(-1),
                pid: dict_i64(dict, kCGWindowOwnerPID).unwrap_or(-1),
                layer: dict_i64(dict, kCGWindowLayer).unwrap_or(-1),
                alpha: dict_f64(dict, kCGWindowAlpha).unwrap_or(1.0),
                bounds: Rect::new(
                    rect.origin.x,
                    rect.origin.y,
                    rect.size.width,
                    rect.size.height,
                ),
            });
        }
        CFRelease(list);
    }
    out
}

unsafe fn dict_i64(dict: *const c_void, key: CFStringRef) -> Option<i64> {
    let n = CFDictionaryGetValue(dict, key);
    let mut v: i64 = 0;
    (!n.is_null() && CFNumberGetValue(n, K_CF_NUMBER_SINT64, &mut v as *mut i64 as *mut c_void))
        .then_some(v)
}

unsafe fn dict_f64(dict: *const c_void, key: CFStringRef) -> Option<f64> {
    let n = CFDictionaryGetValue(dict, key);
    let mut v: f64 = 0.0;
    (!n.is_null() && CFNumberGetValue(n, K_CF_NUMBER_DOUBLE, &mut v as *mut f64 as *mut c_void))
        .then_some(v)
}

/// Find the AX window of `pid` whose frame matches `current` and give it the
/// `desired` frame.
fn move_window(pid: i32, current: Rect, desired: Rect) {
    // SAFETY: every CF/AX object we copy or create is released before return;
    // array elements are borrowed from the retained array.
    unsafe {
        let app = AXUIElementCreateApplication(pid);
        if app.is_null() {
            return;
        }
        // One unresponsive app must not stall the whole loop.
        AXUIElementSetMessagingTimeout(app, 0.25);

        let attr_windows = cfstr(c"AXWindows");
        let attr_pos = cfstr(c"AXPosition");
        let attr_size = cfstr(c"AXSize");

        let mut windows: *const c_void = std::ptr::null();
        if AXUIElementCopyAttributeValue(app, attr_windows, &mut windows) == K_AX_SUCCESS
            && !windows.is_null()
        {
            for i in 0..CFArrayGetCount(windows) {
                let win = CFArrayGetValueAtIndex(windows, i);
                let (Some(p), Some(s)) = (
                    ax_value::<CGPoint>(win, attr_pos, K_AX_VALUE_CG_POINT),
                    ax_value::<CGSize>(win, attr_size, K_AX_VALUE_CG_SIZE),
                ) else {
                    continue;
                };
                let frame = Rect::new(p.x, p.y, s.width, s.height);
                if !frame.approx_eq(&current, 2.0) {
                    continue;
                }
                let pos = CGPoint {
                    x: desired.x,
                    y: desired.y,
                };
                let size = CGSize {
                    width: desired.w,
                    height: desired.h,
                };
                // Position, size, position: moving first lets a shrink
                // succeed near screen edges, and the second move corrects
                // apps that re-anchor after a resize.
                set_ax_value(win, attr_pos, K_AX_VALUE_CG_POINT, &pos);
                if (desired.w - current.w).abs() > TOLERANCE
                    || (desired.h - current.h).abs() > TOLERANCE
                {
                    set_ax_value(win, attr_size, K_AX_VALUE_CG_SIZE, &size);
                    set_ax_value(win, attr_pos, K_AX_VALUE_CG_POINT, &pos);
                }
                break;
            }
            CFRelease(windows);
        }

        CFRelease(attr_windows);
        CFRelease(attr_pos);
        CFRelease(attr_size);
        CFRelease(app);
    }
}

unsafe fn cfstr(s: &CStr) -> CFStringRef {
    CFStringCreateWithCString(std::ptr::null(), s.as_ptr(), K_CF_STRING_ENCODING_UTF8)
}

unsafe fn ax_value<T: Default>(el: *const c_void, attr: CFStringRef, ty: u32) -> Option<T> {
    let mut value: *const c_void = std::ptr::null();
    if AXUIElementCopyAttributeValue(el, attr, &mut value) != K_AX_SUCCESS || value.is_null() {
        return None;
    }
    let mut out = T::default();
    let ok = AXValueGetValue(value, ty, &mut out as *mut T as *mut c_void);
    CFRelease(value);
    ok.then_some(out)
}

unsafe fn set_ax_value<T>(el: *const c_void, attr: CFStringRef, ty: u32, v: &T) {
    let value = AXValueCreate(ty, v as *const T as *const c_void);
    if !value.is_null() {
        AXUIElementSetAttributeValue(el, attr, value);
        CFRelease(value);
    }
}

// ---------------------------------------------------------------------------
// FFI (declarations checked against the macOS SDK headers: AXUIElement.h,
// AXValue.h, AXValueConstants.h, CGWindow.h, CGEventSource.h, CFArray.h,
// CFDictionary.h, CFNumber.h)
// ---------------------------------------------------------------------------

type CFStringRef = *const c_void;

#[repr(C)]
#[derive(Debug, Default, Clone, Copy)]
struct CGPoint {
    x: f64,
    y: f64,
}

#[repr(C)]
#[derive(Debug, Default, Clone, Copy)]
struct CGSize {
    width: f64,
    height: f64,
}

#[repr(C)]
#[derive(Debug, Default, Clone, Copy)]
struct CGRect {
    origin: CGPoint,
    size: CGSize,
}

/// Opaque `CFDictionaryKeyCallBacks` / `CFDictionaryValueCallBacks`; only
/// ever passed by address.
#[repr(C)]
struct CFDictionaryCallBacks {
    _private: [u8; 0],
}

const K_AX_SUCCESS: i32 = 0;
const K_AX_VALUE_CG_POINT: u32 = 1;
const K_AX_VALUE_CG_SIZE: u32 = 2;
const K_CG_WINDOW_LIST_ON_SCREEN_ONLY: u32 = 1 << 0;
const K_CG_WINDOW_LIST_EXCLUDE_DESKTOP: u32 = 1 << 4;
const K_CG_EVENT_SOURCE_STATE_COMBINED: i32 = 0;
const K_CG_MOUSE_BUTTON_LEFT: u32 = 0;
const K_CF_NUMBER_SINT64: isize = 4;
const K_CF_NUMBER_DOUBLE: isize = 13;
const K_CF_STRING_ENCODING_UTF8: u32 = 0x0800_0100;

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    static kAXTrustedCheckOptionPrompt: CFStringRef;
    fn AXIsProcessTrusted() -> bool;
    fn AXIsProcessTrustedWithOptions(options: *const c_void) -> bool;
    fn AXUIElementCreateApplication(pid: i32) -> *const c_void;
    fn AXUIElementSetMessagingTimeout(element: *const c_void, seconds: f32) -> i32;
    fn AXUIElementCopyAttributeValue(
        element: *const c_void,
        attribute: CFStringRef,
        value: *mut *const c_void,
    ) -> i32;
    fn AXUIElementSetAttributeValue(
        element: *const c_void,
        attribute: CFStringRef,
        value: *const c_void,
    ) -> i32;
    fn AXValueCreate(ty: u32, value: *const c_void) -> *const c_void;
    fn AXValueGetValue(value: *const c_void, ty: u32, out: *mut c_void) -> bool;
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    static kCGWindowNumber: CFStringRef;
    static kCGWindowOwnerPID: CFStringRef;
    static kCGWindowLayer: CFStringRef;
    static kCGWindowAlpha: CFStringRef;
    static kCGWindowBounds: CFStringRef;
    fn CGWindowListCopyWindowInfo(option: u32, relative_to: u32) -> *const c_void;
    fn CGRectMakeWithDictionaryRepresentation(dict: *const c_void, rect: *mut CGRect) -> bool;
    fn CGEventSourceButtonState(state: i32, button: u32) -> bool;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    static kCFBooleanTrue: *const c_void;
    static kCFTypeDictionaryKeyCallBacks: CFDictionaryCallBacks;
    static kCFTypeDictionaryValueCallBacks: CFDictionaryCallBacks;
    fn CFRelease(cf: *const c_void);
    fn CFArrayGetCount(array: *const c_void) -> isize;
    fn CFArrayGetValueAtIndex(array: *const c_void, index: isize) -> *const c_void;
    fn CFDictionaryGetValue(dict: *const c_void, key: *const c_void) -> *const c_void;
    fn CFDictionaryCreate(
        allocator: *const c_void,
        keys: *const *const c_void,
        values: *const *const c_void,
        count: isize,
        key_callbacks: *const CFDictionaryCallBacks,
        value_callbacks: *const CFDictionaryCallBacks,
    ) -> *const c_void;
    fn CFNumberGetValue(number: *const c_void, ty: isize, out: *mut c_void) -> bool;
    fn CFStringCreateWithCString(
        allocator: *const c_void,
        s: *const std::os::raw::c_char,
        encoding: u32,
    ) -> CFStringRef;
}
