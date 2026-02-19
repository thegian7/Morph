# Product Requirements Document
## [App Name TBD] — Ambient Screen Border Timer

**Version:** 0.1 (Draft)
**Authors:** Christopher Ledbetter
**Status:** In Review
**Last Updated:** February 2026

---

## 1. Problem Statement

Most people — especially those with ADHD, autism, or AUDHD — experience **time blindness**: the inability to passively track how much time has passed or how soon something is approaching. Existing solutions make this worse by demanding active attention. You have to look at a clock, check a timer, read a notification. Every check is a context switch. Every alarm is a startle.

The **Timeqube** — a $100+ physical device used by therapists and coaches — solved this with ambient color. It sits in peripheral vision and changes color slowly so your nervous system absorbs the passage of time without your conscious attention ever being redirected.

This product brings that experience to the desktop, extends it across the entire workday, and integrates it with your calendar so it just works — no timers to start, nothing to remember.

---

## 2. Vision

A thin, always-visible color border around your screen that tells you where you are in time — not with numbers, not with alarms, but with ambient color that lives in peripheral vision and never demands your attention.

Your screen becomes environmentally time-aware. You always know, without thinking about it, whether you have space to go deep or whether something is approaching.

---

## 3. Target Users

### Primary: General Knowledge Workers
People who live in calendars, take back-to-back meetings, and struggle with transitions. They want fewer surprises and smoother context switching. They are productivity-motivated and willing to pay for tools that help them work better.

### Core Community: AUDHD / ADHD / Autism
People with diagnosable time blindness who find conventional timers and notifications destabilizing. They are vocal, community-driven, and evangelize tools that genuinely understand them. This group drives organic growth and defines the emotional truth of the product.

### Secondary: Therapists & Coaches
Professionals who run back-to-back sessions and currently rely on expensive devices like the Timeqube Mind. They have clear willingness to pay and a professional use case that justifies a subscription.

---

## 4. Core Value Proposition

> "Your screen always knows what time it is, so you don't have to think about it."

- **Zero cognitive load** — no numbers, no reading, no checking
- **Never be ambushed** — meeting transitions are absorbed, not announced
- **Always on** — integrated with your calendar, it just runs
- **Peripheral by design** — the border never covers your content

---

## 5. How It Works

### 5.1 The Screen Border

A thin color strip renders along one or more edges of the screen as a transparent always-on-top overlay. It persists above all applications including full-screen apps. It never captures clicks or keyboard input — it is purely visual.

The border has no text, no numbers, no icons. Only color.

### 5.2 The Color Logic

The border reflects your position in time using a continuous state machine. Color transitions are deliberately slow — measured in minutes, not seconds — so changes are absorbed subconsciously rather than consciously noticed.

| State | Color | Hex | Opacity | Pulse | Behavior |
|-------|-------|-----|---------|-------|----------|
| Deep free time (60+ min) | Soft green | `#4A9B6E` | 0.25 | — | Calm, nearly invisible. You have space. |
| Approaching (30 min out) | Brighter green | `#5BAE7A` | 0.40 | 4000ms | Subconscious nudge. Something is coming. |
| Approaching (15 min out) | Yellow-green | `#A3B84C` | 0.55 | 3000ms | Pulse quickens slightly. Body starts preparing. |
| Approaching (5 min out) | Warm amber | `#D4A843` | 0.70 | 2000ms | Clear signal to start wrapping up. |
| Approaching (2 min out) | Orange | `#D4864A` | 0.80 | 1500ms | Transition is imminent. |
| In session — early (0–40%) | Green | `#4A9B6E` | 0.35 | — | Plenty of time. Settle in. |
| In session — mid (40–70%) | Yellow | `#B8AD42` | 0.50 | — | Time is moving. Awareness builds. |
| In session — late (70–90%) | Orange | `#D4864A` | 0.65 | — | Start thinking about wrapping up. |
| In session — final (90–100%) | Soft purple | `#8B6AAE` | 0.75 | 2500ms | Approaching the end. |
| Session overtime | Deep purple | `#7B5A9E` | 0.80 | 2000ms | Time is up. Not an alarm — a presence. |
| Short gap (< 10 min) | Orange | `#D4864A` | 0.60 | 2500ms | Gap is tight, stay alert. |
| Long gap (10+ min) | Green | `#5BAE7A` | 0.30 | — | Breathing room. |
| No events, open calendar | Dim blue-gray | `#8A9BA8` | 0.15 | — | Environment is calm. Safe to go deep. |

