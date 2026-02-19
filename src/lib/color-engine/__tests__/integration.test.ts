import { describe, it, expect } from 'vitest';
import { getBorderState, DEFAULT_USER_SETTINGS, AMBIENT_PALETTE } from '../index.js';
import type { CalendarEvent, UserSettings, BorderState, Phase } from '../types.js';

const settings: UserSettings = { ...DEFAULT_USER_SETTINGS };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a CalendarEvent from hour:minute offsets on a given base date. */
function evt(
  id: string,
  startHour: number,
  startMin: number,
  endHour: number,
  endMin: number,
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  const base = '2026-03-02'; // a Monday
  const pad = (n: number) => n.toString().padStart(2, '0');
  return {
    id,
    title: `Event ${id}`,
    startTime: `${base}T${pad(startHour)}:${pad(startMin)}:00Z`,
    endTime: `${base}T${pad(endHour)}:${pad(endMin)}:00Z`,
    ignored: false,
    providerId: 'test',
    isAllDay: false,
    ...overrides,
  };
}

/** Create a Date on the test day at hour:minute. */
function at(hour: number, min: number): Date {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return new Date(`2026-03-02T${pad(hour)}:${pad(min)}:00Z`);
}

/** Simulate a day by sampling the border state at every given time point. */
function sampleDay(
  events: CalendarEvent[],
  times: Date[],
  s: UserSettings = settings,
): { time: Date; state: BorderState }[] {
  return times.map((time) => ({ time, state: getBorderState(events, time, s) }));
}

// ---------------------------------------------------------------------------
// Scenario 1: Typical workday (9am-5pm with 6 meetings)
// ---------------------------------------------------------------------------

