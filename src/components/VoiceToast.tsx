import { useVoice } from "../voice";

/** Строка над проигрывателем: что слышим и что сделали (docs/PROJECT.md, 4.13). */
export function VoiceToast() {
  const { phase, heard, message } = useVoice();
  if (phase === "idle" || phase === "downloading") return null;

  const title =
    phase === "loading"
      ? "Достаю модель голоса…"
      : phase === "listening"
        ? "Слушаю"
        : phase === "thinking"
          ? "Думаю…"
          : message;

  return (
    <div className={`voice-toast ${phase}`} role="status" aria-live="polite">
      <span className="voice-lamp" />
      <div className="voice-lines">
        <div className="voice-title">{title}</div>
        {heard && <div className="voice-heard">«{heard}»</div>}
        {phase === "listening" && !heard && <div className="voice-heard muted">Например: «Винил, включи Кино»</div>}
      </div>
    </div>
  );
}
