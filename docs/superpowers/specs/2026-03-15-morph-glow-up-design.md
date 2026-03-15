# Morph Glow-Up: From Beta to Beautiful

**Date:** 2026-03-15
**Status:** Draft
**Scope:** Full UX overhaul — finish incomplete features, redesign settings UI, add tray popover, live preview, adaptive theming, platform parity

## Mission

Morph exists to help people with time blindness and time anxiety manage smoother transitions between activities. Inspired by the Timeqube physical device, it uses ambient color changes on screen borders to create a gentle, non-intrusive sense of time passing — no alarms, no pop-ups, just a gradual shift from calm green to urgent purple that your peripheral vision picks up naturally. Every design decision in this overhaul should reinforce that philosophy: **ambient, calming, helpful — never stressful.**

## Summary

Morph has solid internals (color engine, OAuth flows, calendar polling) but a prototype-quality UI and several half-finished features. This spec covers the "coming out of beta" push: a design system with adaptive light/dark theming, a reimagined settings UI, a live border preview with timeline scrubber, a rich tray popover as the app's primary touchpoint, and equal quality on macOS and Windows.

## Architecture Overview

The work organizes into 5 vertical slices, each delivering complete functionality:

1. **Design System & Adaptive Theming** — shared foundation
2. **Settings UI Overhaul** — rebrand every tab, wire up all unfinished features
3. **Live Preview & Timeline Scrubber** — the centerpiece "wow" feature
4. **Rich Tray Popover** — the new app home screen
5. **Platform Parity & Cleanup** — Windows overlay, launch-at-login, dead code removal

### Dependency Graph

```
[1. Design System] ──► [2. Settings Overhaul] ──► [3. Live Preview]
                  ──► [4. Tray Popover (UI shell)]
                  ──► [5. Platform Parity]

[2. Settings Overhaul] ──► [4. Tray Popover (quick actions)]
```

Slice 1 must complete first. Slices 2 and 5 can begin in parallel after Slice 1. Slice 3 depends on Slice 2's Border tab restructuring. Slice 4's UI shell (layout, theming, event display) can start after Slice 1, but its quick actions (pause, timer) depend on Slice 2's pause/resume Rust infrastructure and timer preset storage.

---

## Slice 1: Design System & Adaptive Theming

### Design Tokens

CSS custom properties on `:root` (light) and `[data-theme="dark"]`:

**Surface colors:**
- Light: warm whites (`#FAFAF9`) and grays (`#F5F5F4`, `#E7E5E4`)
- Dark: landing page navy (`#0f1117` base, `#1a1d2e` elevated, `#252836` cards)

**Brand accents (same in both themes):**
- Morph green: `#4A9B6E` — primary actions, "connected" states, free-time indicators
- Morph amber: `#D4A843` — warnings, timer accents
- Morph purple: `#8B6AAE` — overtime, premium feel accents
- Morph orange: `#D4864A` — urgent warnings

**Semantic tokens:**
- `--color-primary` → Morph green
- `--color-surface-base`, `--color-surface-raised`, `--color-surface-overlay`
- `--color-border`, `--color-border-subtle`
- `--color-text`, `--color-text-secondary`, `--color-text-muted`
- `--color-danger` → `#E54D4D`
- `--color-success` → Morph green

**Typography scale** (system-ui font stack):
- `--text-xs`: 11px — labels, metadata
- `--text-sm`: 13px — secondary text, descriptions
- `--text-base`: 14px — body text
- `--text-lg`: 16px — section headers
- `--text-xl`: 20px — page titles
- `--text-2xl`: 28px — timer countdown

**Spacing scale:** 4px base (`--space-1` through `--space-8`).

**Transitions:** 200ms ease on interactive elements, 300ms on theme transitions.

### Tailwind CSS 4 Dark Mode Integration

The project uses Tailwind CSS 4 via `@tailwindcss/vite`. To align Tailwind's dark mode variant with the `data-theme` attribute system, add the following to the global CSS:

```css
@variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
```

This ensures Tailwind utility classes like `dark:bg-gray-900` respect the `data-theme` attribute rather than only the `prefers-color-scheme` media query. The design system uses CSS custom properties for design tokens (which flip automatically via `[data-theme="dark"]` selectors) and Tailwind utilities for layout/spacing. Both systems coexist without conflict.

