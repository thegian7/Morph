# Morph

**Your screen already knows what time it is. Now you do too.**

Morph is a desktop app that paints a subtle, color-changing border around your screen based on your calendar. Green when you have space. Amber when a meeting is approaching. Purple when time's up. No alarms. No pop-ups. Just color in your peripheral vision — the way your brain processes time best.

Built for people with time blindness. Free and open source.

[![GPL-3.0 License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)
[![Ko-fi](https://img.shields.io/badge/Support-Ko--fi-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/morphlight)

---

## The Problem

If you have ADHD, autism, or just a packed calendar — you already know. Time doesn't feel like a line. It feels like a cliff you walk off without warning.

Traditional solutions all share the same flaw: they demand your attention. Alarms startle. Notifications pile up. Timers require you to remember to check them. And physical color-changing cubes (yes, they exist — more on that below) cost $110 and can't travel with your laptop.

**What if time awareness could just... happen?** Without you having to do anything at all?

## The Science

This isn't a guess. There's real research behind ambient color as a time cue:

- **Timeqube's EU-funded R&D project** found that ambient colors in peripheral vision produce awareness without stress or distraction. Your brain registers the color shift without conscious effort — no startle response, no context switching.
- **The human visual system processes color before shape or text.** A green-to-amber shift in your peripheral vision reaches your brain faster and more gently than any notification ever could.
- **Visual timers are a clinically recommended intervention for ADHD time blindness.** Research links time perception difficulties to dopamine regulation and prefrontal cortex function — the same systems that respond well to ambient environmental cues.

Timeqube proved the concept works with a $110 LED cube. Morph brings it to your screen, connects it to your calendar, and gives it away for free.

## How It Works

Morph creates four thin, transparent windows at the edges of your screen — top, bottom, left, right. Together they form a border that shifts color based on what's next on your calendar:

| What's happening | Border color | You feel |
|---|---|---|
| Nothing for 60+ min | Barely-visible green | Deep focus zone |
| Meeting in ~30 min | Soft green, slow pulse | Subconscious nudge |
| Meeting in ~15 min | Yellow-green | Body starts preparing |
| Meeting in ~5 min | Warm amber | Time to wrap up |
| Meeting in ~2 min | Orange | Transition imminent |
| In a meeting (early) | Calm green | Settled in |
| In a meeting (late) | Soft purple | Approaching the end |
| Overtime | Deeper purple, pulse | Time's up — gently |

Colors transition smoothly over seconds, not instantly. Your brain absorbs the change without ever having to "check the time."

### Calendar Integration

Connect Google Calendar or Microsoft 365 and Morph pulls your events automatically. No manual timers needed (though those are there too — Pomodoro, short break, long break, focus hour).

### Colorblind Accessible

The default palette avoids red entirely (ending at purple instead). An "Ocean" palette using blue-to-orange is available for red-green colorblind users.

## The Origin Story

Morph started with a discovery: [Timeqube](https://timeqube.com/), a small LED cube that changes color over time, designed to sit in your peripheral vision during meetings. Therapists and ADHD coaches were paying $110 each for them. The concept was brilliant — ambient color is the least intrusive form of time awareness possible.

But Timeqube is a physical device. It can't connect to your calendar. It can't travel with your laptop. It can't adapt to back-to-back meetings. And at $110, it's out of reach for many of the people who need it most.

We looked for a software equivalent — something that combines ambient visual cues, calendar integration, and a desktop overlay that's always visible without covering your content. **Nothing existed.** Not from Apple, not from Microsoft, not from any productivity app. It's a genuine white space.

So we built it.

## Tech Stack

- **Rust** backend via [Tauri 2](https://v2.tauri.app/) — native performance, tiny binary
- **React 19** + **Tailwind CSS 4** — settings UI
- **Vanilla TypeScript** — overlay rendering (no framework overhead for the always-on border)
- **SQLite** — local settings storage via `tauri-plugin-sql`
- Calendar providers: Google Calendar, Microsoft 365 (Apple Calendar planned)

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) 20+
- [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform

### Setup

```bash
git clone https://github.com/thegian7/Morph.git
cd Morph
npm install
```

#### Google Calendar credentials (optional)

To enable Google Calendar integration during development, copy the example config and fill in your OAuth credentials:

```bash
cp src-tauri/.cargo/config.toml.example src-tauri/.cargo/config.toml
```

Edit `src-tauri/.cargo/config.toml` with your Google Cloud Console credentials. This file is gitignored.

### Development

```bash
npm run tauri dev
```

### Testing

```bash
# TypeScript tests
npx vitest run

# Rust tests
cd src-tauri && cargo test
```

### Building

```bash
npm run tauri build
```

## Beta Notice

Morph is in early beta. A few things to be aware of:

### Google Calendar: "Unverified app" warning

When connecting Google Calendar, Google will display a warning that Morph is "not verified by Google." This is expected — Google's app verification process takes weeks and requires a privacy policy review. Morph only reads your calendar event times and titles to determine border colors. No data leaves your machine.

To proceed past the warning:
1. Click **Advanced**
2. Click **Go to Morph (unsafe)**
3. Grant the requested calendar permissions

### macOS: Gatekeeper warning

Since Morph is not yet signed with an Apple Developer certificate, macOS will block it on first launch. To open it:
1. Right-click (or Control-click) the app
2. Select **Open** from the context menu
3. Click **Open** in the confirmation dialog

You only need to do this once.

### Windows: SmartScreen warning

Windows Defender SmartScreen may show a warning for unrecognized apps. To proceed:
1. Click **More info**
2. Click **Run anyway**

## Project Structure

```
src-tauri/          Rust backend
  src/
    calendar/       Google, Microsoft, Apple providers + polling
    settings.rs     SQLite-backed user preferences
    tray.rs         System tray with status + timer presets
    tick.rs         1-second emitter driving the overlay
    lib.rs          App setup, NSWindow config, Tauri commands
src/
  overlay/          Vanilla TS border windows (no React)
  settings/         React settings UI with tabbed interface
  lib/
    color-engine/   Pure TS: calendar events → border state
    timer/          Session timer with presets
```

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

This project uses GPL-3.0 — your modifications must remain open source.

## Support

Morph is free. If it helps you, consider leaving a tip:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/morphlight)

## License

[GPL-3.0](LICENSE)
