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

  // Listen for border state updates from the Rust backend / color engine.
  // Each of the four border windows receives the same broadcast event
  // and renders its full area in the given color + opacity.
  await listen<BorderStatePayload>('border-state-update', (event) => {
    applyBorderState(borderEl, event.payload);
  });
}

setup().catch(console.error);
