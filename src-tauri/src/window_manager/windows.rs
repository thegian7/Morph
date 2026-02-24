use super::{MonitorInfo, OverlayManager, BORDER_LABELS};
use tauri::{Manager, WebviewWindow};
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT, TRUE};
use windows::Win32::Graphics::Dwm::DwmExtendFrameIntoClientArea;
use windows::Win32::UI::Controls::MARGINS;
use windows::Win32::Graphics::Gdi::{
    EnumDisplayMonitors, GetMonitorInfoW, MonitorFromWindow, HDC, HMONITOR, MONITORINFO,
    MONITORINFOEXW, MONITOR_DEFAULTTOPRIMARY,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongW, SetWindowLongW, SetWindowPos, GWL_EXSTYLE, HWND_TOPMOST, SWP_FRAMECHANGED,
    SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    WS_EX_TOPMOST, WS_EX_TRANSPARENT,
};

/// Windows overlay manager using Win32 APIs for TOPMOST,
/// WS_EX_TRANSPARENT, and WS_EX_LAYERED configuration.
pub struct WindowsOverlayManager {
    pub top: Option<WebviewWindow>,
    pub bottom: Option<WebviewWindow>,
    pub left: Option<WebviewWindow>,
    pub right: Option<WebviewWindow>,
    /// Which monitor to target: `"primary"` or a device name string.
    pub target_monitor: String,
}

impl Default for WindowsOverlayManager {
    fn default() -> Self {
        Self {
            top: None,
            bottom: None,
            left: None,
            right: None,
            target_monitor: "primary".to_string(),
        }
    }
}

impl WindowsOverlayManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Get the HWND from a Tauri WebviewWindow.
    fn get_hwnd(window: &WebviewWindow) -> Result<HWND, Box<dyn std::error::Error>> {
        let hwnd_raw = window.hwnd()?;
        Ok(HWND(hwnd_raw.0))
    }

    /// Apply Win32 extended window styles for click-through, transparency,
    /// always-on-top, and Alt+Tab hiding.
    fn apply_overlay_styles(hwnd: HWND) -> Result<(), Box<dyn std::error::Error>> {
        unsafe {
            let current_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
            let new_style = current_style
                | WS_EX_TRANSPARENT.0 as i32
                | WS_EX_LAYERED.0 as i32
                | WS_EX_TOPMOST.0 as i32
                | WS_EX_TOOLWINDOW.0 as i32
                | WS_EX_NOACTIVATE.0 as i32;
            SetWindowLongW(hwnd, GWL_EXSTYLE, new_style);

            // Commit style changes and enforce TOPMOST z-order
            SetWindowPos(
                hwnd,
                HWND_TOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_FRAMECHANGED | SWP_NOACTIVATE,
            )?;
        }
        Ok(())
    }

    /// Extend the DWM glass frame across the entire client area so that
    /// CSS transparent backgrounds composite correctly with per-pixel alpha.
    fn extend_dwm_frame(hwnd: HWND) -> Result<(), Box<dyn std::error::Error>> {
        unsafe {
            let margins = MARGINS {
                cxLeftWidth: -1,
                cxRightWidth: -1,
                cyTopHeight: -1,
                cyBottomHeight: -1,
            };
            DwmExtendFrameIntoClientArea(hwnd, &margins)?;
        }
        Ok(())
    }

    /// Configure a single border window with all required Win32 styles.
    fn configure_border_window(window: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
        let hwnd = Self::get_hwnd(window)?;
        Self::apply_overlay_styles(hwnd)?;
        Self::extend_dwm_frame(hwnd)?;
        Ok(())
    }

    /// Helper to iterate over all stored border windows.
    fn each_window(&self, mut f: impl FnMut(&WebviewWindow)) {
        for window in [&self.top, &self.bottom, &self.left, &self.right]
            .into_iter()
            .flatten()
        {
            f(window);
        }
    }

    /// Enumerate all connected monitors and return their info.
    pub fn get_available_monitors() -> Vec<MonitorInfo> {
        let mut monitors = Vec::new();

        unsafe {
            // Collect HMONITOR handles via callback
            let mut hmonitors: Vec<HMONITOR> = Vec::new();
            let _ = EnumDisplayMonitors(
                HDC::default(),
                None,
                Some(enum_monitor_callback),
                LPARAM(&mut hmonitors as *mut Vec<HMONITOR> as isize),
            );

            for hmon in hmonitors {
                let mut info = MONITORINFOEXW {
                    monitorInfo: MONITORINFO {
                        cbSize: std::mem::size_of::<MONITORINFOEXW>() as u32,
                        ..Default::default()
                    },
                    ..Default::default()
                };

                if GetMonitorInfoW(hmon, &mut info as *mut _ as *mut MONITORINFO).as_bool() {
                    let rect = info.monitorInfo.rcMonitor;
                    let is_primary = (info.monitorInfo.dwFlags & 1) != 0; // MONITORINFOF_PRIMARY = 1

                    // Convert device name from wide chars
                    let device_name = String::from_utf16_lossy(
                        &info.szDevice[..info
                            .szDevice
                            .iter()
                            .position(|&c| c == 0)
                            .unwrap_or(info.szDevice.len())],
                    );

                    let id = if is_primary {
                        "primary".to_string()
                    } else {
                        device_name.clone()
                    };

                    monitors.push(MonitorInfo {
                        id,
                        name: device_name,
                        width: (rect.right - rect.left) as f64,
                        height: (rect.bottom - rect.top) as f64,
                        x: rect.left as f64,
                        y: rect.top as f64,
                        is_primary,
                    });
                }
            }
        }

        monitors
    }

    /// Find the monitor rect for a given ID, falling back to primary.
    fn get_monitor_rect_for_id(id: &str, fallback_hwnd: HWND) -> (i32, i32, i32, i32) {
        if id == "primary" {
            return get_primary_monitor_rect(fallback_hwnd);
        }

        let monitors = Self::get_available_monitors();
        for mon in &monitors {
            if mon.id == id {
                return (
                    mon.x as i32,
                    mon.y as i32,
                    mon.width as i32,
                    mon.height as i32,
                );
            }
        }

        // Fallback to primary if saved monitor not found
        get_primary_monitor_rect(fallback_hwnd)
    }
}

