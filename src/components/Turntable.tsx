import { useEffect, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { AnimatePresence, motion, useAnimate } from "motion/react";
import {
  CENTER,
  DECK_H,
  DECK_W,
  GROOVE_INNER_R,
  GROOVE_OUTER_R,
  LABEL_R,
  PIVOT,
  ARM_LENGTH,
  ARM_REST_DEG,
  RECORD_R,
  armAngleForRadius,
  fractionForRadius,
  grooveRadius,
} from "../player/geometry";
import {
  type Speed,
  FLIP_MS,
  SPEED_RATE,
  armRadius,
  currentSide,
  cycleSpeed,
  seekTrack,
  nextTrack,
  prevTrack,
  toggleLift,
  toggleMotor,
  usePlayer,
} from "../player/engine";
import { trackOffsets } from "../player/press";
import { useStore } from "../store";
import { toggleFullscreen } from "../fullscreen";

const { x: CX, y: CY } = CENTER;
/** 33⅓ об/мин в градусах в секунду. */
const DEG_PER_SEC_33 = (33.333 / 60) * 360;

/** Вращение диска с инерцией: разгон и выбег, а не мгновенный старт. */
function useSpin(motor: boolean, speed: Speed) {
  const ref = useRef<SVGGElement>(null);
  const target = useRef(0);
  target.current = motor ? DEG_PER_SEC_33 * SPEED_RATE[speed] : 0;

  useEffect(() => {
    let angle = 0;
    let velocity = 0;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // Разгон быстрее выбега, как у настоящего мотора.
      const tau = target.current > velocity ? 0.35 : 0.9;
      velocity += (target.current - velocity) * (1 - Math.exp(-dt / tau));
      angle = (angle + velocity * dt) % 360;
      ref.current?.setAttribute("transform", `rotate(${angle} ${CX} ${CY})`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return ref;
}

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Блики остаются на месте, пока пластинка крутится, — как свет лампы. */
function wedge(fromDeg: number, toDeg: number, r: number) {
  const p = (d: number) => {
    const a = (d * Math.PI) / 180;
    return `${CX + r * Math.cos(a)} ${CY + r * Math.sin(a)}`;
  };
  return `M ${CX} ${CY} L ${p(fromDeg)} A ${r} ${r} 0 0 1 ${p(toDeg)} Z`;
}

export function Turntable() {
  const record = useStore((s) => s.onPlatter);
  const p = usePlayer();
  // При перевороте сторона на лейбле и кольца меняются в середине движения.
  const [shownSideIdx, setShownSideIdx] = useState(p.sideIdx);
  const [flipScope, animateFlip] = useAnimate<SVGGElement>();
  const lastFlip = useRef(p.flipCount);
  useEffect(() => {
    if (p.flipCount === lastFlip.current) {
      setShownSideIdx(p.sideIdx);
      return;
    }
    lastFlip.current = p.flipCount;
    if (flipScope.current) {
      void animateFlip(
        flipScope.current,
        { scaleX: [1, 0.02, 1] },
        { duration: FLIP_MS / 1000, ease: "easeInOut" },
      );
    }
    const t = setTimeout(() => setShownSideIdx(p.sideIdx), FLIP_MS / 2);
    return () => clearTimeout(t);
  }, [p.flipCount, p.sideIdx, animateFlip, flipScope]);
  const side = p.sides[shownSideIdx] ?? currentSide(p);
  const spinRef = useSpin(p.motor, p.speed);
  const svgRef = useRef<SVGSVGElement>(null);

  const r = armRadius(p);
  const armDeg = r === null ? ARM_REST_DEG : armAngleForRadius(r);
  const armTransition =
    p.needle === "down" && !p.runout ? "transform .35s linear" : "transform .9s cubic-bezier(.45,.05,.25,1)";
  const lifted = p.needle !== "down";

  const gaps = side ? trackOffsets(side).slice(1).map((o) => grooveRadius(o / side.durationMs)) : [];

  const onRecordClick = (e: MouseEvent<SVGElement>) => {
    const svg = svgRef.current;
    if (!svg || !side || side.tracks.length === 0) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    const dist = Math.hypot(pt.x - CX, pt.y - CY);
    if (dist > GROOVE_OUTER_R + 4 || dist < GROOVE_INNER_R) return;
    const atMs = fractionForRadius(dist) * side.durationMs;
    const offsets = trackOffsets(side);
    let i = 0;
    while (i + 1 < offsets.length && offsets[i + 1] <= atMs) i++;
    void seekTrack(i);
  };

  const speeds: { s: Speed; deg: number }[] = [
    { s: 33, deg: -50 },
    { s: 45, deg: 0 },
    { s: 78, deg: 50 },
  ];
  const knobDeg = speeds.find((x) => x.s === p.speed)!.deg;

  return (
    <svg
      ref={svgRef}
      className="turntable"
      viewBox={`0 0 ${DECK_W} ${DECK_H}`}
      role="img"
      aria-label="Проигрыватель"
    >
      <defs>
        <linearGradient id="walnut" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6b3a22" />
          <stop offset=".5" stopColor="#4a2616" />
          <stop offset="1" stopColor="#2f170d" />
        </linearGradient>
        <filter id="grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.004 0.11" numOctaves="4" seed="7" />
          <feColorMatrix values="0 0 0 0 .12  0 0 0 0 .05  0 0 0 0 .02  0 0 0 .9 -.25" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <linearGradient id="silver" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ececea" />
          <stop offset=".55" stopColor="#d7d7d3" />
          <stop offset="1" stopColor="#c4c4bf" />
        </linearGradient>
        <filter id="brushed" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9 0.004" numOctaves="2" seed="3" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .18 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <linearGradient id="chrome" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8f8f8b" />
          <stop offset=".45" stopColor="#f4f4f1" />
          <stop offset="1" stopColor="#9c9c97" />
        </linearGradient>
        <radialGradient id="knob" cx=".4" cy=".35" r=".7">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".6" stopColor="#d6d4cf" />
          <stop offset="1" stopColor="#9a978f" />
        </radialGradient>
        <radialGradient
          id="grooves"
          gradientUnits="userSpaceOnUse"
          cx={CX}
          cy={CY}
          r="2.2"
          spreadMethod="repeat"
        >
          <stop offset="0" stopColor="#121212" />
          <stop offset=".5" stopColor="#232323" />
          <stop offset="1" stopColor="#121212" />
        </radialGradient>
        <filter id="sheenBlur" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="12" />
        </filter>
        <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <clipPath id="recordClip">
          <circle cx={CX} cy={CY} r={RECORD_R} />
        </clipPath>
      </defs>

      {/* Корпус из ореха (двойной клик — полный экран) */}
      <rect
        width={DECK_W}
        height={DECK_H}
        rx="10"
        fill="url(#walnut)"
        onDoubleClick={() => void toggleFullscreen()}
      />
      <rect width={DECK_W} height={DECK_H} rx="10" fill="#000" filter="url(#grain)" pointerEvents="none" />

      {/* Серебристая дека */}
      <rect x="54" y="20" width="652" height="540" rx="16" fill="#00000055" transform="translate(0 4)" />
      <rect x="54" y="20" width="652" height="540" rx="16" fill="url(#silver)" />
      <rect x="54" y="20" width="652" height="540" rx="16" fill="#000" filter="url(#brushed)" />
      <rect x="54.5" y="20.5" width="651" height="539" rx="15.5" fill="none" stroke="#ffffff99" />

      {/* Правая чёрная панель */}
      <rect x="586" y="26" width="114" height="528" rx="10" fill="#141414" />
      <rect x="586" y="26" width="114" height="528" rx="10" fill="none" stroke="#2c2c2c" />
      <text x="662" y="262" className="engrave light">LIFT</text>

      {/* Шильдик */}
      <g transform="translate(66 522)">
        <rect width="104" height="26" rx="3" fill="#2a2a2a" stroke="#777" strokeWidth=".8" />
        <rect x="6" y="5" width="16" height="16" rx="2" fill="none" stroke="#bbb" strokeWidth="1" />
        <text x="14" y="17" className="badge-mark">V</text>
        <text x="30" y="18" className="badge">YM vinil</text>
      </g>

      {/* Клавиша мотора */}
      <g className="control" onClick={() => void toggleMotor()}>
        <rect x="474" y="520" width="44" height="18" rx="3" fill="#1b1b1b" />
        <rect
          x="478"
          y="523"
          width="36"
          height="12"
          rx="2"
          className={`motor-key ${p.motor ? "on" : ""}`}
        />
        <text x="496" y="553" className="engrave">
          {p.motor ? "СТОП" : "ПУСК"}
        </text>
      </g>

      {/* Клавиши ◀◀ / ▶▶ */}
      {[
        { x: 528, dir: -1, act: prevTrack, label: "Предыдущий трек" },
        { x: 556, dir: 1, act: nextTrack, label: "Следующий трек" },
      ].map(({ x, dir, act, label }) => (
        <g key={x} className="control cue" onClick={() => void act()} aria-label={label}>
          <title>{label}</title>
          <rect x={x} y="520" width="24" height="18" rx="3" fill="#1b1b1b" />
          <rect x={x + 2} y="522" width="20" height="14" rx="2" fill="url(#chrome)" className="cue-key" />
          <g transform={`translate(${x + 12} 529) scale(${dir} 1)`} fill="#2a2a2a">
            <path d="M -6 -3.5 L -1 0 L -6 3.5 Z" />
            <path d="M -1 -3.5 L 4 0 L -1 3.5 Z" />
          </g>
        </g>
      ))}
      <text x="554" y="553" className="engrave">ТРЕК</text>

      {/* Диск: резиновый мат, поверх — пластинка */}
      <circle cx={CX} cy={CY} r={RECORD_R + 2} fill="#00000066" filter="url(#soft)" transform="translate(6 8)" />
      <circle cx={CX} cy={CY} r={RECORD_R - 6} fill="#1a1a1a" />
      <g ref={spinRef}>
        <circle cx={CX} cy={CY} r={RECORD_R - 6} fill="none" stroke="#252525" strokeWidth="18" strokeDasharray="2 10" />
      </g>

      {/* initial={false}: при переходе в полный экран и обратно пластинка не «въезжает» заново */}
      <AnimatePresence initial={false}>
        {record && (
          <motion.g
            key={record.key}
            initial={{ x: 420, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 420, opacity: 0 }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          >
            <g ref={flipScope} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
            <g
              className={side ? "grooves-hit" : undefined}
              onClick={onRecordClick}
              clipPath="url(#recordClip)"
            >
              <circle cx={CX} cy={CY} r={RECORD_R} fill={p.vinylTint} />
              <circle cx={CX} cy={CY} r={GROOVE_OUTER_R} fill="url(#grooves)" />
              <circle cx={CX} cy={CY} r={GROOVE_OUTER_R} fill={p.labelColor} opacity=".07" />
              {gaps.map((gr) => (
                <g key={gr}>
                  <circle cx={CX} cy={CY} r={gr} fill="none" stroke="#080808" strokeWidth="2.2" />
                  <circle cx={CX} cy={CY} r={gr - 1.4} fill="none" stroke="#ffffff12" strokeWidth=".7" />
                </g>
              ))}
              <circle cx={CX} cy={CY} r={GROOVE_INNER_R} fill="#111" />
              <circle cx={CX} cy={CY} r={RECORD_R - 0.5} fill="none" stroke="#2a2a2a" />

              {/* Вращается только лейбл: бороздки симметричны, блики стоят */}
              <LabelSpin motor={p.motor} speed={p.speed}>
                  <circle cx={CX} cy={CY} r={LABEL_R} fill={p.labelColor} style={{ transition: "fill .8s" }} />
                  <circle cx={CX} cy={CY} r={LABEL_R - 4} fill="none" stroke="#d6b36a55" strokeWidth=".8" />
                  <circle cx={CX} cy={CY} r={LABEL_R - 30} fill="none" stroke="#00000033" strokeWidth="1" />
                  <text x={CX} y={CY - 52} className="label-brand">YM VINIL</text>
                  <text x={CX} y={CY + 30} className="label-title">{short(record.title, 24)}</text>
                  <text x={CX} y={CY + 44} className="label-sub">{short(record.subtitle, 30)}</text>
                  <text x={CX - 46} y={CY + 4} className="label-side">{side?.letter ?? "A"}</text>
                  <text x={CX + 46} y={CY + 4} className="label-side small">33⅓</text>
                  <text x={CX} y={CY + 64} className="label-fine">STEREO · LONG PLAY</text>
              </LabelSpin>

              <g filter="url(#sheenBlur)" pointerEvents="none">
                <path d={wedge(204, 232, RECORD_R)} fill="#fff" opacity=".09" />
                <path d={wedge(24, 52, RECORD_R)} fill="#fff" opacity=".06" />
              </g>
              <circle cx={CX} cy={CY} r={LABEL_R} fill="none" stroke="#00000066" strokeWidth="2" />
            </g>
            </g>
          </motion.g>
        )}
      </AnimatePresence>

      {/* Ось */}
      <circle cx={CX} cy={CY} r="7" fill="url(#knob)" stroke="#555" strokeWidth=".6" />

      {/* Подставка тонарма */}
      <rect x="650" y="388" width="20" height="54" rx="4" fill="#0a0a0a" stroke="#2e2e2e" />
      <rect x="652" y="402" width="16" height="6" rx="2" fill="url(#chrome)" />

      {/* Рычаг LIFT */}
      <g className={`control lift ${p.needle === "lifted" ? "up" : ""}`} onClick={() => void toggleLift()}>
        <rect x="652" y="276" width="32" height="44" rx="4" fill="#0b0b0b" stroke="#2e2e2e" />
        <g className="lift-lever">
          <rect x="664" y="282" width="8" height="38" rx="3" fill="url(#chrome)" />
          <rect x="660" y="314" width="16" height="10" rx="3" fill="url(#chrome)" />
        </g>
      </g>

      {/* Тонарм */}
      <g
        className={`tonearm ${lifted ? "lifted" : ""}`}
        style={{
          transform: `rotate(${armDeg}deg)`,
          transformOrigin: `${PIVOT.x}px ${PIVOT.y}px`,
          transition: armTransition,
        }}
      >
        {/* противовес */}
        <rect x={PIVOT.x - 15} y={PIVOT.y - 70} width="30" height="40" rx="5" fill="url(#chrome)" />
        <rect x={PIVOT.x - 15} y={PIVOT.y - 52} width="30" height="3" fill="#00000044" />
        <rect x={PIVOT.x - 4} y={PIVOT.y - 32} width="8" height="40" fill="url(#chrome)" />
        {/* трубка */}
        <rect
          x={PIVOT.x - 5}
          y={PIVOT.y}
          width="10"
          height={ARM_LENGTH - 62}
          rx="4"
          fill="url(#chrome)"
        />
        {/* головка */}
        <g transform={`rotate(-22 ${PIVOT.x} ${PIVOT.y + ARM_LENGTH - 64})`}>
          <rect x={PIVOT.x - 13} y={PIVOT.y + ARM_LENGTH - 66} width="26" height="58" rx="3" fill="#1a1a1a" stroke="#4a4a4a" />
          <rect x={PIVOT.x - 13} y={PIVOT.y + ARM_LENGTH - 66} width="26" height="12" rx="2" fill="url(#chrome)" />
          <rect x={PIVOT.x + 12} y={PIVOT.y + ARM_LENGTH - 40} width="16" height="5" rx="2" fill="url(#chrome)" />
        </g>
        {/* шарнир */}
        <circle cx={PIVOT.x} cy={PIVOT.y} r="22" fill="#0b0b0b" stroke="#333" />
        <circle cx={PIVOT.x} cy={PIVOT.y} r="13" fill="url(#knob)" />
      </g>

      {/* Ручка скорости */}
      <g className="control" onClick={cycleSpeed} transform="translate(642 496)">
        <circle r="38" fill="#0b0b0b" stroke="#2e2e2e" />
        {speeds.map(({ s, deg }) => {
          const a = ((deg - 90) * Math.PI) / 180;
          return (
            <text
              key={s}
              x={Math.cos(a) * 30}
              y={Math.sin(a) * 30 + 3}
              className={`speed-mark ${p.speed === s ? "active" : ""}`}
            >
              {s}
            </text>
          );
        })}
        <g style={{ transform: `rotate(${knobDeg}deg)`, transition: "transform .3s ease" }}>
          <circle r="18" fill="url(#knob)" stroke="#777" strokeWidth=".6" />
          <rect x="-1.5" y="-17" width="3" height="9" rx="1.5" fill="#c0392b" />
        </g>
      </g>
    </svg>
  );
}

/** Отдельный вращающийся слой лейбла (ref на <g>, угол пишет useSpin). */
function LabelSpin({ motor, speed, children }: { motor: boolean; speed: Speed; children: ReactNode }) {
  const ref = useSpin(motor, speed);
  return <g ref={ref}>{children}</g>;
}
