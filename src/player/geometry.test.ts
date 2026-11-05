import { describe, expect, it } from "vitest";
import {
  CENTER,
  GROOVE_INNER_R,
  GROOVE_OUTER_R,
  RECORD_R,
  armAngleForRadius,
  fractionForRadius,
  grooveRadius,
  stylusAt,
} from "./geometry";

const dist = (p: { x: number; y: number }) => Math.hypot(p.x - CENTER.x, p.y - CENTER.y);

describe("тонарм", () => {
  it("на стойке игла вне пластинки", () => {
    expect(dist(stylusAt(0))).toBeGreaterThan(RECORD_R);
  });

  it("попадает на нужный радиус", () => {
    for (const r of [GROOVE_OUTER_R, 180, GROOVE_INNER_R]) {
      expect(dist(stylusAt(armAngleForRadius(r)))).toBeCloseTo(r, 1);
    }
  });

  it("к центру угол растёт", () => {
    expect(armAngleForRadius(GROOVE_INNER_R)).toBeGreaterThan(armAngleForRadius(GROOVE_OUTER_R));
  });
});

describe("бороздки", () => {
  it("доля ↔ радиус", () => {
    expect(grooveRadius(0)).toBe(GROOVE_OUTER_R);
    expect(grooveRadius(1)).toBe(GROOVE_INNER_R);
    expect(fractionForRadius(grooveRadius(0.37))).toBeCloseTo(0.37);
  });
});
