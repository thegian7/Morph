# LightTime Color Palette Specification

**Inspired by:** Timeqube's green → yellow → orange → purple progression
**Design philosophy:** Ambient, peripheral, non-alarming. Purple end-state instead of red avoids stress response and improves colorblind accessibility.

---

## Default Palette: "Ambient"

### Pre-Meeting Warning Sequence

| Phase              | State                 | Hex       | RGB          | Opacity | Pulse (ms) | Rationale                                                            |
| ------------------ | --------------------- | --------- | ------------ | ------- | ---------- | -------------------------------------------------------------------- |
| `free-deep`        | 60+ min to next event | `#4A9B6E` | 74, 155, 110 | 0.25    | 0          | Barely visible. Calm, safe green. You have space.                    |
| `warning-far`      | 30 min out            | `#5BAE7A` | 91, 174, 122 | 0.40    | 4000       | Slightly brighter green, very slow pulse begins. Subconscious nudge. |
| `warning-mid`      | 15 min out            | `#A3B84C` | 163, 184, 76 | 0.55    | 3000       | Yellow-green. Pulse quickens slightly. Body starts preparing.        |
| `warning-near`     | 5 min out             | `#D4A843` | 212, 168, 67 | 0.70    | 2000       | Warm amber. Clear signal to start wrapping up.                       |
| `warning-imminent` | 2 min out             | `#D4864A` | 212, 134, 74 | 0.80    | 1500       | Orange. Transition is imminent.                                      |

### In-Session Sequence

| Phase              | State           | Hex       | RGB           | Opacity | Pulse (ms) | Rationale                                 |
| ------------------ | --------------- | --------- | ------------- | ------- | ---------- | ----------------------------------------- |
| `in-session-early` | 0–40% elapsed   | `#4A9B6E` | 74, 155, 110  | 0.35    | 0          | Green. Plenty of time. Settle in.         |
| `in-session-mid`   | 40–70% elapsed  | `#B8AD42` | 184, 173, 66  | 0.50    | 0          | Yellow. Time is moving. Awareness builds. |
| `in-session-late`  | 70–90% elapsed  | `#D4864A` | 212, 134, 74  | 0.65    | 0          | Orange. Start thinking about wrapping up. |
| `in-session-end`   | 90–100% elapsed | `#8B6AAE` | 139, 106, 174 | 0.75    | 2500       | Soft purple. Approaching the end.         |

### Post-Session & Gaps

| Phase            | State          | Hex       | RGB           | Opacity | Pulse (ms) | Rationale                                                         |
| ---------------- | -------------- | --------- | ------------- | ------- | ---------- | ----------------------------------------------------------------- |
| Session overtime | Past 100%      | `#7B5A9E` | 123, 90, 158  | 0.80    | 2000       | Deeper purple, slow pulse. Time is up — not an alarm, a presence. |
| `gap-short`      | < 10 min gap   | `#D4864A` | 212, 134, 74  | 0.60    | 2500       | Orange. Gap is tight, stay alert.                                 |
| `gap-long`       | 10+ min gap    | `#5BAE7A` | 91, 174, 122  | 0.30    | 0          | Green. Plenty of breathing room.                                  |
| No events        | Empty calendar | `#8A9BA8` | 138, 155, 168 | 0.15    | 0          | Very dim neutral blue-gray. Almost invisible. Safe to go deep.    |

---

## Color Interpolation

Colors transition smoothly between phases using **linear interpolation in HSL color space** (not RGB). This produces perceptually uniform transitions — no muddy browns when crossing between green and orange.

**Transition duration:** 8–15 seconds per step (configurable)
**Easing:** `ease-in-out` cubic bezier for all transitions
**Opacity transitions:** Same easing and duration as color

---

## Intensity Variants

Users can choose from three intensity levels that scale the opacity values:

| Intensity | Opacity Multiplier    | Use Case                                             |
| --------- | --------------------- | ---------------------------------------------------- |
| Subtle    | 0.6x                  | Bright environments, users who want minimal presence |
| Normal    | 1.0x (default)        | Standard use                                         |
| Vivid     | 1.4x (capped at 0.95) | Dark environments, users who want stronger signal    |

---

## Colorblind-Accessible Palette: "Ocean"

For red-green colorblind users (~8% of males). Uses a blue → white → orange progression that is fully distinguishable with deuteranopia and protanopia.

| Phase              | Default Hex | Ocean Hex | Ocean Color      |
| ------------------ | ----------- | --------- | ---------------- |
| `free-deep`        | `#4A9B6E`   | `#4A7FB5` | Soft blue        |
| `warning-far`      | `#5BAE7A`   | `#5B92C4` | Medium blue      |
| `warning-mid`      | `#A3B84C`   | `#8CADD4` | Light steel blue |
| `warning-near`     | `#D4A843`   | `#D4C078` | Warm sand        |
| `warning-imminent` | `#D4864A`   | `#D49458` | Warm orange      |
| `in-session-early` | `#4A9B6E`   | `#4A7FB5` | Soft blue        |
| `in-session-mid`   | `#B8AD42`   | `#8CADD4` | Light steel blue |
| `in-session-late`  | `#D4864A`   | `#D49458` | Warm orange      |
| `in-session-end`   | `#8B6AAE`   | `#C47A5A` | Deep coral       |
| Session overtime   | `#7B5A9E`   | `#B5684A` | Burnt orange     |
| `gap-short`        | `#D4864A`   | `#D49458` | Warm orange      |
| `gap-long`         | `#5BAE7A`   | `#5B92C4` | Medium blue      |
| No events          | `#8A9BA8`   | `#8A9BA8` | Neutral (same)   |

---

## Comparison to Timeqube

| Aspect                 | Timeqube       | LightTime                                                        |
| ---------------------- | -------------- | ---------------------------------------------------------------- |
| Green (plenty of time) | Yes            | Yes — similar soft green                                         |
| Yellow (midpoint)      | Yes            | Yes — warm amber/yellow                                          |
| Orange (wrapping up)   | Yes            | Yes — same position in sequence                                  |
| End color              | Purple-ish     | Soft purple (#8B6AAE) — same concept                             |
| Red                    | Not primary    | Not used — purple end-state is calmer                            |
| Pulsing                | Not documented | Yes — slow pulse that quickens as urgency increases              |
| Gray (time's up)       | Yes            | Replaced with deeper purple + pulse. More informative than gray. |
| Colorblind mode        | No             | Yes — blue→orange "Ocean" palette                                |

**Legal note:** Color progressions (green→yellow→orange→purple) are not copyrightable or patentable. The specific hex values here are original. The concept of "ambient color indicating time" is a general UX pattern, not proprietary to any product.

---

## CSS Custom Properties (for implementation)

```css
:root {
  /* Default "Ambient" palette */
  --lt-free-deep: #4a9b6e;
  --lt-warning-far: #5bae7a;
  --lt-warning-mid: #a3b84c;
  --lt-warning-near: #d4a843;
  --lt-warning-imminent: #d4864a;
  --lt-session-early: #4a9b6e;
  --lt-session-mid: #b8ad42;
  --lt-session-late: #d4864a;
  --lt-session-end: #8b6aae;
  --lt-overtime: #7b5a9e;
  --lt-gap-short: #d4864a;
  --lt-gap-long: #5bae7a;
  --lt-no-events: #8a9ba8;

  /* Transition config */
  --lt-transition-duration: 10s;
  --lt-transition-easing: cubic-bezier(0.4, 0, 0.2, 1);
}
```
