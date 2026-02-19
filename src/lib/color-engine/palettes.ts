import type { Palette } from './types.js';

/**
 * Default "Ambient" palette.
 * Green → yellow → orange → purple progression inspired by Timeqube.
 * All hex values match docs/color-palette.md exactly.
 */
export const AMBIENT_PALETTE: Palette = {
  'free-deep':         { hex: '#4A9B6E', opacity: 0.25, pulseSpeed: 0 },
  'warning-far':       { hex: '#5BAE7A', opacity: 0.40, pulseSpeed: 4000 },
  'warning-mid':       { hex: '#A3B84C', opacity: 0.55, pulseSpeed: 3000 },
  'warning-near':      { hex: '#D4A843', opacity: 0.70, pulseSpeed: 2000 },
  'warning-imminent':  { hex: '#D4864A', opacity: 0.80, pulseSpeed: 1500 },
  'in-session-early':  { hex: '#4A9B6E', opacity: 0.35, pulseSpeed: 0 },
  'in-session-mid':    { hex: '#B8AD42', opacity: 0.50, pulseSpeed: 0 },
  'in-session-late':   { hex: '#D4864A', opacity: 0.65, pulseSpeed: 0 },
  'in-session-end':    { hex: '#8B6AAE', opacity: 0.75, pulseSpeed: 2500 },
  'overtime':          { hex: '#7B5A9E', opacity: 0.80, pulseSpeed: 2000 },
  'gap-short':         { hex: '#D4864A', opacity: 0.60, pulseSpeed: 2500 },
  'gap-long':          { hex: '#5BAE7A', opacity: 0.30, pulseSpeed: 0 },
  'no-events':         { hex: '#8A9BA8', opacity: 0.15, pulseSpeed: 0 },
};

/**
 * Colorblind-accessible "Ocean" palette.
 * Blue → white → orange progression fully distinguishable with
 * deuteranopia and protanopia (~8% of males).
 * All hex values match docs/color-palette.md exactly.
 * Opacity and pulse values are shared with the Ambient palette.
 */
export const OCEAN_PALETTE: Palette = {
  'free-deep':         { hex: '#4A7FB5', opacity: 0.25, pulseSpeed: 0 },
  'warning-far':       { hex: '#5B92C4', opacity: 0.40, pulseSpeed: 4000 },
  'warning-mid':       { hex: '#8CADD4', opacity: 0.55, pulseSpeed: 3000 },
  'warning-near':      { hex: '#D4C078', opacity: 0.70, pulseSpeed: 2000 },
  'warning-imminent':  { hex: '#D49458', opacity: 0.80, pulseSpeed: 1500 },
  'in-session-early':  { hex: '#4A7FB5', opacity: 0.35, pulseSpeed: 0 },
  'in-session-mid':    { hex: '#8CADD4', opacity: 0.50, pulseSpeed: 0 },
  'in-session-late':   { hex: '#D49458', opacity: 0.65, pulseSpeed: 0 },
  'in-session-end':    { hex: '#C47A5A', opacity: 0.75, pulseSpeed: 2500 },
  'overtime':          { hex: '#B5684A', opacity: 0.80, pulseSpeed: 2000 },
  'gap-short':         { hex: '#D49458', opacity: 0.60, pulseSpeed: 2500 },
  'gap-long':          { hex: '#5B92C4', opacity: 0.30, pulseSpeed: 0 },
  'no-events':         { hex: '#8A9BA8', opacity: 0.15, pulseSpeed: 0 },
};

/** Palette lookup by name. */
export const PALETTES = {
  ambient: AMBIENT_PALETTE,
  ocean: OCEAN_PALETTE,
} as const;