/// Callback for `EnumDisplayMonitors` that collects HMONITOR handles.
unsafe extern "system" fn enum_monitor_callback(
    hmonitor: HMONITOR,
    _hdc: HDC,
    _lprect: *mut RECT,
    lparam: LPARAM,
) -> BOOL {
    let monitors = &mut *(lparam.0 as *mut Vec<HMONITOR>);
    monitors.push(hmonitor);
    TRUE
}

impl OverlayManager for WindowsOverlayManager {
    fn create_overlay_windows(
        &mut self,
        app: &tauri::AppHandle,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Retrieve the border windows created by lib.rs setup()
        let [top_label, bottom_label, left_label, right_label] = BORDER_LABELS;

        self.top = app.get_webview_window(top_label);
        self.bottom = app.get_webview_window(bottom_label);
        self.left = app.get_webview_window(left_label);
        self.right = app.get_webview_window(right_label);

        // Apply native Win32 styles to each border window
        for (label, window_opt) in [
            (top_label, &self.top),
            (bottom_label, &self.bottom),
            (left_label, &self.left),
            (right_label, &self.right),
        ] {
            match window_opt {
                Some(window) => {
                    if let Err(e) = Self::configure_border_window(window) {
                        eprintln!("Failed to configure border window '{}': {}", label, e);
                    }
                }
                None => {
                    eprintln!("Border window '{}' not found", label);
                }
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
        // Inset side-window layout to avoid corner overlap.
        // Windows uses top-left origin which matches Tauri's coordinate system.
        let positions: [(&Option<WebviewWindow>, f64, f64, f64, f64); 4] = [
            // Top: full width, thickness height
            (&self.top, screen_x, screen_y, screen_w, thickness),
            // Bottom: full width, thickness height
            (
                &self.bottom,
                screen_x,
                screen_y + screen_h - thickness,
                screen_w,
                thickness,
            ),
            // Left: inset vertically to avoid corner overlap
            (
                &self.left,
                screen_x,
                screen_y + thickness,
                thickness,
                screen_h - 2.0 * thickness,
            ),
            // Right: inset vertically to avoid corner overlap
            (
                &self.right,
                screen_x + screen_w - thickness,
                screen_y + thickness,
                thickness,
                screen_h - 2.0 * thickness,
            ),
        ];

        for (window_opt, x, y, w, h) in positions {
            if let Some(window) = window_opt {
                if let Err(e) = window.set_position(tauri::LogicalPosition::new(x, y)) {
                    eprintln!("Failed to set border position: {}", e);
                }
                if let Err(e) = window.set_size(tauri::LogicalSize::new(w, h)) {
                    eprintln!("Failed to set border size: {}", e);
                }
            }
        }
    }

    fn show(&self) {
        self.each_window(|window| {
            if let Err(e) = window.show() {
                eprintln!("Failed to show border window: {}", e);
            }
        });
    }

    fn hide(&self) {
        self.each_window(|window| {
            if let Err(e) = window.hide() {
                eprintln!("Failed to hide border window: {}", e);
            }
        });
    }

    fn set_thickness(&self, thickness: f64) {
        // Re-query monitor dimensions from the first available border window,
        // then reposition all borders at the new thickness.
        let any_window = self
            .top
            .as_ref()
            .or(self.bottom.as_ref())
            .or(self.left.as_ref())
            .or(self.right.as_ref());

        if let Some(window) = any_window {
            match Self::get_hwnd(window) {
                Ok(hwnd) => {
                    let (x, y, w, h) = Self::get_monitor_rect_for_id(&self.target_monitor, hwnd);
                    self.position_borders(x as f64, y as f64, w as f64, h as f64, thickness);
                }
                Err(e) => {
                    eprintln!("Failed to get HWND for thickness update: {}", e);
                }
            }
        }
    }

    fn set_target_monitor(&mut self, monitor_id: &str) {
        self.target_monitor = monitor_id.to_string();
    }
}

/// Get the full area of the primary monitor (including taskbar region).
/// Uses rcMonitor instead of rcWork so the overlay border extends behind the taskbar.
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
