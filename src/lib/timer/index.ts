import type { CalendarEvent } from '@/lib/color-engine/types';
import type { TimerState } from './types';

export type { TimerState, TimerAction, TimerStatus } from './types';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create an idle timer state. */
export function createTimer(): TimerState {
  return {
    status: 'idle',
    durationSeconds: 0,
    startedAt: null,
    pausedAt: null,
    elapsedBeforePause: 0,
  };
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

/** Start a new timer. Only valid from idle or stopped. */
export function startTimer(
  state: TimerState,
  durationSeconds: number,
  now: Date,
): TimerState {
  if (state.status !== 'idle' && state.status !== 'stopped') return state;
  return {
    status: 'running',
    durationSeconds,
    startedAt: now.toISOString(),
    pausedAt: null,
    elapsedBeforePause: 0,
  };
}

/** Pause a running timer. */
export function pauseTimer(state: TimerState, now: Date): TimerState {
  if (state.status !== 'running') return state;
  return {
    ...state,
    status: 'paused',
    pausedAt: now.toISOString(),
    elapsedBeforePause:
      state.elapsedBeforePause + diffSeconds(state.startedAt!, now),
  };
}

/** Resume a paused timer. Adjusts startedAt forward so elapsed calculations stay correct. */
export function resumeTimer(state: TimerState, now: Date): TimerState {
  if (state.status !== 'paused') return state;
  return {
    ...state,
    status: 'running',
    startedAt: now.toISOString(),
    pausedAt: null,
  };
}

/** Stop a running or paused timer. */
export function stopTimer(state: TimerState): TimerState {
  if (state.status !== 'running' && state.status !== 'paused') return state;
  return {
    ...state,
    status: 'stopped',
    pausedAt: null,
  };
}

/** Reset the timer back to idle. Valid from any status. */
export function resetTimer(): TimerState {
  return createTimer();
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Elapsed seconds since the timer started (accounts for pauses). */
export function getElapsedSeconds(state: TimerState, now: Date): number {
  switch (state.status) {
    case 'idle':
    case 'stopped':
      return 0;
    case 'paused':
      return state.elapsedBeforePause;
    case 'running':
      return state.elapsedBeforePause + diffSeconds(state.startedAt!, now);
  }
}

/** Remaining seconds until the timer reaches its duration. Never negative. */
export function getRemainingSeconds(state: TimerState, now: Date): number {
  return Math.max(0, state.durationSeconds - getElapsedSeconds(state, now));
}

/**
 * Convert the current timer state into a synthetic CalendarEvent that the
 * color engine can consume, or null if the timer is idle/stopped.
 */
export function getTimerAsEvent(
  state: TimerState,
  now: Date,
): CalendarEvent | null {
  if (state.status === 'idle' || state.status === 'stopped') return null;

  const elapsed = getElapsedSeconds(state, now);
  // The event "starts" at (now - elapsed) and "ends" at (now - elapsed + duration).
  const eventStart = new Date(now.getTime() - elapsed * 1000);
  const eventEnd = new Date(eventStart.getTime() + state.durationSeconds * 1000);

  return {
    id: 'manual-timer',
    title: 'Timer',
    startTime: eventStart.toISOString(),
    endTime: eventEnd.toISOString(),
    ignored: false,
    isAllDay: false,
    calendarId: undefined,
    providerId: 'manual-timer',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seconds between an ISO timestamp and a Date. */
function diffSeconds(isoString: string, now: Date): number {
  return (now.getTime() - new Date(isoString).getTime()) / 1000;
}
