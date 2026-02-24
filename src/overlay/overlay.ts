import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getBorderState } from '@/lib/color-engine/index';
import type {
  CalendarEvent,
  UserSettings,
  PaletteName,
  Intensity,
  BorderThickness,
  BorderPosition,
} from '@/lib/color-engine/types';
import { DEFAULT_USER_SETTINGS } from '@/lib/color-engine/types';
import { getTimerAsEvent } from '@/lib/timer/index';
import type { TimerState } from '@/lib/timer/types';

/**
 * Payload shape for the border state.
 * Matches the output of getBorderState() from the color engine.
 */
export interface BorderStatePayload {
  color: string;
  opacity: number;
  pulseSpeed: number;
  phase: string;
}

const PULSE_AMPLITUDE = 0.15;

/**
 * Compute the pulsed opacity for a given timestamp.
 * Pure function so it can be unit-tested without rAF.
 */
export function computePulseOpacity(
  timestamp: number,
  baseOpacity: number,
  pulseSpeed: number,
): number {
  if (pulseSpeed <= 0) return baseOpacity;
  const cycle = (timestamp % pulseSpeed) / pulseSpeed;
  const offset = Math.sin(cycle * 2 * Math.PI) * PULSE_AMPLITUDE;
  return Math.max(0, Math.min(1, baseOpacity + offset));
}

/**
 * Creates a pulse animation controller for a given element.
 * Uses CSS @keyframes animation (GPU-composited) instead of rAF for zero JS overhead.
 * Returns an update function to call when BorderState changes.
 */
export function createPulseController(el: HTMLElement) {
  function update(state: BorderStatePayload) {
    el.style.backgroundColor = state.color;

    if (state.pulseSpeed <= 0) {
      el.style.animation = '';
      el.style.opacity = String(state.opacity);
    } else {
      el.style.setProperty('--base-opacity', String(state.opacity));
      el.style.setProperty('--pulse-amplitude', String(PULSE_AMPLITUDE));
      el.style.animation = `pulse-opacity ${state.pulseSpeed}ms ease-in-out infinite`;
    }
  }

  function destroy() {
    el.style.animation = '';
  }

  return { update, destroy };
}

/**
 * Apply a border state update to the given element.
 * Extracted as a pure function so it can be unit-tested without Tauri.
 */
export function applyBorderState(el: HTMLElement, state: BorderStatePayload): void {
  el.style.backgroundColor = state.color;
  el.style.opacity = String(state.opacity);
}

// ---------------------------------------------------------------------------
// State held by the overlay at runtime
// ---------------------------------------------------------------------------

let calendarEvents: CalendarEvent[] = [];
let timerState: TimerState = {
  status: 'idle',
  durationSeconds: 0,
  startedAt: null,
  pausedAt: null,
  elapsedBeforePause: 0,
};
let userSettings: UserSettings = { ...DEFAULT_USER_SETTINGS };
let borderPausedUntil: number | null = null;
let lastState: BorderStatePayload | null = null;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function loadInitialSettings(): Promise<void> {
  try {
    const pairs: [string, string][] = await invoke('get_all_settings');
    for (const [key, value] of pairs) {
      applySettingToState(key, value);
    }
  } catch (e) {
    console.warn('[overlay] Failed to load initial settings:', e);
  }
}

function applySettingToState(key: string, value: string): void {
  switch (key) {
    case 'color_palette':
      if (value === 'ambient' || value === 'ocean') {
        userSettings = { ...userSettings, palette: value as PaletteName };
      }
      break;
    case 'color_intensity':
      if (value === 'subtle' || value === 'normal' || value === 'vivid') {
        userSettings = { ...userSettings, intensity: value as Intensity };
      }
      break;
    case 'border_thickness':
      if (value === 'thin' || value === 'medium' || value === 'thick') {
        userSettings = { ...userSettings, borderThickness: value as BorderThickness };
      }
      break;
    case 'border_position':
      if (
        value === 'all' ||
        value === 'top' ||
        value === 'sides' ||
        value === 'bottom' ||
        value === 'top-sides' ||
        value === 'bottom-sides'
      ) {
        userSettings = { ...userSettings, borderPosition: value as BorderPosition };
      }
      break;
  }
}

