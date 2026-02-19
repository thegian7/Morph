# TS-2: Windows Transparent Click-Through Overlay — Findings

**Date:** February 19, 2026
**Agent:** overlay-win
**Status:** CODE COMPLETE (requires Windows hardware validation)

---

## Summary

A Tauri 2 app has been implemented that creates a transparent, frameless, always-on-top overlay window on Windows with four colored border strips along screen edges. Click-through is implemented via two complementary approaches: the Tauri API and native Win32 extended window styles.

The code compiles on macOS (with Windows code behind `#[cfg(target_os = "windows")]` guards). Full validation requires running on Windows 10/11 hardware.

---

## What Was Built

- Tauri 2 app with a single transparent overlay window
- Four CSS `<div>` elements positioned along screen edges (6px strips)
- Windows-specific Rust overlay configuration using the `windows` crate
- macOS configuration included for local development/testing (reused from TS-1)
- Frontend click-through via `@tauri-apps/api` window API

---

## Click-Through Approach: Tauri API vs Native Fallback

### Approach 1: Tauri API (Frontend)

```typescript
await appWindow.setIgnoreCursorEvents(true);
```

**Status:** UNCERTAIN on Windows. Tauri issue #11461 reports that `setIgnoreCursorEvents` may not work reliably on Windows. The issue describes scenarios where the WebView2 runtime intercepts events before the Tauri window can pass them through.

**Recommendation:** Use as a belt-and-suspenders layer, but do NOT rely on it alone for Windows.

### Approach 2: Native Win32 (Rust) — PRIMARY

The native approach accesses the HWND via `window.hwnd()` and applies extended window styles using the `windows` crate:

```rust
let new_style = current_style
    | WS_EX_TRANSPARENT.0 as i32   // Pass mouse events through
    | WS_EX_LAYERED.0 as i32      // Enable per-pixel alpha
    | WS_EX_TOPMOST.0 as i32      // Always on top
    | WS_EX_TOOLWINDOW.0 as i32   // Hide from Alt+Tab
    | WS_EX_NOACTIVATE.0 as i32;  // Never steal focus
SetWindowLongW(hwnd, GWL_EXSTYLE, new_style);
```

**Why each style is needed:**

