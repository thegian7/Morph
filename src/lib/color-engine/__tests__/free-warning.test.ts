import { describe, it, expect } from 'vitest';
import {
  getBorderState,
  DEFAULT_USER_SETTINGS,
  AMBIENT_PALETTE,
  applyIntensity,
} from '../index.js';
import type { CalendarEvent, UserSettings } from '../types.js';

/** Create a CalendarEvent at a specific time offset from `base`. */
function makeEvent(
  base: Date,
  startOffsetMin: number,
  durationMin: number,
  overrides?: Partial<CalendarEvent>,
): CalendarEvent {
  const start = new Date(base.getTime() + startOffsetMin * 60_000);
  const end = new Date(start.getTime() + durationMin * 60_000);
  return {
    id: `evt-${startOffsetMin}`,
    title: 'Test Event',
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    ignored: false,
    providerId: 'test',
    isAllDay: false,
    ...overrides,
  };
}

const settings: UserSettings = { ...DEFAULT_USER_SETTINGS };
const now = new Date('2026-03-01T10:00:00Z');

describe('no events', () => {
  it('returns no-events phase when event list is empty', () => {
    const state = getBorderState([], now, settings);
    expect(state.phase).toBe('no-events');
    expect(state.color).toBe(AMBIENT_PALETTE['no-events'].hex);
    expect(state.pulseSpeed).toBe(0);
  });

  it('filters out ignored events', () => {
    const events = [makeEvent(now, 10, 30, { ignored: true })];
    const state = getBorderState(events, now, settings);
    expect(state.phase).toBe('no-events');
  });

  it('filters out all-day events', () => {
    const events = [makeEvent(now, -60, 1440, { isAllDay: true })];
    const state = getBorderState(events, now, settings);
    expect(state.phase).toBe('no-events');
  });
});

describe('free-deep', () => {
  it('returns free-deep when next event is 90 minutes away', () => {
    const events = [makeEvent(now, 90, 30)];
    const state = getBorderState(events, now, settings);
    expect(state.phase).toBe('free-deep');
    expect(state.color).toBe(AMBIENT_PALETTE['free-deep'].hex);
    expect(state.pulseSpeed).toBe(0);
  });

  it('returns free-deep when next event is exactly 60 minutes away', () => {
    const events = [makeEvent(now, 60, 30)];
    const state = getBorderState(events, now, settings);
    expect(state.phase).toBe('free-deep');
  });
});

describe('warning-far (30 min threshold)', () => {
  it('interpolates between free-deep and warning-far at 45 min out', () => {
    // 45 min is halfway between 60 (free-deep boundary) and 30 (warning-far boundary)
    const events = [makeEvent(now, 45, 30)];
    const state = getBorderState(events, now, settings);
    expect(state.phase).toBe('free-deep');
    // Should be interpolating — opacity between free-deep (0.25) and warning-far (0.40)
    const rawOpacity = state.opacity / 1.0; // normal intensity = 1.0x
    expect(rawOpacity).toBeGreaterThan(0.25);
    expect(rawOpacity).toBeLessThan(0.4);
  });

  it('shows warning-far at exactly 30 min out', () => {
    const events = [makeEvent(now, 30, 30)];
    const state = getBorderState(events, now, settings);
    expect(state.phase).toBe('warning-far');
    expect(state.pulseSpeed).toBe(AMBIENT_PALETTE['warning-far'].pulseSpeed);
  });
});

describe('warning-mid (15 min threshold)', () => {
  it('interpolates between warning-far and warning-mid at 22.5 min out', () => {
    const events = [makeEvent(now, 22.5, 30)];
    const state = getBorderState(events, now, settings);
    expect(state.phase).toBe('warning-far');
    // Midpoint interpolation — opacity between 0.40 and 0.55
    const rawOpacity = state.opacity;
    expect(rawOpacity).toBeGreaterThan(applyIntensity(0.4, 'normal'));
    expect(rawOpacity).toBeLessThan(applyIntensity(0.55, 'normal'));
  });

  it('shows warning-mid at exactly 15 min out', () => {
    const events = [makeEvent(now, 15, 30)];
    const state = getBorderState(events, now, settings);
    expect(state.phase).toBe('warning-mid');
  });
});

describe('warning-near (5 min threshold)', () => {
  it('shows warning-near at exactly 5 min out', () => {
    const events = [makeEvent(now, 5, 30)];
    const state = getBorderState(events, now, settings);
    expect(state.phase).toBe('warning-near');
  });

  it('interpolates between warning-mid and warning-near at 10 min out', () => {
    const events = [makeEvent(now, 10, 30)];
    const state = getBorderState(events, now, settings);
    expect(state.phase).toBe('warning-mid');
  });
});

describe('warning-imminent (2 min threshold)', () => {
  it('shows warning-imminent at exactly 2 min out', () => {
    const events = [makeEvent(now, 2, 30)];
    const state = getBorderState(events, now, settings);
    expect(state.phase).toBe('warning-imminent');
  });

  it('stays warning-imminent at 1 min out (clamped)', () => {
    const events = [makeEvent(now, 1, 30)];
    const state = getBorderState(events, now, settings);
    expect(state.phase).toBe('warning-imminent');
    expect(state.color).toBe(AMBIENT_PALETTE['warning-imminent'].hex);
  });

  it('stays warning-imminent at 30 seconds out', () => {
    const events = [makeEvent(now, 0.5, 30)];
    const state = getBorderState(events, now, settings);
    expect(state.phase).toBe('warning-imminent');
  });
});

describe('intensity scaling', () => {
  it('subtle intensity reduces opacity', () => {
    const subtleSettings: UserSettings = { ...settings, intensity: 'subtle' };
    const events = [makeEvent(now, 90, 30)];
    const state = getBorderState(events, now, subtleSettings);
    // free-deep base opacity is 0.25, subtle = 0.6x → 0.15
    expect(state.opacity).toBeCloseTo(0.15, 2);
  });

  it('vivid intensity increases opacity but caps at 0.95', () => {
    const vividSettings: UserSettings = { ...settings, intensity: 'vivid' };
    // warning-imminent base opacity is 0.80, vivid = 1.4x → 1.12, capped at 0.95
    const events = [makeEvent(now, 2, 30)];
    const state = getBorderState(events, now, vividSettings);
    expect(state.opacity).toBe(0.95);
  });
});

describe('ocean palette', () => {
  it('uses ocean hex values when palette is ocean', () => {
    const oceanSettings: UserSettings = { ...settings, palette: 'ocean' };
    const events = [makeEvent(now, 90, 30)];
    const state = getBorderState(events, now, oceanSettings);
    expect(state.color).toBe('#4A7FB5');
  });
});

describe('smooth interpolation', () => {
  it('produces different colors at different time points in the same zone', () => {
    const events = [makeEvent(now, 20, 30)]; // 20 min out — between warning-far and warning-mid
    const state20 = getBorderState(events, now, settings);

    const events25 = [makeEvent(now, 25, 30)]; // 25 min out
    const state25 = getBorderState(events25, now, settings);

    // Both in warning-far zone, but different interpolation positions
    expect(state20.phase).toBe('warning-far');
    expect(state25.phase).toBe('warning-far');
    expect(state20.color).not.toBe(state25.color);
    // 20 min (closer) should have higher opacity than 25 min (farther)
    expect(state20.opacity).toBeGreaterThan(state25.opacity);
  });
});