All color transitions use slow easing curves (8–15 seconds per step) to eliminate the startle response. Colors interpolate in **HSL color space** for perceptually smooth transitions. End-of-session uses **soft purple instead of red** — calmer, less triggering, and more colorblind-friendly (inspired by Timeqube's approach).

A colorblind-accessible **"Ocean" palette** (blue → orange) is available as an alternative. See `docs/color-palette.md` for the full specification including both palettes, intensity multipliers, and CSS custom properties.

### 5.3 Calendar Integration

The app connects to the user's calendar and polls for upcoming events. It calculates the current state automatically and begins the pre-meeting warning sequence without any user action.

Users can optionally mark certain calendar events as "ignored" (e.g. all-day events, reminders).

---

## 6. Features

### 6.1 MVP (v1.0)

#### Core Experience
- Always-on-top transparent screen border overlay (macOS + Windows)
- Full color state machine across free time, pre-meeting, and in-session states
- Slow CSS-eased color transitions (no jarring jumps)
- Border persists above full-screen applications
- No click interception — purely visual

#### Calendar Integration
- Google Calendar (OAuth2)
- Apple Calendar (EventKit on macOS)
- Microsoft Outlook / Microsoft 365 (Microsoft Graph API)
- Auto-detect and display next upcoming event
- Configurable event filters (ignore all-day events, specific calendars)

#### Manual Mode
- Set a custom duration timer without calendar
- Quick presets: 15, 25, 30, 45, 60, 90 minutes
- Tap/click system tray icon to start/stop manual timer

#### Settings
- Border thickness (thin / medium / thick)
- Border position (all edges / top only / sides only / bottom only)
- Color intensity (subtle / normal / vivid)
- Warning windows (configurable: 30min, 15min, 5min, 2min)
- Launch at login
- Pause / snooze border for N minutes

#### System
- macOS menu bar app
- Windows system tray app
- Auto-updater (Tauri updater)
- Lightweight — no noticeable CPU/memory footprint

### 6.2 Post-MVP (v1.x)
- Multi-monitor support (border on all screens or selected screen)
- Custom color themes (including colorblind-accessible palettes)
- Focus mode: block distractions during in-session state
- Session history and insights (how many transitions, how much deep time)
- iOS companion app (glanceable widget)
- Smart light integration (Philips Hue, LIFX) — extend border into room
- Do Not Disturb sync (suppress OS notifications during in-session)
- Slack / Teams status sync (set status automatically based on border state)
- Team shared calendars with shared border awareness

---

## 7. Monetization

### Free Tier
- Manual timers only
- Single color theme
- No calendar integration
- Limited to standard warning windows (5 min and 2 min only)

### Pro — $7/month or $56/year (~33% savings)
- Full calendar integration (Google, Apple, Outlook)
- All pre-meeting warning windows (30, 15, 5, 2 min — configurable)
- Custom color intensity and border thickness
- Multi-monitor support (post-MVP)
- Slack / Teams status sync (post-MVP)
- Priority support

**Pricing rationale:** $7/month is below the psychological "think twice" threshold for a productivity tool. Annual pricing at $56 improves cash flow and reduces churn. The free tier is genuinely useful for manual use, which drives trial and word-of-mouth, but the calendar integration is compelling enough to convert.

---

## 8. Technical Architecture

### Stack
- **Framework:** Tauri 2 (Rust shell, TypeScript/React frontend)
- **Frontend:** React + Tailwind CSS
- **State management:** Zustand
- **Local storage:** Tauri SQLite plugin
- **Calendar APIs:** Google Calendar API, Microsoft Graph API, Apple EventKit (macOS native bridge)
- **Payments:** Stripe (subscriptions + customer portal)
- **Distribution:** Direct download + auto-updater; Mac App Store and Microsoft Store post-MVP

### Overlay Window Architecture

The border is rendered as a transparent fullscreen Tauri window at the highest available window level with pointer events disabled. On macOS this uses `NSWindowLevel.screenSaver` or above. On Windows this uses `WS_EX_TOPMOST | WS_EX_LAYERED | WS_EX_TRANSPARENT` extended window styles. The border itself is a React component rendering colored divs along window edges with CSS transitions for color interpolation.

### Color Engine

A pure TypeScript module — no UI dependencies — that takes calendar state as input and returns border state as output. This makes it fully testable and portable.

```typescript
interface CalendarEvent {
  id: string
  title: string
  startTime: Date
  endTime: Date
  ignored: boolean
}

interface BorderState {
  color: string        // hex
  opacity: number      // 0–1
  pulseSpeed: number   // ms per cycle, 0 = no pulse
  phase: Phase
}

type Phase =
  | 'free-deep'
  | 'warning-far'
  | 'warning-mid'
  | 'warning-near'
  | 'warning-imminent'
  | 'in-session-early'
  | 'in-session-mid'
  | 'in-session-late'
  | 'in-session-end'
  | 'gap-short'
  | 'gap-long'

function getBorderState(
  events: CalendarEvent[],
  now: Date,
  settings: UserSettings
): BorderState
```

### Calendar Polling

Calendar events are fetched on a 60-second poll interval. Local state is maintained so the border never flickers on a slow network call. On macOS, Apple Calendar uses EventKit via a native Tauri plugin for offline access.

---

## 9. Go-To-Market

### Phase 1: Community Launch
- Post in r/ADHD, r/autism, r/AuDHD, r/productivity with a genuine story about the Timeqube and why this exists
- Product Hunt launch
- Target ADHD/neurodivergent creators on TikTok and YouTube who review productivity tools
- Free tier drives trial with zero friction

### Phase 2: Therapist & Coach Channel
- Reach out to therapy communities (therapy-related subreddits, Psychology Today forums)
- Position as the software alternative to Timeqube Mind for practitioners who already own smart displays or just want a solution on their laptop
- Consider a "practice license" pricing tier for multi-seat therapy offices

### Phase 3: Broader Knowledge Worker Push
- SEO content around "time blindness," "ADHD productivity," "ambient timer"
- App Store optimization once listed
- Integration partnerships (Notion, Fantastical, etc.)

---

## 10. Success Metrics

| Metric | 30 days | 90 days | 12 months |
|--------|---------|---------|-----------|
| Downloads | 500 | 2,500 | 15,000 |
| Free → Pro conversion | — | 8% | 12% |
| Monthly churn (Pro) | — | <8% | <5% |
| MRR | — | $1,400 | $10,000+ |
| App Store rating | — | 4.2+ | 4.5+ |

---

## 11. Open Questions

1. **App name** — needs to evoke ambient, peripheral, calm. Candidates to explore: Halo, Aura, Periphery, Fringe, Glow, Liminal.
2. **macOS App Store feasibility** — always-on-top overlays above full-screen apps may conflict with sandbox restrictions. Needs technical spike before committing to App Store distribution.
3. **Apple Calendar on Windows** — no native access. Windows users with Apple Calendar will need to connect via iCloud web API or we skip Apple Calendar on Windows v1.
4. **Colorblind accessibility** — the default green→red spectrum is inaccessible for red-green colorblind users (~8% of males). A colorblind mode (e.g. blue→orange) should be prioritized early.
5. **Pricing validation** — $7/month is an assumption. Should be tested with a landing page before building.

---

## 12. Out of Scope (v1)

- Mobile apps (iOS, Android)
- Browser extension
- Team / collaborative features
- Smart home / Hue integration
- Custom color creation (preset themes only)
- Analytics dashboard
- Zapier / webhook integrations

---

*This document is a living draft. All estimates and decisions are subject to revision based on technical spikes, user research, and market validation.*
