import type { TimerPreset, TimerState } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_DURATION_SECONDS = 1;
const MAX_DURATION_SECONDS = 24 * 60 * 60; // 24 hours

// ---------------------------------------------------------------------------
// Default presets
// ---------------------------------------------------------------------------

const DEFAULT_PRESETS: readonly TimerPreset[] = [
  { id: 'pomodoro', name: 'Pomodoro', durationSeconds: 25 * 60 },
  { id: 'short-break', name: 'Short Break', durationSeconds: 5 * 60 },
  { id: 'long-break', name: 'Long Break', durationSeconds: 15 * 60 },
  { id: 'focus-hour', name: 'Focus Hour', durationSeconds: 60 * 60 },
];

/** Return a fresh copy of the built-in presets. */
export function getDefaultPresets(): TimerPreset[] {
  return DEFAULT_PRESETS.map((p) => ({ ...p }));
}

// ---------------------------------------------------------------------------
// Creating presets
// ---------------------------------------------------------------------------

let nextId = 1;

/** Create a new custom preset. */
export function createPreset(name: string, durationSeconds: number, color?: string): TimerPreset {
  return {
    id: `custom-${nextId++}`,
    name,
    durationSeconds,
    color,
  };
}

// ---------------------------------------------------------------------------
// Starting a timer from a preset
// ---------------------------------------------------------------------------

/** Build a running TimerState from a preset. */
export function startTimerFromPreset(preset: TimerPreset, now: number = Date.now()): TimerState {
  return {
    status: 'running',
    durationSeconds: preset.durationSeconds,
    startedAt: new Date(now).toISOString(),
    pausedAt: null,
    elapsedBeforePause: 0,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Validate a preset, returning any errors. */
export function validatePreset(preset: TimerPreset): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!preset.name || preset.name.trim().length === 0) {
    errors.push('Name is required');
  }

  if (typeof preset.durationSeconds !== 'number' || !Number.isFinite(preset.durationSeconds)) {
    errors.push('Duration must be a finite number');
  } else {
    if (preset.durationSeconds < MIN_DURATION_SECONDS) {
      errors.push(`Duration must be at least ${MIN_DURATION_SECONDS} second`);
    }
    if (preset.durationSeconds > MAX_DURATION_SECONDS) {
      errors.push(`Duration must be at most ${MAX_DURATION_SECONDS} seconds (24 hours)`);
    }
  }

  return { valid: errors.length === 0, errors };
}
