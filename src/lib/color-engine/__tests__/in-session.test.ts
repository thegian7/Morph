import { describe, it, expect } from 'vitest';
import {
  getBorderState,
  DEFAULT_USER_SETTINGS,
  AMBIENT_PALETTE,
  OCEAN_PALETTE,
  applyIntensity,
} from '../index.js';
import type { CalendarEvent, UserSettings } from '../types.js';

/**
 * Helper: create a session event and compute state at a given progress fraction.
 * `progress` is 0.0 at start, 1.0 at end. The session is 60 min long.
 */
function stateAtProgress(progress: number, settings?: UserSettings) {
  const sessionDuration = 60; // minutes
  const sessionBase = new Date('2026-03-01T09:00:00Z');
  const events: CalendarEvent[] = [
    {
      id: 'session-1',
      title: 'Test Session',
      startTime: sessionBase.toISOString(),
      endTime: new Date(sessionBase.getTime() + sessionDuration * 60_000).toISOString(),
      ignored: false,
      providerId: 'test',
      isAllDay: false,
    },
  ];
  const elapsed = sessionDuration * progress;
  const nowTime = new Date(sessionBase.getTime() + elapsed * 60_000);
  return getBorderState(events, nowTime, settings ?? DEFAULT_USER_SETTINGS);
}

const settings: UserSettings = { ...DEFAULT_USER_SETTINGS };

describe('in-session-early (0-40%)', () => {
  it('returns in-session-early at session start (0%)', () => {
    const state = stateAtProgress(0);
    expect(state.phase).toBe('in-session-early');
    expect(state.color).toBe(AMBIENT_PALETTE['in-session-early'].hex);
    expect(state.pulseSpeed).toBe(0);
  });

  it('returns in-session-early at 20% through session', () => {
    const state = stateAtProgress(0.2);
    expect(state.phase).toBe('in-session-early');
  });

  it('interpolates opacity within in-session-early zone', () => {
    const state0 = stateAtProgress(0.0);
    const state30 = stateAtProgress(0.3);
    expect(state0.phase).toBe('in-session-early');
    expect(state30.phase).toBe('in-session-early');
    expect(state30.opacity).toBeGreaterThan(state0.opacity);
  });
});

describe('in-session-mid (40-70%)', () => {
  it('returns in-session-mid at exactly 40%', () => {
    const state = stateAtProgress(0.4);
    expect(state.phase).toBe('in-session-mid');
    expect(state.color).toBe(AMBIENT_PALETTE['in-session-mid'].hex);
    expect(state.pulseSpeed).toBe(0);
  });

  it('returns in-session-mid at 55%', () => {
    const state = stateAtProgress(0.55);
    expect(state.phase).toBe('in-session-mid');
  });

  it('interpolates between mid and late', () => {
    const state50 = stateAtProgress(0.5);
    const state65 = stateAtProgress(0.65);
    expect(state50.phase).toBe('in-session-mid');
    expect(state65.phase).toBe('in-session-mid');
    expect(state65.color).not.toBe(state50.color);
    expect(state65.opacity).toBeGreaterThan(state50.opacity);
  });
});

describe('in-session-late (70-90%)', () => {
  it('returns in-session-late at exactly 70%', () => {
    const state = stateAtProgress(0.7);
    expect(state.phase).toBe('in-session-late');
    expect(state.color).toBe(AMBIENT_PALETTE['in-session-late'].hex);
    expect(state.pulseSpeed).toBe(0);
  });

  it('returns in-session-late at 80%', () => {
    const state = stateAtProgress(0.8);
    expect(state.phase).toBe('in-session-late');
  });
});

describe('in-session-end (90-100%)', () => {
  it('returns in-session-end at exactly 90%', () => {
    const state = stateAtProgress(0.9);
    expect(state.phase).toBe('in-session-end');
    expect(state.color).toBe(AMBIENT_PALETTE['in-session-end'].hex);
    expect(state.pulseSpeed).toBe(AMBIENT_PALETTE['in-session-end'].pulseSpeed);
  });

  it('returns in-session-end at 95%', () => {
    const state = stateAtProgress(0.95);
    expect(state.phase).toBe('in-session-end');
    expect(state.pulseSpeed).toBeGreaterThan(0);
  });

  it('transitions purple color toward the end', () => {
    const state90 = stateAtProgress(0.9);
    const state99 = stateAtProgress(0.99);
    expect(state90.phase).toBe('in-session-end');
    expect(state99.phase).toBe('in-session-end');
    expect(state99.opacity).toBeGreaterThan(state90.opacity);
  });
});

describe('overtime (past 100%)', () => {
  it('returns overtime when past session end', () => {
    const sessionBase = new Date('2026-03-01T09:00:00Z');
    const events: CalendarEvent[] = [
      {
        id: 'evt-1',
        title: 'Test Event',
        startTime: sessionBase.toISOString(),
        endTime: new Date(sessionBase.getTime() + 60 * 60_000).toISOString(),
        ignored: false,
        providerId: 'test',
        isAllDay: false,
      },
    ];
    // 2 minutes after session end
    const now = new Date(sessionBase.getTime() + 62 * 60_000);
    const state = getBorderState(events, now, settings);
    expect(state.phase).toBe('overtime');
    expect(state.color).toBe(AMBIENT_PALETTE['overtime'].hex);
    expect(state.opacity).toBeCloseTo(
      applyIntensity(AMBIENT_PALETTE['overtime'].opacity, 'normal'),
      2,
    );
    expect(state.pulseSpeed).toBe(AMBIENT_PALETTE['overtime'].pulseSpeed);
  });

  it('returns overtime with deep purple color', () => {
    const state = stateAtProgress(1.0);
    expect(state.phase).toBe('overtime');
    expect(state.color).toBe('#7B5A9E');
  });
});

