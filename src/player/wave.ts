/**
 * «Моя волна» (docs/PROJECT.md, 4.5): сессия ротора и добор треков на диск.
 */
import { type RawTrack, type Track, postJson, toTrack } from "../api/ym";
import { DISC_CAPACITY_MS } from "./press";

const STATION = "user:onyourwave";
const FROM = "desktop-ym-vinil-wave";

type Session = {
  radioSessionId: string;
  batchId: string;
  sequence?: { track?: RawTrack }[];
};

let sessionId: string | null = null;
let batchId: string | null = null;
/** Все полученные за сессию треки (очередь для ротора и защита от повторов). */
let queue: string[] = [];
/** Треки, не влезшие на прошлый диск, — уйдут на следующий. */
let leftover: Track[] = [];

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
  for (const item of s.sequence ?? []) {
    const t = item.track ? toTrack(item.track) : null;
    if (!t || queue.includes(t.queueId ?? t.id)) continue;
    queue.push(t.queueId ?? t.id);
    out.push(t);
  }
  return out;
}

async function nextBatch(): Promise<Track[]> {
  if (!sessionId) {
    return accept(
      await postJson<Session>("/rotor/session/new", {
        seeds: [STATION],
        queue: [],
        includeTracksInResponse: true,
        includeWaveModel: true,
        interactive: true,
      }),
    );
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
