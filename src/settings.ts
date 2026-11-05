/** Локальные настройки (docs/PROJECT.md, 4.4). Хранятся только в этом браузерном профиле приложения. */
import { create } from "zustand";

export type Settings = {
  /** Громкость треска 0…1. */
  crackleVolume: number;
  /** В конце стороны перевернуть и играть дальше. */
  autoFlip: boolean;
};

const KEY = "ym-vinil:settings";
const defaults: Settings = { crackleVolume: 0.6, autoFlip: false };

function read(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return defaults;
  }
}

export const useSettings = create<Settings>(() => read());

export function updateSettings(patch: Partial<Settings>) {
  useSettings.setState(patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(useSettings.getState()));
  } catch {
    /* хранилище недоступно — настройки живут до перезапуска */
  }
}
