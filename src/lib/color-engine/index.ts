export type {
  Phase,
  CalendarEvent,
  BorderState,
  PaletteEntry,
  Palette,
  Intensity,
  PaletteName,
  BorderPosition,
  BorderThickness,
  UserSettings,
} from './types.js';

export { DEFAULT_USER_SETTINGS, INTENSITY_MULTIPLIERS, MAX_OPACITY } from './types.js';

export { AMBIENT_PALETTE, OCEAN_PALETTE, PALETTES } from './palettes.js';

export {
  parseEvents,
  resolvePhase,
  resolvePreSessionPhase,
  resolveInSessionPhase,
  resolveGapPhase,
  buildWarningBoundaries,
  lerp,
} from './resolve-phase.js';

export type { ParsedEvent, PhaseResult } from './resolve-phase.js';

import type { CalendarEvent, BorderState, UserSettings } from './types.js';
import { INTENSITY_MULTIPLIERS, MAX_OPACITY } from './types.js';
import { PALETTES } from './palettes.js';
import { parseEvents, resolvePhase, lerp } from './resolve-phase.js';

// ---------------------------------------------------------------------------
// HSL color interpolation
// ---------------------------------------------------------------------------

interface HSL {
  h: number; // 0–360
  s: number; // 0–100
  l: number; // 0–100
}

/** Parse a hex color string (e.g. "#4A9B6E") into HSL. */
export function hexToHsl(hex: string): HSL {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: l * 100 };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6;
  } else {
    h = ((r - g) / d + 4) / 6;
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

/** Convert HSL values back to a hex color string. */
export function hslToHex(hsl: HSL): string {
  const h = hsl.h / 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;

  if (s === 0) {
    const v = Math.round(l * 255);
    return `#${v.toString(16).padStart(2, '0').repeat(3)}`.toUpperCase();
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);

  const toHex = (v: number): string => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/**
 * Linearly interpolate between two hex colors in HSL space.
 * @param from - Starting hex color (e.g. "#4A9B6E")
 * @param to   - Ending hex color
 * @param t    - Interpolation factor (0 = from, 1 = to)
 * @returns Interpolated hex color
 */
export function interpolateHsl(from: string, to: string, t: number): string {
  const a = hexToHsl(from);
  const b = hexToHsl(to);

  // Shortest-path hue interpolation (handles wrap-around at 360°)
  let dh = b.h - a.h;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;

  const clamped = Math.max(0, Math.min(1, t));

  return hslToHex({
    h: (((a.h + dh * clamped) % 360) + 360) % 360,
    s: a.s + (b.s - a.s) * clamped,
    l: a.l + (b.l - a.l) * clamped,
  });
}

// ---------------------------------------------------------------------------
// Intensity scaling
// ---------------------------------------------------------------------------

/**
 * Apply intensity scaling to a raw opacity value.
 * Returns the scaled opacity, capped at MAX_OPACITY.
 */
export function applyIntensity(opacity: number, intensity: UserSettings['intensity']): number {
  return Math.min(opacity * INTENSITY_MULTIPLIERS[intensity], MAX_OPACITY);
}

// ---------------------------------------------------------------------------
// getBorderState
// ---------------------------------------------------------------------------

/**
 * Compute the current border visual state from calendar events, current time,
 * and user settings.
 *
 * Determines which phase the user is in (free time, warning, in-session,
 * gap, overtime, or no-events), then interpolates color/opacity/pulse
 * between adjacent phase palette entries for smooth transitions.
 */
export function getBorderState(
  events: CalendarEvent[],
  now: Date,
  settings: UserSettings,
): BorderState {
  const palette = PALETTES[settings.palette];
  const parsed = parseEvents(events, settings);
  const { fromPhase, toPhase, t } = resolvePhase(parsed, now, settings);

  const from = palette[fromPhase];
  const to = palette[toPhase];

  const color = fromPhase === toPhase ? from.hex : interpolateHsl(from.hex, to.hex, t);
  const opacity = fromPhase === toPhase ? from.opacity : lerp(from.opacity, to.opacity, t);
  const pulseSpeed =
    fromPhase === toPhase ? from.pulseSpeed : Math.round(lerp(from.pulseSpeed, to.pulseSpeed, t));

  // The "current" phase is the fromPhase (the zone we're in).
  // Once t crosses 1.0 the resolver moves us to the next zone.
  return {
    color,
    opacity: applyIntensity(opacity, settings.intensity),
    pulseSpeed,
    phase: fromPhase,
  };
}
