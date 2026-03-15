/**
 * Performance benchmarks for the color engine hot path.
 * Run with: npx vitest bench
 */
import { bench, describe } from 'vitest';
import { getBorderState, hexToHsl, hslToHex, interpolateHsl } from '../index';
import {
  parseEvents,
  resolvePhase,
  buildWarningBoundaries,
  resolvePreSessionPhase,
  resolveInSessionPhase,
} from '../resolve-phase';
import type { CalendarEvent, UserSettings } from '../types';
import { DEFAULT_USER_SETTINGS } from '../types';

// ---------------------------------------------------------------------------
// Test data: realistic day with 6 meetings
// ---------------------------------------------------------------------------

const BASE_DATE = new Date('2026-02-23T09:00:00Z');

function makeEvent(
  id: string,
  title: string,
  startHour: number,
  durationMin: number,
): CalendarEvent {
  const start = new Date(BASE_DATE);
  start.setHours(startHour, 0, 0, 0);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + durationMin);
  return {
    id,
    title,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    ignored: false,
    isAllDay: false,
    calendarId: 'cal-1',
    providerId: 'google-work',
  };
}

const EVENTS: CalendarEvent[] = [
  makeEvent('1', 'Standup', 9, 15),
  makeEvent('2', 'Sprint Planning', 10, 60),
  makeEvent('3', 'Lunch', 12, 60),
  makeEvent('4', '1:1 with Manager', 14, 30),
  makeEvent('5', 'Code Review', 15, 30),
  makeEvent('6', 'Retro', 16, 60),
];

const SETTINGS: UserSettings = { ...DEFAULT_USER_SETTINGS };

// Pre-parse for resolver benchmarks
const PARSED = parseEvents(EVENTS, SETTINGS);
const BOUNDARIES = buildWarningBoundaries(SETTINGS);

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

describe('getBorderState (full pipeline)', () => {
  bench('free-deep (no events soon)', () => {
    const now = new Date('2026-02-23T07:00:00Z');
    getBorderState(EVENTS, now, SETTINGS);
  });

  bench('warning-mid (15 min before event)', () => {
    const now = new Date('2026-02-23T08:45:00Z');
    getBorderState(EVENTS, now, SETTINGS);
  });

  bench('in-session-mid (halfway through meeting)', () => {
    const now = new Date('2026-02-23T10:30:00Z');
    getBorderState(EVENTS, now, SETTINGS);
  });

  bench('gap between meetings', () => {
    const now = new Date('2026-02-23T11:15:00Z');
    getBorderState(EVENTS, now, SETTINGS);
  });

  bench('no-events (past all meetings)', () => {
    const now = new Date('2026-02-23T18:00:00Z');
    getBorderState(EVENTS, now, SETTINGS);
  });
});

describe('parseEvents', () => {
  bench('6 events', () => {
    parseEvents(EVENTS, SETTINGS);
  });

  bench('empty events', () => {
    parseEvents([], SETTINGS);
  });
});

describe('resolvePhase', () => {
  bench('pre-session', () => {
    const now = new Date('2026-02-23T08:45:00Z');
    resolvePhase(PARSED, now, SETTINGS);
  });

  bench('in-session', () => {
    const now = new Date('2026-02-23T10:30:00Z');
    resolvePhase(PARSED, now, SETTINGS);
  });

  bench('gap', () => {
    const now = new Date('2026-02-23T11:15:00Z');
    resolvePhase(PARSED, now, SETTINGS);
  });
});

describe('resolvePreSessionPhase', () => {
  bench('45 minutes out', () => {
    resolvePreSessionPhase(45, BOUNDARIES);
  });

  bench('3 minutes out', () => {
    resolvePreSessionPhase(3, BOUNDARIES);
  });
});

describe('resolveInSessionPhase', () => {
  bench('25% progress', () => {
    resolveInSessionPhase(0.25);
  });

  bench('75% progress', () => {
    resolveInSessionPhase(0.75);
  });

  bench('overtime', () => {
    resolveInSessionPhase(1.1);
  });
});

describe('color math', () => {
  bench('hexToHsl', () => {
    hexToHsl('#4A9B6E');
  });

  bench('hslToHex', () => {
    hslToHex({ h: 150, s: 35, l: 45 });
  });

  bench('interpolateHsl', () => {
    interpolateHsl('#4A9B6E', '#E8A547', 0.5);
  });
});
