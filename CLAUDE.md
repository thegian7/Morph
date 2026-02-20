# LightTime

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
- Current totals: 77 Rust + 240 TypeScript = 317 tests

## Key Events

- `border-state-update`: Emitted every 1s by tick emitter, consumed by overlay JS
- `calendar-events-update`: Emitted by calendar poller when events change
