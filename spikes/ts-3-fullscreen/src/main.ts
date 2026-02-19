import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

interface LevelInfo {
  level: number;
  name: string;
}

async function setup() {
  const appWindow = getCurrentWindow();
  await appWindow.setIgnoreCursorEvents(true);

  const levels = await invoke<LevelInfo[]>("list_levels");
  const currentLevel = await invoke<string>("get_level");

  const levelInfo = document.getElementById("level-info");
  if (levelInfo) {
    levelInfo.innerHTML = levels
      .map((l) => {
        const active = currentLevel.includes(String(l.level));
        const cls = active ? ' class="level active"' : ' class="level"';
        return `<div${cls}>${l.name}${active ? " &larr; active" : ""}</div>`;
      })
      .join("");
  }

  console.log("TS-3 Fullscreen overlay initialized");
  console.log("Window level:", currentLevel);
  console.log("Available levels:", levels.map((l) => l.name).join(", "));
}

setup().catch(console.error);
