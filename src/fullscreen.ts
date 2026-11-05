/** Полноэкранный режим проигрывателя (docs/PROJECT.md, 4.6). */
import { create } from "zustand";
import { getCurrentWindow } from "@tauri-apps/api/window";

export const useFullscreen = create<{ on: boolean }>(() => ({ on: false }));

export async function setFullscreen(on: boolean) {
  useFullscreen.setState({ on });
  try {
    await getCurrentWindow().setFullscreen(on);
  } catch {
    // Вне Tauri (превью в браузере) — штатный fullscreen документа.
    try {
      if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen();
      if (!on && document.fullscreenElement) await document.exitFullscreen();
    } catch {
      /* браузер не дал — остаётся только раскладка на всё окно */
    }
  }
}

export const toggleFullscreen = () => setFullscreen(!useFullscreen.getState().on);

window.addEventListener("keydown", (e) => {
  if (e.key === "F11") {
    e.preventDefault();
    void toggleFullscreen();
  } else if (e.key === "Escape" && useFullscreen.getState().on) {
    void setFullscreen(false);
  }
});