### Theme Detection & Switching

- CSS `prefers-color-scheme` media query as default
- Manual override in General settings: System / Light / Dark
- Stored as `theme_preference` in SQLite (`system` | `light` | `dark`)
- Applied by setting `data-theme` attribute on `<html>` element
- When `theme_preference` is `system`, a JS listener on `window.matchMedia('(prefers-color-scheme: dark)')` updates `data-theme` reactively
- Theme switch animates via 300ms `transition` on surface color properties

### Shared Component Library

Location: `src/shared/components/`

Primitives extracted from settings and reused in tray popover:
- `Toggle` — branded switch (green when on)
- `Card` — elevated surface with border, hover state
- `Button` — primary (green fill), secondary (outline), ghost (text-only)
- `IconButton` — compact icon-only button
- `SectionHeader` — label + optional description
- `Badge` — status indicator with color dot
- `Chip` — selectable pill (for timer presets, duration pickers)
- `Slider` — range input with design token colors
- `ProgressRing` — circular progress indicator (SVG-based)

Each component uses semantic design tokens. Theming is automatic.

---

## Slice 2: Settings UI Overhaul

### Window Changes

- Size: 680×560 (up from 600×500)
- Sidebar: Morph logo at top (SVG, adapts to theme), nav items with subtle hover/active states using brand colors, Ko-fi button at bottom
- Content area: 24px padding, card-based grouping

### General Tab

| Setting | Implementation |
|---------|---------------|
| Theme | Three-option picker (System/Light/Dark) with mini preview swatches showing surface + accent colors |
| Launch at login | Toggle — wired to `tauri-plugin-autostart` (see Installation below) |
| Display selector | Card buttons with monitor name labels (only shown with 2+ monitors) |
| Pause border | Duration chips (5/15/30/60 min, Until next event) with keyboard shortcut hint |

**`tauri-plugin-autostart` installation:**
1. Add `tauri-plugin-autostart` to `src-tauri/Cargo.toml` dependencies
2. Register plugin in `lib.rs`: `.plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))`
3. Add `autostart:allow-enable`, `autostart:allow-disable`, `autostart:allow-is-enabled` to capabilities in `tauri.conf.json`
4. Frontend calls: `import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart'`

### Border Tab

| Setting | Current | New |
|---------|---------|-----|
| Thickness | Text buttons (Thin/Medium/Thick) | Slider with live border update |
| Position | Tiny 8×6 diagram | Interactive screen outline (larger, click edges to toggle) |
| Color palette | Text buttons | Color swatch cards showing the full progression |
| Intensity | Text buttons (Subtle/Normal/Vivid) | Slider with live opacity change |

The mini preview and timeline scrubber (Slice 3) live at the top of this tab.

### Calendar Tab

- Provider cards: restyle with design system Card component, brand colors
- **New: Calendar list per provider** — after connecting Google/Microsoft, fetch the user's calendar list and display toggles for each calendar. Toggled-off calendars are stored as a JSON array under the settings key `ignored_calendar_ids` (e.g., `'["cal_abc", "cal_def"]'`). The Rust `get_setting`/`set_setting` commands handle this as a string value; the frontend parses/serializes the JSON array.
- **Google multi-calendar** — replace hardcoded `calendars/primary/events` with:
  1. `GET /calendar/v3/users/me/calendarList` to enumerate calendars
  2. Fetch events from each enabled calendar (those not in `ignored_calendar_ids`)
  3. Merge results with existing event deduplication
- Sync status: last-sync relative time + subtle spinner during active sync

### Timer Tab

- **Pause/Resume**: Show Pause button during active timer (amber), Resume when paused (green). **Requires new Rust event handlers** (see below).
- **Progress ring**: Replace flat progress bar with circular SVG progress ring. Shows elapsed percentage. Brand-colored (green → amber as time runs out).
- **Preset cards**: 2-column grid with brand-colored Card components. Existing presets (Pomodoro 25m, Short Break 5m, Long Break 15m, Focus Hour 60m).
- **Custom preset**: "+" card that opens an inline form (name + duration). Stored as JSON in the existing `settings` key-value table under key `custom_timer_presets` (e.g., `'[{"name":"Deep Work","duration_seconds":2700}]'`). Max 4 custom presets. No new table or migration needed.
- Timer countdown: large monospace `--text-2xl` with `tabular-nums` for stable width.

