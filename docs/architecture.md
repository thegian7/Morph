# Morph Architecture

**Status:** Pre-implementation (decisions finalized, pending Sprint 0 spikes)
**Last Updated:** February 19, 2026

---

## System Overview

```
+------------------------------------------------------------------+
|                        Tauri 2 App                               |
|                                                                  |
|  +---------------------+          +------------------------+    |
|  | Overlay Window(s)   |          | Settings Window        |    |
|  | (per-edge or full)  |          | (React + Tailwind +    |    |
|  |                     |          |  Zustand)              |    |
|  | - CSS border strips |          |                        |    |
|  | - CSS transitions   |          | - Border settings      |    |
|  | - Pulse animation   |          | - Calendar connections |    |
|  | - Color engine (TS) |          | - Warning thresholds   |    |
|  +--------+------------+          | - Timer controls       |    |
|           |                       | - About / Support      |    |
|           | Tauri Events          +----------+-------------+    |
|           | (calendar-events-update,         |                   |
|           |  settings-changed,               | Tauri Commands    |
|           |  tick)                            | (get/set settings,|
|           |                                  |  connect calendar, |
|           |                                  |  start timer)      |
|  +--------v--------------------------+-------v-----------+       |
|  |              Rust Backend                             |       |
|  |                                                       |       |
|  |  +------------------+  +----------------------------+ |       |
|  |  | Window Manager   |  | Calendar Service           | |       |
|  |  | (platform-       |  |                            | |       |
|  |  |  specific)       |  | - CalendarAggregator       | |       |
|  |  |                  |  | - Google Provider          | |       |
|  |  | macOS: objc2     |  | - Microsoft Provider       | |       |
|  |  | Windows: windows |  | - Apple EventKit (macOS)   | |       |
|  |  +------------------+  | - 60s polling loop (Tokio) | |       |
|  |                        | - 1s tick emitter          | |       |
|  |  +------------------+  +----------------------------+ |       |
|  |  | Settings Store   |  | Token Storage              | |       |
|  |  | (SQLite via      |  | (OS Keychain via           | |       |
|  |  |  tauri-plugin-   |  |  keyring crate)            | |       |
|  |  |  sql)            |  +----------------------------+ |       |
|  |  +------------------+                                 |       |
|  +-------------------------------------------------------+       |
+------------------------------------------------------------------+

+------------------------------------------------------------------+
|                   Support (External)                             |
|                                                                  |
|  Ko-fi tip jar — no backend, no license validation               |
|  All features free, voluntary donations                          |
+------------------------------------------------------------------+
```

---

## Data Flow

### Calendar → Overlay Pipeline

```
1. Calendar Providers (Rust)
   - Poll Google/Microsoft APIs every 60 seconds
   - Apple EventKit: real-time via EKEventStoreChangedNotification
   |
   v
2. CalendarAggregator (Rust)
   - Merges events from all providers
   - Deduplicates, sorts by start time
   - Caches in SQLite (survives network outages)
   |
   v
3. Tauri Event Emission (Rust → Frontend)
   - "calendar-events-update": emitted when event list changes
   - "tick": emitted every 1 second (for smooth in-session progression)
   - Payload: CalendarEvent[] (serialized via serde + Tauri events)
   |
   v
4. Color Engine (TypeScript, runs in overlay window)
   - On each "tick" or "calendar-events-update" event:
     getBorderState(events, Date.now(), settings) → BorderState
   - Pure function, no side effects
   |
   v
5. Overlay Rendering (React/CSS in overlay window)
   - Applies BorderState.color via CSS background-color
   - Applies BorderState.opacity via CSS opacity
   - Applies BorderState.pulseSpeed via CSS animation-duration
   - All transitions use 8-15s CSS ease-in-out
```

### Settings Flow

```
Settings Window (React/Zustand)
  → Tauri Command: update_setting(key, value)
    → Rust: write to SQLite
    → Rust: emit "settings-changed" event
      → Overlay window: receives updated settings
      → Color engine: uses new settings on next tick
```

### Manual Timer Flow

```
System Tray / Settings Window
  → Tauri Command: start_timer(duration_minutes)
    → Rust: creates synthetic CalendarEvent
      (startTime = now, endTime = now + duration)
    → Rust: stores timer state in SQLite (survives restart)
    → Included in next "calendar-events-update" emission
    → Color engine treats it identically to a real calendar event
```

---

## Component Boundaries

### Rust Backend Owns

| Component           | Location                               | Purpose                                                         |
| ------------------- | -------------------------------------- | --------------------------------------------------------------- |
| Window Manager      | `src-tauri/src/window_manager/`        | Platform-specific overlay config (NSWindowLevel, WS_EX_TOPMOST) |
| Calendar Providers  | `src-tauri/src/calendar/`              | OAuth flows, API calls, token refresh                           |
| Calendar Aggregator | `src-tauri/src/calendar/aggregator.rs` | Merge, dedup, sort events from all providers                    |
| Polling Service     | `src-tauri/src/calendar/poller.rs`     | 60s poll loop + 1s tick, runs as Tokio background task          |
| Settings Store      | `src-tauri/src/settings.rs`            | SQLite read/write via Tauri commands                            |
| Timer Backend       | `src-tauri/src/timer.rs`               | Timer state, persistence, synthetic event generation            |
| System Tray         | `src-tauri/src/tray.rs`                | Menu bar (macOS) / system tray (Windows)                        |
| Tauri Commands      | `src-tauri/src/commands/`              | All frontend ↔ backend IPC                                      |

