import { describe, it, expect } from 'vitest';
import {
  applyDisplayPrefs,
  darkenHex,
  DEFAULT_DISPLAY_PREFS,
  CONTRAST_BOOST,
  OPAQUE_FLOOR,
  type DisplayPrefs,
} from '../display-prefs';

const state = { color: '#4A9B6E', opacity: 0.4, pulseSpeed: 4000, phase: 'warning-5' };
const prefs = (p: Partial<DisplayPrefs>): DisplayPrefs => ({ ...DEFAULT_DISPLAY_PREFS, ...p });

describe('darkenHex', () => {
  it('scales each channel toward black', () => {
    expect(darkenHex('#ffffff', 0.5)).toBe('#808080');
    expect(darkenHex('#4a9b6e', 0)).toBe('#4a9b6e');
    expect(darkenHex('#000000', 0.3)).toBe('#000000');
  });

  it('passes through non-hex colors', () => {
    expect(darkenHex('rgb(1,2,3)', 0.5)).toBe('rgb(1,2,3)');
    expect(darkenHex('#abc', 0.5)).toBe('#abc');
  });
});

describe('applyDisplayPrefs', () => {
  it('is a no-op with default (dark, no accessibility) prefs', () => {
    expect(applyDisplayPrefs(state, DEFAULT_DISPLAY_PREFS)).toEqual(state);
  });

  it('Reduce Motion stops the pulse but keeps color and opacity', () => {
    const out = applyDisplayPrefs(state, prefs({ reduceMotion: true }));
    expect(out.pulseSpeed).toBe(0);
    expect(out.opacity).toBe(state.opacity);
    expect(out.color).toBe(state.color);
    expect(out.phase).toBe('warning-5');
  });

  it('Increase Contrast strengthens the border, capped at 1', () => {
    expect(applyDisplayPrefs(state, prefs({ increaseContrast: true })).opacity).toBeCloseTo(
      0.4 * CONTRAST_BOOST,
    );
    expect(
      applyDisplayPrefs({ ...state, opacity: 0.9 }, prefs({ increaseContrast: true })).opacity,
    ).toBe(1);
  });

  it('Reduce Transparency raises faint borders to an opaque floor', () => {
    expect(applyDisplayPrefs(state, prefs({ reduceTransparency: true })).opacity).toBe(
      OPAQUE_FLOOR,
    );
    expect(
      applyDisplayPrefs({ ...state, opacity: 0.8 }, prefs({ reduceTransparency: true })).opacity,
    ).toBe(0.8);
  });

  it('light appearance darkens the color', () => {
    const out = applyDisplayPrefs(state, prefs({ dark: false }));
    expect(out.color).not.toBe(state.color);
    expect(out.color).toBe(darkenHex(state.color, 0.12));
  });

  it('never makes a hidden border visible', () => {
    const hidden = { ...state, opacity: 0 };
    const all = prefs({ reduceMotion: true, reduceTransparency: true, increaseContrast: true });
    expect(applyDisplayPrefs(hidden, all)).toBe(hidden);
  });
});
