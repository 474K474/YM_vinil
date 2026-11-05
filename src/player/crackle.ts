/**
 * Треск винила (docs/PROJECT.md, 4.3): отдельный генератор на Web Audio.
 * Музыкальный поток не трогаем — треск просто звучит поверх.
 */

export type CrackleLevel = "off" | "play" | "gap";

const GAIN: Record<CrackleLevel, number> = { off: 0, play: 0.05, gap: 0.14 };

function makeNoise(ctx: AudioContext, seconds = 6): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      // Тихое «шипение» поверхности.
      lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4;
      data[i] = lp * 0.08;
    }
    // Щелчки: короткие затухающие импульсы в случайных местах.
    const clicks = Math.floor(seconds * 18);
    for (let c = 0; c < clicks; c++) {
      const at = Math.floor(Math.random() * (len - 400));
      const amp = Math.random() ** 3 * 0.9 + 0.05;
      const decay = 20 + Math.random() * 180;
      const sign = Math.random() < 0.5 ? -1 : 1;
      for (let k = 0; k < 400; k++) data[at + k] += sign * amp * Math.exp(-k / decay) * (k % 2 ? -1 : 1);
    }
  }
  return buf;
}

class Crackle {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  enabled = true;

  /** Создаётся по жесту пользователя (кнопка мотора), иначе браузер заблокирует звук. */
  private ensure() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    const src = ctx.createBufferSource();
    src.buffer = makeNoise(ctx);
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 700;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(hp).connect(gain).connect(ctx.destination);
    src.start();
    this.ctx = ctx;
    this.gain = gain;
  }

  set(level: CrackleLevel) {
    if (level !== "off") this.ensure();
    if (!this.ctx || !this.gain) return;
    void this.ctx.resume();
    const target = this.enabled ? GAIN[level] : 0;
    this.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }
}

export const crackle = new Crackle();
