// =============================================================================
// TS-2: Windows Transparent Click-Through Overlay Spike
// =============================================================================
//
// This spike validates two approaches for click-through on Windows:
//
// 1. **Tauri API**: `setIgnoreCursorEvents(true)` from the frontend.
//    Known issue: Tauri #11461 reports unreliable behavior on Windows.
//
// 2. **Native fallback**: Access the HWND via Tauri's `window.hwnd()` and
//    apply Win32 extended window styles:
//    - WS_EX_TRANSPARENT: passes mouse events to windows beneath
//    - WS_EX_LAYERED: required for per-pixel alpha / transparency
//    - WS_EX_TOPMOST: keeps the window above all non-topmost windows
//    - WS_EX_TOOLWINDOW: hides from Alt+Tab and taskbar
//    - WS_EX_NOACTIVATE: prevents the window from stealing focus
//
// The native fallback is always applied on Windows for reliability.
// =============================================================================

use tauri::Manager;

// ---------------------------------------------------------------------------
// Windows-specific overlay configuration
// ---------------------------------------------------------------------------
#[cfg(target_os = "windows")]
mod windows_overlay {
    use tauri::WebviewWindow;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::{DwmExtendFrameIntoClientArea, MARGINS};
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTOPRIMARY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongW, SetWindowLongW, SetWindowPos, GWL_EXSTYLE, HWND_TOPMOST, SWP_FRAMECHANGED,
        SWP_NOMOVE, SWP_NOSIZE, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
        WS_EX_TOPMOST, WS_EX_TRANSPARENT,
    };

    /// Configure the overlay window for Windows:
    /// - Cover the entire primary monitor
    /// - Set extended window styles for click-through and transparency
    /// - Use DWM to extend the frame for proper alpha compositing
    pub fn configure_overlay(window: &WebviewWindow) {
        // Get the HWND from the Tauri window
        let hwnd_raw = window.hwnd().expect("failed to get HWND");
        let hwnd = HWND(hwnd_raw.0);

        // --- Step 1: Size the window to cover the primary monitor ---
        let (x, y, width, height) = get_primary_monitor_rect(hwnd);
        window
            .set_position(tauri::LogicalPosition::new(x as f64, y as f64))
            .expect("failed to set position");
        window
            .set_size(tauri::LogicalSize::new(width as f64, height as f64))
            .expect("failed to set size");

        // --- Step 2: Apply extended window styles ---
        //
        // WS_EX_TRANSPARENT: The window is transparent to mouse input.
        //   Mouse messages pass through to whatever is beneath.
        //   This is the Win32 equivalent of macOS setIgnoresMouseEvents.
        //
        // WS_EX_LAYERED: Required for transparency/alpha on Windows.
        //   Without this, the transparent background won't composite.
        //   On Vista+ with DWM, this enables per-pixel alpha blending.
        //
        // WS_EX_TOPMOST: Keeps the window above all non-topmost windows.
        //   Equivalent to HWND_TOPMOST in SetWindowPos.
        //
        // WS_EX_TOOLWINDOW: Prevents the window from appearing in the
        //   Alt+Tab switcher or the taskbar. Combined with skipTaskbar
        //   in tauri.conf.json.
        //
        // WS_EX_NOACTIVATE: Prevents the window from becoming the foreground
        //   window when clicked (belt-and-suspenders with WS_EX_TRANSPARENT).
        //
        unsafe {
            let current_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
            let new_style = current_style
                | WS_EX_TRANSPARENT.0 as i32
                | WS_EX_LAYERED.0 as i32
                | WS_EX_TOPMOST.0 as i32
                | WS_EX_TOOLWINDOW.0 as i32
                | WS_EX_NOACTIVATE.0 as i32;
            SetWindowLongW(hwnd, GWL_EXSTYLE, new_style);

            // Apply the style changes and ensure TOPMOST positioning
            let _ = SetWindowPos(
                hwnd,
                HWND_TOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_FRAMECHANGED,
            );
        }

        // --- Step 3: Extend DWM frame into client area ---
        // This enables proper alpha compositing through the DWM compositor.
        // Setting all margins to -1 extends the glass frame across the
        // entire window, allowing our CSS transparent background to work
        // correctly. Without this, the transparent regions may render as
        // black or opaque.
        unsafe {
            let margins = MARGINS {
                cxLeftWidth: -1,
                cxRightWidth: -1,
                cyTopHeight: -1,
                cyBottomHeight: -1,
            };
            let _ = DwmExtendFrameIntoClientArea(hwnd, &margins);
        }

        // Show the window after all configuration is complete
        window.show().expect("failed to show window");

        println!(
            "Windows overlay configured: {}x{} at ({}, {}), \
             styles=WS_EX_TRANSPARENT|WS_EX_LAYERED|WS_EX_TOPMOST|WS_EX_TOOLWINDOW|WS_EX_NOACTIVATE",
            width, height, x, y
        );
    }

    /// Get the full area of the primary monitor (including taskbar region).
    /// Uses rcMonitor instead of rcWork so the overlay border extends
    /// behind the taskbar.
    fn get_primary_monitor_rect(hwnd: HWND) -> (i32, i32, i32, i32) {
        unsafe {
            let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTOPRIMARY);
            let mut info = MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };
            let _ = GetMonitorInfoW(monitor, &mut info);

            let rect = info.rcMonitor;
            (
                rect.left,
                rect.top,
                rect.right - rect.left,
                rect.bottom - rect.top,
            )
        }
    }
}

// ---------------------------------------------------------------------------
// macOS-specific overlay configuration (reused from TS-1 for local testing)
// ---------------------------------------------------------------------------
#[cfg(target_os = "macos")]
mod macos_overlay {
    use objc2_app_kit::{NSScreen, NSWindow, NSWindowCollectionBehavior};
    use objc2_foundation::{MainThreadMarker, NSRect};
    use tauri::WebviewWindow;

    pub fn configure_overlay(window: &WebviewWindow) {
        let mtm = unsafe { MainThreadMarker::new_unchecked() };
        let screen = NSScreen::mainScreen(mtm).expect("no main screen");
        let frame: NSRect = screen.frame();

        window
            .set_position(tauri::LogicalPosition::new(frame.origin.x, frame.origin.y))
            .expect("failed to set position");
        window
            .set_size(tauri::LogicalSize::new(frame.size.width, frame.size.height))
            .expect("failed to set size");

        let ns_window_ptr = window.ns_window().expect("failed to get NSWindow");
        let ns_window: &NSWindow = unsafe { &*(ns_window_ptr as *const NSWindow) };

        ns_window.setLevel(25);
        ns_window.setCollectionBehavior(
            NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::Stationary
                | NSWindowCollectionBehavior::IgnoresCycle,
        );
        ns_window.setIgnoresMouseEvents(true);
        ns_window.setHasShadow(false);

        window.show().expect("failed to show window");

        println!(
            "macOS overlay configured: {}x{} at ({}, {}), level=25",
            frame.size.width, frame.size.height, frame.origin.x, frame.origin.y
        );
    }
}

// ---------------------------------------------------------------------------
// App entry point
// ---------------------------------------------------------------------------
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let window = app
                .get_webview_window("overlay")
                .expect("overlay window not found");

            #[cfg(target_os = "windows")]
            windows_overlay::configure_overlay(&window);

            #[cfg(target_os = "macos")]
            macos_overlay::configure_overlay(&window);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