/** Check if this window should be visible given the current border position setting. */
function isWindowActiveForPosition(windowLabel: string, position: BorderPosition): boolean {
  switch (position) {
    case 'all':
      return true;
    case 'top':
      return windowLabel === 'border-top';
    case 'bottom':
      return windowLabel === 'border-bottom';
    case 'sides':
      return windowLabel === 'border-left' || windowLabel === 'border-right';
    case 'top-sides':
      return windowLabel !== 'border-bottom';
    case 'bottom-sides':
      return windowLabel !== 'border-top';
    default:
      return true;
  }
}

function stateUnchanged(a: BorderStatePayload | null, b: BorderStatePayload): boolean {
  return (
    a !== null &&
    a.color === b.color &&
    a.opacity === b.opacity &&
    a.pulseSpeed === b.pulseSpeed &&
    a.phase === b.phase
  );
}

const HIDDEN_STATE: BorderStatePayload = {
  color: '#000000',
  opacity: 0,
  pulseSpeed: 0,
  phase: 'no-events',
};

function computeAndApply(
  pulse: ReturnType<typeof createPulseController>,
  windowLabel: string,
): void {
  // If border is paused, show transparent
  if (borderPausedUntil !== null) {
    if (Date.now() < borderPausedUntil) {
      if (stateUnchanged(lastState, HIDDEN_STATE)) return;
      lastState = HIDDEN_STATE;
      pulse.update(HIDDEN_STATE);
      return;
    }
    // Pause expired
    borderPausedUntil = null;
  }

  // Hide this window if it's not active for the current position setting
  if (!isWindowActiveForPosition(windowLabel, userSettings.borderPosition)) {
    if (stateUnchanged(lastState, HIDDEN_STATE)) return;
    lastState = HIDDEN_STATE;
    pulse.update(HIDDEN_STATE);
    return;
  }

  const now = new Date();

  // Merge timer event (if active) into the calendar events
  const timerEvent = getTimerAsEvent(timerState, now);
  const allEvents = timerEvent ? [...calendarEvents, timerEvent] : calendarEvents;

  const state = getBorderState(allEvents, now, userSettings);
  if (stateUnchanged(lastState, state)) return;
  lastState = state;
  pulse.update(state);
}

async function setup() {
  const appWindow = getCurrentWindow();

  // Enable click-through so all mouse events pass to apps beneath
  await appWindow.setIgnoreCursorEvents(true);

  const borderEl = document.getElementById('border');
  if (!borderEl) return;

  const pulse = createPulseController(borderEl);

  // Load initial settings from the backend
  await loadInitialSettings();

  // Listen for calendar events from the Rust poller
  await listen<CalendarEvent[]>('calendar-events-update', (event) => {
    calendarEvents = event.payload;
  });

  // Listen for timer state updates from the backend (tray menu, settings UI)
  await listen<TimerState>('timer-state-update', (event) => {
    timerState = event.payload;
  });

  // Listen for settings changes from the settings UI
  await listen<{ key: string; value: string }>('settings-changed', (event) => {
    applySettingToState(event.payload.key, event.payload.value);
    // Force re-evaluation on next tick (settings may change visible output)
    lastState = null;
  });

  // Listen for border pause events
  await listen<{ minutes: number }>('border-paused', (event) => {
    borderPausedUntil = Date.now() + event.payload.minutes * 60 * 1000;
  });

  // Drive the color engine at 1 Hz — replaces the Rust tick emitter
  const windowLabel = appWindow.label;
  computeAndApply(pulse, windowLabel);
  setInterval(() => computeAndApply(pulse, windowLabel), 1000);
}

setup().catch(console.error);