**Rust pause/resume infrastructure:**

The existing `TimerState` in `lib.rs` (`Mutex<TimerState>`) only handles `start-timer` and `stop-timer` events. Add:

1. Register `pause-timer` event listener in `setup_event_listeners()`:
   - Sets `timer_state.status = "paused"` and `timer_state.paused_at = Some(now.to_rfc3339())`
   - Emits `timer-state-update` with paused state so overlay stops counting
2. Register `resume-timer` event listener:
   - Sets `timer_state.status = "running"`, adjusts `end_time` by elapsed pause duration (`now - paused_at`), clears `paused_at` to `None`
   - Emits `timer-state-update` with resumed state
3. The overlay JS already listens to `timer-state-update` — it will honor the paused flag automatically once the event payload includes it

Frontend emits `pause-timer` / `resume-timer` events (consistent with the existing event-based pattern used throughout the app).

### Alerts Tab (new — wiring up existing WarningSettings component)

- **Note:** `WarningSettings.tsx` currently lives at `src/settings/components/WarningSettings.tsx`. Move it to `src/settings/tabs/AlertsTab.tsx` (or wrap it in a tab component) to match the existing tab file structure (`TimerTab.tsx`, `BorderTab.tsx`, etc.).
- Add "Alerts" to `MAIN_TABS` in `App.tsx` (between Timer and About)
- Toggle switches for each warning threshold: 30 min, 15 min, 5 min, 2 min
- Description text: "Morph gently shifts border color and pulse speed as your next event approaches — like a visual countdown your peripheral vision picks up naturally."
- Saved to `warningWindows` array in `UserSettings`
- Simple on/off per threshold, no per-threshold customization

### About Tab

- Restyle with design system
- Version, Ko-fi donate button (brand red), GitHub/Issues links, GPL-3.0 license

---

## Slice 3: Live Preview & Timeline Scrubber

This is the feature that makes Morph's value instantly tangible — users can see the ambient color progression and understand how it helps them manage time transitions.

### Mini Preview

Location: top of Border tab, always visible.

- 200×120px screen outline rendered in a `<canvas>` element
- Shows current border effect: color, opacity, pulse animation, thickness, position (which edges are active)
- Updates in real-time as the user changes any Border setting
- Uses the actual TypeScript color engine (`getBorderState()` from `src/lib/color-engine/`) with synthetic events
- When no calendar is connected, uses a synthetic "meeting in 20 minutes" scenario

### Timeline Scrubber

Location: expandable panel below the mini preview. Toggle button: "Preview timeline".

- Horizontal timeline representing a 2-hour window centered on a synthetic meeting:
  - -60min: free time (green)
  - -30min to 0: warning progression (green → amber → orange)
  - 0 to +30min: in-session (green → golden → orange → purple)
  - +30min to +60min: overtime → gap → free

- **Playhead**: draggable handle on the timeline. Current position shown as timestamp label.
- **Color bar**: the timeline itself is rendered as a gradient showing the color progression. Each phase segment is a colored block.
- **Phase labels**: below the timeline, labels for each phase transition point.
- **Mini preview updates**: as the playhead moves, the mini preview renders the border state at that timestamp.

### Implementation

```
TimelineScrubber
├── syntheticEvents: CalendarEvent[]  (one 30-min meeting at center)
├── timeRange: { start: Date, end: Date }  (2-hour window)
├── playheadPosition: number  (0-1 normalized)
├── computeStateAtPosition(pos): BorderState
│   └── calls getBorderState(syntheticEvents, settings, fakeNow)
└── renders: <canvas> color bar + draggable playhead + phase labels

MiniPreview
├── borderState: BorderState  (from scrubber or live)
├── settings: { thickness, position, palette, intensity }
└── renders: <canvas> screen outline with colored borders + pulse animation
```

Both components are pure TypeScript/React with no Tauri dependency. They import directly from `src/lib/color-engine/`.

---

## Slice 4: Rich Tray Popover

The tray popover is the primary touchpoint for an ambient app. It answers the core question for someone with time blindness: "What's happening with my time right now?"

### Window Specification

