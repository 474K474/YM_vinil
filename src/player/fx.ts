/**
 * «Звук винила» (docs/PROJECT.md, 4.3): общий AudioContext, цепочка тёплого тона
 * и плавание скорости (wow/flutter). Музыка приходит blob-ом, поэтому её можно
 * пропустить через Web Audio без ограничений CORS.
 */
import { useSettings } from "../settings";

let ctx: AudioContext | null = null;

/** Общий контекст. Создаётся и возобновляется по жесту пользователя. */
export function audioCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Сила эффекта 0…1 с учётом главного переключателя. */
export function vinylAmount(): number {
  const s = useSettings.getState();
  return s.vinylSound ? s.vinylAmount : 0;
}

function saturationCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(n);
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = drive < 0.01 ? x : Math.tanh(drive * x) / norm;
  }
  return curve;
}

type Chain = {
  hp: BiquadFilterNode;
  warmth: BiquadFilterNode;
  presence: BiquadFilterNode;
  air: BiquadFilterNode;
  lp: BiquadFilterNode;
  sat: WaveShaperNode;
  same: [GainNode, GainNode];
  cross: [GainNode, GainNode];
  out: GainNode;
};

let chain: Chain | null = null;

/** Подключает <audio> к цепочке. Вызывать один раз, по жесту пользователя. */
export function attachMedia(el: HTMLMediaElement) {
  if (chain) return;
  const c = audioCtx();
  const src = c.createMediaElementSource(el);

  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 28;
  const warmth = c.createBiquadFilter();
  warmth.type = "lowshelf";
  warmth.frequency.value = 200;
  const presence = c.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 2600;
  presence.Q.value = 0.8;
  const air = c.createBiquadFilter();
  air.type = "highshelf";
  air.frequency.value = 8000;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 0.5;
  const sat = c.createWaveShaper();
  sat.oversample = "2x";

  // Сужение стереобазы: L' = L·a + R·b, R' = R·a + L·b.
  const split = c.createChannelSplitter(2);
  const merge = c.createChannelMerger(2);
  const lToL = c.createGain();
  const rToR = c.createGain();
  const lToR = c.createGain();
  const rToL = c.createGain();
  const out = c.createGain();

  src.connect(hp).connect(warmth).connect(presence).connect(air).connect(lp).connect(sat).connect(split);
  split.connect(lToL, 0).connect(merge, 0, 0);
  split.connect(rToL, 1).connect(merge, 0, 0);
  split.connect(rToR, 1).connect(merge, 0, 1);
  split.connect(lToR, 0).connect(merge, 0, 1);
  merge.connect(out).connect(c.destination);

  chain = { hp, warmth, presence, air, lp, sat, same: [lToL, rToR], cross: [lToR, rToL], out };
  applyFx();
}

/** Применяет текущие настройки к цепочке (вызывается при изменении настроек). */
export function applyFx() {
  if (!chain || !ctx) return;
  const k = vinylAmount();
  const t = ctx.currentTime;
  const ramp = (p: AudioParam, v: number) => p.setTargetAtTime(v, t, 0.05);
  ramp(chain.hp.frequency, 20 + 25 * k);
  ramp(chain.warmth.gain, 3.5 * k);
  ramp(chain.presence.gain, -2 * k);
  ramp(chain.air.gain, -6 * k);
  ramp(chain.lp.frequency, 20000 - 8000 * k);
  chain.sat.curve = saturationCurve(1.6 * k);
  const mix = 0.18 * k;
  for (const g of chain.same) ramp(g.gain, 1 - mix);
  for (const g of chain.cross) ramp(g.gain, mix);
  // Небольшая компенсация громкости после подъёма низа и насыщения.
  ramp(chain.out.gain, 1 - 0.12 * k);
}

useSettings.subscribe(() => applyFx());

/**
 * Множитель скорости от «плавания» диска: медленный wow ~0,5 Гц
 * и быстрый flutter ~6 Гц. Сотые доли процента — слышно, но не фальшиво.
 */
export function wowFactor(timeSec: number): number {
  const k = vinylAmount();
  if (k === 0) return 1;
  const wow = 0.0016 * Math.sin(2 * Math.PI * 0.55 * timeSec) + 0.0006 * Math.sin(2 * Math.PI * 0.23 * timeSec + 1.3);
  const flutter = 0.00035 * Math.sin(2 * Math.PI * 6.2 * timeSec);
  return 1 + k * (wow + flutter);
}
