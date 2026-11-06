/**
 * «Моя волна» (docs/PROJECT.md, 4.5): сессия ротора и добор треков на диск.
 */
import { type RawTrack, type Track, postJson, toTrack } from "../api/ym";
import { useSettings } from "../settings";
import { markLiked } from "./likes";
import { DISC_CAPACITY_MS } from "./press";

const STATION = "user:onyourwave";

/** Настройки волны (docs/PROJECT.md, 4.11). Пустая строка — «любое». */
export type WaveSettings = {
  diversity: "" | "favorite" | "discover" | "popular";
  mood: "" | "active" | "fun" | "calm" | "sad";
  language: "" | "russian" | "not-russian" | "without-words";
};

export const WAVE_LABELS = {
  diversity: { "": "Любое", favorite: "Любимое", discover: "Незнакомое", popular: "Популярное" },
  mood: { "": "Любое", active: "Бодрое", fun: "Весёлое", calm: "Спокойное", sad: "Грустное" },
  language: { "": "Любой", russian: "Русский", "not-russian": "Иностранный", "without-words": "Без слов" },
} as const;

/** Сиды для сессии ротора: станция + выбранные настройки. */
export function waveSeeds(w: WaveSettings): string[] {
  const seeds = [STATION];
  if (w.diversity) seeds.push(`settingDiversity:${w.diversity}`);
  if (w.mood) seeds.push(`settingMoodEnergy:${w.mood}`);
  if (w.language) seeds.push(`settingLanguage:${w.language}`);
  return seeds;
}

/** Короткая подпись настроек для лейбла: «Бодрое · Без слов». */
export function waveCaption(w: WaveSettings): string {
  return [
    w.diversity && WAVE_LABELS.diversity[w.diversity],
    w.mood && WAVE_LABELS.mood[w.mood],
    w.language && WAVE_LABELS.language[w.language],
  ]
    .filter(Boolean)
    .join(" · ");
}
const FROM = "desktop-ym-vinil-wave";

type Session = {
  radioSessionId: string;
  batchId: string;
  sequence?: { track?: RawTrack; liked?: boolean }[];
};

let sessionId: string | null = null;
let batchId: string | null = null;
/** Все полученные за сессию треки (очередь для ротора и защита от повторов). */
let queue: string[] = [];
/** Треки, не влезшие на прошлый диск, — уйдут на следующий. */
let leftover: Track[] = [];

/** Новая сессия с текущими настройками; уже полученные треки не повторяются. */
export function restartWave() {
  sessionId = null;
  batchId = null;
  leftover = [];
}

export function resetWave() {
  sessionId = null;
  batchId = null;
  queue = [];
  leftover = [];
}

function accept(s: Session): Track[] {
  sessionId = s.radioSessionId ?? sessionId;
  batchId = s.batchId ?? batchId;
  const out: Track[] = [];
  markLiked((s.sequence ?? []).filter((i) => i.liked && i.track).map((i) => String(i.track!.id)));
  for (const item of s.sequence ?? []) {
    const t = item.track ? toTrack(item.track) : null;
    if (!t || queue.includes(t.queueId ?? t.id)) continue;
    queue.push(t.queueId ?? t.id);
    out.push(t);
  }
  return out;
}

const newSession = (seeds: string[]) =>
  postJson<Session>("/rotor/session/new", {
    seeds,
    queue: [],
    includeTracksInResponse: true,
    includeWaveModel: true,
    interactive: true,
  });

async function nextBatch(): Promise<Track[]> {
  if (!sessionId) {
    const seeds = waveSeeds(useSettings.getState().wave);
    try {
      return accept(await newSession(seeds));
    } catch (e) {
      // Яндекс не принял сиды настроек — волна без настроек, как раньше.
      if (seeds.length === 1) throw e;
      return accept(await newSession([STATION]));
    }
  }
  return accept(await postJson<Session>(`/rotor/session/${sessionId}/tracks`, { queue, feedbacks: [] }));
}

/** Набирает треков примерно на один диск (две стороны). */
export async function pressWaveDisc(): Promise<Track[]> {
  const out: Track[] = [];
  let total = 0;
  const pending = leftover;
  leftover = [];
  for (let i = 0; i < 8; i++) {
    const batch = i === 0 && pending.length ? pending : await nextBatch();
    if (batch.length === 0) break;
    for (const t of batch) {
      // Диск не больше ёмкости: лишнее — на следующий (кроме самого первого трека).
      if (out.length > 0 && total + t.durationMs > DISC_CAPACITY_MS) leftover.push(t);
      else {
        out.push(t);
        total += t.durationMs;
      }
    }
    if (leftover.length > 0 || total >= DISC_CAPACITY_MS * 0.9) break;
  }
  return out;
}

export type WaveEvent = "trackStarted" | "trackFinished" | "skip";

/** Фидбэк ротору — чтобы волна подстраивалась. Ошибки не мешают слушать. */
export function waveFeedback(type: WaveEvent, track: Track, playedSec = 0) {
  if (!sessionId) return;
  void postJson(`/rotor/session/${sessionId}/feedback`, {
    batch_id: batchId,
    from: FROM,
    event: {
      type,
      timestamp: new Date().toISOString(),
      from: FROM,
      trackId: track.queueId ?? track.id,
      totalPlayedSeconds: playedSec,
    },
  }).catch(() => {});
}