- Tauri `WebviewWindow` created dynamically on tray icon click
- Size: 320×400
- **Position**: Use `TrayIconEvent::Click { position, .. }` from the `on_tray_icon_event` callback to get the tray icon's screen coordinates. Position the window anchored below (macOS) or above (Windows, where tray is at bottom) the tray icon using the position rect.
- **Dismiss behavior**: Listen to `onFocusChanged` on the JS side (`getCurrentWindow().onFocusChanged(({ payload: focused }) => { if (!focused) window.close(); })`). Note: `onFocusChanged` passes an `Event<boolean>`, not a raw boolean — destructure `payload`. On macOS, set the window level to `NSFloatingWindowLevel` (level 3) using the same deferred NSWindow pattern from `lib.rs` (show window → wait for webview → apply window level on main thread). This ensures the window properly gains and loses focus.
- No taskbar/dock presence: use `skipTaskbar: true` in `WebviewWindowBuilder`, and on macOS apply `NSWindowCollectionBehavior::CanJoinAllSpaces | IgnoresCycle`.
- Styled with the shared design system (adaptive theming)
- Entry point: new `src/tray/index.html` + `src/tray/App.tsx` (added to Vite multi-page config in `vite.config.ts`)

### Layout

```
┌──────────────────────────────┐
│  🟢 Free — 42 min to next   │  ← Header: status badge with border color
├──────────────────────────────┤
│  UP NEXT                     │
│  ┌────────────────────────┐  │
│  │ 🔵 10:00  Team Standup │  │  ← Calendar color dot + time + title
│  │ 🟣 11:30  Design Review│  │
│  │ 🔵 14:00  Sprint Plan  │  │
│  └────────────────────────┘  │
├──────────────────────────────┤
│  ⏸ Pause   ⏱ Timer   🔄 Sync│  ← Quick actions row
├──────────────────────────────┤
│                              │
│   [Active timer section -    │  ← Conditional: only when timer running
│    countdown + pause/stop]   │
│                              │
├──────────────────────────────┤
│  ⚙ Settings    Google ● MS ●│  ← Footer: settings link + provider status
└──────────────────────────────┘
```

### Header

- Left: Morph logo (small)
- Center: Current state as text ("Free — 42 min to next" / "Meeting in 12 min" / "In Session: Team Standup" / "Overtime +3 min")
- Background: subtle tint using the current border phase color at low opacity

### Up Next Section

- Next 3 calendar events (today only, or "No more events today")
- Each row: calendar color dot, time (HH:MM), event title (truncated to 1 line)
- Events from ignored calendars are excluded
- Compact: 28px row height

### Quick Actions

- **Pause**: opens a flyout with duration chips (5/15/30/60 min, Until next event). Same logic as settings General tab. **Note:** depends on Slice 2's pause event infrastructure being in place.
- **Timer**: opens a flyout with preset chips (including custom presets from Slice 2). Starting a timer replaces this button with the active timer section. **Note:** depends on Slice 2's custom preset storage being in place.
- **Sync**: emits `force-sync` event (consistent with the existing Settings UI event-based pattern), shows spinner for duration.

### Active Timer Section

- Shows when a timer is running (replaces empty space)
- Circular progress ring (compact, 48px) + digital countdown
- Pause/Resume + Stop buttons (emits `pause-timer` / `resume-timer` / `stop-timer` events)
- Preset name label ("Pomodoro — 18:32 remaining")

### Footer

- Gear icon → opens settings window, closes popover
- Connected provider indicators (colored dots with labels)

### Tray Icon

- Dynamic color matching current border phase:
  - Free: green
  - Warning: amber
  - In-session: contextual (green→amber→purple)
  - Overtime: purple
  - No events: gray
  - Paused: gray with a pause indicator
- Implementation: pre-rendered PNG set (6-8 icons) for each phase state, switched via Tauri's `tray.set_icon()`. Simpler and reliable across platforms vs runtime generation. Icons stored in `src-tauri/icons/tray/`.

---

## Slice 5: Platform Parity & Cleanup

### Windows Overlay

- Implement proper window positioning using `GetMonitorInfoW` for multi-monitor support
- Window styles: `WS_EX_TRANSPARENT | WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_TOPMOST`
- Click-through: `SetLayeredWindowAttributes` or `DwmExtendFrameIntoClientArea`
- Virtual desktop support: `SetWindowLongPtrW` with appropriate flags
- Match macOS behavior: always-on-top, no taskbar, no alt-tab, all virtual desktops

### Launch at Login

