/**
 * Движок проигрывателя (docs/PROJECT.md, 4.2–4.3).
 * Держит <audio>, очередь стороны и «физику»: мотор, иглу, разгон, конец стороны.
 * Состояние публикуется в zustand-стор `usePlayer`, UI только читает его и зовёт действия.
 */
import { create } from "zustand";
import { type RecordItem, type Track, fetchRecordTracks, trackBytes, trackUrl } from "../api/ym";
import { useSettings } from "../settings";
import { DEFAULT_LABEL, coverColor, labelColor, vinylTint } from "./color";
import { crackle } from "./crackle";
import { attachMedia, audioCtx, wowFactor } from "./fx";
import { pressWaveDisc, resetWave, waveFeedback } from "./wave";
import { dislike, toggleLike } from "./likes";
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
  /** Растёт при каждом перевороте — UI проигрывает анимацию. */
  flipCount: number;
  /** Цвет лейбла и оттенок винила под обложку. */
  labelColor: string;
  vinylTint: string;
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
  flipCount: 0,
  labelColor: DEFAULT_LABEL,
  vinylTint: "#0c0c0c",
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

/**
 * Скорость = базовая (33/45/78, разгон, торможение) × «плавание» диска.
 * Плавание пересчитывается ~25 раз в секунду, пока игла на пластинке.
 */
let baseRate = 1;
function setBaseRate(r: number) {
  baseRate = Math.max(0.0625, r);
  audio.playbackRate = Math.max(0.0625, baseRate * wowFactor(performance.now() / 1000));
}
setInterval(() => {
  if (!audio.paused) audio.playbackRate = Math.max(0.0625, baseRate * wowFactor(performance.now() / 1000));
}, 40);

/**
 * Громкость = ручка на деке × текущее затухание (LIFT, торможение мотора).
 */
let fade = 1;
function setFade(f: number) {
  fade = Math.min(1, Math.max(0, f));
  audio.volume = Math.min(1, Math.max(0, useSettings.getState().volume * fade));
}
useSettings.subscribe((s, prev) => {
  if (s.volume !== prev.volume) setFade(fade);
});

/** Будит звук по жесту пользователя: контекст Web Audio и цепочка «звука винила». */
function wake() {
  try {
    audioCtx();
    attachMedia(audio);
  } catch {
    /* без Web Audio звук всё равно играет напрямую */
  }
}

/**
 * Источник трека: mp3 целиком из Rust → blob (для Web Audio без CORS).
 * Если не вышло — прямая ссылка на хранилище.
 */
const srcCache = new Map<string, Promise<string>>();
const blobUrls: string[] = [];
function getSource(id: string): Promise<string> {
  let p = srcCache.get(id);
  if (!p) {
    p = trackBytes(id)
      .then((buf) => {
        const url = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
        blobUrls.push(url);
        // Держим в памяти только несколько последних треков.
        while (blobUrls.length > 4) {
          const old = blobUrls.shift()!;
          if (audio.src !== old) URL.revokeObjectURL(old);
          for (const [k, v] of srcCache) void v.then((u) => u === old && srcCache.delete(k));
        }
        return url;
      })
      .catch(() => trackUrl(id));
    srcCache.set(id, p);
    p.catch(() => srcCache.delete(id));
  }
  return p;
}

function prefetchNext() {
  const s = st();
  const next = currentSide(s)?.tracks[s.trackIdx + 1];
  if (next) void getSource(next.id).catch(() => {});
}

const isWave = () => st().record?.kind === "wave";

async function playCurrent(myGen: number, ramp: boolean) {
  const s = st();
  const track = currentTrack(s);
  if (!track) return;
  let url: string;
  try {
    url = await getSource(track.id);
  } catch (e) {
    if (myGen !== gen) return;
    set({ error: `Не удалось получить трек (${String(e)}). Нужна активная подписка Плюс.` });
    await stopMotor();
    return;
  }
  if (myGen !== gen || st().needle !== "down") return;

  soundingId = null;
  if (audio.src !== url) audio.src = url;
  audio.currentTime = st().positionMs / 1000;
  setFade(1);
  const rate = SPEED_RATE[st().speed];
  setBaseRate(ramp ? rate * 0.82 : rate);
  try {
    await audio.play();
  } catch (e) {
    if (myGen === gen) set({ error: `Не удалось воспроизвести: ${String(e)}` });
    return;
  }
  if (myGen !== gen) return;
  soundingId = track.id;
  if (isWave() && st().positionMs < 1000) waveFeedback("trackStarted", track);
  crackle.set("play");
  if (ramp) {
    await tween(450, (k) => {
      if (myGen === gen) setBaseRate(rate * (0.82 + 0.18 * k));
    });
  }
  prefetchNext();
}

/** Трек бросили посреди — сообщаем волне. */
function reportSkip() {
  const s = st();
  const track = currentTrack(s);
  if (isWave() && track && s.needle === "down" && s.positionMs > 0) {
    waveFeedback("skip", track, s.positionMs / 1000);
  }
}

