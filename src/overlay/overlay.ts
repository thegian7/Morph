import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Payload shape for the `border-state-update` Tauri event.
 * Mirrors BorderState from src/lib/color-engine/types.ts but kept
 * local to avoid import-path issues in the overlay webview context.
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
 * Returns an update function to call when BorderState changes.
 */
export function createPulseController(el: HTMLElement) {
  let animationId: number | null = null;
  let pulseSpeed = 0;
  let baseOpacity = 0;

  function tick(timestamp: number) {
    if (pulseSpeed <= 0) return;
    el.style.opacity = String(computePulseOpacity(timestamp, baseOpacity, pulseSpeed));
    animationId = requestAnimationFrame(tick);
  }

  function update(state: BorderStatePayload) {
    el.style.backgroundColor = state.color;
    baseOpacity = state.opacity;
    pulseSpeed = state.pulseSpeed;

    if (pulseSpeed <= 0) {
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
      el.style.opacity = String(baseOpacity);
    } else if (animationId === null) {
      animationId = requestAnimationFrame(tick);
    }
  }

  function destroy() {
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  return { update, destroy };
}

/**
 * Apply a border state update to the given element.
 * Extracted as a pure function so it can be unit-tested without Tauri.
 */
export function applyBorderState(
  el: HTMLElement,
  state: BorderStatePayload,
): void {
  el.style.backgroundColor = state.color;
  el.style.opacity = String(state.opacity);
}

async function setup() {
  const appWindow = getCurrentWindow();

  // Enable click-through so all mouse events pass to apps beneath
  await appWindow.setIgnoreCursorEvents(true);

  const borderEl = document.getElementById('border');
  if (!borderEl) return;

  const pulse = createPulseController(borderEl);

  // Listen for border state updates from the Rust backend / color engine.
  // Each of the four border windows receives the same broadcast event
  // and renders its full area in the given color + opacity.
  await listen<BorderStatePayload>('border-state-update', (event) => {
    pulse.update(event.payload);
  });
}

setup().catch(console.error);
