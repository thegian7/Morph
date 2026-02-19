# Technical Architecture Analysis
## Ambient Screen Border Timer (LightTime)

**Date:** February 19, 2026
**Status:** Initial Analysis
**Risk Level:** Medium-High (several unknowns require spikes before committing)

---

## Table of Contents

1. [Tauri 2 Overlay Feasibility](#1-tauri-2-overlay-feasibility)
2. [macOS Sandbox & App Store Restrictions](#2-macos-sandbox--app-store-restrictions)
3. [Calendar API Complexity](#3-calendar-api-complexity)
4. [Performance Concerns](#4-performance-concerns)
5. [Technical Spike List](#5-technical-spike-list)
6. [Architecture Recommendations](#6-architecture-recommendations)

---

## 1. Tauri 2 Overlay Feasibility

**Risk Level: HIGH -- This is the #1 technical risk for the entire project.**

### What Tauri 2 Supports Natively

Tauri 2 provides window configuration options that cover several of our requirements:

- **`transparent: true`** -- Enables transparent window backgrounds. Colors with alpha < 1.0 produce transparency.
- **`alwaysOnTop: true`** -- Keeps the window above other windows.
- **`decorations: false`** -- Removes the title bar and window chrome.
- **`setIgnoreCursorEvents(true)`** -- Disables mouse event capture, allowing clicks to pass through.

A basic overlay window configuration in `tauri.conf.json`:
```json
{
  "windows": [
    {
      "label": "overlay",
      "transparent": true,
      "alwaysOnTop": true,
      "decorations": false,
      "fullscreen": true,
      "resizable": false
    }
  ]
}
```

### What Works

- **Transparent windows**: Confirmed working on both macOS and Windows in Tauri 2. There was a bug in early v2 betas (`#8308`) but it has been resolved.
- **Always-on-top**: Standard feature, works reliably on both platforms.
- **Decorations disabled**: Works on both platforms for frameless windows.
- **Cursor event passthrough**: `setIgnoreCursorEvents(true)` exists and is the primary mechanism for click-through behavior.

### Critical Limitations

#### 1. Click-Through Is All-or-Nothing

`setIgnoreCursorEvents(true)` disables ALL mouse interaction with the window. There is no native Tauri support for "pass through clicks on transparent areas but capture clicks on opaque areas." The Tauri maintainers explicitly closed feature request `#13070` stating this "won't be implemented" due to complexity. The underlying issue `#2090` was closed with the note that "detecting whether an area within a window is transparent or not is a near impossible task, even Electron gave up on the idea."

**Impact on LightTime:** For our use case, this is actually acceptable. The border overlay is purely visual and should NEVER capture any input. We want full click-through at all times. Setting `setIgnoreCursorEvents(true)` once and leaving it is the correct behavior.

#### 2. Windows Platform Bugs

There are documented issues with `setIgnoreCursorEvents()` not working correctly on Windows 10 (`#11461`). Mouse clicks were not passing through the webview window even with the API enabled. The issue was closed as "not planned."

**Impact:** This needs investigation in the spike. The workaround may require setting Windows-specific extended window styles (`WS_EX_TRANSPARENT | WS_EX_LAYERED`) directly via Rust code on the native window handle, bypassing Tauri's API.

#### 3. Fullscreen App Overlay

The PRD requires the border to "persist above full-screen applications." This is platform-specific:

- **macOS**: Requires `NSWindowLevel.screenSaver` or higher (e.g., `kCGMaximumWindowLevel`), plus `NSWindowCollectionBehavior.canJoinAllSpaces` and `.fullScreenAuxiliary`. Standard `alwaysOnTop` may not be sufficient to float above macOS native fullscreen apps. This requires Rust-side native code to set the window level via the `objc2` crate.
- **Windows**: `WS_EX_TOPMOST` generally works above fullscreen apps, but behavior varies with exclusive fullscreen (DirectX) vs. borderless fullscreen games. For typical desktop use (meetings, productivity), this should work.

#### 4. Multi-Monitor Support (Post-MVP)

There are reported issues with Tauri creating windows on multiple monitors (`#14019`), with all overlay windows opening on the same monitor regardless of position settings. This is a post-MVP concern but should be noted.

### Tauri Overlay Verdict

**Feasible with caveats.** The core use case (transparent, click-through, always-on-top border) is achievable but will require:
- Platform-specific Rust code to set native window levels (especially macOS)
- A spike to verify `setIgnoreCursorEvents` reliability on Windows
- Potentially bypassing Tauri's window API to set native window styles directly

---

## 2. macOS Sandbox & App Store Restrictions

### The Sandbox Problem

The Mac App Store requires all apps to be sandboxed. Sandbox restrictions relevant to LightTime:

- **Accessibility Permissions**: Cannot be requested from sandboxed apps. The permission prompt never appears, and the app cannot be added to System Settings > Privacy & Security > Accessibility.
- **Window Level Manipulation**: Setting `NSWindowLevel` above `.floating` may be restricted or rejected during review.
- **Inter-App Communication**: Sandboxing prevents observation or modification of other apps' behavior.

### Specific Risks for LightTime

1. **NSWindowLevel.screenSaver**: Using screen-saver-level or higher window levels to float above fullscreen apps is likely to trigger App Store review rejection. Apple's review guidelines are strict about apps that overlay the entire screen, as this behavior pattern is associated with malware.

2. **Accessibility Permissions**: LightTime does NOT need accessibility permissions for its core function (it's purely visual, no input monitoring). However, if future features like "Do Not Disturb sync" or "focus mode" are added, they would require accessibility access, which is incompatible with the sandbox.

3. **Calendar Access (EventKit)**: EventKit access IS available in the sandbox with the `com.apple.security.personal-information.calendars` entitlement. This is one of the few system integrations that works.

### App Store Verdict

**Mac App Store distribution is HIGH RISK for v1.** The always-on-top overlay above fullscreen apps is the core product feature, and it directly conflicts with sandbox restrictions. Many successful Mac overlay utilities (Alfred, BetterTouchTool, Bartender) do NOT distribute via the App Store for exactly these reasons.

### Recommended Distribution Strategy

| Channel | Timeline | Notes |
|---------|----------|-------|
| **Direct download + notarization** | MVP | Full functionality, no sandbox restrictions |
| **Auto-updater (Tauri built-in)** | MVP | Sparkle-based on macOS, NSIS on Windows |
| **Mac App Store** | Post-MVP, if feasible | May require feature compromises (no fullscreen overlay) |
| **Microsoft Store** | Post-MVP | Less restrictive than Mac App Store |

Apple notarization (without the App Store) provides the same security assurance to users without sandbox restrictions. The app can be signed, notarized, and distributed via direct download with Gatekeeper approval.

---

## 3. Calendar API Complexity

### Google Calendar API

**Complexity: MEDIUM-HIGH**

#### OAuth2 Flow for Desktop Apps
- Uses the "installed application" flow with PKCE (Proof Key for Code Exchange)
- Requires opening the system browser for authentication (no embedded webview -- Google blocks this)
- Must handle a localhost redirect URI to capture the authorization code
- Token storage: Access tokens (1 hour TTL) + refresh tokens must be stored securely

#### Scopes Required
- `https://www.googleapis.com/auth/calendar.events.readonly` -- Read calendar events
- This is classified as a **sensitive scope** by Google

#### Verification Requirements
- **Sensitive scope verification** is mandatory before public launch
- Requires: privacy policy URL, homepage, app description, detailed justification for each scope
- Requires: **YouTube video** demonstrating the auth flow and how calendar data is used
- **Timeline: Several weeks** for review. Rejection on first submission is common.
- **Unverified app limit**: 100 users maximum until verification is complete
- During development, users see a scary "This app isn't verified" warning and must click through "Advanced > Go to (unsafe)"

#### Gotchas
- Refresh token limits: One per client/user combo. If a new refresh token is issued, the old one may be revoked.
- Token secure storage: Must use OS keychain (macOS Keychain, Windows Credential Manager) -- not plaintext files.
- Rate limits: 1,000,000 queries/day default, but per-user limits of ~10 queries/second.
- Google may revoke API access if app is not compliant with their policies.

### Microsoft Graph API (Outlook/M365)

**Complexity: MEDIUM**

#### OAuth2 Flow
- Uses MSAL (Microsoft Authentication Library) for token management
- MSAL handles token caching, refresh, and retry logic automatically
- Supports `authorization_code` flow with PKCE for desktop apps
- Redirect URI: `https://login.microsoftonline.com/common/oauth2/nativeclient`

#### Scopes Required
- `Calendars.Read` -- Read user calendar events
- `offline_access` -- Required to get a refresh token

#### Azure App Registration
- Must register the app in Azure Active Directory (Entra ID)
- Configure as a "Public client/native application"
- Multi-tenant by default (supports personal and work accounts)

#### Gotchas
- Public client refresh tokens are device-bound -- cannot be used across devices
- Organization admins can restrict which apps their users authorize (admin consent may be required)
- Personal Microsoft accounts vs. work/school accounts have different token behaviors
- MSAL libraries exist for many languages but there is no official Rust MSAL SDK -- would need to use the REST API directly or shell out to a helper process

### Apple EventKit (macOS only)

**Complexity: LOW-MEDIUM**

#### Access Model
- No OAuth -- uses macOS system permissions directly
- Three levels: No access, write-only, full access
- User grants permission via system dialog on first use
- Works within the macOS sandbox (App Store compatible)

#### Rust Integration
- The `objc2-event-kit` crate provides Rust bindings to Apple's EventKit framework
- Classes available: `EKEventStore`, `EKCalendar`, `EKEvent`, `EKAlarm`
- Can be wrapped as a Tauri plugin for clean frontend/backend separation
- Only available on macOS (no Windows/Linux support -- as noted in PRD Open Question #3)

#### Gotchas
- Tauri apps may re-request permissions after every app update (`#11085`)
- Need a `tauri-plugin-macos-permissions` or equivalent to handle permission prompts gracefully
- EventKit provides real-time event changes via `EKEventStoreChangedNotification` -- better than polling
- Calendar data is available offline (no network dependency)

### Calendar Integration Verdict

| Provider | Complexity | Gotchas | MVP Priority |
|----------|-----------|---------|-------------|
| **Google Calendar** | Medium-High | Verification takes weeks, scary unverified warning, PKCE flow | P0 -- Most users |
| **Microsoft Graph** | Medium | No Rust MSAL SDK, admin consent issues for org accounts | P0 -- Enterprise users |
| **Apple EventKit** | Low-Medium | macOS only, permission re-prompt on updates | P1 -- Nice to have |

**Recommendation:** Build Google Calendar first (largest user base), Microsoft second. Apple EventKit is a differentiator on macOS but can come slightly later. Consider using a calendar abstraction layer (like Nylas or a shared interface) to avoid maintaining three separate integrations.

---

## 4. Performance Concerns

### The Baseline Question

LightTime renders a fullscreen transparent window with a thin colored border using CSS. The vast majority of the window area is fully transparent. How expensive is this?

### GPU/CPU Cost Analysis

#### Idle State (No Animation)
- A static transparent window with solid-color border divs uses **minimal GPU resources**
- The compositor treats it as a single texture layer
- Expected CPU usage: **< 0.5%** when idle (no transitions)
- Expected memory: **20-40 MB** typical for a Tauri app with a minimal webview

#### During Color Transitions
- CSS `transition` on `background-color` with 8-15 second durations is extremely lightweight
- The browser composites `background-color` changes on the GPU
- At 8-15 second transition durations, the GPU update rate is trivially low
- Expected CPU impact during transition: **< 1%**

#### Pulse Animation
- CSS `animation` with `opacity` changes can be GPU-accelerated
- Using `will-change: opacity` or `transform: translateZ(0)` ensures compositor-layer promotion
- Pulse cycles of 1-3 seconds are well within normal CSS animation performance

### Potential Issues

1. **Transparent window compositing overhead**: The OS must composite the transparent overlay with all windows beneath it on every screen refresh. On modern hardware this is negligible, but on older integrated GPUs it could add a few percent GPU load.

2. **Fullscreen window size**: A 4K display means the transparent window texture is 3840x2160 pixels. Even though it's mostly transparent, the compositor still allocates the full RGBA buffer. At 4 bytes/pixel, that's ~33 MB just for the overlay texture. On multi-monitor setups, this multiplies.

3. **Webview idle power draw**: Chromium-based webviews (used by Tauri on Windows) and WebKit (macOS) have background timer throttling, but even an idle webview has some baseline power draw. This matters for laptop battery life.

4. **CSS animation and idle CPU**: Continuous CSS animations (like the pulse) prevent the CPU from entering low-power states. The pulse animation should be paused when not needed (e.g., during "free-deep" and "in-session-early" states).

### Optimization Recommendations

- **Use `opacity` and `transform` for animations** -- these are GPU-composited and avoid layout/paint
- **Pause CSS animations** when the border is in a static state (no pulse needed)
- **Consider reducing the overlay window size** -- instead of a fullscreen transparent window, use 4 thin windows (one per edge). This dramatically reduces the transparent surface area the compositor must handle
- **Use `will-change` sparingly** -- only on actively animating elements
- **Set `webview.background_color` to transparent** in Tauri config to avoid double-rendering

### Performance Verdict

**Low risk for modern hardware.** A fullscreen transparent overlay with slow CSS transitions is not computationally expensive. The main concern is battery impact from the always-on webview, which can be mitigated with animation pausing. The 4-window approach (one per edge) is recommended over a single fullscreen transparent window for both performance and compatibility reasons.

---

## 5. Technical Spike List

Prioritized by risk and dependency on architecture decisions.

### Spike 1: Transparent Click-Through Overlay (CRITICAL)
**Priority: P0 -- Must complete before committing to Tauri**
**Estimated effort: 2-3 days**

Build a minimal Tauri 2 app that:
- Creates a transparent, frameless, always-on-top window
- Renders a colored border (4 divs along edges)
- Enables `setIgnoreCursorEvents(true)` for full click-through
- Test on macOS: Does it appear above fullscreen apps? (Requires native `NSWindowLevel` adjustment)
- Test on Windows 10/11: Does click-through work? Does it appear above maximized apps?
- Measure idle CPU/GPU usage

**Success criteria:** Border is visible, click-through works, apps beneath remain fully interactive on both platforms.

### Spike 2: Four-Window vs. Single-Window Architecture (HIGH)
**Priority: P0 -- Informs fundamental architecture**
**Estimated effort: 1-2 days**

Compare two approaches:
- **Single fullscreen transparent window**: Simpler code, but larger compositor surface, potential issues with fullscreen apps
- **Four thin windows** (top, bottom, left, right strips): Smaller compositor surface, inherently click-through (only covers border area), but more complex window management and positioning

Test: Multi-monitor behavior, window positioning accuracy, resize handling when display resolution changes.

### Spike 3: macOS Window Level Above Fullscreen (HIGH)
**Priority: P0 -- Core feature depends on this**
**Estimated effort: 1-2 days**

Use the `objc2` crate to:
- Access the native `NSWindow` from Tauri's window handle
- Set `window.level` to `.screenSaver` or `CGWindowLevelForKey(.maximumWindow)`
- Set `collectionBehavior` to `[.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]`
- Verify the overlay appears above macOS native fullscreen apps and in all Spaces

### Spike 4: Google Calendar OAuth2 Flow (MEDIUM)
**Priority: P1 -- Complex but well-documented**
**Estimated effort: 2-3 days**

Implement the OAuth2 PKCE flow for Google Calendar:
- Open system browser with authorization URL
- Listen on localhost for the redirect callback
- Exchange code for tokens
- Store tokens in OS keychain (macOS Keychain / Windows Credential Manager)
- Fetch upcoming events using `calendar.events.list`
- Handle token refresh

### Spike 5: Apple EventKit via Rust FFI (MEDIUM)
**Priority: P2 -- macOS-only, can defer**
**Estimated effort: 2-3 days**

Build a minimal Tauri plugin using `objc2-event-kit`:
- Request calendar access permission
- Fetch events from `EKEventStore`
- Listen for `EKEventStoreChangedNotification` for real-time updates
- Return events to the frontend via Tauri commands

### Spike 6: Windows Click-Through Fallback (MEDIUM)
**Priority: P1 -- Required if Spike 1 reveals Windows issues**
**Estimated effort: 1-2 days**

If `setIgnoreCursorEvents` does not work reliably on Windows:
- Access the native `HWND` from Tauri's window handle
- Apply `WS_EX_TRANSPARENT | WS_EX_LAYERED | WS_EX_TOPMOST` directly via the Windows API (`windows` crate)
- Verify click-through and visual rendering

---

## 6. Architecture Recommendations

### Should You Stick With Tauri 2?

**Yes, with caveats.** Tauri 2 is the right choice for this project, but expect to write platform-specific Rust code for the overlay window behavior. Here's why:

#### Why Tauri 2 Is Correct
- **Lightweight**: 20-40 MB RAM vs. 150-300 MB for Electron. Critical for an always-on background app.
- **Rust backend**: Direct access to native APIs via `objc2` (macOS) and `windows` crate (Windows) without external FFI.
- **Built-in auto-updater**: Saves significant development time.
- **Multi-window support**: Can create separate overlay and settings windows.
- **Active ecosystem**: 70,000+ GitHub stars, 2,000+ contributors.

#### Why NOT Electron
- Electron's transparent window support is better documented but has the same fundamental limitation (no per-pixel click-through).
- Electron apps use 5-10x more memory -- unacceptable for an always-on utility.
- Electron bundles Chromium (~150 MB download size) vs. Tauri using the OS webview.

#### Why NOT a Fully Native App
- Building a native app (Swift on macOS, C++ on Windows) would give perfect overlay control but doubles the development effort.
- The overlay is the only component that needs native code. The settings UI, color engine, and calendar logic are all platform-agnostic.

### Recommended Architecture: Hybrid Approach

```
+------------------------------------------+
|              Tauri 2 App                 |
|                                          |
|  +------------------+  +-------------+  |
|  | Overlay Window(s)|  | Settings    |  |
|  | (per-edge thin   |  | Window      |  |
|  |  windows)        |  | (React UI)  |  |
|  +--------+---------+  +------+------+  |
|           |                    |         |
|  +--------v--------------------v------+  |
|  |          Rust Backend              |  |
|  |                                    |  |
|  | +------------+ +----------------+  |  |
|  | | Native     | | Calendar       |  |  |
|  | | Window Mgr | | Aggregator     |  |  |
|  | | (objc2 /   | | (Google/MS/    |  |  |
|  | |  windows)  | |  EventKit)     |  |  |
|  | +------------+ +----------------+  |  |
|  |                                    |  |
|  | +------------+ +----------------+  |  |
|  | | Color      | | Settings       |  |  |
|  | | Engine     | | Store          |  |  |
|  | | (TS module)| | (SQLite)       |  |  |
|  | +------------+ +----------------+  |  |
|  +------------------------------------+  |
+------------------------------------------+
```

### Key Architecture Decisions

#### 1. Four Thin Windows Over Single Fullscreen Window

Use four narrow windows (one per screen edge) instead of one fullscreen transparent window:

- **Pro**: Dramatically reduces transparent surface area (4 thin strips vs. entire screen)
- **Pro**: Inherently avoids click-through issues (windows only cover the border area)
- **Pro**: Better compatibility with fullscreen apps (thin strips are less likely to interfere)
- **Con**: More complex window positioning logic
- **Con**: Corner rendering requires careful overlap management

Each edge window would be (e.g., for "medium" thickness):
- Top: full width x 6px
- Bottom: full width x 6px
- Left: 6px x full height
- Right: 6px x full height

#### 2. Color Engine in TypeScript (As PRD Specifies)

Keep the color engine as a pure TypeScript module. It's the right call:
- Fully testable without any native dependencies
- Can run identically in browser tests and the Tauri app
- State transitions are simple enough that TS performance is irrelevant
- The engine emits `BorderState` and the overlay windows just render it

#### 3. Platform-Specific Native Window Code in Rust

Create a `window_manager` module with platform-specific implementations:

```rust
// src-tauri/src/window_manager/mod.rs

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

pub trait OverlayManager {
    fn configure_overlay(window: &tauri::Window) -> Result<(), Error>;
    fn set_window_level_above_fullscreen(window: &tauri::Window) -> Result<(), Error>;
    fn enable_click_through(window: &tauri::Window) -> Result<(), Error>;
}
```

macOS implementation uses `objc2` to set `NSWindowLevel` and collection behaviors.
Windows implementation uses the `windows` crate to set extended window styles.

#### 4. Calendar Abstraction Layer

Build a trait-based calendar abstraction in Rust:

```rust
pub trait CalendarProvider: Send + Sync {
    async fn authenticate(&mut self) -> Result<(), CalendarError>;
    async fn fetch_events(&self, from: DateTime, to: DateTime) -> Result<Vec<CalendarEvent>, CalendarError>;
    async fn refresh_token(&mut self) -> Result<(), CalendarError>;
    fn provider_name(&self) -> &str;
}
```

Implement separately for Google (REST + OAuth2), Microsoft (REST + OAuth2), and Apple (EventKit FFI).

#### 5. Token Storage

Use OS-native secure storage:
- macOS: Keychain via `security-framework` crate
- Windows: Credential Manager via `windows` crate
- Consider `keyring` crate which abstracts both

#### 6. Polling Strategy

- Poll calendar APIs every 60 seconds (as PRD specifies)
- Apple EventKit: Use `EKEventStoreChangedNotification` for instant updates instead of polling
- Cache events locally in SQLite to survive network outages
- The color engine recalculates on every poll + on a 1-second timer for smooth in-session progression

### Stack Changes from PRD

| PRD Spec | Recommendation | Reason |
|----------|---------------|--------|
| Single fullscreen overlay | Four edge windows | Performance, click-through reliability |
| Mac App Store (post-MVP) | Direct download + notarization first | Sandbox conflicts with core feature |
| React frontend | Keep React (or consider Svelte for lighter bundle) | Svelte would reduce overlay window bundle size |
| Zustand state | Keep for settings window; overlay windows use simple event-driven updates | Overlay is too simple to need a state library |

### Development Phase Recommendation

1. **Week 1-2**: Complete Spikes 1-3 (overlay feasibility). If any fail, re-evaluate.
2. **Week 3-4**: Build color engine (TypeScript, fully tested) + overlay rendering
3. **Week 5-6**: Google Calendar OAuth2 integration (Spike 4)
4. **Week 7-8**: Settings UI, manual timer mode, system tray
5. **Week 9-10**: Microsoft Graph integration, polish, beta testing
6. **Post-beta**: Apple EventKit, Mac App Store evaluation

---

## Summary of Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|------------|
| Click-through fails on Windows | High | Medium | Native window styles fallback (Spike 6) |
| Overlay not visible above fullscreen apps | High | Medium | Native window level code (Spike 3) |
| Google OAuth verification takes too long | Medium | High | Start verification early, use unverified mode (100 users) for beta |
| Mac App Store rejection | Medium | High | Ship direct download first, App Store is optional |
| Performance on older hardware | Low | Low | Four-window approach mitigates; CSS transitions are lightweight |
| Apple EventKit Rust bindings immature | Low | Medium | Defer to post-MVP if problematic |
| Multi-monitor window placement bugs | Medium | Medium | Defer to post-MVP; test during spike |

---

## Sources

- [Tauri 2 Window Customization Docs](https://v2.tauri.app/learn/window-customization/)
- [Tauri 2 Configuration Reference](https://v2.tauri.app/reference/config/)
- [Tauri Issue #13070: Transparent Window Click-Through](https://github.com/tauri-apps/tauri/issues/13070)
- [Tauri Issue #2090: Ignore Mouse Event on Transparent Areas](https://github.com/tauri-apps/tauri/issues/2090)
- [Tauri Issue #11461: setIgnoreCursorEvents Bug on Windows](https://github.com/tauri-apps/tauri/issues/11461)
- [Tauri Issue #14019: Multi-Monitor Window Placement](https://github.com/tauri-apps/tauri/issues/14019)
- [Why Useful Mac Apps Aren't on the App Store](https://alinpanaitiu.com/blog/apps-outside-app-store/)
- [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google OAuth2 for Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Google Calendar API Scopes](https://developers.google.com/workspace/calendar/api/auth)
- [Google Sensitive Scope Verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- [Google Unverified App Limits](https://support.google.com/cloud/answer/7454865)
- [Microsoft Graph Auth Flow](https://learn.microsoft.com/en-us/graph/auth-v2-user)
- [MSAL Authentication Flows](https://learn.microsoft.com/en-us/entra/identity-platform/msal-authentication-flows)
- [Apple EventKit Documentation](https://developer.apple.com/documentation/eventkit)
- [objc2-event-kit Rust Crate](https://crates.io/crates/objc2-event-kit)
- [tauri-plugin-macos-permissions](https://github.com/ayangweb/tauri-plugin-macos-permissions)
- [CSS GPU Animation Best Practices](https://www.smashingmagazine.com/2016/12/gpu-animation-doing-it-right/)
- [macOS Transparent Overlay Window in Swift](https://gaitatzis.medium.com/create-a-translucent-overlay-window-on-macos-in-swift-67d5e000ce90)
- [Electron vs Tauri Comparison (2025)](https://www.dolthub.com/blog/2025-11-13-electron-vs-tauri/)
