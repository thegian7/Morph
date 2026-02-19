import { describe, it, expect } from 'vitest';
import { getBorderState, DEFAULT_USER_SETTINGS, parseEvents } from '../index.js';
import type { CalendarEvent, UserSettings } from '../types.js';

const settings: UserSettings = { ...DEFAULT_USER_SETTINGS };

/** Helper: create a standard event at a given time offset. */
function makeEvent(
  id: string,
  startOffsetMin: number,
  durationMin: number,
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  const base = new Date('2026-03-01T09:00:00Z');
  return {
    id,
    title: `Event ${id}`,
    startTime: new Date(base.getTime() + startOffsetMin * 60_000).toISOString(),
    endTime: new Date(base.getTime() + (startOffsetMin + durationMin) * 60_000).toISOString(),
    ignored: false,
    providerId: 'test',
    isAllDay: false,
    ...overrides,
  };
}

const BASE = new Date('2026-03-01T09:00:00Z');

describe('all-day event filtering', () => {
  it('excludes all-day events from state calculation', () => {
    const allDay = makeEvent('ad-1', 0, 60, { isAllDay: true });
    const state = getBorderState([allDay], BASE, settings);
    expect(state.phase).toBe('no-events');
  });

  it('still considers timed events when all-day events are present', () => {
    const allDay = makeEvent('ad-1', -60, 1440, { isAllDay: true });
    const timed = makeEvent('t-1', 30, 60); // starts in 30 min
    const state = getBorderState([allDay, timed], BASE, settings);
    expect(state.phase).toBe('warning-far');
  });
});

describe('ignored event filtering', () => {
  it('excludes events with ignored: true', () => {
    const ignoredEvt = makeEvent('ig-1', 0, 60, { ignored: true });
    const state = getBorderState([ignoredEvt], BASE, settings);
    expect(state.phase).toBe('no-events');
  });

  it('considers non-ignored events alongside ignored ones', () => {
    const ignored = makeEvent('ig-1', 10, 30, { ignored: true });
    const normal = makeEvent('n-1', 10, 30);
    const state = getBorderState([ignored, normal], BASE, settings);
    // 10 min away → warning-near (between 15 and 5 min thresholds)
    expect(state.phase).toBe('warning-mid');
  });
});

describe('calendar-level ignore filtering', () => {
  const calSettings: UserSettings = {
    ...DEFAULT_USER_SETTINGS,
    ignoredCalendarIds: ['cal-holidays', 'cal-birthdays'],
  };

  it('excludes events from ignored calendars', () => {
    const holiday = makeEvent('h-1', 0, 60, { calendarId: 'cal-holidays' });
    const state = getBorderState([holiday], BASE, calSettings);
    expect(state.phase).toBe('no-events');
  });

  it('excludes multiple ignored calendars', () => {
    const holiday = makeEvent('h-1', 10, 30, { calendarId: 'cal-holidays' });
    const birthday = makeEvent('b-1', 20, 30, { calendarId: 'cal-birthdays' });
    const state = getBorderState([holiday, birthday], BASE, calSettings);
    expect(state.phase).toBe('no-events');
  });

  it('keeps events from non-ignored calendars', () => {
    const holiday = makeEvent('h-1', 10, 30, { calendarId: 'cal-holidays' });
    const work = makeEvent('w-1', 10, 30, { calendarId: 'cal-work' });
    const state = getBorderState([holiday, work], BASE, calSettings);
    expect(state.phase).not.toBe('no-events');
  });

  it('keeps events without calendarId (not affected by calendar ignore)', () => {
    const noCalId = makeEvent('nc-1', 10, 30);
    const state = getBorderState([noCalId], BASE, calSettings);
    expect(state.phase).not.toBe('no-events');
  });

  it('does not filter when ignoredCalendarIds is empty', () => {
    const evt = makeEvent('e-1', 10, 30, { calendarId: 'cal-holidays' });
    const state = getBorderState([evt], BASE, settings); // default settings — empty list
    expect(state.phase).not.toBe('no-events');
  });
});

describe('parseEvents filtering', () => {
  it('filters before sorting (order is by start time)', () => {
    const late = makeEvent('late', 60, 30);
    const ignored = makeEvent('ig', 30, 30, { ignored: true });
    const early = makeEvent('early', 10, 30);
    const parsed = parseEvents([late, ignored, early]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].id).toBe('early');
    expect(parsed[1].id).toBe('late');
  });

  it('filters calendar-ignored events when settings provided', () => {
    const calSettings: UserSettings = {
      ...DEFAULT_USER_SETTINGS,
      ignoredCalendarIds: ['cal-x'],
    };
    const normal = makeEvent('n-1', 0, 30);
    const calX = makeEvent('cx-1', 10, 30, { calendarId: 'cal-x' });
    const parsed = parseEvents([normal, calX], calSettings);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('n-1');
  });

  it('passes all events through when no settings provided (backward compat)', () => {
    const evt = makeEvent('e-1', 0, 30, { calendarId: 'cal-holidays' });
    const parsed = parseEvents([evt]);
    expect(parsed).toHaveLength(1);
  });
});

describe('combined filtering scenarios', () => {
  it('handles mix of ignored, all-day, calendar-ignored, and normal events', () => {
    const calSettings: UserSettings = {
      ...DEFAULT_USER_SETTINGS,
      ignoredCalendarIds: ['cal-holidays'],
    };
    const events = [
      makeEvent('allday', -60, 1440, { isAllDay: true }),
      makeEvent('ignored', 10, 30, { ignored: true }),
      makeEvent('cal-ignored', 20, 30, { calendarId: 'cal-holidays' }),
      makeEvent('normal', 5, 30), // 5 min out → warning-near
    ];
    const state = getBorderState(events, BASE, calSettings);
    expect(state.phase).toBe('warning-near');
  });

  it('returns no-events when all events are filtered out', () => {
    const calSettings: UserSettings = {
      ...DEFAULT_USER_SETTINGS,
      ignoredCalendarIds: ['cal-holidays'],
    };
    const events = [
      makeEvent('allday', -60, 1440, { isAllDay: true }),
      makeEvent('ignored', 10, 30, { ignored: true }),
      makeEvent('cal-ignored', 20, 30, { calendarId: 'cal-holidays' }),
    ];
    const state = getBorderState(events, BASE, calSettings);
    expect(state.phase).toBe('no-events');
  });
});
