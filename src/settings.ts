/** Локальные настройки (docs/PROJECT.md, 4.4). Хранятся только в этом браузерном профиле приложения. */
import { create } from "zustand";

export type Settings = {
  /** Закрытие окна прячет его в трей. */
  closeToTray: boolean;
  /** Стиль винила (docs/PROJECT.md, 4.10). */
  vinylStyle: "black" | "color" | "clear" | "picture";
  /** Сортировка плейлистов и альбомов. */
  shelfSort: "default" | "title" | "artist" | "year";
  /** Громкость с ручки на деке 0…1. */
  volume: number;
  /** Главный переключатель «звука винила»: тон, насыщение, плавание, треск. */
  vinylSound: boolean;
  /** Сила эффекта 0…1. */
  vinylAmount: number;
  /** Громкость треска 0…1. */
  crackleVolume: number;
  /** В конце стороны перевернуть и играть дальше. */
  autoFlip: boolean;
  /** Скрытые разделы полки. */
  hiddenSections: string[];
  /** Вся полка спрятана. */
  shelfHidden: boolean;
  /** Треклист открыт в полноэкранном режиме. */
  fsTracklist: boolean;
};

const KEY = "ym-vinil:settings";
const defaults: Settings = {
  closeToTray: true,
  vinylStyle: "black",
  shelfSort: "default",
  volume: 0.8,
  vinylSound: true,
  vinylAmount: 0.6,
  crackleVolume: 0.6,
  autoFlip: false,
  hiddenSections: [],
  shelfHidden: false,
  fsTracklist: false,
};

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
