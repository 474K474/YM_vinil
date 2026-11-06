/**
 * Голосовое управление v1 — по кнопке (docs/PROJECT.md, 4.13).
 * Зажал кнопку на деке или правый Ctrl → говоришь → отпустил → команда выполняется.
 */
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { searchBest } from "../api/catalog";
import {
  cueTrack,
  dislikeCurrent,
  duck,
  flip,
  likeCurrent,
  nextTrack,
  prevTrack,
  startMotor,
  stopMotor,
  toggleLift,
  usePlayer,
  whenLoaded,
} from "../player/engine";
import { updateSettings, useSettings } from "../settings";
import { useStore } from "../store";
import type { RecordItem } from "../api/ym";
import { type VoiceCommand, decide } from "./commands";
import { prepare, startListening, stopListening } from "./recognizer";

type Phase = "idle" | "downloading" | "loading" | "listening" | "thinking" | "done" | "error";

type VoiceState = {
  installed: boolean | null;
  phase: Phase;
  /** Живой текст или итог: что услышали. */
  heard: string;
  /** Что сделали / почему не получилось. */
  message: string;
  progress: number;
};

export const useVoice = create<VoiceState>(() => ({
  installed: null,
  phase: "idle",
  heard: "",
  message: "",
  progress: 0,
}));
const set = (p: Partial<VoiceState>) => useVoice.setState(p);

let hideTimer: ReturnType<typeof setTimeout> | null = null;
function finish(phase: "done" | "error", message: string) {
  set({ phase, message });
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => set({ phase: "idle", heard: "", message: "" }), 4500);
}

export async function refreshInstalled() {
  const installed = await invoke<boolean>("voice_model_installed").catch(() => false);
  set({ installed });
  return installed;
}

export async function downloadModel() {
  set({ phase: "downloading", progress: 0, message: "" });
  const un = await listen<number>("voice://progress", ({ payload }) => set({ progress: payload }));
  try {
    await invoke("voice_model_download");
    set({ installed: true, phase: "idle", progress: 1 });
    void prepare().catch(() => {});
  } catch (e) {
    finish("error", `Не удалось скачать модель: ${String(e)}`);
  } finally {
    un();
  }
}

export async function deleteModel() {
  await invoke("voice_model_delete").catch(() => {});
  set({ installed: false });
}

// ── Нажатие и отпускание ─────────────────────────────────

let pressed = false;

export async function press() {
  if (pressed || !useSettings.getState().voice) return;
  if (!(useVoice.getState().installed ?? (await refreshInstalled()))) {
    finish("error", "Сначала скачайте модель голоса в настройках");
    return;
  }
  pressed = true;
  if (hideTimer) clearTimeout(hideTimer);
  set({ phase: "loading", heard: "", message: "" });
  duck(true);
  try {
    await startListening((text) => set({ heard: text }));
    // Пока грузилась модель, кнопку могли уже отпустить.
    if (!pressed) {
      set({ phase: "listening" });
      await release();
      return;
    }
    set({ phase: "listening" });
  } catch (e) {
    pressed = false;
    duck(false);
    const msg = String(e).includes("NotAllowed") ? "Нет доступа к микрофону" : `Голос не запустился: ${String(e)}`;
    finish("error", msg);
  }
}

export async function release() {
  if (!pressed && useVoice.getState().phase !== "listening") return;
  pressed = false;
  if (useVoice.getState().phase === "loading") return; // доделает press()
  set({ phase: "thinking" });
  const u = await stopListening();
  duck(false);
  if (!u || !u.free.trim()) {
    finish("error", "Ничего не услышал — зажмите кнопку и говорите");
    return;
  }
  const cmd = decide(u.free, u.grammar);
  set({ heard: u.grammar && cmd.kind !== "play" && cmd.kind !== "unknown" ? u.grammar.text : u.free });
  try {
    finish("done", await execute(cmd));
  } catch (e) {
    finish("error", `Не получилось: ${String(e)}`);
  }
}

