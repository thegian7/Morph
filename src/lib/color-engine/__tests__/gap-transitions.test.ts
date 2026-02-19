import { describe, it, expect } from 'vitest';
import { getBorderState, DEFAULT_USER_SETTINGS, AMBIENT_PALETTE } from '../index.js';
import type { CalendarEvent, UserSettings } from '../types.js';

const settings: UserSettings = { ...DEFAULT_USER_SETTINGS };

/** Create two back-to-back events with a gap between them. */
function twoEventsWithGap(gapMinutes: number) {
  const base = new Date('2026-03-01T09:00:00Z');
  const first: CalendarEvent = {
    id: 'evt-1',
    title: 'First Meeting',
    startTime: base.toISOString(),
    endTime: new Date(base.getTime() + 30 * 60_000).toISOString(),
    ignored: false,
    providerId: 'test',
    isAllDay: false,
  };
  const second: CalendarEvent = {
    id: 'evt-2',
    title: 'Second Meeting',
    startTime: new Date(base.getTime() + (30 + gapMinutes) * 60_000).toISOString(),
    endTime: new Date(base.getTime() + (60 + gapMinutes) * 60_000).toISOString(),
    ignored: false,
    providerId: 'test',
    isAllDay: false,
  };
  return { base, events: [first, second] };
}

/** Get state at a specific number of minutes after the first session ends. */
function stateInGap(gapMinutes: number, minutesAfterEnd: number) {
  const { base, events } = twoEventsWithGap(gapMinutes);
  const now = new Date(base.getTime() + (30 + minutesAfterEnd) * 60_000);
  return getBorderState(events, now, settings);
}

describe('overtime → gap transition', () => {
  it('shows overtime immediately after session end (1 min into 15 min gap)', () => {
    const state = stateInGap(15, 1);
    expect(state.phase).toBe('overtime');
  });

  it('transitions from overtime toward gap-long during 5-min window (3 min into 15 min gap)', () => {
    const state = stateInGap(15, 3);
    expect(state.phase).toBe('overtime');
    // Should be interpolating toward gap-long (t ~= 0.6)
    expect(state.opacity).toBeLessThan(AMBIENT_PALETTE['overtime'].opacity);
  });

  it('exits overtime after 5 min (6 min into 30 min gap)', () => {
    const state = stateInGap(30, 6);
    expect(state.phase).not.toBe('overtime');
  });

  it('overtime fills entire gap when gap <= 5 min', () => {
    const state3 = stateInGap(4, 2);
    expect(state3.phase).toBe('overtime');
    const state4 = stateInGap(4, 3.5);
    expect(state4.phase).toBe('overtime');
  });
});

describe('5-minute gap', () => {
  it('stays overtime for the entire gap (gap <= overtime duration)', () => {
    const s1 = stateInGap(5, 1);
    const s2 = stateInGap(5, 3);
    const s4 = stateInGap(5, 4.5);
    expect(s1.phase).toBe('overtime');
    expect(s2.phase).toBe('overtime');
    expect(s4.phase).toBe('overtime');
  });
});

describe('10-minute gap (crossover threshold)', () => {
  it('shows overtime for first 5 minutes', () => {
    const state = stateInGap(10, 2);
    expect(state.phase).toBe('overtime');
  });

  it('transitions to warning after overtime window', () => {
    const state = stateInGap(10, 6);
    // 10 min gap, 6 min in → 4 min until next event
    // 4 min is between warning-near (5 min) and warning-imminent (2 min)
    expect(state.phase).toBe('warning-near');
  });
});

describe('15-minute gap', () => {
  it('shows overtime → gap-long transition at 3 min in', () => {
    const state = stateInGap(15, 3);
    expect(state.phase).toBe('overtime');
  });

  it('shows warning for next event once past overtime (6 min in, 9 min to go)', () => {
    const state = stateInGap(15, 6);
    // 9 min until next event → between warning-near (5) and warning-mid (15)
    expect(state.phase).toBe('warning-mid');
  });

  it('shows warning-near when 4 min from next event (11 min in)', () => {
    const state = stateInGap(15, 11);
    expect(state.phase).toBe('warning-near');
  });

  it('shows warning-imminent when 1 min from next event (14 min in)', () => {
    const state = stateInGap(15, 14);
    expect(state.phase).toBe('warning-imminent');
  });
});

describe('30-minute gap', () => {
  it('shows overtime at 2 min', () => {
    const state = stateInGap(30, 2);
    expect(state.phase).toBe('overtime');
  });

  it('shows warning-far at 6 min in (24 min to next)', () => {
    const state = stateInGap(30, 6);
    // 24 min to next event → between warning-far (30) and warning-mid (15)
    expect(state.phase).toBe('warning-far');
  });

  it('shows warning-mid at 18 min in (12 min to next)', () => {
    const state = stateInGap(30, 18);
    expect(state.phase).toBe('warning-mid');
  });

  it('shows warning-imminent at 29 min in (1 min to next)', () => {
    const state = stateInGap(30, 29);
    expect(state.phase).toBe('warning-imminent');
  });
});

describe('gap interpolation smoothness', () => {
  it('opacity changes through a 15-min gap with no large jumps', () => {
    const readings = [1, 3, 5, 6, 8, 10, 12, 14].map((m) => ({
      min: m,
      opacity: stateInGap(15, m).opacity,
      phase: stateInGap(15, m).phase,
    }));
    // Check that post-overtime readings differ (not all the same value)
    const postOvertime = readings.filter((r) => r.phase !== 'overtime');
    expect(postOvertime.length).toBeGreaterThan(2);
    // Adjacent post-overtime readings should not have large jumps (> 0.3)
    for (let i = 0; i < postOvertime.length - 1; i++) {
      const diff = Math.abs(postOvertime[i].opacity - postOvertime[i + 1].opacity);
      expect(diff).toBeLessThan(0.3);
    }
  });
});
