/**
 * Движок проигрывателя (docs/PROJECT.md, 4.2–4.3).
 * Держит <audio>, очередь стороны и «физику»: мотор, иглу, разгон, конец стороны.
 * Состояние публикуется в zustand-стор `usePlayer`, UI только читает его и зовёт действия.
 */
import { create } from "zustand";
import { type RecordItem, type Track, fetchRecordTracks, trackUrl } from "../api/ym";
import { crackle } from "./crackle";
import { RUNOUT_R, grooveRadius } from "./geometry";
import { type Side, allSides, press, trackOffsets } from "./press";

export type Speed = 33 | 45 | 78;
/** 45 и 78 ускоряют звук вместе с высотой тона, как на настоящем виниле. */
export const SPEED_RATE: Record<Speed, number> = { 33: 1, 45: 45 / 33.33, 78: 78 / 33.33 };
export type Needle = "rest" | "moving" | "down" | "lifted";

export type PlayerState = {
  record: RecordItem | null;
  loading: boolean;
  error: string | null;
  sides: Side[];
  sideIdx: number;
  trackIdx: number;
  /** Позиция внутри текущего трека. */
  positionMs: number;
  motor: boolean;
  speed: Speed;
  needle: Needle;
  /** Игла в выводной канавке. */
  runout: boolean;
  /** Сторона доиграна — ждём «Перевернуть». */
  sideEnded: boolean;
};

const initial: PlayerState = {
  record: null,
  loading: false,
  error: null,
  sides: [],
  sideIdx: 0,
  trackIdx: 0,
  positionMs: 0,
  motor: false,
  speed: 33,
  needle: "rest",
  runout: false,
  sideEnded: false,
};

export const usePlayer = create<PlayerState>(() => initial);
const st = () => usePlayer.getState();
const set = (p: Partial<PlayerState>) => usePlayer.setState(p);

// ── Вычисляемое ─────────────────────────────────────────

export const currentSide = (s: PlayerState): Side | null => s.sides[s.sideIdx] ?? null;
export const currentTrack = (s: PlayerState): Track | null => currentSide(s)?.tracks[s.trackIdx] ?? null;

/** Доля пройденной стороны 0…1. */
export function sideProgress(s: PlayerState): number {
  const side = currentSide(s);
  if (!side || side.durationMs === 0) return 0;
  const offset = trackOffsets(side)[s.trackIdx] ?? 0;
  return (offset + s.positionMs) / side.durationMs;
}

/** Радиус, на котором стоит игла; null — тонарм на стойке. */
export function armRadius(s: PlayerState): number | null {
  if (s.needle === "rest") return null;
  if (s.runout) return RUNOUT_R;
  return grooveRadius(sideProgress(s));
}

// ── Звук ────────────────────────────────────────────────

const audio = new Audio();
audio.preload = "auto";
audio.preservesPitch = false;

