import { describe, it, expect } from 'vitest';
import {
  createTimer,
  startTimer,
  pauseTimer,
  resumeTimer,
  stopTimer,
  resetTimer,
  getElapsedSeconds,
  getRemainingSeconds,
  getTimerAsEvent,
} from '../index';
import type { TimerState } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a Date from a simple offset in seconds from a fixed epoch. */
function t(seconds: number): Date {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, seconds));
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

describe('Timer state transitions', () => {
  it('creates an idle timer', () => {
    const timer = createTimer();
    expect(timer.status).toBe('idle');
    expect(timer.durationSeconds).toBe(0);
    expect(timer.startedAt).toBeNull();
    expect(timer.pausedAt).toBeNull();
    expect(timer.elapsedBeforePause).toBe(0);
  });

  it('idle -> running via start', () => {
    const timer = startTimer(createTimer(), 300, t(0));
    expect(timer.status).toBe('running');
    expect(timer.durationSeconds).toBe(300);
    expect(timer.startedAt).toBe(t(0).toISOString());
  });

  it('running -> paused via pause', () => {
    const running = startTimer(createTimer(), 300, t(0));
    const paused = pauseTimer(running, t(10));
    expect(paused.status).toBe('paused');
    expect(paused.pausedAt).toBe(t(10).toISOString());
    expect(paused.elapsedBeforePause).toBe(10);
  });

  it('paused -> running via resume', () => {
    const running = startTimer(createTimer(), 300, t(0));
    const paused = pauseTimer(running, t(10));
    const resumed = resumeTimer(paused, t(20));
    expect(resumed.status).toBe('running');
    expect(resumed.startedAt).toBe(t(20).toISOString());
    expect(resumed.pausedAt).toBeNull();
    expect(resumed.elapsedBeforePause).toBe(10);
  });

  it('running -> stopped via stop', () => {
    const running = startTimer(createTimer(), 300, t(0));
    const stopped = stopTimer(running);
    expect(stopped.status).toBe('stopped');
  });

  it('paused -> stopped via stop', () => {
    const running = startTimer(createTimer(), 300, t(0));
    const paused = pauseTimer(running, t(10));
    const stopped = stopTimer(paused);
    expect(stopped.status).toBe('stopped');
    expect(stopped.pausedAt).toBeNull();
  });

  it('stopped -> running via start', () => {
    const running = startTimer(createTimer(), 300, t(0));
    const stopped = stopTimer(running);
    const restarted = startTimer(stopped, 600, t(100));
    expect(restarted.status).toBe('running');
    expect(restarted.durationSeconds).toBe(600);
    expect(restarted.elapsedBeforePause).toBe(0);
  });

  it('any -> idle via reset', () => {
    const running = startTimer(createTimer(), 300, t(0));
    const reset = resetTimer();
    expect(reset.status).toBe('idle');
    expect(reset.durationSeconds).toBe(0);
    // Verify reset works conceptually from any state
    expect(running.status).toBe('running');
    expect(reset.status).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// Invalid transitions (no-ops)
// ---------------------------------------------------------------------------

describe('Invalid transitions are no-ops', () => {
  it('cannot pause an idle timer', () => {
    const idle = createTimer();
    expect(pauseTimer(idle, t(0))).toBe(idle);
  });

  it('cannot resume a running timer', () => {
    const running = startTimer(createTimer(), 300, t(0));
    expect(resumeTimer(running, t(5))).toBe(running);
  });

  it('cannot start an already running timer', () => {
    const running = startTimer(createTimer(), 300, t(0));
    expect(startTimer(running, 600, t(5))).toBe(running);
  });

  it('cannot stop an idle timer', () => {
    const idle = createTimer();
    expect(stopTimer(idle)).toBe(idle);
  });

  it('cannot pause a stopped timer', () => {
    const stopped = stopTimer(startTimer(createTimer(), 300, t(0)));
    expect(pauseTimer(stopped, t(10))).toBe(stopped);
  });
});

// ---------------------------------------------------------------------------
// Elapsed / remaining time
// ---------------------------------------------------------------------------

describe('Elapsed and remaining time', () => {
  it('elapsed is 0 for idle timer', () => {
    expect(getElapsedSeconds(createTimer(), t(100))).toBe(0);
  });

  it('elapsed tracks running time', () => {
    const running = startTimer(createTimer(), 300, t(0));
    expect(getElapsedSeconds(running, t(45))).toBe(45);
  });

  it('elapsed freezes when paused', () => {
    const running = startTimer(createTimer(), 300, t(0));
    const paused = pauseTimer(running, t(30));
    // Time advances but elapsed stays frozen at 30
    expect(getElapsedSeconds(paused, t(100))).toBe(30);
  });

  it('elapsed resumes after resume', () => {
    const running = startTimer(createTimer(), 300, t(0));
    const paused = pauseTimer(running, t(30));
    const resumed = resumeTimer(paused, t(50));
    // 30s before pause + 10s after resume = 40s
    expect(getElapsedSeconds(resumed, t(60))).toBe(40);
  });

  it('elapsed is 0 for stopped timer', () => {
    const running = startTimer(createTimer(), 300, t(0));
    const stopped = stopTimer(running);
    expect(getElapsedSeconds(stopped, t(100))).toBe(0);
  });

  it('remaining = duration - elapsed', () => {
    const running = startTimer(createTimer(), 300, t(0));
    expect(getRemainingSeconds(running, t(100))).toBe(200);
  });

  it('remaining never goes below 0', () => {
    const running = startTimer(createTimer(), 60, t(0));
    expect(getRemainingSeconds(running, t(120))).toBe(0);
  });

  it('handles multiple pause/resume cycles', () => {
    let state: TimerState = startTimer(createTimer(), 600, t(0));
    // Run for 10s, pause for 20s
    state = pauseTimer(state, t(10));
    state = resumeTimer(state, t(30));
    // Run for 15s, pause for 25s
    state = pauseTimer(state, t(45));
    state = resumeTimer(state, t(70));
    // Run for 5s more
    // Total elapsed: 10 + 15 + 5 = 30
    expect(getElapsedSeconds(state, t(75))).toBe(30);
    expect(getRemainingSeconds(state, t(75))).toBe(570);
  });
});

// ---------------------------------------------------------------------------
// getTimerAsEvent
// ---------------------------------------------------------------------------

describe('getTimerAsEvent', () => {
  it('returns null for idle timer', () => {
    expect(getTimerAsEvent(createTimer(), t(0))).toBeNull();
  });

  it('returns null for stopped timer', () => {
    const stopped = stopTimer(startTimer(createTimer(), 300, t(0)));
    expect(getTimerAsEvent(stopped, t(10))).toBeNull();
  });

  it('returns a CalendarEvent for a running timer', () => {
    const running = startTimer(createTimer(), 300, t(0));
    const event = getTimerAsEvent(running, t(60));
    expect(event).not.toBeNull();
    expect(event!.id).toBe('manual-timer');
    expect(event!.title).toBe('Timer');
    expect(event!.providerId).toBe('manual-timer');
    expect(event!.ignored).toBe(false);
    expect(event!.isAllDay).toBe(false);
    expect(event!.calendarId).toBeUndefined();
  });

  it('event spans from effective start to effective start + duration', () => {
    const running = startTimer(createTimer(), 300, t(0));
    const event = getTimerAsEvent(running, t(60))!;
    const start = new Date(event.startTime);
    const end = new Date(event.endTime);
    // Event start should be 60s before now (i.e., t(0))
    expect(start.getTime()).toBe(t(0).getTime());
    // Event end should be 300s after start
    expect((end.getTime() - start.getTime()) / 1000).toBe(300);
  });

  it('paused timer event accounts for pause time', () => {
    const running = startTimer(createTimer(), 300, t(0));
    const paused = pauseTimer(running, t(30));
    // Now is t(100), but timer has been paused since t(30), so elapsed = 30
    const event = getTimerAsEvent(paused, t(100))!;
    const start = new Date(event.startTime);
    const end = new Date(event.endTime);
    // start = now - elapsed = t(100) - 30s = t(70)
    expect(start.getTime()).toBe(t(70).getTime());
    // duration is still 300s
    expect((end.getTime() - start.getTime()) / 1000).toBe(300);
  });

  it('resumed timer event shifts correctly', () => {
    let state: TimerState = startTimer(createTimer(), 300, t(0));
    state = pauseTimer(state, t(20));
    state = resumeTimer(state, t(50));
    // Now is t(60). Elapsed = 20 (before pause) + 10 (after resume) = 30
    const event = getTimerAsEvent(state, t(60))!;
    const start = new Date(event.startTime);
    const end = new Date(event.endTime);
    // start = t(60) - 30s = t(30)
    expect(start.getTime()).toBe(t(30).getTime());
    expect((end.getTime() - start.getTime()) / 1000).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// Serialization round-trip
// ---------------------------------------------------------------------------

describe('Serialization', () => {
  it('state survives JSON round-trip', () => {
    let state: TimerState = startTimer(createTimer(), 300, t(0));
    state = pauseTimer(state, t(20));

    const serialized = JSON.stringify(state);
    const deserialized: TimerState = JSON.parse(serialized);

    expect(deserialized).toEqual(state);
    expect(deserialized.status).toBe('paused');
    expect(deserialized.elapsedBeforePause).toBe(20);
    expect(deserialized.startedAt).toBe(t(0).toISOString());
    expect(deserialized.pausedAt).toBe(t(20).toISOString());
  });

  it('deserialized state works with timer functions', () => {
    let state: TimerState = startTimer(createTimer(), 300, t(0));
    state = pauseTimer(state, t(20));

    const deserialized: TimerState = JSON.parse(JSON.stringify(state));
    const resumed = resumeTimer(deserialized, t(50));

    expect(resumed.status).toBe('running');
    expect(getElapsedSeconds(resumed, t(60))).toBe(30);
  });
});
