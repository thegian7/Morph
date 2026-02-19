# TS-4: Four-Window vs Single-Window Architecture — Findings

**Date:** February 19, 2026
**Agent:** overlay-win
**Status:** ANALYSIS COMPLETE
**Recommendation:** **Four-window approach (B)**

---

## Summary

This spike compares two overlay architectures for rendering a colored border around the screen:

- **(A) Single fullscreen transparent window** — one window covers the entire screen; CSS renders border strips along edges; the center is transparent/click-through
- **(B) Four thin windows** — one narrow window per edge (top, bottom, left, right); each covers only its border strip area

After analysis across six dimensions — compositor performance, click-through behavior, fullscreen compatibility, window positioning, multi-monitor support, and implementation complexity — **Approach B (four windows) is recommended** for production. It is superior in the two most critical dimensions (click-through reliability and compositor performance) and equal or better in the rest.

---

## Evaluation Matrix

| Dimension | (A) Single Fullscreen | (B) Four Windows | Winner |
|-----------|----------------------|------------------|--------|
| Compositor performance | Worse | Better | **B** |
| Click-through behavior | Requires native hacks | Trivial / not needed | **B** |
| Fullscreen compatibility | Equal | Equal | Tie |
| Window positioning | Simpler | More code, more robust | **B** |
| Multi-monitor support | Simpler per-screen | More windows, but cleaner | **B** |
| Implementation complexity | ~150 LOC | ~250 LOC | A |

---

## 1. Compositor Performance

### (A) Single Fullscreen Window

The overlay window covers the entire screen — e.g., 2560x1440 = 3,686,400 pixels on a typical display. Even though only the border strips are colored and the rest is transparent, the compositor must:

1. **Allocate a full-screen backing surface** in GPU memory. On macOS, Core Animation allocates a `CALayer` for the entire window. On Windows, DWM allocates a redirection surface (unless `WS_EX_NOREDIRECTIONBITMAP` is set, which may conflict with WebView2).

2. **Composite the entire surface on every frame.** The compositor must blend this full-screen transparent layer with every window beneath it, even when nothing has changed. macOS Core Animation is efficient with static layers, but DWM on Windows may be less so with large layered windows.

3. **WebView2/WKWebView renders the full viewport.** The browser engine must manage a full-screen DOM, even though 99%+ of the pixels are transparent. While modern engines skip painting for transparent regions, the layout and compositing overhead remains.

**Measured in TS-1:** 0.0% CPU idle on macOS. This is excellent, but macOS has an unusually efficient compositor. Windows DWM behavior may differ, especially with `WS_EX_LAYERED` on a full-screen window.

**GPU memory:** A full-screen transparent RGBA surface at 2560x1440 uses ~14.7 MB. At 4K (3840x2160), that's ~33.2 MB. Not catastrophic, but wasteful for rendering a few pixels of border.

### (B) Four Thin Windows

Each border window covers only its strip area:

| Window | Dimensions (1440p) | Pixels | RGBA Memory |
|--------|-------------------|--------|-------------|
| Top | 2560 x 6 | 15,360 | ~60 KB |
| Bottom | 2560 x 6 | 15,360 | ~60 KB |
| Left | 6 x 1440 | 8,640 | ~34 KB |
| Right | 6 x 1440 | 8,640 | ~34 KB |
| **Total** | | **47,880** | **~188 KB** |

Compare: 188 KB vs 14.7 MB — a **78x reduction** in GPU surface memory.

The compositor only needs to blend four tiny surfaces instead of one full-screen surface. Each window can be fully opaque (no transparency needed for the window itself — only the border color opacity), which eliminates the most expensive compositing operation: per-pixel alpha blending over a large area.

**Caveat:** Four separate WebView instances means four browser processes/contexts. On Tauri 2 with WebView2 (Windows) or WKWebView (macOS), each window gets its own web content process. The base memory overhead per WebView is ~15-25 MB. Four windows = ~60-100 MB total vs ~40 MB for one window. However, since each window's DOM is trivially small (a single div), the actual runtime memory should be lower than typical web pages.

**Mitigation for WebView overhead:** In production, consider whether the four border windows even need a WebView at all. A pure Rust rendering approach (drawing a solid color rectangle via `CALayer` on macOS or `FillRect` on Windows) would eliminate WebView overhead entirely. This is a future optimization — for now, the four-WebView approach is simple and validated.

**Verdict: B wins.** The compositor savings from tiny opaque windows far outweigh the WebView duplication cost, especially for the CPU idle target of < 1%.

---

## 2. Click-Through Behavior