/** Любая новая команда отменяет «длинные» сценарии предыдущих (разгон, пауза между треками). */
let gen = 0;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function tween(ms: number, step: (k: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      step(k);
      if (k < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

const urlCache = new Map<string, Promise<string>>();
function getUrl(id: string): Promise<string> {
  let p = urlCache.get(id);
  if (!p) {
    p = trackUrl(id);
    urlCache.set(id, p);
    // Ссылки на хранилище живут недолго — не держим их дольше пары минут.
    setTimeout(() => urlCache.delete(id), 120_000);
    p.catch(() => urlCache.delete(id));
  }
  return p;
}

function prefetchNext() {
  const s = st();
  const next = currentSide(s)?.tracks[s.trackIdx + 1];
  if (next) void getUrl(next.id).catch(() => {});
}

async function playCurrent(myGen: number, ramp: boolean) {
  const s = st();
  const track = currentTrack(s);
  if (!track) return;
  let url: string;
  try {
    url = await getUrl(track.id);
  } catch (e) {
    if (myGen !== gen) return;
    set({ error: `Не удалось получить трек (${String(e)}). Нужна активная подписка Плюс.` });
    await stopMotor();
    return;
  }
  if (myGen !== gen || st().needle !== "down") return;

  if (audio.src !== url) audio.src = url;
  audio.currentTime = st().positionMs / 1000;
  audio.volume = 1;
  const rate = SPEED_RATE[st().speed];
  audio.playbackRate = ramp ? rate * 0.82 : rate;
  try {
    await audio.play();
  } catch (e) {
    if (myGen === gen) set({ error: `Не удалось воспроизвести: ${String(e)}` });
    return;
  }
  crackle.set("play");
  if (ramp) {
    await tween(450, (k) => {
      if (myGen === gen) audio.playbackRate = rate * (0.82 + 0.18 * k);
    });
  }
  prefetchNext();
}

audio.addEventListener("timeupdate", () => {
  if (st().needle === "down") set({ positionMs: audio.currentTime * 1000 });
});

audio.addEventListener("ended", () => void onTrackEnded());

async function onTrackEnded() {
  const myGen = ++gen;
  const s = st();
  const side = currentSide(s);
  if (!side) return;

  if (s.trackIdx + 1 < side.tracks.length) {
    // Пауза между треками: игла скользит по гладкому кольцу, треск громче.
    set({ trackIdx: s.trackIdx + 1, positionMs: 0 });
    crackle.set("gap");
    await wait(1400);
    if (myGen !== gen || st().needle !== "down") return;
    await playCurrent(myGen, false);
    return;
  }

  // Конец стороны: выводная канавка, затем автовозврат и остановка.
  set({ runout: true });
  crackle.set("gap");
  await wait(2600);
  if (myGen !== gen) return;
  crackle.set("off");
  set({ needle: "rest", runout: false, sideEnded: true, positionMs: 0, trackIdx: 0 });
  await wait(700);
  if (myGen !== gen) return;
  set({ motor: false });
}

// ── Действия ────────────────────────────────────────────

function hardStop() {
  gen++;
  audio.pause();
  crackle.set("off");
}

export async function load(record: RecordItem) {
  hardStop();
  const myGen = gen;
  set({ ...initial, speed: st().speed, record, loading: true });
  try {
    const volumes = await fetchRecordTracks(record);
    if (myGen !== gen) return;
    const sides = allSides(press(volumes));
    set({
      loading: false,
      sides,
      error: sides.length ? null : "На этой пластинке нет доступных треков.",
    });
  } catch (e) {
    if (myGen === gen) set({ loading: false, error: `Не удалось загрузить треки: ${String(e)}` });
  }
}

export function eject() {
  hardStop();
  audio.removeAttribute("src");
  set({ ...initial, speed: st().speed });
}

export async function startMotor() {
  const s = st();
  if (s.motor || s.loading || !currentTrack(s)) return;
  const myGen = ++gen;
  set({ motor: true, sideEnded: false, error: null });
  crackle.set("off"); // создаёт AudioContext по жесту пользователя
  await wait(900); // разгон диска
  if (myGen !== gen) return;
  set({ needle: "moving" });
  await wait(800); // тонарм подъезжает к бороздке
  if (myGen !== gen) return;
  set({ needle: "down" });
  await playCurrent(myGen, true);
}

export async function stopMotor() {
  const s = st();
  if (!s.motor) return;
  const myGen = ++gen;
  if (s.needle === "down" && !audio.paused) {
    // Мотор выключили под иглой — звук «проседает», как при торможении диска.
    const from = audio.playbackRate;
    crackle.set("off");
    await tween(900, (k) => {
      audio.playbackRate = Math.max(0.0625, from * (1 - 0.75 * k));
      audio.volume = 1 - k * k;
    });
  }
  if (myGen !== gen) return;
  audio.pause();
  crackle.set("off");
  // Следующий запуск — с начала текущего трека.
  set({ motor: false, needle: "rest", runout: false, positionMs: 0 });
}

export const toggleMotor = () => (st().motor ? stopMotor() : startMotor());

export async function toggleLift() {
  const s = st();
  if (s.needle === "down") {
    const myGen = ++gen;
    crackle.set("off");
    await tween(160, (k) => (audio.volume = 1 - k));
    if (myGen !== gen) return;
    audio.pause();
    set({ needle: "lifted" });
  } else if (s.needle === "lifted" && s.motor) {
    const myGen = ++gen;
    set({ needle: "down" });
    await playCurrent(myGen, false);
  }
}

/** Клик по бороздке — игла на начало трека `i`. */
export async function seekTrack(i: number) {
  const s = st();
  const side = currentSide(s);
  if (!side || i < 0 || i >= side.tracks.length) return;
  const myGen = ++gen;
  audio.pause();
  set({ trackIdx: i, positionMs: 0, runout: false });
  if (s.needle === "down") {
    crackle.set("gap");
    await wait(250);
    if (myGen !== gen) return;
    await playCurrent(myGen, false);
  }
  // Иначе (игла поднята или мотор выключен) просто запомнили, откуда играть.
}

export function setSpeed(speed: Speed) {
  set({ speed });
  if (!audio.paused) audio.playbackRate = SPEED_RATE[speed];
}

export function cycleSpeed() {
  const order: Speed[] = [33, 45, 78];
  setSpeed(order[(order.indexOf(st().speed) + 1) % order.length]);
}

/** Перевернуть пластинку / поставить следующий диск. После последней стороны — снова A. */
export async function flip() {
  const s = st();
  if (s.sides.length === 0) return;
  if (s.motor) await stopMotor();
  set({
    sideIdx: (s.sideIdx + 1) % s.sides.length,
    trackIdx: 0,
    positionMs: 0,
    sideEnded: false,
    runout: false,
  });
}

/** Подпись для кнопки переворота: та же пластинка или следующий диск. */
export function flipLabel(s: PlayerState): string {
  if (s.sides.length <= 1) return "Сначала";
  const next = (s.sideIdx + 1) % s.sides.length;
  if (next === 0) return "Снова сторона A";
  return Math.floor(next / 2) === Math.floor(s.sideIdx / 2)
    ? `Перевернуть на сторону ${s.sides[next].letter}`
    : `Следующий диск (${s.sides[next].letter})`;
}
