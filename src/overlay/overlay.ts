import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface BorderStatePayload {
  color: string;
  opacity: number;
  pulseSpeed: number;
  phase: string;
}

async function setup() {
  const appWindow = getCurrentWindow();

  // Enable click-through so all mouse events pass to apps beneath
  await appWindow.setIgnoreCursorEvents(true);

  const borderEl = document.getElementById('border');
  if (!borderEl) return;

  // Listen for border state updates from the Rust backend / color engine
  await listen<BorderStatePayload>('border-state-update', (event) => {
    const { color, opacity } = event.payload;
    borderEl.style.backgroundColor = color;
    borderEl.style.opacity = String(opacity);
  });
}

setup().catch(console.error);