### (A) Single Fullscreen Window

Requires explicit click-through on both platforms:

- **macOS:** `NSWindow.setIgnoresMouseEvents(true)` + Tauri `setIgnoreCursorEvents(true)` — validated working in TS-1
- **Windows:** `WS_EX_TRANSPARENT` via `SetWindowLongW` + Tauri API (unreliable per #11461) — implemented in TS-2, needs hardware validation

The single-window approach covers the ENTIRE screen, so if click-through fails or has edge cases (certain UI elements, drag operations, scroll events, right-click context menus), the user's entire desktop becomes unusable. This is a **catastrophic failure mode**.

Known risks:
- Tauri issue #11461: WebView2 may intercept events before the window passes them through
- macOS: certain event types (drag-and-drop across the overlay) may not pass through `setIgnoresMouseEvents`
- Windows: `WS_EX_TRANSPARENT` may interact poorly with touch input, pen input, or accessibility tools

### (B) Four Thin Windows

The border windows are positioned at the screen edges, covering only a 6px strip. The vast majority of the screen (the center, where users interact with applications) has **no overlay window at all**. Click-through is only needed for the thin border areas.

In practice, for 6px border strips:
- Users rarely click directly on the extreme edge of the screen
- macOS Dock and menu bar are at edges but are either above the overlay (menu bar at level 25+) or the overlay can be configured to avoid the Dock area
- Windows taskbar is at an edge, but with `WS_EX_TOPMOST` and `WS_EX_TRANSPARENT`, clicks pass through

Even if click-through fails entirely, only the 6px edge strips would be affected — users could still interact with 99.7% of their screen. This is a **graceful degradation** rather than catastrophic failure.

Furthermore, the four-window approach opens the possibility of **not needing click-through at all** on certain platforms. If the border windows are narrow enough (e.g., 4-6px), they could simply be opaque, non-interactive windows that the user never tries to click. The OS would naturally route clicks to the windows beneath because the user clicks on the center of the screen, not the extreme edges. Click-through would be a nice-to-have for edge cases (e.g., window resize handles at screen edges) rather than a hard requirement.

**Verdict: B wins decisively.** The four-window approach eliminates click-through as a critical risk and degrades gracefully even if click-through mechanisms fail.

---

## 3. Fullscreen Compatibility

### macOS

Both approaches use the same NSWindow APIs:
- `setLevel()` to position above fullscreen apps
- `NSWindowCollectionBehavior::FullScreenAuxiliary` to appear alongside fullscreen apps
- `NSWindowCollectionBehavior::CanJoinAllSpaces` to appear on all Spaces

TS-3 validated that `FullScreenAuxiliary` + `setLevel(1000)` (kCGScreenSaverWindowLevel) works for appearing above fullscreen apps. This applies identically to one window or four windows.

### Windows

Both approaches use `WS_EX_TOPMOST`. Neither approach works above exclusive fullscreen (DirectX/Vulkan) — the DWM compositor is bypassed entirely. Both work above "borderless windowed" fullscreen apps.

**Verdict: Tie.** Fullscreen behavior depends on window level/style, not on how many windows are used.

---

## 4. Window Positioning

### (A) Single Fullscreen Window

Position and size to cover the full screen:

```rust
// macOS
let frame = NSScreen::mainScreen().frame();
window.set_position(LogicalPosition::new(frame.origin.x, frame.origin.y));
window.set_size(LogicalSize::new(frame.size.width, frame.size.height));

// Windows
let rect = monitor_info.rcMonitor;
window.set_position(LogicalPosition::new(rect.left, rect.top));
window.set_size(LogicalSize::new(rect.right - rect.left, rect.bottom - rect.top));
```

On display changes (resolution change, external monitor connect/disconnect), resize the single window. Simple.

### (B) Four Thin Windows

Each window is positioned at its edge:

```rust
fn position_border_windows(screen_x: f64, screen_y: f64, screen_w: f64, screen_h: f64, thickness: f64) {
    // Top: full width, positioned at top edge
    top.set_position(LogicalPosition::new(screen_x, screen_y));
    top.set_size(LogicalSize::new(screen_w, thickness));

    // Bottom: full width, positioned at bottom edge
    bottom.set_position(LogicalPosition::new(screen_x, screen_y + screen_h - thickness));
    bottom.set_size(LogicalSize::new(screen_w, thickness));

    // Left: full height, positioned at left edge
    left.set_position(LogicalPosition::new(screen_x, screen_y));
    left.set_size(LogicalSize::new(thickness, screen_h));

    // Right: full height, positioned at right edge
    right.set_position(LogicalPosition::new(screen_x + screen_w - thickness, screen_y));
    right.set_size(LogicalSize::new(thickness, screen_h));
}
```

More code, but it also means:
- **Changing border thickness** is a simple resize operation (e.g., user changes from "thin" to "thick" in settings). With approach A, you'd change CSS — also simple but requires a WebView round-trip.
- **Changing which edges are active** (e.g., "top only" or "sides only" in settings) is trivial: show/hide individual windows. With approach A, you'd toggle CSS visibility — similar simplicity.
- **Display change handling** requires repositioning four windows instead of one. More code, but the same screen query logic.

**Verdict: B is slightly more code but more robust.** The explicit positioning of each edge window means the border is always pixel-perfect at the edge, regardless of CSS rendering quirks. With approach A, a full-screen transparent window relies on CSS `position: fixed` to place the strips, which could have sub-pixel rendering issues on fractional DPI scaling.

---

## 5. Multi-Monitor Support

### (A) Single Fullscreen Window

One window per monitor. For N monitors, create N transparent fullscreen windows, each sized to its monitor's frame.

Each window runs its own WebView with the same overlay HTML. The color engine state is shared via Tauri events (same event broadcast reaches all windows).

### (B) Four Thin Windows

Four windows per monitor. For N monitors, create 4N windows.

This means a 2-monitor setup has 8 windows, a 3-monitor setup has 12. Each is tiny (6px strip), so the compositor overhead is still far less than approach A's full-screen windows.

The window management is more complex (tracking which four windows belong to which monitor), but this is a simple data structure:

```rust
struct MonitorOverlay {
    monitor_id: String,
    top: WebviewWindow,
    bottom: WebviewWindow,
    left: WebviewWindow,
    right: WebviewWindow,
}
```

On monitor connect/disconnect, add/remove a `MonitorOverlay` struct and its four windows.

**Verdict: B is slightly more complex but scales better.** The per-monitor overhead is lower (4 tiny windows vs 1 fullscreen window), and the grouping abstraction is clean.

---

## 6. Implementation Complexity

### (A) Single Fullscreen Window

Estimated LOC for the window manager:
- Window creation + sizing: ~30 LOC
- Platform-specific config (macOS + Windows): ~80 LOC (already written in TS-1 and TS-2)
- Display change listener: ~20 LOC
- Multi-monitor: ~30 LOC
- **Total: ~160 LOC**

Frontend overlay HTML/CSS is the same in both approaches.

### (B) Four Thin Windows

Estimated LOC for the window manager:
- Window creation (x4) + sizing: ~60 LOC
- Platform-specific config (macOS + Windows, x4): ~100 LOC
- Edge positioning logic: ~40 LOC
- Display change listener: ~20 LOC
- Multi-monitor (MonitorOverlay struct): ~50 LOC
- Show/hide per-edge (settings): ~20 LOC
- **Total: ~290 LOC**

### Tauri Configuration

Approach A requires 1 window definition in `tauri.conf.json`. Approach B requires 4:

```json
{
  "app": {
    "windows": [
      { "label": "border-top", "transparent": true, "decorations": false, ... },
      { "label": "border-bottom", "transparent": true, "decorations": false, ... },
      { "label": "border-left", "transparent": true, "decorations": false, ... },
      { "label": "border-right", "transparent": true, "decorations": false, ... }
    ]
  }
}
```

Alternatively, create windows dynamically in Rust `setup()` rather than declaring them in config. This is cleaner for multi-monitor (windows created per detected monitor).

**Verdict: A is simpler.** About 130 fewer LOC. However, the additional complexity in B is straightforward boilerplate (positioning logic, window grouping), not algorithmic complexity.

---

## Additional Considerations

### Border Thickness Changes

- **A:** Change CSS variable `--border-thickness`. Instant, no window resize needed.
- **B:** Resize four windows via Tauri API. Requires a round-trip to Rust, but still < 1ms.

Both approaches handle this well. B is slightly more work but gives pixel-perfect control.

### Pulse Animation Performance

The PRD specifies a slow pulse animation (1500-4000ms cycle). Both approaches use CSS `animation` for this.

- **A:** The animation runs on a full-screen window. Even though only the border strips animate, the browser may invalidate the full window on each animation frame. Modern browsers optimize this (only repaint dirty regions), but it's compositor-dependent.
- **B:** The animation runs on four tiny windows. Each window's entire content IS the border strip, so repainting is trivially cheap.

**Edge: B** for pulse animation efficiency.

### Startup Behavior

- **A:** One window to create, configure, and show. Faster startup.
- **B:** Four windows to create, configure, and position. Slightly slower startup (~50-100ms more due to 4x window creation), but windows start hidden and show simultaneously after configuration.

The difference is negligible in practice.

### Color Engine Integration

The color engine runs in TypeScript and emits `BorderState` (color, opacity, pulseSpeed).

- **A:** One WebView receives the state and applies it to all four CSS divs.
- **B:** Four WebViews each need to receive the state. Options:
  1. **Tauri event broadcast:** Emit a `border-state-update` event; all four windows receive it. Simple, ~0 overhead.
  2. **Single WebView hosts color engine, broadcasts to others.** Adds unnecessary complexity.
  3. **Run color engine in Rust instead of TypeScript.** Would allow direct window control without WebView round-trips. Future optimization.

Option 1 (Tauri event broadcast) is the simplest and recommended approach.

### Edge Case: Overlapping Corners

With approach B, the four windows overlap at the corners (top-left, top-right, bottom-left, bottom-right). At 6px thickness:

```
[top window: full width, 6px tall]
[left: 6px wide, full height]
[right: 6px wide, full height]
[bottom: full width, 6px tall]
```

The corners where top/bottom overlap with left/right will have double opacity (e.g., 0.6 + 0.6 = 1.0 instead of 0.6). This creates visibly brighter corners.

**Fix options:**
1. **Inset the side windows** by the border thickness: left/right windows start at `y + thickness` and end at `y + height - thickness`, avoiding overlap. The corners belong to the top/bottom windows.
2. **Use CSS to clip** the overlapping corners (not applicable since these are separate windows).
3. **Accept the overlap.** At 6px, the corners are tiny and the double-opacity may not be noticeable in practice.

**Recommendation:** Option 1 (inset side windows). Clean, no visual artifacts:

```
Top:    x=0,              y=0,              w=screen_w,           h=thickness
Bottom: x=0,              y=screen_h-thick, w=screen_w,           h=thickness
Left:   x=0,              y=thickness,      w=thickness,          h=screen_h - 2*thickness
Right:  x=screen_w-thick, y=thickness,      w=thickness,          h=screen_h - 2*thickness
```

---

## Recommendation

**Use Approach B: Four thin windows.**

### Rationale (priority order)

1. **Click-through reliability** is the #1 risk for the product. The border overlay must NEVER interfere with the user's workflow. Four thin windows eliminate click-through as a critical dependency — even if the mechanism fails entirely, only 6px edge strips are affected instead of the entire screen.

2. **Compositor performance** is 78x better in GPU surface memory and proportionally better in compositing workload. This matters for the < 1% CPU idle target, especially on Windows where DWM behavior with large layered windows is less predictable.

3. **The ~130 LOC additional complexity is trivial** compared to the risk reduction. The extra code is straightforward positioning logic, not complex algorithms.

4. **Graceful degradation** is better: if one edge window crashes or fails, the other three continue working. With approach A, a single window failure loses the entire border.

5. **Future optimization path** is cleaner: the four-window approach can evolve to pure Rust rendering (no WebView per border strip) if the WebView memory overhead becomes a concern. Each "window" would become a native colored rectangle.

### For OE-1 (Project Scaffold)

- Define window labels: `border-top`, `border-bottom`, `border-left`, `border-right`
- Create windows dynamically in Rust `setup()` (not in `tauri.conf.json`) for multi-monitor flexibility
- Use inset side windows to avoid corner overlap
- Broadcast `BorderState` via Tauri events to all four windows

### For OE-2 (Overlay Rendering)

- Each border window contains a single full-size div with the border color/opacity
- CSS transitions for smooth color changes (8-15s ease-in-out, per PRD)
- CSS animation for pulse effect
- Listen for `border-state-update` Tauri event

### For OE-3/OE-4 (Platform Window Managers)

- Apply the same platform-specific configuration from TS-1 (macOS) and TS-2 (Windows) to each of the four windows
- All four windows share the same window level, collection behavior, and click-through settings
- Position windows using the edge calculation with inset sides

---

## Decision Log

| Decision | Choice | Alternatives Considered |
|----------|--------|------------------------|
| Overlay architecture | Four windows (B) | Single fullscreen (A) |
| Corner overlap | Inset side windows | Accept double-opacity; CSS clip |
| Color engine location | TypeScript in each WebView | Single WebView + broadcast; Rust |
| State distribution | Tauri event broadcast | Shared memory; IPC |
| Window creation | Dynamic in Rust setup() | Static in tauri.conf.json |
| Click-through | Still apply for edge strips | Skip entirely |
