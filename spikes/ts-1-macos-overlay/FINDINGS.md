# TS-1: macOS Transparent Click-Through Overlay — Findings

**Date:** February 19, 2026
**Agent:** overlay-mac
**Status:** VALIDATED

---

## Summary

A minimal Tauri 2 app successfully renders a transparent, frameless, always-on-top overlay window on macOS with colored border strips along all four screen edges. Click-through works correctly via both Tauri's `setIgnoreCursorEvents(true)` and NSWindow's `setIgnoresMouseEvents(true)`.

---

## What Was Built

- Tauri 2 app with a single transparent overlay window
- Four CSS `<div>` elements positioned along screen edges (6px strips)
- Rust-side macOS window configuration using `objc2` crates
- Frontend click-through via `@tauri-apps/api` window API

## Key Technical Decisions

### Window Sizing

**Do NOT use `fullscreen: true` in tauri.conf.json.** Tauri's `fullscreen` triggers macOS native fullscreen mode, which creates a new Space and hides the Dock/menu bar. Instead:
- Start with the window hidden (`"visible": false`)
- In Rust `setup()`, read `NSScreen::mainScreen().frame()` for the screen dimensions
- Set the window position and size to match the full screen frame
- Call `window.show()` after configuration

### Window Level

Set via `ns_window.setLevel(25)` which corresponds to `kCGOverlayWindowLevel`. This places the window above all normal application windows. For the production app, consider:
- Level 25 (`kCGOverlayWindowLevel`): above normal windows, menus, and popups
- Level 1000 (`kCGScreenSaverWindowLevel`): above full-screen apps (needed for TS-3 spike)

### Click-Through

Two mechanisms used as belt-and-suspenders:
1. **Tauri API (frontend):** `getCurrentWindow().setIgnoreCursorEvents(true)` — tells WKWebView to pass through events
2. **NSWindow (Rust):** `ns_window.setIgnoresMouseEvents(true)` — tells macOS window server to skip this window for hit testing

Both are needed. The Tauri API alone may not prevent all macOS event routing. The NSWindow call alone wouldn't affect WKWebView's internal hit testing.

### Transparency

Requires `"macOSPrivateApi": true` in `app` config. Without this, Tauri cannot create transparent windows on macOS. This is a known Tauri limitation — transparent windows on macOS require using private WebKit APIs.

### Window Collection Behavior

```rust
NSWindowCollectionBehavior::CanJoinAllSpaces    // Visible on all Spaces/desktops
    | NSWindowCollectionBehavior::Stationary    // Not affected by Expose/Mission Control
    | NSWindowCollectionBehavior::IgnoresCycle  // Not included in Cmd+Tab cycling
```

This ensures the overlay is always visible, never steals focus, and never appears in app switchers.

---

## Measurements

| Metric | Result | Target |
|--------|--------|--------|
| Idle CPU | 0.0% | < 1% |
| Memory | ~40 MB (0.2% of system) | Reasonable |
| Startup time | ~2s (debug build) | N/A for spike |
| Build time | ~28s first build, ~1-3s incremental | N/A |

---

## Validation Results

| Criterion | Pass/Fail | Notes |
|-----------|-----------|-------|
| Transparent frameless window launches | PASS | Requires `macOSPrivateApi: true` |
| Colored border strips visible on all edges | PASS | 6px green strips on all four edges |
| Mouse events pass through to apps beneath | PASS | Both Tauri and NSWindow level click-through |
| Keyboard input unaffected | PASS | Overlay never becomes key window |
| Idle CPU < 1% | PASS | 0.0% after initial rendering |
| Overlay appears above normal windows | PASS | Window level 25 (kCGOverlayWindowLevel) |
| Window appears on all Spaces | PASS | CanJoinAllSpaces collection behavior |
| No shadow | PASS | setHasShadow(false) |
| No Dock icon / app switcher entry | PARTIAL | skipTaskbar hides Dock icon; app still appears in Force Quit list (expected) |

---

## Dependencies Used

### Rust
- `tauri` 2.10.x with `macos-private-api` feature
- `objc2` 0.6.x — safe Objective-C bindings
- `objc2-app-kit` 0.3.x — NSWindow, NSScreen, NSWindowCollectionBehavior
- `objc2-foundation` 0.3.x — MainThreadMarker, NSRect

### Frontend
- `@tauri-apps/api` v2 — window API for `setIgnoreCursorEvents`
- `vite` v6 — bundler

---

## Risks and Open Questions for Production

1. **Full-screen apps:** Window level 25 may not appear above macOS native full-screen apps. The TS-3 spike should test higher window levels (1000+) and `NSWindowCollectionBehavior::FullScreenAuxiliary`.

2. **Multi-monitor:** `NSScreen::mainScreen()` only returns one screen. Production code needs `NSScreen::screens()` to handle all monitors, potentially using separate windows per screen (see TS-4 architecture decision).

3. **Screen resolution changes:** The window is sized once at startup. Production code should listen for `NSApplicationDidChangeScreenParametersNotification` to re-size on resolution/display changes.

4. **macOS Private API:** Using `macOSPrivateApi: true` means the app cannot be distributed via the Mac App Store (sandbox restrictions). This aligns with the architecture decision to use direct download distribution.

5. **Window level persistence:** macOS may lower the window level in certain edge cases (e.g., screen recording permission dialogs). The production app should periodically verify the window level.

6. **Retina/HiDPI:** The screen frame is in logical points, not physical pixels. Tauri's `LogicalSize`/`LogicalPosition` handle this correctly, but the CSS border width (6px) will appear as 6 logical points (12 physical pixels on 2x Retina). This is fine — the PRD specifies thickness in user-configurable logical units.

---

## Recommendations for Production (OE-3)

1. Use `objc2` crates (not raw `objc::msg_send!`) for type-safe macOS API access
2. Configure the window in Rust `setup()`, not from the frontend — avoids flash of unstyled window
3. Use `visible: false` in config, show after all configuration is complete
4. Implement both NSWindow and Tauri-level click-through for reliability
5. For TS-3, test `setLevel(1000)` to appear above full-screen apps
6. Consider four separate windows (one per edge) instead of one full-screen window to further minimize any potential rendering overhead — this is the TS-4 architecture question
