import { describe, it, expect } from 'vitest';
import { hexToHsl, hslToHex, interpolateHsl } from '../index.js';

describe('hexToHsl', () => {
  it('converts pure red', () => {
    expect(hexToHsl('#FF0000')).toEqual({ h: 0, s: 100, l: 50 });
  });

  it('converts pure green', () => {
    expect(hexToHsl('#00FF00')).toEqual({ h: 120, s: 100, l: 50 });
  });

  it('converts pure blue', () => {
    expect(hexToHsl('#0000FF')).toEqual({ h: 240, s: 100, l: 50 });
  });

  it('converts white', () => {
    expect(hexToHsl('#FFFFFF')).toEqual({ h: 0, s: 0, l: 100 });
  });

  it('converts black', () => {
    expect(hexToHsl('#000000')).toEqual({ h: 0, s: 0, l: 0 });
  });

  it('converts medium gray', () => {
    const hsl = hexToHsl('#808080');
    expect(hsl.h).toBe(0);
    expect(hsl.s).toBe(0);
    expect(hsl.l).toBeCloseTo(50.2, 0);
  });

  it('converts the free-deep green (#4A9B6E)', () => {
    const hsl = hexToHsl('#4A9B6E');
    expect(hsl.h).toBeCloseTo(146.7, 0);
    expect(hsl.s).toBeCloseTo(35.5, 0);
    expect(hsl.l).toBeCloseTo(44.9, 0);
  });
});

describe('hslToHex', () => {
  it('converts pure red HSL to hex', () => {
    expect(hslToHex({ h: 0, s: 100, l: 50 })).toBe('#FF0000');
  });

  it('converts pure green HSL to hex', () => {
    expect(hslToHex({ h: 120, s: 100, l: 50 })).toBe('#00FF00');
  });

  it('converts pure blue HSL to hex', () => {
    expect(hslToHex({ h: 240, s: 100, l: 50 })).toBe('#0000FF');
  });

  it('converts white HSL to hex', () => {
    expect(hslToHex({ h: 0, s: 0, l: 100 })).toBe('#FFFFFF');
  });

  it('converts black HSL to hex', () => {
    expect(hslToHex({ h: 0, s: 0, l: 0 })).toBe('#000000');
  });

  it('handles grayscale (s=0) at 50% lightness', () => {
    const hex = hslToHex({ h: 0, s: 0, l: 50 });
    expect(hex).toBe('#808080');
  });
});

describe('round-trip hex → hsl → hex', () => {
  const colors = [
    '#FF0000',
    '#00FF00',
    '#0000FF',
    '#FFFFFF',
    '#000000',
    '#808080',
    '#4A9B6E', // ambient free-deep
    '#5BAE7A', // ambient warning-far
    '#D4A843', // ambient warning-near
    '#8B6AAE', // ambient in-session-end
    '#8A9BA8', // ambient no-events
    '#4A7FB5', // ocean free-deep
  ];

  for (const hex of colors) {
    it(`round-trips ${hex}`, () => {
      const hsl = hexToHsl(hex);
      const result = hslToHex(hsl);
      expect(result).toBe(hex);
    });
  }
});

describe('interpolateHsl', () => {
  it('returns the from color at t=0', () => {
    expect(interpolateHsl('#FF0000', '#0000FF', 0)).toBe('#FF0000');
  });

  it('returns the to color at t=1', () => {
    expect(interpolateHsl('#FF0000', '#0000FF', 1)).toBe('#0000FF');
  });

  it('returns a midpoint at t=0.5', () => {
    // Red (h=0) to blue (h=240): shortest path goes backward through 360
    // Midpoint hue = (0 + (-120)*0.5) = -60 → 300° = magenta
    const mid = interpolateHsl('#FF0000', '#0000FF', 0.5);
    const midHsl = hexToHsl(mid);
    expect(midHsl.h).toBeCloseTo(300, 0);
    expect(midHsl.s).toBeCloseTo(100, 0);
    expect(midHsl.l).toBeCloseTo(50, 0);
  });

  it('takes the shortest hue path through 0° (wraparound)', () => {
    // Hue 350° to hue 10°: shortest arc is 20° through 0°, not 340° the long way
    // HSL(350, 100, 50) and HSL(10, 100, 50) — create hex values for these
    const from = hslToHex({ h: 350, s: 100, l: 50 });
    const to = hslToHex({ h: 10, s: 100, l: 50 });

    const mid = interpolateHsl(from, to, 0.5);
    const midHsl = hexToHsl(mid);
    // Midpoint should be hue 0° (or 360°), not 180°
    expect(midHsl.h).toBeCloseTo(0, 0);
    expect(midHsl.s).toBeCloseTo(100, 0);
    expect(midHsl.l).toBeCloseTo(50, 0);
  });

  it('takes the shortest hue path in reverse direction through 0°', () => {
    // Hue 10° to hue 350°: should go backward through 0°, not forward through 180°
    const from = hslToHex({ h: 10, s: 100, l: 50 });
    const to = hslToHex({ h: 350, s: 100, l: 50 });

    const mid = interpolateHsl(from, to, 0.5);
    const midHsl = hexToHsl(mid);
    expect(midHsl.h).toBeCloseTo(0, 0);
  });

  it('clamps t below 0 to 0', () => {
    expect(interpolateHsl('#FF0000', '#0000FF', -0.5)).toBe('#FF0000');
  });

  it('clamps t above 1 to 1', () => {
    expect(interpolateHsl('#FF0000', '#0000FF', 1.5)).toBe('#0000FF');
  });

  it('interpolates between palette colors', () => {
    // Interpolate between ambient free-deep and warning-near
    const mid = interpolateHsl('#4A9B6E', '#D4A843', 0.5);
    const midHsl = hexToHsl(mid);
    // Both colors have moderate saturation and lightness; hue should be between them
    const fromHsl = hexToHsl('#4A9B6E');
    const toHsl = hexToHsl('#D4A843');
    // Midpoint hue should be between the two source hues
    expect(midHsl.h).toBeGreaterThan(Math.min(fromHsl.h, toHsl.h));
    expect(midHsl.h).toBeLessThan(Math.max(fromHsl.h, toHsl.h));
  });
});
