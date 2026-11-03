# Morph

Ambient screen border overlay that changes color based on upcoming calendar events. Built with Tauri 2, React 19, TypeScript, Tailwind CSS 4, and Rust.

## Architecture

- **Rust backend** (`src-tauri/`): Tauri 2 app with calendar providers (Google, Microsoft, Apple), polling service, border state management, system tray, SQLite settings
- **Settings UI** (`src/settings/`): React 19 + Tailwind CSS 4 SPA in a Tauri window
- **Overlay** (`src/overlay/`): vanilla TypeScript. On Windows it draws the border in 4 transparent webviews (top, bottom, left, right). On macOS it only runs the color engine in `border-top`, and Rust draws the border natively (`window_manager/macos_render.rs`).
- **Color Engine** (`src/lib/color-engine/`): Pure TypeScript module that computes border state from calendar events
- **Timer** (`src/lib/timer/`): Session timer with presets

## macOS: Native Border, Webview Color Engine

The border on macOS is drawn by `window_manager/macos_render.rs`. Each `layout::Shape` becomes a borderless, click-through `MorphBorderWindow` (an NSWindow subclass that overrides `constrainFrameRect:toScreen:` so the menu-bar tint can sit under the menu bar). Each window hosts one `CAShapeLayer`:
- Fit-mode strips are plain fills.
- Reserve and Overlay modes are a single picture-frame window with rounded inner corners (even-odd fill, radius `layout::inner_radius`).

Color and opacity cross-fade over 2 s, and the pulse is an autoreversing Core Animation opacity animation. The GPU does that work; no JavaScript runs per frame.

The color engine stays in TypeScript and runs in the `border-top` webview. The other three border webviews are destroyed in `setup()`. Every second the engine emits:
- `border-render`, the look with display preferences applied, which the native renderer consumes;
- `border-state-update`, the raw state, which the tray consumes.

Rust, not the overlay script, decides which edges show (`layout::shapes`).

**Critical constraints for the engine webview:**
- Don't configure its NSWindow (level, `setIgnoresMouseEvents`, collection behavior) until its page has loaded, or WKWebView never runs its JavaScript. `Builder::on_page_load` (Finished) calls `macos::engine_loaded`, which parks it.
- It has to stay on screen. A hidden webview is throttled even with `backgroundThrottling: "disabled"`: measured gaps were up to 18 s, then 2 s ticks. Parked as a click-through 1pt window at level 25 in the display's top-left corner, it ticks steadily at 1 Hz. The overlay script draws nothing when `uses_native_border` returns true.

There is no startup delay. The native windows are created immediately, and the border shows the first `border-render` as soon as the engine loads.

## macOS Border Placement (`border_mode` setting)

Geometry is pure and unit-tested in `src-tauri/src/window_manager/layout.rs`; `macos.rs` applies it.

- `fit` (default): draws only in space macOS already reserves. The top strip fills the menu-bar band (`frame` minus `visibleFrame`) at level 23, just under `NSMainMenuWindowLevel`, so menu titles and status items draw on top. Dock edges get a strip at level 19, under the Dock. Edges with no reserved band, or disabled in `border_position`, get no window.
- `reserve`: a frame inside `visibleFrame` at `NSStatusWindowLevel` (25), and `macos_reserve.rs` (Accessibility API, ~4 Hz poll) keeps other apps' windows out of them. Edges snapped to the screen are trimmed and floating windows slid. It skips while the mouse button is down, skips fullscreen windows and Morph's own windows, and gives up after 3 failed attempts per window. Needs Accessibility access (`accessibility_status` / `request_accessibility` commands).
- `overlay`: a frame around the full display at level 25 (it used to be 1000, which covered menus, Spotlight and Notification Center).

Gotchas:
- AppKit pushes windows below menu-bar level out from under the menu bar, which is why native border windows use the `MorphBorderWindow` subclass. Never re-class Tao's windows (`object_setClass`) to get the same effect: they're KVO-observed (`NSKVONotifying_TaoWindow`), and re-classing crashes with a segfault.
- Relayout uses `orderFrontRegardless`, not Tauri `show()`, which would steal focus.
- A 2 s main-thread poll (`refresh_if_geometry_changed`) re-applies the layout when the Dock or menu bar changes size, position or auto-hide, or when an app enters or leaves fullscreen.
- Fullscreen: when another app's layer-0 window covers the whole display, `fit` and `reserve` collapse to a 3pt hairline along the top edge (`layout::for_fullscreen`), and nothing is reserved. `overlay` is left unchanged. Joining other apps' fullscreen Spaces needs both `CanJoinAllApplications` and the Accessory activation policy. `lib.rs` sets Accessory in `setup()`, because the bare dev binary doesn't get `LSUIElement` and would otherwise be a regular app that can't appear there.

## Settings UI and Fit Mode

In Fit mode, Settings → Border shows what will actually be drawn. `useReservedEdges` polls the `get_reserved_edges` command every 3 s (`layout::reserved_edges`: menu bar on top, plus whichever edge the Dock is on) for the selected display. The live preview draws only enabled ∩ reserved edges. The Position selector draws enabled edges that can't be drawn as dashed, and explains why (`src/settings/components/fitEdges.ts`). Other modes and non-macOS platforms are unchanged.

## System Display Preferences

`window_manager::DisplayPrefs` (Reduce Motion, Reduce Transparency, Increase Contrast, dark appearance) comes from `NSWorkspace` / `NSApp.effectiveAppearance`. The overlay fetches it with `get_display_prefs` and follows `display-prefs-changed`, which the 2 s poll emits on change. `src/overlay/display-prefs.ts` applies it to the `border-render` look on macOS, and to what each webview draws on Windows: no pulse, a contrast boost, an opacity floor, and darker colors in light mode. The raw state is still what gets broadcast to the tray. With Reduce Transparency on, the menu bar is opaque, so Fit mode moves its top tint to a hairline along the bottom of the menu-bar band, above the bar (`layout::for_opaque_menu_bar`).

## Multi-Page Vite Setup

Two HTML entry points configured in `vite.config.ts`:

- `src/overlay/index.html` - overlay border windows (vanilla TS, no React)
- `src/settings/index.html` - settings window (React 19)

Border windows are declared in `tauri.conf.json`, NOT created dynamically via `WebviewWindowBuilder`.

## Asana

- Workspace GID: `1212831895668971`
- Project GID: `1213360452791797`

## Testing

- Rust: `cd src-tauri && cargo test`
- TypeScript: `npx vitest run` (from project root)
- Current totals: 135 Rust + 343 TypeScript = 478 tests

## Key Events

- `border-state-update`: Broadcast by the border-top overlay window (the leader) whenever its computed state changes; consumed by the tray icon (Rust) and tray popover. On Windows each overlay window also runs the color engine locally at 1 Hz.
- `border-render` (macOS): Emitted by the engine (`border-top`) whenever the look changes, as `{ color, opacity, pulseSpeed, phase }` with display preferences applied; consumed by the native renderer in `lib.rs`
- `calendar-events-update`: Emitted by calendar poller when events change
- `settings-changed`: Emitted by the `set_setting` command with `{ key, value }`; consumed by the overlay, theme hook, and window manager (`border_thickness`, `selected_display`, `border_mode`, `border_position` trigger a relayout)
- `display-prefs-changed`: Emitted by the macOS geometry poll with `DisplayPrefs` whenever an accessibility or appearance preference changes; consumed by the overlay
- `border-paused`: Emitted by `pause_border` with `{ minutes }` — positive = pause duration, `0` = resume, negative = pause until the next calendar event starts
