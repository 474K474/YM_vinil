/**
 * Мост главного окна с треем и мини-плеером (docs/PROJECT.md, 4.9).
 * Главное окно — единственное, где играет музыка: сюда приходят команды,
 * отсюда рассылается состояние.
 */
import { emit, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  currentTrack,
  likeCurrent,
  nextTrack,
  prevTrack,
  togglePlay,
  usePlayer,
} from "./player/engine";
import { isLiked, useLikes } from "./player/likes";
import { useSettings } from "./settings";

export type MiniState = {
  hasRecord: boolean;
  title: string;
  artist: string;
  record: string;
  cover: string | null;
  labelColor: string;
  playing: boolean;
  motor: boolean;
  liked: boolean;
};

export type PlayerCmd = "toggle" | "next" | "prev" | "like";

function snapshot(): MiniState {
  const p = usePlayer.getState();
  const t = currentTrack(p);
  return {
    hasRecord: Boolean(p.record),
    title: t?.title ?? p.record?.title ?? "Проигрыватель пуст",
    artist: t?.artists ?? p.record?.subtitle ?? "Поставьте пластинку",
    record: p.record?.title ?? "",
    cover: p.record?.cover ?? null,
    labelColor: p.labelColor,
    playing: p.needle === "down",
    motor: p.motor,
    liked: isLiked(useLikes.getState().ids, t),
  };
}

let last = "";
function broadcast(force = false) {
  const s = snapshot();
  const key = JSON.stringify(s);
  if (!force && key === last) return;
  const trackChanged = !last || JSON.parse(last).title !== s.title;
  last = key;
  void emit("player://state", s).catch(() => {});
  if (trackChanged) {
    const tip = s.hasRecord ? `YM Vinil — ${s.title} · ${s.artist}` : "YM Vinil";
    void invoke("set_tray_tooltip", { text: tip }).catch(() => {});
  }
}

let started = false;
export function startBridge() {
  if (started) return;
  started = true;

  void listen<PlayerCmd>("player://cmd", ({ payload }) => {
    if (payload === "toggle") togglePlay();
    else if (payload === "next") void nextTrack();
    else if (payload === "prev") void prevTrack();
    else if (payload === "like") likeCurrent();
  }).catch(() => {});
  void listen("player://hello", () => broadcast(true)).catch(() => {});

  usePlayer.subscribe(() => broadcast());
  useLikes.subscribe(() => broadcast());

  const syncTray = () =>
    void invoke("set_close_to_tray", { enabled: useSettings.getState().closeToTray }).catch(() => {});
  syncTray();
  useSettings.subscribe((s, prev) => s.closeToTray !== prev.closeToTray && syncTray());
}