/**
 * Какой трек сейчас реально звучит. Пока игла переставляется на другой трек,
 * старый <audio> ещё присылает timeupdate — без этой проверки его позиция
 * попадала в новый трек, и тот начинался не с начала.
 */
let soundingId: string | null = null;

audio.addEventListener("timeupdate", () => {
  const s = st();
  if (s.needle !== "down" || audio.paused || soundingId !== currentTrack(s)?.id) return;
  set({ positionMs: audio.currentTime * 1000 });
});

audio.addEventListener("ended", () => void onTrackEnded());

async function onTrackEnded() {
  const myGen = ++gen;
  const s = st();
  const side = currentSide(s);
  if (!side) return;
  const finished = currentTrack(s);
  if (isWave() && finished) waveFeedback("trackFinished", finished, finished.durationMs / 1000);

  soundingId = null;
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

  if (useSettings.getState().autoFlip && st().sides.length > 0) {
    await wait(600);
    if (myGen !== gen) return;
    await flip();
    await wait(FLIP_MS);
    if (st().record && !st().loading) await startMotor();
  }
}

/** Длительность анимации переворота (синхронно с Turntable). */
export const FLIP_MS = 750;

// ── Действия ────────────────────────────────────────────

function hardStop() {
  gen++;
  soundingId = null;
  audio.pause();
  crackle.set("off");
}

export async function load(record: RecordItem) {
  hardStop();
  const myGen = gen;
  set({ ...initial, speed: st().speed, record, loading: true });
  if (record.kind === "wave") set({ labelColor: WAVE_LABEL, vinylTint: "#0d0a12" });
  if (record.cover) {
    void coverColor(record.cover).then((c) => {
      if (c && st().record?.key === record.key) set({ labelColor: labelColor(c), vinylTint: vinylTint(c) });
    });
  }
  try {
    let volumes: Track[][];
    if (record.kind === "wave") {
      resetWave();
      volumes = [await pressWaveDisc()];
    } else {
      volumes = await fetchRecordTracks(record);
    }
    if (myGen !== gen) return;
    const sides = allSides(press(volumes.filter((v) => v.length > 0)));
    set({
      loading: false,
      sides,
      error: sides.length ? null : "На этой пластинке нет доступных треков.",
    });
  } catch (e) {
    if (myGen === gen) set({ loading: false, error: `Не удалось загрузить треки: ${String(e)}` });
  }
}

/** Цвет лейбла «Моей волны». */
const WAVE_LABEL = "#3b2a6b";

export function eject() {
  reportSkip();
  hardStop();
  audio.removeAttribute("src");
  set({ ...initial, speed: st().speed });
}

