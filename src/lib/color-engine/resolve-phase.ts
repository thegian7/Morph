import type { CalendarEvent, Phase, UserSettings } from './types.js';

/** Parsed event with Date objects for efficient comparison. */
export interface ParsedEvent {
  id: string;
  startTime: Date;
  endTime: Date;
}

/** Filter and parse events: remove ignored, all-day, and calendar-ignored events. Sort by start time. */
export function parseEvents(events: CalendarEvent[], settings?: UserSettings): ParsedEvent[] {
  const ignoredCals = settings?.ignoredCalendarIds ?? [];
  return events
    .filter((e) => {
      if (e.ignored || e.isAllDay) return false;
      if (ignoredCals.length > 0 && e.calendarId && ignoredCals.includes(e.calendarId)) return false;
      return true;
    })
    .map((e) => ({
      id: e.id,
      startTime: new Date(e.startTime),
      endTime: new Date(e.endTime),
    }))
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

/**
 * Interpolated border values (color, opacity, pulseSpeed) between two palette entries.
 * t=0 returns `from`, t=1 returns `to`.
 */
export interface InterpolatedState {
  phase: Phase;
  color: string;
  opacity: number;
  pulseSpeed: number;
}

/**
 * Linearly interpolate a numeric value between two endpoints.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ---------------------------------------------------------------------------
// Warning phase thresholds
// ---------------------------------------------------------------------------

/** The phases corresponding to the 4 default warning windows, ordered from far to imminent. */
const WARNING_PHASES: Phase[] = ['warning-far', 'warning-mid', 'warning-near', 'warning-imminent'];

/**
 * A boundary between two warning zones. `minutesBefore` is the threshold
 * (from UserSettings.warningWindows), `phase` is the phase that begins
 * when we cross that threshold moving closer to the event.
 */
interface WarningBoundary {
  minutesBefore: number;
  phase: Phase;
}

/**
 * Build the warning boundary list from user settings.
 * warningWindows is expected sorted descending, e.g. [30, 15, 5, 2].
 * Returns boundaries sorted descending by minutesBefore.
 */
export function buildWarningBoundaries(settings: UserSettings): WarningBoundary[] {
  const windows = [...settings.warningWindows].sort((a, b) => b - a);
  return windows.map((mins, i) => ({
    minutesBefore: mins,
    phase: WARNING_PHASES[i] ?? WARNING_PHASES[WARNING_PHASES.length - 1],
  }));
}

// ---------------------------------------------------------------------------
// Free-time / warning phase resolution
// ---------------------------------------------------------------------------

/** The minutes-before threshold above which we consider the user in "free-deep" mode. */
const FREE_DEEP_THRESHOLD = 60;

/**
 * Resolve the phase when the user is NOT currently in a session.
 * Returns the phase and an interpolation factor (0-1) within the current zone.
 *
 * Zones (example with default [30, 15, 5, 2] windows):
 *   - >= 60 min out: free-deep (no interpolation)
 *   - 60 → 30 min: interpolate free-deep → warning-far
 *   - 30 → 15 min: interpolate warning-far → warning-mid
 *   - 15 →  5 min: interpolate warning-mid → warning-near
 *   -  5 →  2 min: interpolate warning-near → warning-imminent
 *   - <  2 min:    warning-imminent (clamped, no further interpolation)
 */
export function resolvePreSessionPhase(
  minutesUntilEvent: number,
  boundaries: WarningBoundary[],
): { fromPhase: Phase; toPhase: Phase; t: number } {
  // Well past the furthest warning — deep free time
  if (minutesUntilEvent >= FREE_DEEP_THRESHOLD) {
    return { fromPhase: 'free-deep', toPhase: 'free-deep', t: 0 };
  }

  // Between free-deep threshold and the first (farthest) warning boundary.
  // At exactly the boundary value we enter the new phase (use > not >=).
  const farthest = boundaries[0];
  if (minutesUntilEvent > farthest.minutesBefore) {
    const range = FREE_DEEP_THRESHOLD - farthest.minutesBefore;
    const elapsed = FREE_DEEP_THRESHOLD - minutesUntilEvent;
    return {
      fromPhase: 'free-deep',
      toPhase: farthest.phase,
      t: range > 0 ? elapsed / range : 1,
    };
  }

  // Walk through adjacent boundary pairs
  for (let i = 0; i < boundaries.length - 1; i++) {
    const upper = boundaries[i];
    const lower = boundaries[i + 1];
    if (minutesUntilEvent > lower.minutesBefore) {
      const range = upper.minutesBefore - lower.minutesBefore;
      const elapsed = upper.minutesBefore - minutesUntilEvent;
      return {
        fromPhase: upper.phase,
        toPhase: lower.phase,
        t: range > 0 ? elapsed / range : 1,
      };
    }
  }

  // Past the last (most imminent) boundary — clamp at warning-imminent
  const nearest = boundaries[boundaries.length - 1];
  return { fromPhase: nearest.phase, toPhase: nearest.phase, t: 0 };
}

// ---------------------------------------------------------------------------
// In-session phase resolution
// ---------------------------------------------------------------------------

/** Session progress boundaries as fraction of total duration. */
const SESSION_BOUNDARIES: { threshold: number; phase: Phase }[] = [
  { threshold: 0.0, phase: 'in-session-early' }, // 0-40%
  { threshold: 0.4, phase: 'in-session-mid' }, // 40-70%
  { threshold: 0.7, phase: 'in-session-late' }, // 70-90%
  { threshold: 0.9, phase: 'in-session-end' }, // 90-100%
];

/**
 * Resolve the phase when the user is currently in a session.
 * `progress` is 0.0 at session start, 1.0 at session end, >1.0 for overtime.
 */
export function resolveInSessionPhase(progress: number): {
  fromPhase: Phase;
  toPhase: Phase;
  t: number;
} {
  // Overtime: past 100%
  if (progress >= 1.0) {
    return { fromPhase: 'overtime', toPhase: 'overtime', t: 0 };
  }

  // Find which segment we're in
  for (let i = SESSION_BOUNDARIES.length - 1; i >= 0; i--) {
    const boundary = SESSION_BOUNDARIES[i];
    if (progress >= boundary.threshold) {
      const nextThreshold =
        i < SESSION_BOUNDARIES.length - 1 ? SESSION_BOUNDARIES[i + 1].threshold : 1.0;
      const nextPhase =
        i < SESSION_BOUNDARIES.length - 1 ? SESSION_BOUNDARIES[i + 1].phase : 'overtime';
      const range = nextThreshold - boundary.threshold;
      const elapsed = progress - boundary.threshold;
      return {
        fromPhase: boundary.phase,
        toPhase: nextPhase as Phase,
        t: range > 0 ? elapsed / range : 0,
      };
    }
  }

  // Fallback (shouldn't reach here with progress >= 0)
  return { fromPhase: 'in-session-early', toPhase: 'in-session-early', t: 0 };
}

// ---------------------------------------------------------------------------
// Gap resolution
// ---------------------------------------------------------------------------

/** Threshold in minutes: gaps shorter than this are "short". */
const SHORT_GAP_THRESHOLD = 10;

/** Minutes past session end during which overtime is shown before gap kicks in. */
const OVERTIME_DURATION = 5;

/**
 * Resolve the gap phase between two sessions.
 * `gapMinutes` is the total gap length in minutes.
 * `minutesIntoGap` is how far into the gap we currently are.
 *
 * For short gaps (< 10 min): gap-short (no interpolation — stay alert).
 * For gaps around the threshold: interpolate gap-short → gap-long.
 * For long gaps (> 10 min): gap-long, then transition into warning for next event.
 */
export function resolveGapPhase(
  gapMinutes: number,
  minutesIntoGap?: number,
): {
  fromPhase: Phase;
  toPhase: Phase;
  t: number;
} {
  if (gapMinutes < SHORT_GAP_THRESHOLD) {
    return { fromPhase: 'gap-short', toPhase: 'gap-short', t: 0 };
  }
  // For gaps right around the threshold (10-15 min), interpolate
  // from gap-short to gap-long over the first half of the gap.
  if (minutesIntoGap !== undefined && gapMinutes < 20) {
    const halfGap = gapMinutes / 2;
    if (minutesIntoGap < halfGap) {
      const t = minutesIntoGap / halfGap;
      return { fromPhase: 'gap-short', toPhase: 'gap-long', t };
    }
  }
  return { fromPhase: 'gap-long', toPhase: 'gap-long', t: 0 };
}

// ---------------------------------------------------------------------------
// Top-level phase resolver
// ---------------------------------------------------------------------------

export interface PhaseResult {
  fromPhase: Phase;
  toPhase: Phase;
  t: number;
}

/**
 * Determine the current phase given parsed events and current time.
 */
export function resolvePhase(
  parsed: ParsedEvent[],
  now: Date,
  settings: UserSettings,
): PhaseResult {
  const nowMs = now.getTime();

  if (parsed.length === 0) {
    return { fromPhase: 'no-events', toPhase: 'no-events', t: 0 };
  }

  // Find current session (now is between start and end)
  const currentSession = parsed.find(
    (e) => nowMs >= e.startTime.getTime() && nowMs < e.endTime.getTime(),
  );

  if (currentSession) {
    const duration = currentSession.endTime.getTime() - currentSession.startTime.getTime();
    const elapsed = nowMs - currentSession.startTime.getTime();
    const progress = duration > 0 ? elapsed / duration : 1;
    return resolveInSessionPhase(progress);
  }

  // Check if we're past the end of a session (overtime)
  const pastSessions = parsed.filter((e) => nowMs >= e.endTime.getTime());
  const futureSessions = parsed.filter((e) => nowMs < e.startTime.getTime());

  if (pastSessions.length > 0 && futureSessions.length > 0) {
    // Between two sessions — gap
    const lastEnded = pastSessions[pastSessions.length - 1];
    const nextStarts = futureSessions[0];
    const gapMs = nextStarts.startTime.getTime() - lastEnded.endTime.getTime();
    const gapMinutes = gapMs / 60_000;
    const timeSinceEnd = (nowMs - lastEnded.endTime.getTime()) / 60_000;
    const minutesUntilNext = (nextStarts.startTime.getTime() - nowMs) / 60_000;

    // Overtime zone: first OVERTIME_DURATION minutes after session end.
    // For very short gaps, overtime fills the whole gap (no separate gap phase).
    if (timeSinceEnd < OVERTIME_DURATION && gapMinutes <= OVERTIME_DURATION) {
      return { fromPhase: 'overtime', toPhase: 'overtime', t: 0 };
    }

    // Transition from overtime → gap/warning over the overtime window
    if (timeSinceEnd < OVERTIME_DURATION) {
      // Interpolate overtime → next phase
      const t = timeSinceEnd / OVERTIME_DURATION;
      if (gapMinutes < SHORT_GAP_THRESHOLD) {
        return { fromPhase: 'overtime', toPhase: 'gap-short', t };
      }
      return { fromPhase: 'overtime', toPhase: 'gap-long', t };
    }

    // Past the overtime window — resolve gap or warning for next event
    const minutesIntoGap = timeSinceEnd;

    if (gapMinutes < SHORT_GAP_THRESHOLD) {
      return resolveGapPhase(gapMinutes, minutesIntoGap);
    }

    // For longer gaps, use the warning sequence for the upcoming event
    const boundaries = buildWarningBoundaries(settings);
    return resolvePreSessionPhase(minutesUntilNext, boundaries);
  }

  if (pastSessions.length > 0 && futureSessions.length === 0) {
    // Past all sessions, check overtime
    const lastEnded = pastSessions[pastSessions.length - 1];
    const timeSinceEnd = (nowMs - lastEnded.endTime.getTime()) / 60_000;
    if (timeSinceEnd < OVERTIME_DURATION) {
      return { fromPhase: 'overtime', toPhase: 'overtime', t: 0 };
    }
    // No more events for the day
    return { fromPhase: 'no-events', toPhase: 'no-events', t: 0 };
  }

  // Only future sessions remain — pre-session warning
  const nextEvent = futureSessions[0];
  const minutesUntil = (nextEvent.startTime.getTime() - nowMs) / 60_000;
  const boundaries = buildWarningBoundaries(settings);
  return resolvePreSessionPhase(minutesUntil, boundaries);
}
