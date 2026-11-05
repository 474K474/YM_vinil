import { describe, expect, it } from "vitest";
import type { Track } from "../api/ym";
import { DISC_CAPACITY_MS, allSides, press, splitEvenly, splitSides, trackOffsets } from "./press";

const min = (m: number) => m * 60_000;
const tracks = (...mins: number[]): Track[] =>
  mins.map((m, i) => ({ id: String(i), title: `T${i}`, artists: "", durationMs: min(m) }));
const sum = (ts: Track[]) => ts.reduce((s, t) => s + t.durationMs, 0);

describe("splitSides", () => {
  it("делит по возможности поровну и сохраняет порядок", () => {
    const [a, b] = splitSides(tracks(5, 5, 5, 5));
    expect(a.map((t) => t.id)).toEqual(["0", "1"]);
    expect(b.map((t) => t.id)).toEqual(["2", "3"]);
  });

  it("учитывает длительность, а не количество", () => {
    const [a, b] = splitSides(tracks(10, 2, 3, 4, 1));
    expect(sum(a)).toBe(min(10));
    expect(sum(b)).toBe(min(10));
  });

  it("один трек — всё на стороне A", () => {
    const [a, b] = splitSides(tracks(7));
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(0);
  });
});

describe("splitEvenly", () => {
  it("короткий альбом — один диск", () => {
    expect(splitEvenly(tracks(4, 4, 4, 4, 4, 4, 4, 4), DISC_CAPACITY_MS)).toHaveLength(1);
  });

  it("длинный плейлист — несколько дисков, каждый в пределах ёмкости", () => {
    const groups = splitEvenly(tracks(...Array(40).fill(4)), DISC_CAPACITY_MS);
    expect(groups.length).toBe(4);
    for (const g of groups) expect(sum(g)).toBeLessThanOrEqual(DISC_CAPACITY_MS);
    expect(groups.flat().map((t) => t.id)).toEqual(Array.from({ length: 40 }, (_, i) => String(i)));
  });

  it("трек длиннее диска не теряется", () => {
    const groups = splitEvenly(tracks(60, 3), DISC_CAPACITY_MS);
    expect(groups.flat()).toHaveLength(2);
  });
});

describe("press", () => {
  it("буквы сторон идут сквозь диски и тома", () => {
    const discs = press([tracks(...Array(20).fill(4)), tracks(5, 5)]);
    expect(allSides(discs).map((s) => s.letter)).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  it("смещения треков внутри стороны", () => {
    const [disc] = press([tracks(3, 4, 5, 6)]);
    expect(trackOffsets(disc.sides[0])).toEqual([0, min(3)]);
  });
});
