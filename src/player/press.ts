/**
 * «Пресс»: превращает треки в пластинки (docs/PROJECT.md, раздел 4.1).
 * Чистые функции без React и API — покрыты тестами в press.test.ts.
 */
import type { Track } from "../api/ym";

/** Целевая длина стороны. */
export const SIDE_TARGET_MS = 23 * 60_000;
/** Ёмкость одного диска (две стороны). */
export const DISC_CAPACITY_MS = SIDE_TARGET_MS * 2;

export type Side = {
  /** Буква стороны: A, B, C… сквозь все диски. */
  letter: string;
  tracks: Track[];
  durationMs: number;
};

export type Disc = { sides: [Side, Side] };

const total = (tracks: Track[]) => tracks.reduce((s, t) => s + t.durationMs, 0);

/**
 * Делит треки на последовательные группы, каждая не длиннее `capacity`
 * (кроме случая, когда один трек сам длиннее — он идёт отдельно).
 * Группы выравниваются по длительности: сначала считаем нужное число групп,
 * затем жадно режем по равной доле.
 */
export function splitEvenly(tracks: Track[], capacity: number): Track[][] {
  if (tracks.length === 0) return [];
  const sum = total(tracks);
  let groups = Math.max(1, Math.ceil(sum / capacity));

  for (; groups <= tracks.length; groups++) {
    const target = sum / groups;
    const out: Track[][] = [];
    let cur: Track[] = [];
    let curMs = 0;
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      const left = tracks.length - i;
      const groupsLeft = groups - out.length;
      // Начинаем новую группу, если так ближе к целевой доле
      // или если треков осталось ровно столько, сколько групп.
      const overshoot = curMs + t.durationMs - target;
      const shouldBreak =
        cur.length > 0 &&
        groupsLeft > 1 &&
        (left < groupsLeft || overshoot > target - curMs);
      if (shouldBreak) {
        out.push(cur);
        cur = [];
        curMs = 0;
      }
      cur.push(t);
      curMs += t.durationMs;
    }
    out.push(cur);
    if (out.every((g) => g.length === 1 || total(g) <= capacity)) return out;
  }
  return tracks.map((t) => [t]);
}

/** Делит треки диска на две стороны с максимально равной длительностью. */
export function splitSides(tracks: Track[]): [Track[], Track[]] {
  if (tracks.length <= 1) return [tracks, []];
  const sum = total(tracks);
  let best = 1;
  let bestDiff = Infinity;
  let acc = 0;
  for (let i = 1; i < tracks.length; i++) {
    acc += tracks[i - 1].durationMs;
    const diff = Math.abs(sum - 2 * acc);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return [tracks.slice(0, best), tracks.slice(best)];
}

const letter = (i: number) => String.fromCharCode(65 + (i % 26));

/** Тома (volumes) → диски → стороны с буквами сквозь все диски. */
export function press(volumes: Track[][]): Disc[] {
  const discs: Disc[] = [];
  let sideIndex = 0;
  for (const volume of volumes) {
    for (const discTracks of splitEvenly(volume, DISC_CAPACITY_MS)) {
      const [a, b] = splitSides(discTracks);
      discs.push({
        sides: [
          { letter: letter(sideIndex++), tracks: a, durationMs: total(a) },
          { letter: letter(sideIndex++), tracks: b, durationMs: total(b) },
        ],
      });
    }
  }
  return discs;
}

/** Все стороны подряд — удобно для навигации «следующая сторона». */
export const allSides = (discs: Disc[]): Side[] => discs.flatMap((d) => d.sides);

/** Время начала каждого трека внутри стороны. */
export function trackOffsets(side: Side): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const t of side.tracks) {
    out.push(acc);
    acc += t.durationMs;
  }
  return out;
}
