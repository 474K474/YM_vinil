/**
 * Автообновление (docs/PROJECT.md, 4.7): при запуске и раз в 6 часов —
 * маленький запрос latest.json. Без согласия пользователя ничего не скачивается.
 */
import { create } from "zustand";
import { type Update, check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

type UpdateState = {
  available: Update | null;
  /** null — ещё не качаем; 0…1 — прогресс загрузки. */
  progress: number | null;
  error: string | null;
  dismissed: boolean;
};

export const useUpdate = create<UpdateState>(() => ({
  available: null,
  progress: null,
  error: null,
  dismissed: false,
}));

const SIX_HOURS = 6 * 60 * 60 * 1000;

async function checkNow() {
  try {
    const update = await check();
    if (update) useUpdate.setState({ available: update, dismissed: false, error: null });
  } catch {
    /* нет сети или запущено вне установленного приложения — тихо пропускаем */
  }
}

let started = false;
export function startUpdateChecks() {
  if (started) return;
  started = true;
  void checkNow();
  setInterval(() => void checkNow(), SIX_HOURS);
}

export async function installUpdate() {
  const { available } = useUpdate.getState();
  if (!available) return;
  let total = 0;
  let got = 0;
  useUpdate.setState({ progress: 0, error: null });
  try {
    await available.downloadAndInstall((e) => {
      if (e.event === "Started") total = e.data.contentLength ?? 0;
      else if (e.event === "Progress") {
        got += e.data.chunkLength;
        if (total) useUpdate.setState({ progress: got / total });
      } else if (e.event === "Finished") useUpdate.setState({ progress: 1 });
    });
    await relaunch();
  } catch (e) {
    useUpdate.setState({ progress: null, error: String(e) });
  }
}

export const dismissUpdate = () => useUpdate.setState({ dismissed: true });
