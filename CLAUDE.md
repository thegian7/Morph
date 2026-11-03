# Morph

Ambient screen border overlay that changes color based on upcoming calendar events. Built with Tauri 2, React 19, TypeScript, Tailwind CSS 4, and Rust.

## Architecture

- **Rust backend** (`src-tauri/`): Tauri 2 app with calendar providers (Google, Microsoft, Apple), polling service, border state management, system tray, SQLite settings
- **Settings UI** (`src/settings/`): React 19 + Tailwind CSS 4 SPA in a Tauri window
- **Overlay** (`src/overlay/`): Vanilla TypeScript in 4 transparent border windows (top, bottom, left, right)
- **Color Engine** (`src/lib/color-engine/`): Pure TypeScript module that computes border state from calendar events
- **Timer** (`src/lib/timer/`): Session timer with presets

## Critical: macOS Overlay Window Constraint

**NSWindow configuration MUST be deferred until after the webview loads.** Applying macOS NSWindow settings (window level, click-through via `setIgnoresMouseEvents`, collection behavior) before the webview finishes loading prevents JavaScript from ever executing in WKWebView.

Current pattern in `lib.rs`:

1. Show overlay windows immediately (from tauri.conf.json)
2. Wait 1 second for webview JS to initialize
3. Apply NSWindow config on the main thread via `run_on_main_thread()`

If you modify overlay window setup, preserve this ordering.

## macOS Border Placement (`border_mode` setting)

Geometry is pure and unit-tested in `src-tauri/src/window_manager/layout.rs`; `macos.rs` applies it.

- `fit` (default): draws only in space macOS already reserves. The top window fills the menu-bar band (`frame` minus `visibleFrame`) at level 23, just under `NSMainMenuWindowLevel`, so menu titles and status items draw on top. Dock edges get a strip at level 19, under the Dock. Edges with no reserved band are ordered out.
- `reserve`: strips sit inside `visibleFrame` at `NSStatusWindowLevel` (25), and `macos_reserve.rs` (Accessibility API, ~4 Hz poll) keeps other apps' windows out of them. Edges snapped to the screen are trimmed and floating windows slid. It skips while the mouse button is down, skips fullscreen windows and Morph's own windows, and gives up after 3 failed attempts per window. Needs Accessibility access (`accessibility_status` / `request_accessibility` commands).
- `overlay`: classic full-frame edges at level 25 (it used to be 1000, which covered menus, Spotlight and Notification Center).

Gotchas:
- AppKit pushes windows below menu-bar level out from under the menu bar. `macos.rs` adds a `constrainFrameRect:toScreen:` override to `TaoWindow` that leaves tint-level (19/23) windows alone. Don't swap the windows' class (`object_setClass`) instead: Tao windows are KVO-observed (`NSKVONotifying_TaoWindow`), and re-classing them crashes with a segfault.
- `border-top` is the leader that broadcasts state to the tray, so it is never ordered out. When it has no strip, it's parked as a 1pt speck.
- Relayout uses `orderFrontRegardless`, not Tauri `show()`, which would steal focus.
- A 2 s main-thread poll (`refresh_if_geometry_changed`) re-applies the layout when the Dock or menu bar changes size, position or auto-hide, or when an app enters or leaves fullscreen.
- Fullscreen: when another app's layer-0 window covers the whole display, `fit` and `reserve` collapse to a 3pt hairline along the top edge (`layout::for_fullscreen`), and nothing is reserved. `overlay` is left unchanged. Joining other apps' fullscreen Spaces needs both `CanJoinAllApplications` and the Accessory activation policy. `lib.rs` sets Accessory in `setup()`, because the bare dev binary doesn't get `LSUIElement` and would otherwise be a regular app that can't appear there.

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
- Current totals: 121 Rust + 321 TypeScript = 442 tests

## Key Events

- `border-state-update`: Broadcast by the border-top overlay window (the leader) whenever its computed state changes; consumed by the tray icon (Rust) and tray popover. The overlay windows each run the color engine locally at 1 Hz.
- `calendar-events-update`: Emitted by calendar poller when events change
- `settings-changed`: Emitted by the `set_setting` command with `{ key, value }`; consumed by the overlay, theme hook, and window manager (`border_thickness`, `selected_display`, `border_mode`, `border_position` trigger a relayout)
- `border-paused`: Emitted by `pause_border` with `{ minutes }` — positive = pause duration, `0` = resume, negative = pause until the next calendar event starts