describe('gap-short (< 10 min between sessions)', () => {
  it('returns overtime shortly after session ends before next session', () => {
    const base = new Date('2026-03-01T09:00:00Z');
    const events: CalendarEvent[] = [
      {
        id: 'evt-1',
        title: 'First Meeting',
        startTime: base.toISOString(),
        endTime: new Date(base.getTime() + 30 * 60_000).toISOString(),
        ignored: false,
        providerId: 'test',
        isAllDay: false,
      },
      {
        id: 'evt-2',
        title: 'Second Meeting',
        startTime: new Date(base.getTime() + 35 * 60_000).toISOString(),
        endTime: new Date(base.getTime() + 65 * 60_000).toISOString(),
        ignored: false,
        providerId: 'test',
        isAllDay: false,
      },
    ];
    // 3 min after first session ends → within overtime window
    const now = new Date(base.getTime() + 33 * 60_000);
    const state = getBorderState(events, now, settings);
    expect(state.phase).toBe('overtime');
  });
});

describe('gap-long (10+ min between sessions)', () => {
  it('returns free-deep for long gap far from next event', () => {
    const base = new Date('2026-03-01T09:00:00Z');
    const events: CalendarEvent[] = [
      {
        id: 'evt-1',
        title: 'First Meeting',
        startTime: base.toISOString(),
        endTime: new Date(base.getTime() + 30 * 60_000).toISOString(),
        ignored: false,
        providerId: 'test',
        isAllDay: false,
      },
      {
        id: 'evt-2',
        title: 'Second Meeting',
        startTime: new Date(base.getTime() + 90 * 60_000).toISOString(),
        endTime: new Date(base.getTime() + 120 * 60_000).toISOString(),
        ignored: false,
        providerId: 'test',
        isAllDay: false,
      },
    ];
    // 40 min mark → 10 min past first session, 50 min until next
    const now = new Date(base.getTime() + 40 * 60_000);
    const state = getBorderState(events, now, settings);
    expect(state.phase).toBe('free-deep');
  });
});

describe('ocean palette in-session', () => {
  it('uses ocean hex values during in-session-early at 0%', () => {
    const oceanSettings: UserSettings = { ...settings, palette: 'ocean' };
    const state = stateAtProgress(0.0, oceanSettings);
    expect(state.phase).toBe('in-session-early');
    expect(state.color).toBe(OCEAN_PALETTE['in-session-early'].hex);
  });

  it('uses ocean hex values during in-session-end at 90%', () => {
    const oceanSettings: UserSettings = { ...settings, palette: 'ocean' };
    const state = stateAtProgress(0.9, oceanSettings);
    expect(state.phase).toBe('in-session-end');
    expect(state.color).toBe(OCEAN_PALETTE['in-session-end'].hex);
  });
});

describe('smooth in-session progression', () => {
  it('opacity increases progressively through the session', () => {
    const state10 = stateAtProgress(0.1);
    const state50 = stateAtProgress(0.5);
    const state80 = stateAtProgress(0.8);
    const state95 = stateAtProgress(0.95);

    expect(state50.opacity).toBeGreaterThan(state10.opacity);
    expect(state80.opacity).toBeGreaterThan(state50.opacity);
    expect(state95.opacity).toBeGreaterThan(state80.opacity);
  });

  it('phases progress in order through the session', () => {
    const phases = [0.1, 0.3, 0.5, 0.7, 0.85, 0.95, 1.05].map((p) => stateAtProgress(p).phase);
    expect(phases).toEqual([
      'in-session-early',
      'in-session-early',
      'in-session-mid',
      'in-session-late',
      'in-session-late',
      'in-session-end',
      'overtime',
    ]);
  });
});

describe('boundary transitions use interpolation', () => {
  it('at 39% (just before mid boundary), color is not yet mid color', () => {
    const state = stateAtProgress(0.39);
    expect(state.phase).toBe('in-session-early');
    expect(state.color).not.toBe(AMBIENT_PALETTE['in-session-mid'].hex);
  });

  it('at 40% (exactly mid boundary), color is mid color', () => {
    const state = stateAtProgress(0.4);
    expect(state.phase).toBe('in-session-mid');
    expect(state.color).toBe(AMBIENT_PALETTE['in-session-mid'].hex);
  });

  it('at 69% (just before late boundary), color differs from 41%', () => {
    const state41 = stateAtProgress(0.41);
    const state69 = stateAtProgress(0.69);
    expect(state41.phase).toBe('in-session-mid');
    expect(state69.phase).toBe('in-session-mid');
    expect(state41.color).not.toBe(state69.color);
  });
});
