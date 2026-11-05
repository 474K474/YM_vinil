import { playFrom, usePlayer } from "../player/engine";
import { useStore } from "../store";

const mmss = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Обратная сторона конверта: треклист по сторонам (docs/PROJECT.md, 4.4). */
export function SleeveBack() {
  const record = useStore((s) => s.onPlatter);
  const p = usePlayer();
  if (!record || p.sides.length === 0) return null;

  return (
    <section className="sleeve-back" aria-label="Обратная сторона конверта">
      <header>
        <span className="sb-title">{record.title}</span>
        <span className="sb-sub">{record.subtitle}</span>
      </header>
      <div className="sb-sides">
        {p.sides.map((side, si) => (
          <div key={side.letter} className="sb-side">
            <div className="sb-side-head">
              <span>Сторона {side.letter}</span>
              <span>{mmss(side.durationMs)}</span>
            </div>
            <ol>
              {side.tracks.map((t, ti) => {
                const current = si === p.sideIdx && ti === p.trackIdx && !p.sideEnded;
                return (
                  <li key={`${t.id}-${ti}`}>
                    <button
                      className={`sb-track ${current ? "current" : ""}`}
                      onClick={() => void playFrom(si, ti)}
                      title={si === p.sideIdx ? "Поставить иглу на этот трек" : `Перевернуть на сторону ${side.letter}`}
                    >
                      <span className="sb-n">{side.letter}{ti + 1}</span>
                      <span className="sb-name">
                        {t.title}
                        {record.kind !== "album" && t.artists && <em> — {t.artists}</em>}
                      </span>
                      <span className="sb-dur">{mmss(t.durationMs)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
