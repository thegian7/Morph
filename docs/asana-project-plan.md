# Morph -- Asana Project Plan

**Date:** February 19, 2026
**Status:** Ready for Import
**Sprint Cadence:** 2-week sprints

---

## Table of Contents

1. [Project Structure (Asana Sections)](#1-project-structure-asana-sections)
2. [Milestones](#2-milestones)
3. [Detailed Tickets by Section](#3-detailed-tickets-by-section)
4. [Sprint Planning](#4-sprint-planning)
5. [Risk-Informed Prioritization](#5-risk-informed-prioritization)
6. [Go/No-Go Gates](#6-gono-go-gates)
7. [Dependency Graph](#7-dependency-graph)

---

## 1. Project Structure (Asana Sections)

| Section                    | Description                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Technical Spikes**       | Feasibility validation before committing to architecture. Must complete before substantial feature work.  |
| **Core Overlay Engine**    | Transparent border rendering, click-through, platform-specific window management. The foundational layer. |
| **Color Engine**           | Pure TypeScript state machine that maps calendar state to border color/opacity/pulse.                     |
| **Calendar Integrations**  | Google Calendar, Microsoft Graph, Apple EventKit OAuth flows and event fetching.                          |
| **Manual Timer**           | Standalone timer mode. Quick presets, start/stop from tray.                                               |
| **Settings UI**            | React-based settings window for border, color, calendar, and general preferences.                         |
| **System Tray / Menu Bar** | macOS menu bar and Windows system tray integration, quick actions, status display.                        |
| **Billing & Licensing**    | Ko-fi tip jar integration, open source licensing (GPL-3.0). No paid tier.                                 |
| **Distribution & Updates** | Notarization, code signing, auto-updater, installer packaging.                                            |
| **QA & Polish**            | Cross-platform testing, accessibility, performance profiling, edge cases.                                 |
| **Launch Prep**            | Landing page, marketing assets, community launch, Google OAuth verification.                              |

---

## 2. Milestones

### M0: Technical Spikes Complete

**Definition:** All critical architectural questions answered. Confident that Tauri 2 can deliver the core overlay experience on both macOS and Windows.
**Gate:** Go/No-Go decision on Tauri 2 and overlay architecture.
**Target:** End of Sprint 0 (Week 2)

### M1: Overlay POC

**Definition:** Working transparent border on macOS and Windows that renders colored edges, stays above all windows (including fullscreen on macOS), passes through all clicks, and transitions colors smoothly.
**Target:** End of Sprint 1 (Week 4)

### M2: Color Engine Complete

**Definition:** Full color state machine implemented and tested. Manual timer mode functional end-to-end (set timer, see color transition, timer completes with end-of-session state).
**Target:** End of Sprint 2 (Week 6)

### M3: Calendar MVP

**Definition:** Google Calendar connected end-to-end. App reads upcoming events, calculates state, and drives the overlay automatically. Microsoft Graph integration functional.
**Target:** End of Sprint 3 (Week 8)

### M4: Beta

**Definition:** All MVP features integrated. Settings UI complete. System tray working. Ko-fi tip jar linked. Internal/closed beta testing with real users.
**Target:** End of Sprint 5 (Week 10)

### M5: Launch

**Definition:** Public release. GitHub Releases distribution. Landing page live. Google OAuth verified (or workaround in place). Ko-fi tip jar active. Open source (GPL-3.0).
**Target:** End of Sprint 7 (Week 14)

---

## 3. Detailed Tickets by Section

### 3.1 Technical Spikes

#### TS-1: Spike -- Transparent Click-Through Overlay on macOS

**Description:** Build a minimal Tauri 2 app that creates a transparent, frameless, always-on-top window on macOS. Render four colored divs along the screen edges. Enable `setIgnoreCursorEvents(true)`. Verify that apps beneath the overlay remain fully interactive (mouse clicks, drags, keyboard input all pass through). Measure idle CPU/GPU usage.

**Acceptance Criteria:**

- Tauri 2 app launches with a transparent frameless window on macOS
- Colored border strips visible along all four screen edges
- All mouse events pass through to apps beneath the overlay
- Keyboard input is unaffected by the overlay
- Idle CPU usage < 1% measured via Activity Monitor
- Document findings (what worked, what required workarounds)

**Dependencies:** None
**Size:** M (2-3 days)
**Milestone:** M0

---

#### TS-2: Spike -- Transparent Click-Through Overlay on Windows

**Description:** Test the same Tauri 2 overlay on Windows 10 and Windows 11. The technical analysis flagged `setIgnoreCursorEvents` bugs on Windows (Tauri issue #11461). If the Tauri API fails, implement fallback using native Windows API: access the `HWND` and set `WS_EX_TRANSPARENT | WS_EX_LAYERED | WS_EX_TOPMOST` via the `windows` crate.

**Acceptance Criteria:**

- Click-through verified on Windows 11
- Click-through verified on Windows 10 (if available for testing)
- If Tauri API fails, native fallback implemented and verified
- Overlay visible above maximized (not exclusive fullscreen) windows
- Idle CPU usage < 1%
- Document findings and chosen approach

**Dependencies:** TS-1 (use same codebase, test on Windows)
**Size:** M (2-3 days)
**Milestone:** M0

---

#### TS-3: Spike -- macOS Fullscreen Space Overlay

**Description:** Using the `objc2` crate, access the native `NSWindow` from Tauri's window handle. Set `window.level` to `.screenSaver` or `CGWindowLevelForKey(.maximumWindow)`. Set `collectionBehavior` to `[.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]`. Verify overlay appears above native macOS fullscreen apps (Safari, Zoom, etc.) and persists across all Spaces.

**Acceptance Criteria:**

- Overlay visible above a fullscreen Safari window
- Overlay visible above a fullscreen Zoom call
- Overlay persists when switching between macOS Spaces
- Overlay does not interfere with Mission Control or Expose
- No macOS security/permission prompts triggered (beyond expected)
- Rust code documented with comments explaining each native API call

**Dependencies:** TS-1
**Size:** M (1-2 days)
**Milestone:** M0

---

#### TS-4: Spike -- Four-Window vs. Single-Window Architecture

**Description:** Compare two overlay approaches: (A) single fullscreen transparent window with border-only rendering, and (B) four thin windows positioned at each screen edge. Evaluate compositor performance, click-through behavior, fullscreen compatibility, and window positioning reliability. Test display resolution change handling (connect/disconnect external monitor, change resolution).

**Acceptance Criteria:**

- Both approaches implemented in the spike codebase
- Performance comparison documented (CPU, GPU, memory for each)
- Click-through behavior compared on both macOS and Windows
- Fullscreen app compatibility compared
- Display resolution change behavior tested
- Clear recommendation with rationale documented

**Dependencies:** TS-1, TS-2
**Size:** M (1-2 days)
**Milestone:** M0

---

#### TS-5: Spike -- Google Calendar OAuth2 PKCE Flow

**Description:** Implement the Google Calendar OAuth2 PKCE flow in a Tauri app. Open the system browser for authorization, listen on a localhost redirect URI, exchange the code for tokens, store tokens in the macOS Keychain (using `keyring` crate), and fetch upcoming events from the Calendar API. Handle token refresh.

**Acceptance Criteria:**

- System browser opens with Google OAuth consent screen
- Authorization code captured via localhost redirect
- Access token and refresh token obtained and stored in OS keychain
- Upcoming events (next 24 hours) fetched and logged to console
- Token refresh works after access token expiry
- Errors handled gracefully (user denies consent, network failure)
- Works on macOS; Windows keychain tested if possible

**Dependencies:** None (can run in parallel with TS-1)
**Size:** M (2-3 days)
**Milestone:** M0

---

#### TS-6: Spike -- Microsoft Graph OAuth2 Flow

**Description:** Implement Microsoft Graph OAuth2 authorization code flow with PKCE for calendar access. Register the app in Azure AD (Entra ID). Use scopes `Calendars.Read` and `offline_access`. Handle both personal Microsoft accounts and work/school accounts. Store tokens in OS keychain.

**Acceptance Criteria:**

- Azure AD app registration configured as public client
- OAuth flow opens system browser, captures auth code
- Tokens stored in OS keychain
- Calendar events fetched from Microsoft Graph `calendarView` endpoint
- Token refresh works
- Both personal and work accounts tested (or documented which was tested)

**Dependencies:** None (can run in parallel with other spikes)
**Size:** M (2-3 days)
**Milestone:** M0

---

### 3.2 Core Overlay Engine

#### OE-1: Set Up Tauri 2 Project Scaffold

**Description:** Initialize the Tauri 2 project with React + TypeScript frontend, Tailwind CSS, and the recommended project structure. Configure `tauri.conf.json` for the overlay window(s) and a separate settings window. Set up the Rust workspace with platform-specific modules (`window_manager/macos.rs`, `window_manager/windows.rs`). Add linting (ESLint, clippy), formatting (Prettier, rustfmt), and basic CI.

**Acceptance Criteria:**

- `cargo tauri dev` runs and shows an empty window
- React + TypeScript + Tailwind CSS configured in the frontend
- Rust `src-tauri/src/window_manager/mod.rs` with `#[cfg(target_os)]` stubs
- ESLint and Prettier configured for TypeScript
- `cargo clippy` passes with no warnings
- `.gitignore` covers Tauri build artifacts

**Dependencies:** TS-4 (architecture decision determines window setup)
**Size:** M (1-2 days)
**Milestone:** M1

---

#### OE-2: Implement Overlay Window Rendering (Chosen Architecture)

**Description:** Based on the spike findings (TS-4), implement the overlay border rendering using the chosen approach (four thin windows or single fullscreen). Render colored `<div>` strips along the selected edges. Support border position setting (all edges, top only, sides only, bottom only). Apply CSS `transition` on `background-color` with configurable duration.

**Acceptance Criteria:**

- Colored border visible on all configured screen edges
- Border renders correctly at all three thickness settings (thin: 3px, medium: 6px, thick: 10px)
- Border position is configurable (all edges / top / sides / bottom)
- Color transitions use CSS easing with 8-15 second duration
- Border does not cover any application content beyond its configured thickness
- Border handles display resolution changes gracefully

**Dependencies:** OE-1, TS-4
**Size:** M (2-3 days)
**Milestone:** M1

---

#### OE-3: Implement Platform-Specific Window Management (macOS)

**Description:** Create the macOS `OverlayManager` implementation using `objc2`. Set `NSWindowLevel` above fullscreen, configure `collectionBehavior` for all Spaces, enable click-through. This is production code evolved from the spike (TS-3).

**Acceptance Criteria:**

- Overlay visible above native macOS fullscreen apps
- Overlay persists across all Spaces
- All mouse and keyboard events pass through
- Code compiles only on macOS target (`#[cfg(target_os = "macos")]`)
- Error handling for all native API calls (no unwraps on objc calls)

**Dependencies:** OE-1, TS-3
**Size:** M (1-2 days)
**Milestone:** M1

---

#### OE-4: Implement Platform-Specific Window Management (Windows)

**Description:** Create the Windows `OverlayManager` implementation using the `windows` crate. Set extended window styles for click-through and always-on-top. Use the approach validated in the spike (TS-2) -- either Tauri's API or native fallback.

**Acceptance Criteria:**

- Overlay visible above maximized windows on Windows 10 and 11
- All mouse and keyboard events pass through
- Code compiles only on Windows target (`#[cfg(target_os = "windows")]`)
- Tested with common apps (browser, VS Code, Zoom)

**Dependencies:** OE-1, TS-2
**Size:** M (1-2 days)
**Milestone:** M1

---

#### OE-5: Implement Pulse Animation

**Description:** Add CSS `opacity` pulse animation to the border. Use GPU-composited properties only (`opacity`, `transform`). Pulse speed is driven by `BorderState.pulseSpeed` (milliseconds per cycle, 0 = no pulse). Ensure the animation is paused when not needed to reduce power draw.

**Acceptance Criteria:**

- Smooth sinusoidal opacity pulse at configurable speed
- Pulse pauses when `pulseSpeed` is 0 (no idle CPU cost)
- Uses `will-change: opacity` for GPU compositing
- Visually smooth at pulse speeds from 500ms to 5000ms
- No jank or frame drops during pulse

**Dependencies:** OE-2
**Size:** S (< 1 day)
**Milestone:** M1

---

#### OE-6: Overlay-to-Backend Communication Bridge

**Description:** Set up the Tauri command/event bridge between the Rust backend and the overlay frontend. The backend emits `BorderState` updates via Tauri events. The overlay window listens for these events and updates its rendering. This decouples the color engine from the overlay rendering.

**Acceptance Criteria:**

- Rust backend can emit `border-state-update` events with `BorderState` payload
- Overlay frontend receives events and updates border color, opacity, pulse
- Event emission works at 1 Hz (once per second) without performance issues
- Serialization/deserialization of `BorderState` tested

**Dependencies:** OE-2
**Size:** S (< 1 day)
**Milestone:** M1

---

### 3.3 Color Engine

#### CE-1: Define Color Engine Types and Interfaces

**Description:** Create the TypeScript module with all types defined in the PRD: `CalendarEvent`, `BorderState`, `Phase`, `UserSettings`. Define the `getBorderState(events, now, settings)` function signature. Include all 11 phase values from the PRD. Define the color palette constants (hex values for each phase).

**Acceptance Criteria:**

- All types exported from `src/lib/color-engine/types.ts`
- `getBorderState` function signature in `src/lib/color-engine/index.ts`
- Color constants defined for all 11 phases
- Default `UserSettings` defined (warning windows at 30, 15, 5, 2 min)
- No UI dependencies -- pure TypeScript module

**Dependencies:** None
**Size:** S (< 1 day)
**Milestone:** M2

---

#### CE-2: Implement Free Time and Warning States

**Description:** Implement the `getBorderState` logic for states when the user is NOT currently in a session: `free-deep` (60+ min to next event), `warning-far` (30 min), `warning-mid` (15 min), `warning-near` (5 min), `warning-imminent` (2 min), and the `no events` calm state. Compute smooth color interpolation between states based on exact time remaining. Warning thresholds should use the user's configured values.

**Acceptance Criteria:**

- Returns `free-deep` with dim green when next event is 60+ min away
- Smoothly interpolates color from green through yellow to amber as time approaches
- Warning thresholds match `UserSettings` configuration
- Returns calm neutral state when no events exist
- Pulse speed increases as event approaches (none at 60min, slow at 30min, faster at 5min)
- All transitions tested with unit tests at key time points

**Dependencies:** CE-1
**Size:** M (1-2 days)
**Milestone:** M2

---

#### CE-3: Implement In-Session States

**Description:** Implement `getBorderState` for when the user is currently inside a calendar event: `in-session-early` (0-40%), `in-session-mid` (40-70%), `in-session-late` (70-90%), `in-session-end` (90-100%). The phase is determined by the percentage of elapsed session time. Include the end-of-session slow red strobe.

**Acceptance Criteria:**

- Correct phase returned based on elapsed percentage of the event
- Color smoothly transitions green > yellow-green > yellow > orange > red
- End-of-session triggers slow red strobe (pulse with appropriate speed)
- Handles events of varying lengths (15 min to 3 hours)
- Handles events that have already ended (returns appropriate post-session state)
- Unit tests for boundary conditions (exactly at 40%, 70%, 90%, 100%)

**Dependencies:** CE-1
**Size:** M (1-2 days)
**Milestone:** M2

---

#### CE-4: Implement Gap and Transition States

**Description:** Implement `getBorderState` for back-to-back meeting gaps: `gap-short` and `gap-long`. A 5-minute gap should feel urgent (amber/orange), a 30-minute gap should feel calm (green). Handle the transition from one event ending to the next event's warning sequence.

**Acceptance Criteria:**

- Short gaps (< 10 min) render warm/urgent colors
- Long gaps (> 15 min) render calm colors
- Smooth transition from in-session-end to gap state
- Gap state correctly transitions into warning state for the next event
- Handles overlapping events (picks the nearest non-ignored event)
- Unit tests for common gap scenarios (5 min, 10 min, 15 min, 30 min gaps)

**Dependencies:** CE-2, CE-3
**Size:** M (1-2 days)
**Milestone:** M2

---

#### CE-5: Implement Event Filtering Logic

**Description:** Add event filtering to the color engine. All-day events should be ignored by default. Users can mark specific calendars or events as ignored. Filtered events should not affect the border state calculation.

**Acceptance Criteria:**

- All-day events excluded from state calculation by default
- Events with `ignored: true` excluded from calculation
- Calendar-level ignore supported (all events from a specific calendar)
- Filtering applied before state calculation (not after)
- Unit tests for filtering scenarios

**Dependencies:** CE-1
**Size:** S (< 1 day)
**Milestone:** M2

---

#### CE-6: Color Engine Integration Test Suite

**Description:** Build a comprehensive integration test suite that runs the color engine through realistic day scenarios: a day with back-to-back meetings, a day with long free blocks, a day with many short events, an empty calendar day. Use time simulation to advance through the day and verify state transitions.

**Acceptance Criteria:**

- Test scenario: typical workday (9am-5pm with 5-6 meetings)
- Test scenario: meeting-free focus day
- Test scenario: back-to-back meetings with 5 and 15 minute gaps
- Test scenario: overlapping events
- Test scenario: event that gets cancelled mid-session (events array changes)
- All tests pass; coverage > 90% on the color engine module

**Dependencies:** CE-2, CE-3, CE-4, CE-5
**Size:** M (1-2 days)
**Milestone:** M2

---

### 3.4 Calendar Integrations

#### CAL-1: Build Calendar Provider Abstraction Layer

**Description:** Create a Rust trait `CalendarProvider` and a `CalendarAggregator` that manages multiple providers. The aggregator merges events from all connected providers, deduplicates, and sorts by start time. It exposes a single `fetch_upcoming_events()` method that the color engine consumes.

**Acceptance Criteria:**

- `CalendarProvider` trait defined with `authenticate`, `fetch_events`, `refresh_token` methods
- `CalendarAggregator` holds a `Vec<Box<dyn CalendarProvider>>`
- Events from multiple providers merged and sorted by start time
- Duplicate detection for events that appear in multiple calendars
- `CalendarEvent` struct matches the TypeScript interface (id, title, startTime, endTime, ignored, calendarId, providerId)
- Unit tests with mock providers

**Dependencies:** None
**Size:** M (1-2 days)
**Milestone:** M3

---

#### CAL-2: Implement Google Calendar Provider

**Description:** Build the Google Calendar `CalendarProvider` implementation. Handle the full OAuth2 PKCE flow (evolved from spike TS-5): open system browser, capture auth code on localhost, exchange for tokens, store in OS keychain. Implement `fetch_events` using the Google Calendar API `events.list` endpoint. Implement token refresh.

**Acceptance Criteria:**

- OAuth2 PKCE flow completes successfully
- Tokens stored securely in OS keychain
- Events fetched for configurable time window (default: next 24 hours)
- Token refresh happens automatically before expiry
- Handles revoked tokens gracefully (re-prompts user to authenticate)
- Handles network errors with retry (max 3 attempts)
- Rate limiting respected
- User can disconnect/reconnect Google Calendar

**Dependencies:** CAL-1, TS-5
**Size:** L (3-5 days)
**Milestone:** M3

---

#### CAL-3: Implement Microsoft Graph Calendar Provider

**Description:** Build the Microsoft Graph `CalendarProvider` implementation. Handle OAuth2 authorization code flow with PKCE (evolved from spike TS-6). Use the `calendarView` endpoint for event fetching. Support both personal Microsoft accounts and work/school accounts.

**Acceptance Criteria:**

- OAuth2 flow works with personal Microsoft accounts
- OAuth2 flow works with work/school accounts (tested or documented limitation)
- Tokens stored securely in OS keychain
- Events fetched from `calendarView` endpoint
- Token refresh works automatically
- User can disconnect/reconnect Microsoft Calendar

**Dependencies:** CAL-1, TS-6
**Size:** L (3-5 days)
**Milestone:** M3

---

#### CAL-4: Implement Apple EventKit Provider (macOS)

**Description:** Build the Apple EventKit `CalendarProvider` implementation as a Tauri plugin. Request calendar access permission. Fetch events from `EKEventStore`. Listen for `EKEventStoreChangedNotification` for real-time updates instead of polling. Only compiled on macOS.

**Acceptance Criteria:**

- Permission dialog appears on first use with clear messaging
- Events fetched from all user calendars
- Real-time event change notifications received and processed
- Permission re-prompts handled gracefully after app updates
- Compiles only on macOS (`#[cfg(target_os = "macos")]`)
- User can disconnect/reconnect Apple Calendar

**Dependencies:** CAL-1
**Size:** M (2-3 days)
**Milestone:** M3

---

#### CAL-5: Implement Calendar Polling Service

**Description:** Create a background service that polls calendar providers every 60 seconds. Cache events in SQLite to survive network outages. Emit events to the frontend via Tauri events whenever the event list changes. The color engine recalculates on each poll update AND on a 1-second timer for smooth in-session progression.

**Acceptance Criteria:**

- Polling runs every 60 seconds in a background Tokio task
- Events cached in SQLite (`calendar_events` table)
- Only emits update events when the event list actually changes
- 1-second tick emitted for the color engine's in-session time progression
- Graceful degradation on network failure (uses cached events)
- Polling interval configurable in settings
- Polling pauses when all providers are disconnected

**Dependencies:** CAL-1, OE-6
**Size:** M (2-3 days)
**Milestone:** M3

---

#### CAL-6: Calendar Connection UI

**Description:** Build the calendar connection management UI in the settings window. Show connected providers with their account name and status. Provide "Connect" buttons for each supported provider. Show a "Disconnect" option for connected providers. Display sync status and last sync time.

**Acceptance Criteria:**

- Lists all supported calendar providers (Google, Microsoft, Apple on macOS)
- "Connect" button triggers OAuth flow for Google/Microsoft or permission prompt for Apple
- Connected accounts show email/account name and green status indicator
- "Disconnect" button removes tokens and stops syncing for that provider
- Last sync time displayed per provider
- Error states shown clearly (expired token, network error)

**Dependencies:** CAL-2 or CAL-3 (at least one provider implemented), SET-1 (settings window shell)
**Size:** M (1-2 days)
**Milestone:** M3

---

### 3.5 Manual Timer

#### MT-1: Implement Manual Timer State Machine

**Description:** Create a TypeScript module for the manual timer. Supports start, pause, resume, stop, and reset actions. Tracks elapsed time and total duration. Feeds into the color engine as a synthetic calendar event (same interface as real events, enabling code reuse).

**Acceptance Criteria:**

- Timer starts with a specified duration
- Timer can be paused and resumed
- Timer emits current elapsed/remaining time
- Timer state is represented as a `CalendarEvent` with `startTime = now` and `endTime = now + duration`
- Color engine treats manual timer events identically to calendar events
- Timer state persists across app restarts (resume from where you left off)

**Dependencies:** CE-1
**Size:** M (1-2 days)
**Milestone:** M2

---

#### MT-2: Implement Timer Presets

**Description:** Add quick-start timer presets: 15, 25, 30, 45, 60, 90 minutes. Presets are accessible from both the system tray menu and the settings window. Starting a preset immediately begins the timer.

**Acceptance Criteria:**

- All six preset durations available
- Selecting a preset starts the timer immediately
- Active timer displayed in system tray tooltip
- Custom duration input available (not just presets)
- Only one timer can be active at a time

**Dependencies:** MT-1, ST-1 (system tray)
**Size:** S (< 1 day)
**Milestone:** M2

---

### 3.6 Settings UI

#### SET-1: Create Settings Window Shell

**Description:** Create the settings window as a separate Tauri window. Set up React routing for settings sections (General, Border, Calendar, Timer, About). Use Tailwind CSS for styling. Settings window should open from the system tray and be a standard resizable window (not overlay).

**Acceptance Criteria:**

- Settings window opens from system tray menu
- Navigation between settings sections works
- Window is a standard OS window with title bar and close button
- Closes back to tray (does not quit the app)
- Responsive layout that works at various window sizes

**Dependencies:** OE-1
**Size:** M (1-2 days)
**Milestone:** M4

---

#### SET-2: Implement Border Settings

**Description:** Build the border settings section. Controls: border thickness (thin/medium/thick with visual preview), border position (all edges/top/sides/bottom), color intensity (subtle/normal/vivid). Changes should apply immediately (live preview on the overlay).

**Acceptance Criteria:**

- Thickness selector with three options and visual preview
- Position selector with four options
- Color intensity selector with three options
- Changes apply immediately to the live overlay
- Settings persist to SQLite via Tauri commands
- Reset to defaults button

**Dependencies:** SET-1, OE-2
**Size:** M (1-2 days)
**Milestone:** M4

---

#### SET-3: Implement Warning Window Settings

**Description:** Build the warning timing settings section. Allow users to configure which warning thresholds are active (30 min, 15 min, 5 min, 2 min). Each threshold can be toggled on/off. Free tier is limited to 5 min and 2 min only (pro feature gate).

**Acceptance Criteria:**

- Toggle switches for each warning threshold
- Free tier shows 30 min and 15 min as locked/pro-only
- Changes persist and are consumed by the color engine
- Visual explanation of what each threshold means

**Dependencies:** SET-1, CE-2
**Size:** S (< 1 day)
**Milestone:** M4

---

#### SET-4: Implement General Settings

**Description:** Build the general settings section. Controls: launch at login toggle, pause/snooze border (for N minutes), app version info. On macOS, "launch at login" uses `SMAppService`. On Windows, uses the registry Run key or startup folder.

**Acceptance Criteria:**

- Launch at login toggle works on macOS
- Launch at login toggle works on Windows
- Pause/snooze button with duration picker (5, 15, 30, 60 min, or until next event)
- Snooze hides the overlay and restores it after the duration
- App version displayed

**Dependencies:** SET-1
**Size:** M (1-2 days)
**Milestone:** M4

---

### 3.7 System Tray / Menu Bar

#### ST-1: Implement System Tray / Menu Bar Icon

**Description:** Create the system tray (Windows) / menu bar (macOS) presence. The icon should reflect the current border state using a colored dot or tinted icon. Clicking the icon shows a context menu. The app should run as a tray-only app (no dock icon on macOS, no taskbar entry on Windows).

**Acceptance Criteria:**

- Tray icon appears on macOS menu bar
- Tray icon appears on Windows system tray
- Icon color reflects current phase (or a neutral icon when idle)
- App does not appear in macOS dock
- App does not appear in Windows taskbar
- Icon persists after login (if launch-at-login enabled)

**Dependencies:** OE-1
**Size:** M (1-2 days)
**Milestone:** M4

---

#### ST-2: Implement Tray Context Menu

**Description:** Build the context menu that appears when clicking/right-clicking the tray icon. Menu items: current state label, timer presets submenu, pause/resume, open settings, quit. The menu should update dynamically (e.g., show "Resume" when paused, show active timer remaining time).

**Acceptance Criteria:**

- Context menu appears on left-click (macOS) and right-click (Windows)
- Shows current state ("Free time", "Meeting in 15 min", "In: Team Standup -- 23 min left")
- Timer presets submenu (15, 25, 30, 45, 60, 90 min)
- Active timer shows remaining time and "Stop Timer" option
- Pause/Resume toggle
- "Open Settings" opens the settings window
- "Quit" exits the application cleanly

**Dependencies:** ST-1, MT-1
**Size:** M (1-2 days)
**Milestone:** M4

---

### 3.8 Billing & Licensing

#### BL-1: Set Up Stripe Products and Pricing

**Description:** Create the Stripe product configuration: a single product ("Morph Pro") with two prices -- $7/month and $56/year. Configure the customer portal for subscription management. Set up webhook endpoint for payment events.

**Acceptance Criteria:**

- Stripe product "Morph Pro" created in test mode
- Monthly price ($7/mo) and annual price ($56/year) configured
- Customer portal enabled for self-serve subscription management
- Webhook endpoint URL configured (can be a placeholder until backend is ready)
- Test mode keys stored securely (not in source code)

**Dependencies:** None
**Size:** S (< 1 day)
**Milestone:** M4

---

#### BL-2: Implement License Verification System

**Description:** Build the license verification system. On app launch, check if the user has an active Pro subscription. Use a simple approach: Stripe Checkout creates a subscription, webhook stores the license status, app checks a license server (or validates a signed license key locally). For MVP, a simple API endpoint that validates email + license key is sufficient.

**Acceptance Criteria:**

- App checks license status on launch
- Unlicensed users get free-tier features only
- Licensed users get all Pro features
- License check works offline (cached locally, re-verified periodically)
- Grace period of 7 days if license check fails (network issues)
- License status stored securely on device

**Dependencies:** BL-1
**Size:** L (3-5 days)
**Milestone:** M4

---

#### BL-3: Implement Upgrade Flow

**Description:** Build the in-app upgrade experience. When a free-tier user taps a pro-only feature, show an upgrade prompt. The upgrade button opens Stripe Checkout in the system browser. After successful payment, the app detects the new license and unlocks pro features.

**Acceptance Criteria:**

- Pro-only features show a lock icon or "Pro" badge on free tier
- Tapping a locked feature shows an upgrade prompt with pricing
- "Upgrade" button opens Stripe Checkout in system browser
- After payment, app detects new license within 60 seconds
- Annual vs. monthly pricing options shown
- "Manage Subscription" link opens Stripe Customer Portal

**Dependencies:** BL-2, SET-1
**Size:** M (2-3 days)
**Milestone:** M4

---

### 3.9 Distribution & Updates

#### DU-1: Configure macOS Code Signing and Notarization

**Description:** Set up Apple Developer certificate for code signing. Configure Tauri's build pipeline to sign and notarize the macOS DMG. Notarization allows the app to run without Gatekeeper warnings on user machines.

**Acceptance Criteria:**

- App is signed with a Developer ID Application certificate
- DMG is signed and notarized with Apple
- App launches cleanly on a fresh macOS install (no Gatekeeper warning)
- Notarization stapled to the DMG
- CI/CD pipeline can perform signing and notarization

**Dependencies:** OE-1
**Size:** M (2-3 days)
**Milestone:** M5

---

#### DU-2: Configure Windows Code Signing

**Description:** Obtain and configure a Windows code signing certificate (EV or standard). Configure Tauri's NSIS installer to sign the executable and installer.

**Acceptance Criteria:**

- Executable (.exe) is signed
- NSIS installer is signed
- Windows SmartScreen does not show a warning on first install
- Certificate details visible in file properties

**Dependencies:** OE-1
**Size:** M (1-2 days)
**Milestone:** M5

---

#### DU-3: Implement Auto-Updater

**Description:** Configure Tauri's built-in auto-updater. Set up an update manifest endpoint (can be a static JSON file on a CDN). The app checks for updates on launch and periodically. Updates are downloaded in the background and applied on next restart.

**Acceptance Criteria:**

- App checks for updates on launch
- Update check runs every 24 hours in the background
- Update notification shown to user when available
- User can choose to update now or later
- Update downloads in the background
- Update applies on next app restart
- Update manifest hosted and accessible
- Rollback mechanism if update fails

**Dependencies:** DU-1 (macOS) or DU-2 (Windows)
**Size:** M (2-3 days)
**Milestone:** M5

---

#### DU-4: Create Installer Packages

**Description:** Configure Tauri to produce: DMG for macOS, NSIS installer for Windows. Include app icon, license agreement, and appropriate install locations. macOS DMG should include the standard drag-to-Applications UI.

**Acceptance Criteria:**

- macOS DMG produced with drag-to-Applications layout
- Windows NSIS installer with install wizard
- App icon set correctly on both platforms
- Uninstaller included for Windows
- Install size documented

**Dependencies:** OE-1
**Size:** M (1-2 days)
**Milestone:** M5

---

### 3.10 QA & Polish

#### QA-1: Cross-Platform Overlay Testing

**Description:** Systematic testing of the overlay on macOS and Windows across common scenarios: various screen resolutions, fullscreen apps, multi-window setups, screen sharing (Zoom, Teams), display sleep/wake, lid close/open on laptops.

**Acceptance Criteria:**

- Overlay tested on macOS 13+ (Ventura, Sonoma, Sequoia)
- Overlay tested on Windows 10 and Windows 11
- Overlay survives display sleep/wake
- Overlay survives lid close/open
- Overlay does not interfere with screen sharing
- Overlay behaves correctly on Retina/HiDPI displays
- All issues documented and tracked

**Dependencies:** OE-2, OE-3, OE-4
**Size:** M (2-3 days)
**Milestone:** M4

---

#### QA-2: Performance Profiling

**Description:** Profile the app's CPU, GPU, memory, and battery impact on macOS and Windows. Target: < 1% CPU idle, < 50 MB memory, no measurable battery impact vs. not running. Profile during color transitions and pulse animations.

**Acceptance Criteria:**

- CPU usage < 1% when idle (no animation)
- CPU usage < 2% during transitions/pulse
- Memory usage < 50 MB
- No memory leaks over 24-hour run
- Battery impact profiled on MacBook (should be negligible)
- Results documented with methodology

**Dependencies:** OE-5, CE-6
**Size:** M (1-2 days)
**Milestone:** M4

---

#### QA-3: Accessibility Review

**Description:** Review the app for accessibility: provide at least one colorblind-friendly palette (blue-to-orange) as an alternative to the default green-to-red. Ensure settings UI is keyboard navigable and screen-reader compatible. Document the accessibility approach.

**Acceptance Criteria:**

- Default green-to-red palette available
- Alternative blue-to-orange palette available for red-green colorblind users
- Palette selection available in settings
- Settings window is keyboard navigable
- Settings window works with VoiceOver (macOS) and Narrator (Windows)
- Accessibility statement drafted for the website

**Dependencies:** SET-2, CE-1
**Size:** M (2-3 days)
**Milestone:** M4

---

#### QA-4: Onboarding Flow

**Description:** Build a first-run onboarding experience that: welcomes the user, explains what the border does, guides through macOS permission grants (if needed), offers to connect a calendar, and starts a demo timer so the user can see the border in action immediately.

**Acceptance Criteria:**

- Onboarding appears on first launch only
- Explains the ambient border concept in 2-3 screens
- Guides through any required macOS permissions with screenshots
- Offers calendar connection (skippable)
- Starts a 2-minute demo timer to show the border in action
- "Get Started" completes onboarding and closes the window

**Dependencies:** SET-1, MT-1, CAL-6
**Size:** M (2-3 days)
**Milestone:** M4

---

### 3.11 Launch Prep

#### LP-1: Start Google OAuth Verification Process

**Description:** Submit the Google OAuth verification application. This requires: privacy policy URL, homepage URL, app description, detailed justification for the `calendar.events.readonly` scope, and a YouTube video demonstrating the OAuth flow. Start this early -- verification takes several weeks and first-submission rejection is common.

**Acceptance Criteria:**

- Google Cloud Console project configured with production OAuth consent screen
- Privacy policy page published
- YouTube demo video uploaded
- Verification application submitted
- Timeline tracked (expect 2-4 weeks for review)

**Dependencies:** CAL-2 (Google Calendar flow must be working for the demo video)
**Size:** M (2-3 days)
**Milestone:** M5

---

#### LP-2: Create Landing Page

**Description:** Build a landing page for Morph with: hero section showing the border concept, feature highlights, pricing table (free vs. pro), download buttons (macOS + Windows), and email signup for launch notification. Can be a simple static site (e.g., Astro or Next.js on Vercel).

**Acceptance Criteria:**

- Hero section with compelling visual of the screen border
- Clear explanation of the product in 1-2 sentences
- Feature comparison table (free vs. pro)
- Pricing displayed ($7/mo or $56/year)
- Download buttons for macOS and Windows
- Email signup form for launch updates
- Responsive design (mobile + desktop)

**Dependencies:** DU-4 (need download files to link)
**Size:** L (3-5 days)
**Milestone:** M5

---

#### LP-3: Prepare Community Launch Content

**Description:** Draft launch posts for: r/ADHD, r/AuDHD, r/productivity, Product Hunt. Each post should tell the genuine story of the product (inspired by Timeqube, designed for time blindness) and avoid feeling like marketing. Include screenshots and a short demo GIF.

**Acceptance Criteria:**

- Reddit post draft for r/ADHD (focuses on time blindness story)
- Reddit post draft for r/productivity (focuses on calendar integration)
- Product Hunt listing draft (tagline, description, screenshots)
- Demo GIF showing the border transitioning through states (~15 seconds)
- Screenshots of: overlay in action, settings window, calendar connection
- All content reviewed for tone (genuine, not salesy)

**Dependencies:** QA-4 (app must be polished for screenshots)
**Size:** M (2-3 days)
**Milestone:** M5

---

#### LP-4: Azure AD App Registration for Production

**Description:** Configure the Azure AD (Entra ID) app registration for production use. Enable multi-tenant support. Configure redirect URIs. Ensure both personal Microsoft accounts and work/school accounts are supported. Verify admin consent is not required for basic calendar read access.

**Acceptance Criteria:**

- Azure AD app registration in production tenant
- Multi-tenant audience configured
- Redirect URIs configured for desktop app
- Verified that `Calendars.Read` does not require admin consent for personal accounts
- Documented any limitations for organizational accounts

**Dependencies:** CAL-3
**Size:** S (< 1 day)
**Milestone:** M5

---

#### LP-5: Set Up Stripe Production Environment

**Description:** Move Stripe configuration from test mode to production. Create production products, prices, and customer portal. Configure production webhook endpoint. Verify end-to-end payment flow.

**Acceptance Criteria:**

- Production Stripe products and prices created
- Production webhook endpoint configured and verified
- Customer portal configured for production
- End-to-end test: user upgrades, subscription activates, license validates
- Production API keys stored securely in deployment environment

**Dependencies:** BL-2, BL-3
**Size:** S (< 1 day)
**Milestone:** M5

---

#### LP-6: Set Up SQLite Database Schema

**Description:** Design and implement the local SQLite database schema for storing settings, cached calendar events, license state, and timer history. Use Tauri's SQLite plugin. Include migration support for future schema changes.

**Acceptance Criteria:**

- `settings` table for user preferences (key-value)
- `calendar_events` table for cached events
- `calendar_providers` table for connected accounts (no tokens -- those go in keychain)
- `license` table for cached license state
- Migration system in place (versioned schema changes)
- Database created on first launch

**Dependencies:** OE-1
**Size:** M (1-2 days)
**Milestone:** M2

---

## 4. Sprint Planning

### Sprint 0 (Weeks 1-2): Technical Spikes

**Goal:** Validate all critical assumptions before building.

| Ticket                              | Size | Parallelizable        |
| ----------------------------------- | ---- | --------------------- |
| TS-1: macOS Overlay Spike           | M    | Yes (with TS-5, TS-6) |
| TS-2: Windows Overlay Spike         | M    | After TS-1            |
| TS-3: macOS Fullscreen Overlay      | M    | After TS-1            |
| TS-4: Four-Window vs. Single-Window | M    | After TS-1, TS-2      |
| TS-5: Google Calendar OAuth2 Spike  | M    | Yes (with TS-1)       |
| TS-6: Microsoft Graph OAuth2 Spike  | M    | Yes (with TS-1)       |

**Parallelization:** One developer can work TS-1 > TS-2 > TS-3 > TS-4 while another works TS-5 > TS-6 concurrently.

**Gate:** M0 Go/No-Go at end of sprint.

---

### Sprint 1 (Weeks 3-4): Core Overlay

**Goal:** Production-quality overlay working on both platforms.

| Ticket                          | Size | Parallelizable |
| ------------------------------- | ---- | -------------- |
| OE-1: Project Scaffold          | M    | First          |
| OE-2: Overlay Rendering         | M    | After OE-1     |
| OE-3: macOS Window Management   | M    | After OE-1     |
| OE-4: Windows Window Management | M    | After OE-1     |
| OE-5: Pulse Animation           | S    | After OE-2     |
| OE-6: Communication Bridge      | S    | After OE-2     |
| LP-6: SQLite Schema             | M    | After OE-1     |

**Parallelization:** OE-3 and OE-4 can be done simultaneously by different developers. LP-6 can be done in parallel with OE-2.

**Gate:** M1 at end of sprint.

---

### Sprint 2 (Weeks 5-6): Color Engine + Manual Timer

**Goal:** Full color state machine working with manual timer.

| Ticket                             | Size | Parallelizable                      |
| ---------------------------------- | ---- | ----------------------------------- |
| CE-1: Types and Interfaces         | S    | First                               |
| CE-2: Free Time and Warning States | M    | After CE-1                          |
| CE-3: In-Session States            | M    | After CE-1; parallel with CE-2      |
| CE-4: Gap and Transition States    | M    | After CE-2, CE-3                    |
| CE-5: Event Filtering              | S    | After CE-1; parallel with CE-2/CE-3 |
| CE-6: Integration Test Suite       | M    | After CE-2, CE-3, CE-4, CE-5        |
| MT-1: Manual Timer State Machine   | M    | After CE-1                          |
| MT-2: Timer Presets                | S    | After MT-1, ST-1 (partial)          |

**Parallelization:** CE-2 and CE-3 can be developed in parallel. CE-5 can be developed in parallel with CE-2/CE-3. MT-1 can be developed in parallel with CE-2/CE-3.

**Gate:** M2 at end of sprint. Demo: manual timer drives color transitions on the real overlay.

---

### Sprint 3 (Weeks 7-8): Calendar Integration

**Goal:** Google Calendar working end-to-end. Microsoft Graph functional.

| Ticket                            | Size | Parallelizable                   |
| --------------------------------- | ---- | -------------------------------- |
| CAL-1: Provider Abstraction Layer | M    | First                            |
| CAL-2: Google Calendar Provider   | L    | After CAL-1                      |
| CAL-3: Microsoft Graph Provider   | L    | After CAL-1; parallel with CAL-2 |
| CAL-5: Polling Service            | M    | After CAL-1, OE-6                |
| ST-1: System Tray Icon            | M    | Parallel with CAL work           |

**Parallelization:** CAL-2 and CAL-3 can be developed by different developers simultaneously. ST-1 can be developed independently.

**Gate:** M3 at end of sprint. Demo: app reads Google Calendar, border changes color based on real upcoming meetings.

---

### Sprint 4 (Weeks 9-10): Settings & Polish

**Goal:** Full settings UI, system tray, Apple Calendar, onboarding.

| Ticket                         | Size | Parallelizable           |
| ------------------------------ | ---- | ------------------------ |
| SET-1: Settings Window Shell   | M    | First                    |
| SET-2: Border Settings         | M    | After SET-1              |
| SET-3: Warning Window Settings | S    | After SET-1              |
| SET-4: General Settings        | M    | After SET-1              |
| CAL-4: Apple EventKit Provider | M    | Parallel with SET work   |
| CAL-6: Calendar Connection UI  | M    | After SET-1, CAL-2/CAL-3 |
| ST-2: Tray Context Menu        | M    | After ST-1, MT-1         |
| MT-2: Timer Presets (complete) | S    | After ST-1               |

**Parallelization:** All SET tickets can be parallelized after SET-1. CAL-4 is independent. ST-2 depends on ST-1.

---

### Sprint 5 (Weeks 11-12): Billing, QA, Beta

**Goal:** Billing integrated, all features working, beta-ready.

| Ticket                       | Size | Parallelizable           |
| ---------------------------- | ---- | ------------------------ |
| BL-1: Stripe Products        | S    | First                    |
| BL-2: License Verification   | L    | After BL-1               |
| BL-3: Upgrade Flow           | M    | After BL-2, SET-1        |
| QA-1: Cross-Platform Testing | M    | Parallel with BL         |
| QA-2: Performance Profiling  | M    | Parallel with BL         |
| QA-3: Accessibility Review   | M    | Parallel with BL         |
| QA-4: Onboarding Flow        | M    | After SET-1, MT-1, CAL-6 |

**Gate:** M4 at end of sprint. Beta begins.

---

### Sprint 6 (Weeks 13-14): Distribution & Launch

**Goal:** Public release.

| Ticket                          | Size | Parallelizable              |
| ------------------------------- | ---- | --------------------------- |
| DU-1: macOS Code Signing        | M    | Parallel with DU-2          |
| DU-2: Windows Code Signing      | M    | Parallel with DU-1          |
| DU-3: Auto-Updater              | M    | After DU-1, DU-2            |
| DU-4: Installer Packages        | M    | After DU-1, DU-2            |
| LP-1: Google OAuth Verification | M    | Start ASAP (long lead time) |
| LP-2: Landing Page              | L    | Parallel with DU work       |
| LP-3: Community Launch Content  | M    | Parallel, after QA-4        |
| LP-4: Azure AD Production       | S    | After CAL-3                 |
| LP-5: Stripe Production         | S    | After BL-2, BL-3            |

**Note:** LP-1 (Google OAuth Verification) has a multi-week lead time. Start it as soon as the Google Calendar flow is demoed (after Sprint 3). It runs in parallel with all subsequent sprints.

**Gate:** M5. Launch.

---

## 5. Risk-Informed Prioritization

Based on the technical analysis, the following tickets are flagged as high-risk and must be tackled early:

### Critical Path Risks (Sprint 0)

| Risk                                                   | Ticket | Why It Is Critical                                                                                                      |
| ------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| Tauri click-through may not work on Windows            | TS-2   | If click-through fails on Windows, we need native fallback code or an alternative framework. Must know before building. |
| macOS fullscreen overlay may not work                  | TS-3   | Core product feature. If overlay cannot appear above fullscreen apps, the value proposition is degraded.                |
| Four-window vs. single-window affects all overlay code | TS-4   | Architecture decision that affects every overlay ticket. Must be resolved before Sprint 1.                              |

### High-Priority Risks (Early Sprints)

| Risk                                  | Ticket | Why It Is Risky                                                                                          |
| ------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| Google OAuth verification takes weeks | LP-1   | 100-user cap until verified. Start verification immediately after demo video is possible.                |
| No Rust MSAL SDK                      | CAL-3  | Microsoft Graph integration must use raw REST. More work than Google if unfamiliar. Spike de-risks this. |
| Performance on older hardware         | QA-2   | An always-on app must be invisible to system resources. Profile early, not at the end.                   |

### Risk Mitigation Schedule

| Risk                               | When Detected   | Fallback                                                               |
| ---------------------------------- | --------------- | ---------------------------------------------------------------------- |
| Tauri overlay fails completely     | End of Sprint 0 | Evaluate Electron (heavier but proven) or native approach              |
| Windows click-through fails        | Sprint 0        | Implement native `WS_EX_TRANSPARENT` fallback (TS-2/Spike 6)           |
| macOS fullscreen overlay blocked   | Sprint 0        | Degrade gracefully (overlay above normal windows only, not fullscreen) |
| Google OAuth verification rejected | Sprint 3+       | Use unverified mode (100 users) for beta; resubmit with corrections    |
| Apple EventKit bindings unreliable | Sprint 4        | Defer Apple Calendar to post-MVP; focus on Google + Microsoft          |

---

## 6. Go/No-Go Gates

### Gate 0: Tauri Feasibility (End of Sprint 0)

**Decision:** Should we proceed with Tauri 2 as the framework?

**Criteria:**
| Criterion | Pass | Fail |
|-----------|------|------|
| Click-through works on macOS | Required | Pivot to native macOS app |
| Click-through works on Windows (native fallback OK) | Required | Consider Windows-only native or Electron |
| Overlay visible above fullscreen apps on macOS | Required | Degrade feature (still go, but document limitation) |
| Four-window or single-window approach is viable | At least one works | Fundamental re-evaluation |
| Performance acceptable (< 2% CPU idle) | Required | Investigate optimization before proceeding |

**Outcomes:**

- **GO:** All "Required" criteria pass. Proceed to Sprint 1.
- **GO WITH CAVEATS:** Most criteria pass but with documented limitations. Adjust scope (e.g., no fullscreen overlay on macOS) and proceed.
- **NO-GO / PIVOT:** Click-through fails on both platforms or performance is unacceptable. Evaluate Electron or native alternatives before proceeding.

---

### Gate 1: Calendar Integration Viability (End of Sprint 3)

**Decision:** Is the calendar integration solid enough for beta?

**Criteria:**
| Criterion | Pass | Fail |
|-----------|------|------|
| Google Calendar OAuth flow works end-to-end | Required | Cannot launch without Google Calendar |
| Token refresh works reliably | Required | Users will get logged out constantly |
| Events drive color state correctly | Required | Core value prop broken |
| Microsoft Graph at least functional | Preferred | Can launch with Google-only for beta |
| Google OAuth verification submitted | Required | Blocked at 100 users |

**Outcomes:**

- **GO:** Google Calendar fully working, Microsoft at least functional. Proceed to beta.
- **GO WITH CAVEATS:** Google Calendar working, Microsoft deferred. Beta is Google-only.
- **NO-GO:** Google Calendar flow unreliable. Fix before proceeding.

---

### Gate 2: Beta Readiness (End of Sprint 5)

**Decision:** Is the app ready for beta testers?

**Criteria:**
| Criterion | Pass | Fail |
|-----------|------|------|
| All MVP features functional | Required | Fix before beta |
| No crashes in 24-hour run | Required | Stability issues must be resolved |
| CPU idle < 1% | Required | Optimization needed |
| Stripe billing flow works | Required | Cannot gate pro features |
| Onboarding flow complete | Required | First-run experience is critical |
| At least 10 internal testers for 1 week | Preferred | Can proceed with less but risky |

**Outcomes:**

- **GO:** All criteria met. Begin beta with real users.
- **GO WITH CAVEATS:** Minor issues documented, proceed with small beta group.
- **NO-GO:** Crashes, performance issues, or broken core flows. Fix first.

---

### Gate 3: Launch Readiness (End of Sprint 6)

**Decision:** Ready for public launch?

**Criteria:**
| Criterion | Pass | Fail |
|-----------|------|------|
| Google OAuth verification approved | Required | Cannot exceed 100 users |
| Code signing works on both platforms | Required | Users cannot install |
| Auto-updater functional | Required | No way to ship fixes post-launch |
| Landing page live with download links | Required | No distribution channel |
| Beta feedback addressed | Required | Known issues will tank reviews |
| Community launch content ready | Preferred | Can soft-launch without big push |

**Outcomes:**

- **GO:** Ship it.
- **SOFT LAUNCH:** Google OAuth pending but < 100 beta users provides runway. Launch to small audience.
- **DELAY:** Critical blockers (code signing, OAuth rejection, installer failures). Fix and re-evaluate.

---

## 7. Dependency Graph

The following shows critical dependencies between tickets. Tickets not listed here have no blocking dependencies beyond their section prerequisites.

```
TS-1 (macOS Overlay) ──> TS-2 (Windows Overlay) ──> TS-4 (Architecture Decision)
TS-1 ──> TS-3 (macOS Fullscreen)                ──> TS-4
TS-4 ──> OE-1 (Project Scaffold) ──> OE-2 (Rendering) ──> OE-5 (Pulse)
                                  ──> OE-3 (macOS WM)     ──> OE-6 (Bridge)
                                  ──> OE-4 (Windows WM)

CE-1 (Types) ──> CE-2 (Free/Warning) ──> CE-4 (Gaps) ──> CE-6 (Tests)
             ──> CE-3 (In-Session)   ──> CE-4
             ──> CE-5 (Filtering)    ──> CE-6
             ──> MT-1 (Timer)        ──> MT-2 (Presets)

TS-5 (Google Spike) ──> CAL-2 (Google Provider) ──> LP-1 (OAuth Verification)
TS-6 (MS Spike)     ──> CAL-3 (MS Provider)     ──> LP-4 (Azure Production)
CAL-1 (Abstraction) ──> CAL-2, CAL-3, CAL-4, CAL-5

SET-1 (Settings Shell) ──> SET-2, SET-3, SET-4, CAL-6, BL-3, QA-4
ST-1 (Tray Icon) ──> ST-2 (Tray Menu), MT-2

BL-1 (Stripe Setup) ──> BL-2 (License) ──> BL-3 (Upgrade) ──> LP-5 (Stripe Prod)

DU-1 (macOS Signing) ──> DU-3 (Auto-Updater), DU-4 (Installers) ──> LP-2 (Landing Page)
DU-2 (Windows Signing) ──> DU-3, DU-4
```

### Longest Critical Path

```
TS-1 > TS-2 > TS-4 > OE-1 > OE-2 > OE-6 > CAL-5 > (integration testing) > QA-1 > DU-1 > DU-3 > LP-2
```

This path spans approximately 12-14 weeks, which aligns with the 7-sprint schedule.

### Early-Start Items (Long Lead Time)

| Item                                 | When to Start                            | Why                                         |
| ------------------------------------ | ---------------------------------------- | ------------------------------------------- |
| LP-1: Google OAuth Verification      | As soon as CAL-2 is demo-able (Sprint 3) | Takes 2-4 weeks for review                  |
| DU-1/DU-2: Code Signing Certificates | Sprint 4                                 | Certificate procurement can take days/weeks |
| LP-2: Landing Page                   | Sprint 5                                 | Needs design work parallel to dev           |

---

## Summary

| Metric            | Count               |
| ----------------- | ------------------- |
| Total Sections    | 11                  |
| Total Tickets     | 47                  |
| Milestones        | 6 (M0-M5)           |
| Go/No-Go Gates    | 4                   |
| Sprints to Launch | 7 (14 weeks)        |
| Size S Tickets    | 10                  |
| Size M Tickets    | 30                  |
| Size L Tickets    | 5                   |
| Size XL Tickets   | 0 (all broken down) |