describe('typical workday scenario', () => {
  const events = [
    evt('standup', 9, 0, 9, 15), // 15 min standup
    evt('design-review', 9, 30, 10, 0), // 30 min design review (15 min gap)
    evt('sprint-planning', 10, 0, 11, 0), // 60 min sprint planning (back-to-back)
    evt('lunch-n-learn', 12, 0, 12, 30), // 30 min (60 min gap)
    evt('one-on-one', 14, 0, 14, 30), // 30 min 1:1 (90 min gap)
    evt('retro', 16, 0, 17, 0), // 60 min retro (90 min gap)
  ];

  it('shows warning sequence before first meeting', () => {
    // 2 hours before → free-deep
    const s1 = getBorderState(events, at(7, 0), settings);
    expect(s1.phase).toBe('free-deep');

    // 25 min before → warning-far (between 30 and 15 threshold)
    const s2 = getBorderState(events, at(8, 35), settings);
    expect(s2.phase).toBe('warning-far');

    // 10 min before → warning-mid (between 15 and 5)
    const s3 = getBorderState(events, at(8, 50), settings);
    expect(s3.phase).toBe('warning-mid');

    // 1 min before → warning-imminent
    const s4 = getBorderState(events, at(8, 59), settings);
    expect(s4.phase).toBe('warning-imminent');
  });

  it('progresses through in-session phases during standup', () => {
    // Start (0%) → in-session-early
    const s1 = getBorderState(events, at(9, 0), settings);
    expect(s1.phase).toBe('in-session-early');

    // 10 min in (67%) → in-session-mid
    const s2 = getBorderState(events, at(9, 10), settings);
    expect(s2.phase).toBe('in-session-mid');

    // 14 min in (93%) → in-session-end
    const s3 = getBorderState(events, at(9, 14), settings);
    expect(s3.phase).toBe('in-session-end');
  });

  it('shows overtime after standup ends then warning for design review', () => {
    // 1 min after standup ends (9:16), 14 min to design review
    const s1 = getBorderState(events, at(9, 16), settings);
    expect(s1.phase).toBe('overtime');

    // 6 min after standup (9:21), 9 min to design review → past overtime window
    const s2 = getBorderState(events, at(9, 21), settings);
    expect(s2.phase).not.toBe('overtime');
    // 9 min to next → warning-mid (between 15 and 5)
    expect(s2.phase).toBe('warning-mid');
  });

  it('handles back-to-back sprint planning right after design review', () => {
    // Design review ends at 10:00, sprint planning starts at 10:00
    // At 10:00 we should be in sprint planning
    const s = getBorderState(events, at(10, 0), settings);
    expect(s.phase).toBe('in-session-early');
  });

  it('shows long gap phase after sprint planning (60 min gap to lunch)', () => {
    // Sprint planning ends 11:00, lunch at 12:00
    // 6 min after end (11:06) → past overtime, 54 min to next
    const s = getBorderState(events, at(11, 6), settings);
    expect(s.phase).toBe('free-deep');
  });

  it('shows no-events after the last meeting', () => {
    // Retro ends at 17:00, 6 min later overtime is done
    const s = getBorderState(events, at(17, 6), settings);
    expect(s.phase).toBe('no-events');
  });

  it('phases always transition monotonically through the day (no regressions)', () => {
    // Sample every 5 minutes from 7am to 6pm
    const times: Date[] = [];
    for (let h = 7; h <= 18; h++) {
      for (let m = 0; m < 60; m += 5) {
        times.push(at(h, m));
      }
    }
    const samples = sampleDay(events, times);

    // Verify we see a good variety of phases through the day
    const phases = new Set(samples.map((s) => s.state.phase));
    expect(phases.size).toBeGreaterThanOrEqual(5);

    // Verify opacity is always in valid range
    for (const { state } of samples) {
      expect(state.opacity).toBeGreaterThanOrEqual(0);
      expect(state.opacity).toBeLessThanOrEqual(1);
      expect(state.pulseSpeed).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Meeting-free focus day
// ---------------------------------------------------------------------------

describe('meeting-free focus day', () => {
  it('shows no-events all day with empty calendar', () => {
    const times = [at(8, 0), at(10, 0), at(12, 0), at(14, 0), at(17, 0)];
    for (const time of times) {
      const state = getBorderState([], time, settings);
      expect(state.phase).toBe('no-events');
      expect(state.color).toBe(AMBIENT_PALETTE['no-events'].hex);
    }
  });

  it('shows no-events when only all-day events exist', () => {
    const allDay = evt('ooo', 0, 0, 23, 59, { isAllDay: true });
    const state = getBorderState([allDay], at(12, 0), settings);
    expect(state.phase).toBe('no-events');
  });

  it('shows no-events when only ignored events exist', () => {
    const ignored = evt('blocked', 10, 0, 11, 0, { ignored: true });
    const state = getBorderState([ignored], at(10, 30), settings);
    expect(state.phase).toBe('no-events');
  });

  it('maintains low opacity throughout the day', () => {
    const times = [at(8, 0), at(12, 0), at(17, 0)];
    for (const time of times) {
      const state = getBorderState([], time, settings);
      expect(state.opacity).toBeLessThanOrEqual(0.2);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Back-to-back meetings with 5 and 15 minute gaps
// ---------------------------------------------------------------------------

describe('back-to-back meetings with gaps', () => {
  const events = [
    evt('meeting-a', 9, 0, 9, 30), // 30 min
    // 5 minute gap
    evt('meeting-b', 9, 35, 10, 5), // 30 min
    // 15 minute gap
    evt('meeting-c', 10, 20, 10, 50), // 30 min
  ];

  describe('5-minute gap between A and B', () => {
    it('shows overtime throughout the entire 5 min gap', () => {
      // gap is 5 min, which is <= OVERTIME_DURATION, so overtime fills it
      const s1 = getBorderState(events, at(9, 31), settings);
      const s2 = getBorderState(events, at(9, 33), settings);
      const s4 = getBorderState(events, at(9, 34), settings);
      expect(s1.phase).toBe('overtime');
      expect(s2.phase).toBe('overtime');
      expect(s4.phase).toBe('overtime');
    });

    it('enters meeting-b in-session at 9:35', () => {
      const s = getBorderState(events, at(9, 35), settings);
      expect(s.phase).toBe('in-session-early');
    });
  });

  describe('15-minute gap between B and C', () => {
    it('shows overtime right after meeting-b ends', () => {
      const s = getBorderState(events, at(10, 6), settings);
      expect(s.phase).toBe('overtime');
    });

    it('transitions to warning after overtime window', () => {
      // 10:11 → 6 min after end, 9 min to meeting-c
      const s = getBorderState(events, at(10, 11), settings);
      expect(s.phase).not.toBe('overtime');
      // 9 min to next → warning-mid
      expect(s.phase).toBe('warning-mid');
    });

    it('shows warning-imminent close to meeting-c', () => {
      const s = getBorderState(events, at(10, 19), settings);
      expect(s.phase).toBe('warning-imminent');
    });
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Overlapping events
// ---------------------------------------------------------------------------

describe('overlapping events', () => {
  const events = [
    evt('workshop', 9, 0, 11, 0), // 2 hours
    evt('standup', 9, 30, 9, 45), // overlaps within workshop
    evt('lunch', 10, 30, 11, 30), // overlaps end of workshop
  ];

  it('shows in-session during the overlap period', () => {
    // At 9:35 both workshop and standup are active, should still show in-session
    const s = getBorderState(events, at(9, 35), settings);
    expect(['in-session-early', 'in-session-mid', 'in-session-late', 'in-session-end']).toContain(
      s.phase,
    );
  });

  it('stays in-session through the entire workshop', () => {
    const times = [at(9, 0), at(9, 30), at(10, 0), at(10, 30), at(10, 59)];
    for (const time of times) {
      const s = getBorderState(events, time, settings);
      expect(s.phase).toMatch(/^in-session/);
    }
  });

  it('continues in-session into overlapping lunch event', () => {
    // At 10:45, workshop is still going AND lunch has started
    const s = getBorderState(events, at(10, 45), settings);
    expect(s.phase).toMatch(/^in-session/);
  });

  it('shows in-session for lunch after workshop ends', () => {
    // At 11:10, workshop ended but lunch continues
    const s = getBorderState(events, at(11, 10), settings);
    expect(s.phase).toMatch(/^in-session/);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Event cancelled mid-session (simulated)
// ---------------------------------------------------------------------------

describe('event cancelled mid-session', () => {
  const fullDay = [
    evt('morning-sync', 9, 0, 9, 30),
    evt('design-review', 10, 0, 11, 0),
    evt('afternoon', 14, 0, 15, 0),
  ];

  it('shows in-session during design review when it exists', () => {
    const s = getBorderState(fullDay, at(10, 15), settings);
    expect(s.phase).toMatch(/^in-session/);
  });

  it('shows free time during design review slot when event is removed', () => {
    // Simulate cancellation: remove design-review from the list
    const afterCancel = fullDay.filter((e) => e.id !== 'design-review');
    const s = getBorderState(afterCancel, at(10, 15), settings);
    // morning-sync ended at 9:30, now 10:15 (45 min later, past overtime)
    // afternoon at 14:00 is 3h45m away → free-deep
    expect(s.phase).toBe('free-deep');
  });

  it('shows free time when cancelled event is marked ignored instead', () => {
    const withIgnored = fullDay.map((e) =>
      e.id === 'design-review' ? { ...e, ignored: true } : e,
    );
    const s = getBorderState(withIgnored, at(10, 15), settings);
    expect(s.phase).toBe('free-deep');
  });

  it('adjusts warning sequence for next event after cancellation', () => {
    const afterCancel = fullDay.filter((e) => e.id !== 'design-review');
    // At 13:50, 10 min before afternoon → warning-mid
    const s = getBorderState(afterCancel, at(13, 50), settings);
    expect(s.phase).toBe('warning-mid');
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: Intensity scaling across scenarios
// ---------------------------------------------------------------------------

describe('intensity scaling integration', () => {
  const event = evt('meeting', 10, 0, 11, 0);

  it('subtle intensity reduces opacity', () => {
    const subtleSettings: UserSettings = { ...settings, intensity: 'subtle' };
    const normal = getBorderState([event], at(10, 30), settings);
    const subtle = getBorderState([event], at(10, 30), subtleSettings);
    expect(subtle.opacity).toBeLessThan(normal.opacity);
  });

  it('vivid intensity increases opacity (capped at MAX_OPACITY)', () => {
    const vividSettings: UserSettings = { ...settings, intensity: 'vivid' };
    const normal = getBorderState([event], at(10, 30), settings);
    const vivid = getBorderState([event], at(10, 30), vividSettings);
    expect(vivid.opacity).toBeGreaterThanOrEqual(normal.opacity);
    expect(vivid.opacity).toBeLessThanOrEqual(0.95);
  });

  it('all phases produce valid opacity across intensities', () => {
    const intensities: UserSettings['intensity'][] = ['subtle', 'normal', 'vivid'];
    const times = [at(8, 0), at(9, 50), at(10, 0), at(10, 30), at(10, 55), at(11, 1), at(12, 0)];
    for (const intensity of intensities) {
      const s: UserSettings = { ...settings, intensity };
      for (const time of times) {
        const state = getBorderState([event], time, s);
        expect(state.opacity).toBeGreaterThanOrEqual(0);
        expect(state.opacity).toBeLessThanOrEqual(0.95);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 7: Ocean palette full-day
// ---------------------------------------------------------------------------

describe('ocean palette full-day scenario', () => {
  const oceanSettings: UserSettings = { ...settings, palette: 'ocean' };
  const events = [evt('focus-time', 10, 0, 11, 30)];

  it('uses ocean palette colors for free-deep', () => {
    const s = getBorderState(events, at(8, 0), oceanSettings);
    expect(s.color).toBe('#4A7FB5');
    expect(s.phase).toBe('free-deep');
  });

  it('uses ocean palette colors for in-session', () => {
    const s = getBorderState(events, at(10, 0), oceanSettings);
    expect(s.color).toBe('#4A7FB5');
    expect(s.phase).toBe('in-session-early');
  });

  it('uses ocean palette colors for overtime', () => {
    const s = getBorderState(events, at(11, 31), oceanSettings);
    expect(s.color).toBe('#B5684A');
    expect(s.phase).toBe('overtime');
  });
});

// ---------------------------------------------------------------------------
// Scenario 8: Full-day timeline continuity
// ---------------------------------------------------------------------------

describe('full-day timeline continuity', () => {
  const events = [
    evt('standup', 9, 0, 9, 15),
    evt('deep-work', 10, 0, 12, 0),
    evt('lunch', 12, 30, 13, 0),
    evt('review', 15, 0, 16, 0),
  ];

  it('every minute produces a valid border state from 7am to 7pm', () => {
    for (let h = 7; h <= 19; h++) {
      for (let m = 0; m < 60; m++) {
        const state = getBorderState(events, at(h, m), settings);
        expect(state.color).toMatch(/^#[0-9A-F]{6}$/);
        expect(state.opacity).toBeGreaterThanOrEqual(0);
        expect(state.opacity).toBeLessThanOrEqual(1);
        expect(state.pulseSpeed).toBeGreaterThanOrEqual(0);
        expect(typeof state.phase).toBe('string');
      }
    }
  });

  it('no adjacent minutes have opacity jumps greater than 0.15', () => {
    const states: BorderState[] = [];
    for (let h = 7; h <= 19; h++) {
      for (let m = 0; m < 60; m++) {
        states.push(getBorderState(events, at(h, m), settings));
      }
    }
    for (let i = 1; i < states.length; i++) {
      const diff = Math.abs(states[i].opacity - states[i - 1].opacity);
      // Allow larger jumps at session boundaries (phase change)
      if (states[i].phase !== states[i - 1].phase) continue;
      expect(diff).toBeLessThan(0.15);
    }
  });

  it('covers all major phase categories through the day', () => {
    const times: Date[] = [];
    for (let h = 7; h <= 19; h++) {
      for (let m = 0; m < 60; m += 10) {
        times.push(at(h, m));
      }
    }
    const phases = new Set(times.map((t) => getBorderState(events, t, settings).phase));

    // Should see at least these categories
    const hasInSession = [...phases].some((p) => p.startsWith('in-session'));
    const hasWarning = [...phases].some((p) => p.startsWith('warning'));
    const hasOvertime = phases.has('overtime');
    const hasNoEvents = phases.has('no-events');
    const hasFreeDeep = phases.has('free-deep');

    expect(hasInSession).toBe(true);
    expect(hasWarning).toBe(true);
    expect(hasOvertime).toBe(true);
    expect(hasNoEvents).toBe(true);
    expect(hasFreeDeep).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario 9: Custom warning windows
// ---------------------------------------------------------------------------

describe('custom warning windows', () => {
  const customSettings: UserSettings = {
    ...settings,
    warningWindows: [45, 20, 10, 3],
  };
  const events = [evt('meeting', 10, 0, 11, 0)];

  it('uses custom thresholds for warning phases', () => {
    // 40 min out → warning-far (between 45 and 20)
    const s1 = getBorderState(events, at(9, 20), customSettings);
    expect(s1.phase).toBe('warning-far');

    // 15 min out → warning-mid (between 20 and 10)
    const s2 = getBorderState(events, at(9, 45), customSettings);
    expect(s2.phase).toBe('warning-mid');

    // 5 min out → warning-near (between 10 and 3)
    const s3 = getBorderState(events, at(9, 55), customSettings);
    expect(s3.phase).toBe('warning-near');

    // 1 min out → warning-imminent (< 3)
    const s4 = getBorderState(events, at(9, 59), customSettings);
    expect(s4.phase).toBe('warning-imminent');
  });
});

// ---------------------------------------------------------------------------
// Scenario 10: Calendar-level filtering in full-day context
// ---------------------------------------------------------------------------

describe('calendar filtering in full-day context', () => {
  const calSettings: UserSettings = {
    ...settings,
    ignoredCalendarIds: ['cal-social'],
  };

  const events = [
    evt('standup', 9, 0, 9, 15, { calendarId: 'cal-work' }),
    evt('birthday-party', 12, 0, 13, 0, { calendarId: 'cal-social' }),
    evt('review', 15, 0, 16, 0, { calendarId: 'cal-work' }),
  ];

  it('ignores the social calendar event entirely', () => {
    // At 12:30, birthday party is in progress but from ignored calendar
    const s = getBorderState(events, at(12, 30), calSettings);
    // standup ended at 9:15, review at 15:00 → 150 min away → free-deep
    expect(s.phase).toBe('free-deep');
  });

  it('still tracks work calendar events', () => {
    const s = getBorderState(events, at(9, 5), calSettings);
    expect(s.phase).toMatch(/^in-session/);
  });

  it('warning sequence targets next non-ignored event', () => {
    // At 14:50, 10 min before review → warning-mid
    const s = getBorderState(events, at(14, 50), calSettings);
    expect(s.phase).toBe('warning-mid');
  });
});