| Style | Purpose | macOS Equivalent |
|-------|---------|-----------------|
| `WS_EX_TRANSPARENT` | Mouse events pass through to windows beneath | `setIgnoresMouseEvents(true)` |
| `WS_EX_LAYERED` | Required for transparency/alpha compositing | (handled by DWM automatically on macOS) |
| `WS_EX_TOPMOST` | Window stays above all non-topmost windows | `setLevel(25)` |
| `WS_EX_TOOLWINDOW` | Hides from Alt+Tab and taskbar | `IgnoresCycle` collection behavior |
| `WS_EX_NOACTIVATE` | Prevents focus stealing on interaction | (NSWindow doesn't activate by default when ignoring mouse) |

### DWM Frame Extension

```rust
let margins = MARGINS {
    cxLeftWidth: -1,
    cxRightWidth: -1,
    cyTopHeight: -1,
    cyBottomHeight: -1,
};
DwmExtendFrameIntoClientArea(hwnd, &margins);
```

This extends the Desktop Window Manager glass frame across the entire window client area. Without this, transparent regions may render as black. Setting all margins to -1 tells DWM to extend the frame to cover the entire window, enabling proper per-pixel alpha compositing with the WebView2 content.

---

## Window Sizing

Unlike macOS (which uses `NSScreen::mainScreen().frame()`), Windows uses `MonitorFromWindow` + `GetMonitorInfoW`:

```rust
let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTOPRIMARY);
let mut info = MONITORINFO { cbSize: size_of::<MONITORINFO>() as u32, ..Default::default() };
GetMonitorInfoW(monitor, &mut info);
let rect = info.rcMonitor; // Full monitor area including behind taskbar
```

We use `rcMonitor` (full area) rather than `rcWork` (excludes taskbar) because the border should extend behind the taskbar for a complete screen-edge effect.

---

## Key Differences from macOS (TS-1)

| Aspect | macOS | Windows |
|--------|-------|---------|
| Click-through (native) | `NSWindow.setIgnoresMouseEvents(true)` | `WS_EX_TRANSPARENT` via `SetWindowLongW` |
| Transparency | `macOSPrivateApi: true` in Tauri config | `WS_EX_LAYERED` + DWM frame extension |
| Always-on-top | `NSWindow.setLevel(25)` | `WS_EX_TOPMOST` + `SetWindowPos(HWND_TOPMOST)` |
| Hide from switcher | `IgnoresCycle` collection behavior | `WS_EX_TOOLWINDOW` + `skipTaskbar` |
| Multi-Space/Desktop | `CanJoinAllSpaces` | Windows virtual desktops: separate investigation needed |
| Private API needed | Yes (`macOSPrivateApi: true`) | No |
| Window shadow | `setHasShadow(false)` | `decorations: false` in Tauri config removes shadow |

---

## Dependencies

### Rust (Windows-specific)

```toml
[target.'cfg(target_os = "windows")'.dependencies]
windows = { version = "0.58", features = [
    "Win32_Foundation",
    "Win32_UI_WindowsAndMessaging",
    "Win32_Graphics_Dwm",
    "Win32_Graphics_Gdi",
] }
```

The `windows` crate v0.58 provides safe bindings to Win32 APIs. Features are granular — only the required API surface is compiled.

### Frontend (shared cross-platform)

- `@tauri-apps/api` v2 — window API for `setIgnoreCursorEvents`
- `vite` v6 — bundler

---

## Compilation Verification

| Check | Result | Notes |
|-------|--------|-------|
| `cargo check` on macOS (host target) | PASS | Windows module excluded via `#[cfg]`, macOS module compiles |
| `cargo check --target x86_64-pc-windows-msvc` | NOT TESTED | Requires Windows MSVC toolchain; document for CI |
| JSON validation (all config files) | PASS | Validated via `python3 -m json.tool` |
| npm install | PASS | 16 packages, 0 vulnerabilities |

---

## What Needs Windows Hardware Validation

These items CANNOT be validated on macOS and require testing on Windows 10/11:

### Must Validate

1. **Click-through works:** Verify that `WS_EX_TRANSPARENT` actually passes mouse events through the overlay to applications beneath. Test with:
   - Clicking desktop icons through the overlay
   - Dragging windows beneath the overlay
   - Right-click context menus
   - Scrolling in applications beneath

2. **Tauri API behavior:** Test if `setIgnoreCursorEvents(true)` works on Windows independently. If it does, document whether the native fallback is still needed.

3. **Transparency renders correctly:** Verify that the CSS transparent background + DWM frame extension produces proper per-pixel alpha. The border strips should be semi-transparent green and the rest of the window should be fully transparent (invisible).

4. **Always-on-top persistence:** Verify `WS_EX_TOPMOST` keeps the window above:
   - Normal application windows
   - Full-screen applications (games, video players)
   - UAC prompts (expected to fail — UAC runs on secure desktop)
   - Windows taskbar

5. **Alt+Tab / taskbar hiding:** Verify `WS_EX_TOOLWINDOW` hides the overlay from Alt+Tab switching and the taskbar.

6. **CPU usage at idle:** Measure with Task Manager or Process Explorer. Target: < 1% CPU. The overlay should be purely static after initial render (no animation timers, no repaints).

### Should Validate

7. **Windows virtual desktops:** Test if the overlay appears on all virtual desktops or only the active one. May need `IVirtualDesktopManager` COM interface for cross-desktop visibility.

8. **DPI scaling:** Test on high-DPI displays (125%, 150%, 200%). Verify the border renders at the correct thickness and the window covers the full screen.

9. **Multi-monitor:** Current code uses `MonitorFromWindow(MONITOR_DEFAULTTOPRIMARY)` which only covers the primary monitor. Multi-monitor support is a production concern (TS-4 architecture decision).

10. **Windows 10 vs 11:** Test on both. Windows 11 has a newer DWM compositor which may behave differently with layered windows.

11. **WebView2 runtime:** Confirm WebView2 is installed or bundled. Tauri 2 on Windows requires the Chromium-based WebView2 runtime.

---

## Risks and Mitigations

### Risk: WS_EX_TRANSPARENT + WS_EX_LAYERED interaction

On older Windows versions or with certain GPU drivers, combining `WS_EX_TRANSPARENT` with `WS_EX_LAYERED` could cause the window to not render at all (fully invisible including the border strips).

**Mitigation:** If this occurs, use `SetLayeredWindowAttributes` to set a specific transparency color key instead of per-pixel alpha. This is a more compatible but less flexible approach.

### Risk: Full-screen games/apps

`WS_EX_TOPMOST` may not appear above exclusive full-screen (DirectX/Vulkan) applications. These bypass the DWM compositor entirely.

**Mitigation:** For "borderless windowed" full-screen apps, `WS_EX_TOPMOST` should work. For exclusive full-screen, this is an accepted limitation (same as macOS full-screen limitation addressed in TS-3).

### Risk: Tauri issue #11461

The Tauri API for click-through may not work on Windows, or may work inconsistently across WebView2 versions.

**Mitigation:** The native `WS_EX_TRANSPARENT` fallback is always applied regardless of whether the Tauri API succeeds. The frontend wraps the Tauri call in a try/catch and logs the result.

### Risk: Antivirus / security software

Some antivirus or enterprise security tools flag always-on-top transparent windows as suspicious (used by screen recording malware).

**Mitigation:** Code signing the application (planned for distribution) should address most false positives. This is a distribution concern, not a spike concern.

---

## Recommendations for Production (OE-4)

1. **Use the `windows` crate** (not raw `winapi`) for type-safe Win32 API access. The `windows` crate is Microsoft's official Rust binding.

2. **Always apply native window styles in Rust `setup()`**, not from the frontend. This avoids a flash of visible/interactive window before styles are applied.

3. **Start with `visible: false`** in tauri.conf.json, show after all configuration is complete (matching macOS approach from TS-1).

4. **Apply both Tauri API and native click-through** as belt-and-suspenders. Log which one succeeds for diagnostics.

5. **Investigate virtual desktop support** for production. The `IVirtualDesktopManager` COM interface can pin a window to all desktops.

6. **Consider `WS_EX_NOREDIRECTIONBITMAP`** for reduced GPU memory usage. This tells DWM not to allocate a redirection surface for the window, since we handle our own compositing via WebView2. Needs testing — may conflict with WebView2 rendering.

7. **Monitor DWM compositor state.** If the user disables DWM (Windows 7 compatibility, or certain RDP sessions), `WS_EX_LAYERED` transparency will degrade. Detect this with `DwmIsCompositionEnabled` and fall back gracefully.

---

## File Structure

```
spikes/ts-2-windows-overlay/
  index.html              # Overlay UI: four border-strip divs
  package.json            # npm dependencies
  vite.config.ts          # Vite dev server config
  FINDINGS.md             # This document
  src/
    main.ts               # Frontend: setIgnoreCursorEvents + logging
  src-tauri/
    Cargo.toml            # Rust deps: tauri, windows crate, objc2 (macOS)
    tauri.conf.json       # Window config: transparent, decorations:false, etc.
    build.rs              # Tauri build script
    capabilities/
      default.json        # Tauri permissions for window APIs
    src/
      main.rs             # Entry point
      lib.rs              # Platform-specific overlay modules (windows_overlay, macos_overlay)
```
