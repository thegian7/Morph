import { describe, it, expect } from 'vitest';
import { getDefaultPresets, createPreset, startTimerFromPreset, validatePreset } from '../presets';
import type { TimerPreset } from '../types';

// ---------------------------------------------------------------------------
// Default presets
// ---------------------------------------------------------------------------

describe('getDefaultPresets', () => {
  it('returns four default presets', () => {
    const presets = getDefaultPresets();
    expect(presets).toHaveLength(4);
  });

  it('includes Pomodoro at 25 minutes', () => {
    const presets = getDefaultPresets();
    const pomodoro = presets.find((p) => p.name === 'Pomodoro');
    expect(pomodoro).toBeDefined();
    expect(pomodoro!.durationSeconds).toBe(25 * 60);
  });

  it('includes Short Break at 5 minutes', () => {
    const presets = getDefaultPresets();
    const shortBreak = presets.find((p) => p.name === 'Short Break');
    expect(shortBreak).toBeDefined();
    expect(shortBreak!.durationSeconds).toBe(5 * 60);
  });

  it('includes Long Break at 15 minutes', () => {
    const presets = getDefaultPresets();
    const longBreak = presets.find((p) => p.name === 'Long Break');
    expect(longBreak).toBeDefined();
    expect(longBreak!.durationSeconds).toBe(15 * 60);
  });

  it('includes Focus Hour at 60 minutes', () => {
    const presets = getDefaultPresets();
    const focusHour = presets.find((p) => p.name === 'Focus Hour');
    expect(focusHour).toBeDefined();
    expect(focusHour!.durationSeconds).toBe(60 * 60);
  });

  it('returns a fresh copy each time', () => {
    const a = getDefaultPresets();
    const b = getDefaultPresets();
    expect(a).not.toBe(b);
    expect(a[0]).not.toBe(b[0]);
    expect(a).toEqual(b);
  });

  it('all default presets have an id and name', () => {
    for (const preset of getDefaultPresets()) {
      expect(preset.id).toBeTruthy();
      expect(preset.name).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Creating custom presets
// ---------------------------------------------------------------------------

describe('createPreset', () => {
  it('creates a preset with the given name and duration', () => {
    const preset = createPreset('Meeting', 30 * 60);
    expect(preset.name).toBe('Meeting');
    expect(preset.durationSeconds).toBe(30 * 60);
  });

  it('assigns a unique id', () => {
    const a = createPreset('A', 60);
    const b = createPreset('B', 120);
    expect(a.id).not.toBe(b.id);
  });

  it('stores the optional color', () => {
    const preset = createPreset('Colorful', 60, '#ff0000');
    expect(preset.color).toBe('#ff0000');
  });

  it('color is undefined when not provided', () => {
    const preset = createPreset('Plain', 60);
    expect(preset.color).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Starting a timer from a preset
// ---------------------------------------------------------------------------

describe('startTimerFromPreset', () => {
  it('returns a running timer state', () => {
    const preset = createPreset('Test', 300);
    const state = startTimerFromPreset(preset);
    expect(state.status).toBe('running');
  });

  it('uses the preset duration', () => {
    const preset = createPreset('Test', 1500);
    const state = startTimerFromPreset(preset);
    expect(state.durationSeconds).toBe(1500);
  });

  it('uses the provided timestamp', () => {
    const preset = createPreset('Test', 300);
    const now = Date.UTC(2026, 0, 15, 12, 0, 0);
    const state = startTimerFromPreset(preset, now);
    expect(state.startedAt).toBe(new Date(now).toISOString());
  });

  it('starts with zero elapsed time', () => {
    const preset = createPreset('Test', 300);
    const state = startTimerFromPreset(preset);
    expect(state.elapsedBeforePause).toBe(0);
    expect(state.pausedAt).toBeNull();
  });

  it('works with default presets', () => {
    const presets = getDefaultPresets();
    for (const preset of presets) {
      const state = startTimerFromPreset(preset);
      expect(state.status).toBe('running');
      expect(state.durationSeconds).toBe(preset.durationSeconds);
    }
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('validatePreset', () => {
  it('accepts a valid preset', () => {
    const preset = createPreset('Valid', 300);
    const result = validatePreset(preset);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('all default presets are valid', () => {
    for (const preset of getDefaultPresets()) {
      expect(validatePreset(preset).valid).toBe(true);
    }
  });

  it('rejects empty name', () => {
    const preset: TimerPreset = { id: '1', name: '', durationSeconds: 300 };
    const result = validatePreset(preset);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Name is required');
  });

  it('rejects whitespace-only name', () => {
    const preset: TimerPreset = { id: '1', name: '   ', durationSeconds: 300 };
    const result = validatePreset(preset);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Name is required');
  });

  it('rejects duration below minimum (< 1 second)', () => {
    const preset: TimerPreset = { id: '1', name: 'Too Short', durationSeconds: 0 };
    const result = validatePreset(preset);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('at least'))).toBe(true);
  });

  it('rejects negative duration', () => {
    const preset: TimerPreset = { id: '1', name: 'Negative', durationSeconds: -10 };
    const result = validatePreset(preset);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('at least'))).toBe(true);
  });

  it('rejects duration above maximum (> 24 hours)', () => {
    const preset: TimerPreset = {
      id: '1',
      name: 'Too Long',
      durationSeconds: 24 * 60 * 60 + 1,
    };
    const result = validatePreset(preset);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('at most'))).toBe(true);
  });

  it('accepts exactly 1 second', () => {
    const preset: TimerPreset = { id: '1', name: 'Min', durationSeconds: 1 };
    expect(validatePreset(preset).valid).toBe(true);
  });

  it('accepts exactly 24 hours', () => {
    const preset: TimerPreset = {
      id: '1',
      name: 'Max',
      durationSeconds: 24 * 60 * 60,
    };
    expect(validatePreset(preset).valid).toBe(true);
  });

  it('rejects NaN duration', () => {
    const preset: TimerPreset = { id: '1', name: 'NaN', durationSeconds: NaN };
    const result = validatePreset(preset);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('finite number'))).toBe(true);
  });

  it('rejects Infinity duration', () => {
    const preset: TimerPreset = {
      id: '1',
      name: 'Infinity',
      durationSeconds: Infinity,
    };
    const result = validatePreset(preset);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('finite number'))).toBe(true);
  });

  it('collects multiple errors', () => {
    const preset: TimerPreset = { id: '1', name: '', durationSeconds: -5 };
    const result = validatePreset(preset);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
