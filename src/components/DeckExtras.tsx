import { useEffect, useRef } from "react";
import type { PointerEvent } from "react";
import { currentTrack, dislikeCurrent, likeCurrent, usePlayer } from "../player/engine";
import { isLiked, useLikes } from "../player/likes";
import { updateSettings, useSettings } from "../settings";
import { press, release, useVoice } from "../voice";

/**
 * Лайк, дизлайк и ручка громкости на чёрной панели (docs/PROJECT.md, 4.7).
 * Стоят правее шарнира тонарма — туда рычаг никогда не заходит.
 */
const COL_X = 676;

const clamp = (v: number) => Math.min(1, Math.max(0, v));
/** Ход ручки: −135°…+135°. */
const angleFor = (v: number) => -135 + 270 * v;

function arc(r: number, from: number, to: number) {
  const p = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
  };
  const large = to - from > 180 ? 1 : 0;
  return `M ${p(from)} A ${r} ${r} 0 ${large} 1 ${p(to)}`;
}

export function DeckExtras() {
  const p = usePlayer();
  const track = currentTrack(p);
  const liked = useLikes((s) => isLiked(s.ids, track));
  const volume = useSettings((s) => s.volume);
  const drag = useRef<{ y: number; v: number } | null>(null);

  // Колесо над ручкой меняет громкость и не прокручивает страницу
  // (React вешает wheel пассивно, поэтому слушатель ставим сами).
  const knobRef = useRef<SVGGElement>(null);
  useEffect(() => {
    const el = knobRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = useSettings.getState().volume;
      updateSettings({ volume: clamp(v - Math.sign(e.deltaY) * 0.05) });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const onDown = (e: PointerEvent<SVGGElement>) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, v: volume };
  };
  const onMove = (e: PointerEvent) => {
    if (!drag.current) return;
    updateSettings({ volume: clamp(drag.current.v + (drag.current.y - e.clientY) / 150) });
  };
  const onUp = () => {
    drag.current = null;
  };

  const disabled = !track;
  const voiceOn = useSettings((s) => s.voice);
  const phase = useVoice((s) => s.phase);
  const hot = phase === "listening" || phase === "loading";

  return (
    <g className="deck-extras">
      {/* ♥ */}
      <g
        className={`control round-key ${liked ? "liked" : ""} ${disabled ? "off" : ""}`}
        onClick={() => !disabled && likeCurrent()}
        transform={`translate(${COL_X} 142)`}
      >
        <title>{liked ? "Убрать из «Мне нравится»" : "В «Мне нравится»"}</title>
        <circle r="14" fill="#0b0b0b" stroke="#333" />
        <circle r="11" className="round-key-face" />
        <path
          className="heart"
          d="M0 5.2 C -6.5 0.8 -7 -3.6 -4 -5.1 C -2.2 -6 -0.7 -5 0 -3.6 C 0.7 -5 2.2 -6 4 -5.1 C 7 -3.6 6.5 0.8 0 5.2 Z"
        />
      </g>

      {/* ✕ */}
      <g
        className={`control round-key ${disabled ? "off" : ""}`}
        onClick={() => !disabled && void dislikeCurrent()}
        transform={`translate(${COL_X} 178)`}
      >
        <title>Не нравится — пропустить</title>
        <circle r="14" fill="#0b0b0b" stroke="#333" />
        <circle r="11" className="round-key-face" />
        <path d="M -3.6 -3.6 L 3.6 3.6 M 3.6 -3.6 L -3.6 3.6" stroke="#3a3a3a" strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* Кнопка голоса: зажать и говорить (docs/PROJECT.md, 4.13) */}
      {voiceOn && (
        <g
          className={`control round-key mic-key ${hot ? "hot" : ""} ${phase === "thinking" ? "busy" : ""}`}
          transform={`translate(${COL_X + 4} 356)`}
          onPointerDown={(e) => {
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
            void press();
          }}
          onPointerUp={() => void release()}
          onPointerCancel={() => void release()}
        >
          <title>Голос: зажмите и скажите команду (или правый Ctrl)</title>
          <circle r="14" fill="#0b0b0b" stroke="#333" />
          <circle r="11" className="round-key-face" />
          <circle r="11" className="mic-glow" />
          <rect x="-2.6" y="-6.5" width="5.2" height="8.5" rx="2.6" className="mic-icon" />
          <path d="M -5 0 a 5 5 0 0 0 10 0 M 0 5 v 2.5" fill="none" strokeWidth="1.4" strokeLinecap="round" className="mic-stroke" />
        </g>
      )}

      {/* Ручка громкости */}
      <g
        className="control volume-knob"
        ref={knobRef}
        transform={`translate(${COL_X} 226)`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={() => updateSettings({ volume: 0.8 })}
      >
        <title>Громкость {Math.round(volume * 100)}% — колесо или перетащить вверх/вниз</title>
        <circle r="19" fill="#0b0b0b" stroke="#333" />
        <path d={arc(16.5, -135, 135)} stroke="#2c2c2c" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        {volume > 0.005 && (
          <path
            d={arc(16.5, -135, angleFor(volume))}
            className="volume-arc"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />
        )}
        <g style={{ transform: `rotate(${angleFor(volume)}deg)` }}>
          <circle r="11" fill="url(#knob)" stroke="#777" strokeWidth=".6" />
          <rect x="-1.2" y="-10.5" width="2.4" height="6" rx="1.2" fill="#c0392b" />
        </g>
      </g>
    </g>
  );
}
