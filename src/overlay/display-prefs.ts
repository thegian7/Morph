/**
 * Adapting the border to the user's system display preferences
 * (System Settings → Accessibility → Display, and light/dark appearance).
 *
 * Pure functions so they can be unit-tested without Tauri.
 */

/** Mirrors `window_manager::DisplayPrefs` in Rust (camelCase over IPC). */
export interface DisplayPrefs {
  reduceMotion: boolean;
  reduceTransparency: boolean;
  increaseContrast: boolean;
  dark: boolean;
}

export const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  reduceMotion: false,
  reduceTransparency: false,
  increaseContrast: false,
  dark: true,
};

/** The subset of border state these adjustments touch. */
export interface AdjustableState {
  color: string;
  opacity: number;
  pulseSpeed: number;
}

/** Opacity multiplier under Increase Contrast. */
export const CONTRAST_BOOST = 1.35;
/** Minimum opacity of a visible border under Reduce Transparency. */
export const OPAQUE_FLOOR = 0.6;
/** How much to darken colors in light appearance (0–1). */
export const LIGHT_MODE_DARKEN = 0.12;

/** Darken a `#rrggbb` color by `amount` (0–1). Other formats pass through. */
export function darkenHex(color: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const scale = (c: number) => Math.round(c * (1 - amount));
  const r = scale((n >> 16) & 0xff);
  const g = scale((n >> 8) & 0xff);
  const b = scale(n & 0xff);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Apply display preferences to a border state.
 *
 * - Reduce Motion: no pulsing (the slow color fades remain — dissolves are
 *   what Apple recommends in place of motion).
 * - Increase Contrast: a stronger border.
 * - Reduce Transparency: a visible border is never faint and see-through.
 * - Light appearance: slightly darker colors so pale greens and yellows keep
 *   contrast against a light menu bar and wallpaper.
 *
 * A hidden state (opacity 0) is left hidden.
 */
export function applyDisplayPrefs<T extends AdjustableState>(state: T, prefs: DisplayPrefs): T {
  if (state.opacity <= 0) return state;

  let opacity = state.opacity;
  if (prefs.increaseContrast) opacity = Math.min(1, opacity * CONTRAST_BOOST);
  if (prefs.reduceTransparency) opacity = Math.max(opacity, OPAQUE_FLOOR);

  return {
    ...state,
    color: prefs.dark ? state.color : darkenHex(state.color, LIGHT_MODE_DARKEN),
    opacity,
    pulseSpeed: prefs.reduceMotion ? 0 : state.pulseSpeed,
  };
}