export async function startMotor() {
  wake();
  const s = st();
  if (s.motor || s.loading || !currentTrack(s)) return;
  const myGen = ++gen;
  set({ motor: true, sideEnded: false, error: null });
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
    const from = baseRate;
    crackle.set("off");
    await tween(900, (k) => {
      setBaseRate(from * (1 - 0.75 * k));
      setFade(1 - k * k);
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
  wake();
  const s = st();
  if (s.needle === "down") {
    const myGen = ++gen;
    crackle.set("off");
    await tween(160, (k) => setFade(1 - k));
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
  wake();
  const s = st();
  const side = currentSide(s);
  if (!side || i < 0 || i >= side.tracks.length) return;
  if (i !== s.trackIdx) reportSkip();
  const myGen = ++gen;
  soundingId = null;
  audio.pause();
  set({ trackIdx: i, positionMs: 0, runout: false, sideEnded: false });
  if (s.needle === "down") {
    crackle.set("gap");
    await wait(250);
    if (myGen !== gen) return;
    await playCurrent(myGen, false);
  }
  // Иначе (игла поднята или мотор выключен) просто запомнили, откуда играть.
}

/** ▶▶ — следующий трек; на последнем — следующая сторона. */
export async function nextTrack() {
  const s = st();
  const side = currentSide(s);
  if (!side) return;
  if (s.trackIdx + 1 < side.tracks.length) return seekTrack(s.trackIdx + 1);
  reportSkip();
  await goToSide((s.sideIdx + 1) % Math.max(1, s.sides.length), 0, true);
}

/** ♥ на деке. */
export function likeCurrent() {
  const t = currentTrack(st());
  if (t) void toggleLike(t);
}

/** ✕ на деке: дизлайк и сразу следующий трек. */
export async function dislikeCurrent() {
  const t = currentTrack(st());
  if (!t) return;
  void dislike(t);
  await nextTrack();
}

/** ◀◀ — в начало трека (если прошло > 3 с), иначе предыдущий трек или конец прошлой стороны. */
export async function prevTrack() {
  const s = st();
  if (s.positionMs > 3000 || (s.trackIdx === 0 && s.sideIdx === 0)) return seekTrack(s.trackIdx);
  if (s.trackIdx > 0) return seekTrack(s.trackIdx - 1);
  const prev = s.sides[s.sideIdx - 1];
  await goToSide(s.sideIdx - 1, prev.tracks.length - 1, false);
}

export function setSpeed(speed: Speed) {
  set({ speed });
  if (!audio.paused) setBaseRate(SPEED_RATE[speed]);
}

export function cycleSpeed() {
  const order: Speed[] = [33, 45, 78];
  setSpeed(order[(order.indexOf(st().speed) + 1) % order.length]);
}

/** Для волны: перед переходом с последней стороны прессуем следующий диск. */
async function ensureNextDisc(): Promise<boolean> {
  const s = st();
  if (!isWave() || s.sideIdx + 1 < s.sides.length) return true;
  set({ loading: true });
  try {
    const tracks = await pressWaveDisc();
    const more = allSides(press([tracks], st().sides.length));
    set({ loading: false, sides: [...st().sides, ...more] });
    return more.length > 0;
  } catch (e) {
    set({ loading: false, error: `Волна не ответила: ${String(e)}` });
    return false;
  }
}

/** Переход на сторону (с анимацией переворота); если мотор крутился — играем дальше. */
async function goToSide(sideIdx: number, trackIdx: number, forward: boolean) {
  const wasPlaying = st().motor;
  if (wasPlaying) await stopMotor();
  if (forward && !(await ensureNextDisc())) return;
  if (forward && isWave() && sideIdx === 0 && st().sides.length > 1) sideIdx = st().sideIdx + 1;
  gen++;
  set({
    sideIdx,
    trackIdx,
    positionMs: 0,
    sideEnded: false,
    runout: false,
    flipCount: st().flipCount + 1,
  });
  await wait(FLIP_MS);
  if (wasPlaying) await startMotor();
}

/** Перевернуть пластинку / поставить следующий диск. После последней стороны — снова A (у волны — новый диск). */
export async function flip() {
  const s = st();
  if (s.sides.length === 0) return;
  if (s.motor) await stopMotor();
  if (!(await ensureNextDisc())) return;
  const sides = st().sides;
  set({
    sideIdx: (st().sideIdx + 1) % sides.length,
    trackIdx: 0,
    positionMs: 0,
    sideEnded: false,
    runout: false,
    flipCount: st().flipCount + 1,
  });
}

/**
 * Клик по треку на обратной стороне конверта.
 * Та же сторона — игла на трек; другая — переворот (если мотор крутился, играем дальше).
 */
export async function playFrom(sideIdx: number, trackIdx: number) {
  const s = st();
  if (sideIdx === s.sideIdx) {
    await seekTrack(trackIdx);
    return;
  }
  reportSkip();
  await goToSide(sideIdx, trackIdx, false);
}

/** Подпись для кнопки переворота: та же пластинка или следующий диск. */
export function flipLabel(s: PlayerState): string {
  const wave = s.record?.kind === "wave";
  if (s.sides.length <= 1 && !wave) return "Сначала";
  const nextIdx = s.sideIdx + 1;
  if (nextIdx >= s.sides.length) return wave ? "Следующий диск волны" : "Снова сторона A";
  return Math.floor(nextIdx / 2) === Math.floor(s.sideIdx / 2)
    ? `Перевернуть на сторону ${s.sides[nextIdx].letter}`
    : `Следующий диск (${s.sides[nextIdx].letter})`;
}

// ── Системный плеер (Media Session) ─────────────────────

function setupMediaSession() {
  const ms = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
  if (!ms) return;

  let lastKey = "";
  usePlayer.subscribe((s) => {
    const track = currentTrack(s);
    const key = `${s.record?.key}|${s.sideIdx}|${s.trackIdx}`;
    if (track && s.record && key !== lastKey) {
      lastKey = key;
      ms.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artists,
        album: `${s.record.title} · сторона ${currentSide(s)?.letter ?? ""}`,
        artwork: s.record.cover ? [{ src: s.record.cover, sizes: "400x400", type: "image/jpeg" }] : [],
      });
    }
    if (!s.record) {
      lastKey = "";
      ms.metadata = null;
    }
    ms.playbackState = s.needle === "down" ? "playing" : s.record ? "paused" : "none";
  });

  const handlers: [MediaSessionAction, () => void][] = [
    [
      "play",
      () => {
        const s = st();
        if (s.needle === "lifted") void toggleLift();
        else if (!s.motor) void startMotor();
      },
    ],
    ["pause", () => st().needle === "down" && void toggleLift()],
    ["stop", () => void stopMotor()],
    ["nexttrack", () => void nextTrack()],
    ["previoustrack", () => void prevTrack()],
  ];
  for (const [action, fn] of handlers) {
    try {
      ms.setActionHandler(action, fn);
    } catch {
      /* действие не поддерживается этой платформой */
    }
  }
}

setupMediaSession();
