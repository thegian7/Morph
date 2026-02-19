import { getCurrentWindow } from "@tauri-apps/api/window";

async function setup() {
  const appWindow = getCurrentWindow();

  // Enable click-through via Tauri API.
  // NOTE: Tauri issue #11461 reports this may not work reliably on Windows.
  // The Rust backend applies WS_EX_TRANSPARENT as a native fallback.
  try {
    await appWindow.setIgnoreCursorEvents(true);
    console.log("Tauri setIgnoreCursorEvents(true) succeeded");
  } catch (err) {
    console.warn("Tauri setIgnoreCursorEvents failed, relying on native fallback:", err);
  }

  console.log("Overlay initialized — click-through enabled (Windows spike)");
}

setup().catch(console.error);
