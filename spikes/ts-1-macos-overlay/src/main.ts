import { getCurrentWindow } from "@tauri-apps/api/window";

async function setup() {
  const appWindow = getCurrentWindow();

  // Enable click-through so all mouse events pass to apps beneath
  await appWindow.setIgnoreCursorEvents(true);

  console.log("Overlay initialized — click-through enabled");
}

setup().catch(console.error);