// ── Исполнение ───────────────────────────────────────────

const shelfItem = (kind: RecordItem["kind"]) => useStore.getState().shelf.find((r) => r.kind === kind);

async function putAndPlay(record: RecordItem, trackId?: string) {
  const store = useStore.getState();
  if (store.onPlatter?.key !== record.key) {
    store.putOnPlatter(record);
    if (!(await whenLoaded())) throw new Error("пластинка не загрузилась");
  }
  if (trackId && !(await cueTrack(trackId))) {
    // Трек мог не попасть на пластинку (недоступен) — играем с начала.
  }
  if (!usePlayer.getState().motor) await startMotor();
}

async function execute(cmd: VoiceCommand): Promise<string> {
  const p = usePlayer.getState();
  const vol = useSettings.getState().volume;
  switch (cmd.kind) {
    case "pause":
      if (p.needle === "down") await toggleLift();
      return "Пауза";
    case "resume":
      if (p.needle === "lifted") await toggleLift();
      else if (!p.motor && p.record) await startMotor();
      return "Играем";
    case "stop":
      await stopMotor();
      return "Мотор остановлен";
    case "next":
      await nextTrack();
      return "Следующий трек";
    case "prev":
      await prevTrack();
      return "Предыдущий трек";
    case "flip":
      await flip();
      return "Переворачиваю";
    case "louder":
      updateSettings({ volume: Math.min(1, vol + 0.15) });
      return `Громкость ${Math.round(Math.min(1, vol + 0.15) * 100)}%`;
    case "quieter":
      updateSettings({ volume: Math.max(0, vol - 0.15) });
      return `Громкость ${Math.round(Math.max(0, vol - 0.15) * 100)}%`;
    case "like":
      likeCurrent();
      return "Отметил «Мне нравится»";
    case "dislike":
      await dislikeCurrent();
      return "Не нравится — пропускаю";
    case "wave":
    case "chart":
    case "likes": {
      const r = shelfItem(cmd.kind);
      if (!r) return "Не нашёл на полке";
      await putAndPlay(r);
      return `Ставлю: ${r.title}`;
    }
    case "play": {
      // Свои плейлисты ищем сначала на полке.
      if (cmd.scope === "playlist" || cmd.scope === "any") {
        const q = cmd.query.toLowerCase();
        const own = useStore
          .getState()
          .shelf.find((r) => (r.kind === "playlist" || r.kind === "likes") && r.title.toLowerCase().includes(q));
        if (own) {
          await putAndPlay(own);
          return `Ставлю плейлист: ${own.title}`;
        }
      }
      const pick = await searchBest(cmd.query, cmd.scope);
      if (!pick) return `Не нашёл «${cmd.query}»`;
      await putAndPlay(pick.record, pick.trackId);
      return `Ставлю: ${pick.label}`;
    }
    case "unknown":
      return "Не понял команду. Например: «включи Кино», «пауза», «дальше»";
  }
}

// ── Горячая клавиша ─────────────────────────────────────

let started = false;
export function startVoice() {
  if (started) return;
  started = true;
  // Модель грузится в фоне заранее, чтобы первое нажатие срабатывало сразу.
  const warm = () =>
    void refreshInstalled().then((ok) => {
      if (ok && useSettings.getState().voice) setTimeout(() => void prepare().catch(() => {}), 1500);
    });
  warm();
  useSettings.subscribe((s, prev) => s.voice && !prev.voice && warm());
  // Зажатый правый Ctrl — говорим (в окне приложения).
  window.addEventListener("keydown", (e) => {
    if (e.code === "ControlRight" && !e.repeat) void press();
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "ControlRight") void release();
  });
  // Окно потеряло фокус с зажатой клавишей — считаем, что отпустили.
  window.addEventListener("blur", () => pressed && void release());
}
