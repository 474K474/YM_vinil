/**
 * Статус в Discord (docs/PROJECT.md, 4.11): «Слушает YM Vinil».
 * Шлём в Rust только смену трека, стороны, скорости или паузы — не каждую секунду.
 */
import { invoke } from "@tauri-apps/api/core";
import { SPEED_RATE, currentSide, currentTrack, usePlayer } from "./player/engine";
import { useSettings } from "./settings";
import { useStore } from "./store";

type Presence = {
  title: string;
  artist: string;
  record: string;
  cover: string | null;
  side: string;
  startMs: number;
  endMs: number;
};

let lastKey = "";
let timer: ReturnType<typeof setTimeout> | null = null;

function compute(): { key: string; presence: Presence | null } {
  if (!useSettings.getState().discord) return { key: "off", presence: null };
  const p = usePlayer.getState();
  const track = currentTrack(p);
  const record = useStore.getState().onPlatter;
  if (p.needle !== "down" || !track || !record || p.runout) return { key: "idle", presence: null };

  const rate = SPEED_RATE[p.speed];
  // Ключ без позиции: позиция сама тикает в Discord по таймеру.
  const key = [track.id, p.sideIdx, p.trackIdx, p.speed, record.key].join("|");
  const now = Date.now();
  const startMs = Math.round(now - p.positionMs / rate);
  return {
    key,
    presence: {
      title: track.title,
      artist: track.artists,
      record: record.title,
      cover: record.cover ?? null,
      side: currentSide(p)?.letter ?? "A",
      startMs,
      endMs: Math.round(startMs + track.durationMs / rate),
    },
  };
}

function push() {
  const { key, presence } = compute();
  if (key === lastKey) return;
  lastKey = key;
  void invoke("discord_set", { presence }).catch(() => {});
}

/** Небольшая задержка — чтобы при переключении треков не дёргать Discord. */
function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(push, 600);
}

let started = false;
export function startDiscord() {
  if (started) return;
  started = true;
  usePlayer.subscribe(schedule);
  useSettings.subscribe((s, prev) => s.discord !== prev.discord && schedule());
  useStore.subscribe((s, prev) => s.onPlatter !== prev.onPlatter && schedule());
}

export const discordAvailable = () => invoke<boolean>("discord_available").catch(() => false);
