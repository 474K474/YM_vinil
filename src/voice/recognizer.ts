/**
 * Распознавание речи (docs/PROJECT.md, 4.13): Vosk в WebAssembly, без сети.
 * Два распознавателя на одном микрофоне: свободный (для «включи …») и со словарём
 * коротких команд. Какой из них прав — решает `decide`.
 */
import { invoke } from "@tauri-apps/api/core";
import type { Model, KaldiRecognizer } from "vosk-browser";
import { COMMAND_PHRASES, type GrammarResult } from "./commands";

type Ready = {
  model: Model;
  free: KaldiRecognizer;
  grammar: KaldiRecognizer;
  ctx: AudioContext;
};

let ready: Promise<Ready> | null = null;

async function boot(): Promise<Ready> {
  const { createModel } = await import("vosk-browser");
  const bytes = await invoke<ArrayBuffer>("voice_model_bytes");
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/gzip" }));
  const model = await createModel(url, -1);
  URL.revokeObjectURL(url);
  const ctx = new AudioContext();
  const free = new model.KaldiRecognizer(ctx.sampleRate);
  const grammar = new model.KaldiRecognizer(ctx.sampleRate, JSON.stringify([...COMMAND_PHRASES, "[unk]"]));
  grammar.setWords(true);
  // `on` в vosk-browser нельзя снять, поэтому слушатели вешаются один раз
  // и пишут в текущую сессию.
  free.on("result", ((m: { result: { text?: string } }) => {
    if (session && m.result.text) session.freeParts.push(m.result.text);
  }) as never);
  free.on("partialresult", ((m: { result: { partial?: string } }) => {
    if (session) session.onPartial([...session.freeParts, m.result.partial ?? ""].join(" ").trim());
  }) as never);
  grammar.on("result", ((m: { result: { text?: string; result?: { word: string; conf: number }[] } }) => {
    if (session && m.result.text) session.grammarParts.push({ text: m.result.text, words: m.result.result ?? [] });
  }) as never);
  return { model, free, grammar, ctx };
}

/** Загружает модель в память (~3 с). Повторные вызовы — мгновенно. */
export function prepare(): Promise<Ready> {
  if (!ready) {
    ready = boot();
    ready.catch(() => {
      ready = null;
    });
  }
  return ready;
}

export type Utterance = { free: string; grammar: GrammarResult | null };

type Session = {
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  node: ScriptProcessorNode;
  freeParts: string[];
  grammarParts: GrammarResult[];
  onPartial: (text: string) => void;
};

let session: Session | null = null;

/** Начать слушать. `onPartial` получает живой текст для строки над декой. */
export async function startListening(onPartial: (text: string) => void): Promise<void> {
  if (session) return;
  const r = await prepare();
  if (r.ctx.state === "suspended") await r.ctx.resume();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    video: false,
  });
  const source = r.ctx.createMediaStreamSource(stream);
  // ScriptProcessor устарел, но именно его понимает vosk-browser и он есть везде.
  const node = r.ctx.createScriptProcessor(4096, 1, 1);
  const s: Session = { stream, source, node, freeParts: [], grammarParts: [], onPartial };

  node.onaudioprocess = (e) => {
    try {
      r.free.acceptWaveform(e.inputBuffer);
      r.grammar.acceptWaveform(e.inputBuffer);
    } catch {
      /* один пропущенный кусок звука не страшен */
    }
  };
  source.connect(node);
  // ScriptProcessor работает, только если подключён к выходу; звук не слышен — буфер выхода пустой.
  node.connect(r.ctx.destination);
  session = s;
}

/** Закончить фразу: дождаться итогов обоих распознавателей. */
export async function stopListening(): Promise<Utterance | null> {
  const s = session;
  if (!s) return null;
  const r = await prepare();
  s.node.disconnect();
  s.source.disconnect();
  s.stream.getTracks().forEach((t) => t.stop());

  // После retrieveFinalResult каждый распознаватель присылает последний «result».
  const freeCount = s.freeParts.length;
  const grammarCount = s.grammarParts.length;
  r.free.retrieveFinalResult();
  r.grammar.retrieveFinalResult();
  const t0 = Date.now();
  while (Date.now() - t0 < 2500 && (s.freeParts.length === freeCount || s.grammarParts.length === grammarCount)) {
    await new Promise((res) => setTimeout(res, 50));
  }
  session = null;

  const free = s.freeParts.join(" ").trim();
  // Словарь учитываем, только если фраза уложилась в один его итог.
  const grammar = s.grammarParts.filter((g) => g.text.trim()).length === 1 ? s.grammarParts.find((g) => g.text.trim())! : null;
  if (!free && !grammar) return null;
  return { free, grammar };
}

export const isListening = () => session !== null;
