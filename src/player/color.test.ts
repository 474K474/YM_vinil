import { describe, expect, it } from "vitest";
import { dominantColor, labelColor, rgbToHsl } from "./color";

function image(...pixels: [number, number, number, number][]) {
  return new Uint8ClampedArray(pixels.flat());
}
const repeat = <T,>(n: number, v: T) => Array.from({ length: n }, () => v);

describe("цвет обложки", () => {
  it("выбирает насыщенный цвет, а не фон", () => {
    const px = image(...repeat(70, [20, 20, 20, 255] as [number, number, number, number]), ...repeat(30, [30, 80, 200, 255] as [number, number, number, number]));
    const c = dominantColor(px);
    expect(c.b).toBeGreaterThan(c.r);
    expect(c.b).toBeGreaterThan(150);
  });

  it("серая обложка — средний цвет", () => {
    const c = dominantColor(image(...repeat(10, [120, 120, 120, 255] as [number, number, number, number])));
    expect(Math.round(c.r)).toBe(120);
  });

  it("лейбл тёмный при любой обложке", () => {
    for (const c of [{ r: 250, g: 240, b: 20 }, { r: 255, g: 255, b: 255 }, { r: 10, g: 10, b: 40 }]) {
      const hex = labelColor(c);
      const rgb = { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
      expect(rgbToHsl(rgb).l).toBeLessThanOrEqual(0.31);
    }
  });
});