### TypeScript Frontend Owns

| Component       | Location                | Purpose                                                          |
| --------------- | ----------------------- | ---------------------------------------------------------------- |
| Color Engine    | `src/lib/color-engine/` | Pure TS: getBorderState() + types + palettes                     |
| Manual Timer UI | `src/lib/timer/`        | Timer state machine (TS), feeds synthetic events to color engine |
| Overlay Window  | `src/overlay/`          | Renders border strips, applies BorderState via CSS               |
| Settings Window | `src/settings/`         | React UI for all settings sections                               |
| Shared Types    | `src/lib/types/`        | CalendarEvent, BorderState, Phase, UserSettings                  |

### Shared Interfaces

`CalendarEvent` is defined in both Rust and TypeScript. They must stay in sync manually. The Rust struct uses `serde` for serialization; the TS interface mirrors it exactly.

```rust
// src-tauri/src/calendar/types.rs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarEvent {
    pub id: String,
    pub title: String,
    pub start_time: DateTime<Utc>,  // serialized as ISO 8601
    pub end_time: DateTime<Utc>,
    pub ignored: bool,
    pub calendar_id: Option<String>,
    pub provider_id: String,
    pub is_all_day: bool,
}
```

```typescript
// src/lib/types/calendar-event.ts
export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  ignored: boolean;
  calendarId?: string;
  providerId: string;
  isAllDay: boolean;
}
```

> **Future improvement:** Use the `ts-rs` crate to auto-generate TypeScript interfaces from Rust structs. Not needed for MVP with this small surface area.

---

## Monetization

Morph is completely free and open source (GPL-3.0). No paid tier, no feature gates, no license keys. Revenue is via voluntary tips through Ko-fi. A "Support Morph" link appears in the About tab, system tray menu, and settings footer.

---

## Local SQLite Schema

> Corresponds to task LP-6. This is Sprint 1 foundational work, not launch prep.

```sql
-- User preferences (key-value store)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cached calendar events (survives network outages)
CREATE TABLE calendar_events (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  calendar_id TEXT,
  title TEXT NOT NULL,
  start_time TEXT NOT NULL,        -- ISO 8601
  end_time TEXT NOT NULL,          -- ISO 8601
  is_all_day INTEGER DEFAULT 0,
  ignored INTEGER DEFAULT 0,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Connected calendar accounts (tokens stored in OS keychain, NOT here)
CREATE TABLE calendar_providers (
  id TEXT PRIMARY KEY,             -- e.g., "google-user@gmail.com"
  provider_type TEXT NOT NULL,     -- 'google', 'microsoft', 'apple'
  account_name TEXT NOT NULL,      -- display name / email
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_sync_at TEXT,
  status TEXT NOT NULL DEFAULT 'connected'  -- 'connected', 'error', 'disconnected'
);

-- Timer state (persists across restarts)
CREATE TABLE timer (
  id INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton
  duration_seconds INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  paused_at TEXT,
  elapsed_before_pause INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running'   -- 'running', 'paused', 'stopped'
);

-- Schema version for migrations
CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## Key Architecture Decisions

| Decision              | Choice                                                      | Rationale                                                                  |
| --------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| Overlay architecture  | **TBD by TS-4 spike**                                       | Four-window recommended by technical analysis, but spike must validate     |
| Color engine language | **TypeScript**                                              | Pure module, fully testable, runs in overlay window                        |
| Color engine tick     | **1-second interval in TS**, triggered by Rust "tick" event | Keeps color engine pure; Rust just provides the clock                      |
| State management      | **Zustand** (settings window only)                          | Overlay is too simple for a state library — direct event-driven updates    |
| Frontend framework    | **React + Tailwind CSS**                                    | As specified in PRD                                                        |
| Bundler               | **Vite**                                                    | Tauri 2 default, pairs with Vitest                                         |
| Testing (TS)          | **Vitest**                                                  | Fast, zero-config with Vite, ESM-native                                    |
| Testing (Rust)        | **cargo test** (built-in)                                   | Standard Rust testing                                                      |
| CI/CD                 | **GitHub Actions**                                          | Tauri has official GH Actions templates; good macOS/Windows runner support |
| Token storage         | **OS Keychain via `keyring` crate**                         | Cross-platform: macOS Keychain, Windows Credential Manager                 |
| Local database        | **SQLite via tauri-plugin-sql**                             | Lightweight, embedded, no server needed                                    |
| Monetization          | **Free + Ko-fi tip jar**                                    | No backend needed, no feature gates, voluntary support                     |
| License               | **GPL-3.0 open source**                                     | Free forever, community contributions welcome                              |
| Distribution          | **GitHub Releases + Homebrew**                              | Phase 1: unsigned. Phase 2: package managers. Phase 3: code signing        |

---

## Open Questions (Resolved by Spikes)

| Question                                        | Resolved By | Impact If Wrong                        |
| ----------------------------------------------- | ----------- | -------------------------------------- |
| Does click-through work on Windows?             | TS-2        | Need native WS_EX_TRANSPARENT fallback |
| Can overlay appear above macOS fullscreen apps? | TS-3        | Core feature degraded                  |
| Four windows or one fullscreen window?          | TS-4        | Affects all overlay code               |
| Does Google OAuth PKCE work in Tauri?           | TS-5        | May need different auth approach       |
| Does Microsoft Graph OAuth work without MSAL?   | TS-6        | May need to defer MS support           |