Uses `tauri-plugin-autostart` (see installation steps in Slice 2, General Tab section). Both macOS and Windows are handled by the plugin.

### Overlay Window Geometry

- Remove hardcoded 1920×1080 dimensions from `tauri.conf.json`
- Set reasonable small defaults (100×100 at 0,0)
- Overlay managers reposition and resize windows dynamically on startup and monitor change
- Both macOS and Windows managers handle multi-monitor correctly

### Cleanup

- Delete `src-tauri/src/tick.rs` **and** remove the `pub mod tick;` line from `src-tauri/src/lib.rs`
- Commit untracked files: `ErrorBoundary.tsx`, `WarningSettings.tsx`, `color-math.test.ts`, `performance.bench.ts`
- Add `.superpowers/` to `.gitignore`

---

## Decisions Log

| # | Decision | Chosen | Rationale |
|---|----------|--------|-----------|
| 1 | Improvement scope | Full glow-up (finish + reimagine) | User chose "coming out of beta" push |
| 2 | Settings personality | Adaptive (light/dark) | Follows system theme, feels native on both platforms |
| 3 | Live preview | Yes, with timeline scrubber | Key differentiator, premium feel, makes the ambient concept instantly tangible |
| 4 | Tray experience | Rich popover | Tray IS the app for an ambient tool — answers "what's happening with my time?" |
| 5 | Platform priority | Both macOS and Windows equally | Double the audience |
| 6 | Implementation strategy | Vertical slices | Sustained momentum, natural parallelization for 10-agent team |
| 7 | Theme picker in General tab | Mini preview swatches | More visual than a dropdown |
| 8 | Border position control | Interactive screen outline | More intuitive than radio buttons |
| 9 | Custom color palette | Skip for v1 | YAGNI — two palettes cover accessibility needs |
| 10 | Timer progress indicator | Circular ring (SVG) | More compact and visually distinct than flat bar |
| 11 | Custom timer presets | Include (JSON in settings table) | Simple to build, high user value, no migration needed |
| 12 | Warning settings tab name | "Alerts" | Broader, more user-friendly |
| 13 | Per-threshold customization | Skip | Keep it simple — just on/off toggles |
| 14 | Timeline scrubber window | 2-hour synthetic meeting | Clean demo, works without calendar connected |
| 15 | Mini preview renderer | Canvas element | Better performance for animation |
| 16 | Tray popover: event click action | None (v1) | Keep scope tight |
| 17 | Tray popover implementation | Tauri WebviewWindow (not NSPopover) | Cross-platform consistency, full style control |
| 18 | Tray icon | Pre-rendered PNG set | Simpler and reliable vs runtime generation |
| 19 | Launch-at-login | tauri-plugin-autostart | Handles both platforms, maintained by Tauri team |
| 20 | Theme detection | CSS media query + data-theme attribute | Simpler, works in both webviews natively |
| 21 | Custom preset storage | JSON in existing settings KV table | Avoids new migration, consistent with other array settings |
| 22 | Timer pause/resume | New Rust event handlers (not TS-only) | Must propagate to overlay, not just settings UI |
| 23 | Tray popover positioning | TrayIconEvent.position from callback | First-class Tauri 2 API, no platform hacks needed |
| 24 | Tray popover dismiss | JS onFocusChanged + NSFloatingWindowLevel on macOS | Reliable cross-platform, uses existing deferred NSWindow pattern |
| 25 | Sync action pattern | Emit `force-sync` event | Consistent with existing Settings UI pattern |
| 26 | WarningSettings location | Move to tabs/ directory | Match existing tab file structure |

## Out of Scope (v1)

- Custom color palette creation
- Deep-linking calendar events to external apps
- Per-warning-threshold customization
- Apple Calendar UI improvements (EventKit permissions flow could be improved but is functional)
- Notification system integration (could complement borders with system notifications)
- Keyboard shortcuts system (good v2 feature)
- Multiple simultaneous timers

## Testing Strategy

- Existing test suites (83 Rust + 274 TS) must continue passing
- New TypeScript tests for: shared components, timeline scrubber logic, tray popover state
- New Rust tests for: Windows overlay positioning, autostart plugin integration, multi-calendar fetch, timer pause/resume event handling
- Manual testing matrix: macOS light/dark × Windows light/dark × each settings tab × tray popover
