/**
 * Цвет лейбла под обложку (docs/PROJECT.md, 4.4).
 * Чистые функции + загрузка обложки через Rust (без CORS-проблем canvas).
 */
import { invoke } from "@tauri-apps/api/core";

export type RGB = { r: number; g: number; b: number };

export const DEFAULT_LABEL = "#7a1f24";

export function rgbToHsl({ r, g, b }: RGB) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === R ? ((G - B) / d + (G < B ? 6 : 0)) / 6 : max === G ? ((B - R) / d + 2) / 6 : ((R - G) / d + 4) / 6;
  return { h, s, l };
}

export function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Основной цвет картинки: пиксели раскладываются по 12 оттенкам с весом
 * «насыщенность × яркость», побеждает самый весомый оттенок.
 * Почти серая обложка → её средний цвет.
 */
export function dominantColor(rgba: Uint8ClampedArray): RGB {
  const buckets = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  const avg = { r: 0, g: 0, b: 0, n: 0 };
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const px = { r: rgba[i], g: rgba[i + 1], b: rgba[i + 2] };
    avg.r += px.r;
    avg.g += px.g;
    avg.b += px.b;
    avg.n++;
    const { h, s, l } = rgbToHsl(px);
    const w = s * (1 - Math.abs(2 * l - 1));
    if (w < 0.15) continue;
    const bk = buckets[Math.floor(h * 12) % 12];
    bk.w += w;
    bk.r += px.r * w;
    bk.g += px.g * w;
    bk.b += px.b * w;
  }
  const best = buckets.reduce((a, b) => (b.w > a.w ? b : a));
  if (avg.n === 0) return { r: 122, g: 31, b: 36 };
  if (best.w < avg.n * 0.04) return { r: avg.r / avg.n, g: avg.g / avg.n, b: avg.b / avg.n };
  return { r: best.r / best.w, g: best.g / best.w, b: best.b / best.w };
}

/** Цвет «бумаги» лейбла: тот же оттенок, но тёмный и спокойный, чтобы кремовый текст читался. */
export function labelColor(c: RGB): string {
  const { h, s, l } = rgbToHsl(c);
  return hslToHex(h, Math.min(s, 0.62), Math.min(0.3, Math.max(0.2, l * 0.6)));
}

/** Едва заметный оттенок винила. */
export function vinylTint(c: RGB): string {
  const { h, s } = rgbToHsl(c);
  return hslToHex(h, Math.min(s, 0.5), 0.07);
}

const cache = new Map<string, Promise<RGB | null>>();

/** Цвет обложки по URL; null — если не получилось (тогда стандартный бордовый). */
export function coverColor(url: string): Promise<RGB | null> {
  let p = cache.get(url);
  if (!p) {
    p = (async () => {
      try {
        const buf = await invoke<ArrayBuffer>("cover_bytes", { url });
        const bmp = await createImageBitmap(new Blob([buf]));
        const size = 40;
        const canvas = new OffscreenCanvas(size, size);
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(bmp, 0, 0, size, size);
        return dominantColor(ctx.getImageData(0, 0, size, size).data);
      } catch {
        return null;
      }
    })();
    cache.set(url, p);
  }
  return p;
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

export type VinylStyle = "black" | "color" | "clear" | "picture";

/** Цвета пластинки для стиля винила (docs/PROJECT.md, 4.10). */
export function vinylLook(style: VinylStyle, label: string, tint: string) {
  const { h, s } = rgbToHsl(hexToRgb(label));
  const sat = Math.max(0.5, Math.min(0.85, s + 0.15));
  switch (style) {
    case "color":
      return { base: hslToHex(h, sat, 0.36), baseOpacity: 1, runout: hslToHex(h, sat, 0.3), clearGrooves: true };
    case "clear":
      return { base: hslToHex(h, sat, 0.5), baseOpacity: 0.42, runout: hslToHex(h, sat, 0.45), clearGrooves: true };
    case "picture":
      return { base: hslToHex(h, sat, 0.3), baseOpacity: 1, runout: hslToHex(h, sat, 0.25), clearGrooves: true };
    default:
      return { base: tint, baseOpacity: 1, runout: "#111111", clearGrooves: false };
  }
}
