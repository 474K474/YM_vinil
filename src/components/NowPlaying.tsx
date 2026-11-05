import { currentSide, currentTrack, flip, flipLabel, usePlayer } from "../player/engine";
import { useStore } from "../store";

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function NowPlaying() {
  const record = useStore((s) => s.onPlatter);
  const p = usePlayer();
  const side = currentSide(p);
  const track = currentTrack(p);

  if (!record) {
    return (
      <div className="now">
        <h2>Проигрыватель пуст</h2>
        <p className="muted">Выберите пластинку на полке.</p>
      </div>
    );
  }

  return (
    <div className="now">
      <div className="now-head">
        {record.cover && <img className="now-cover" src={record.cover} alt="" />}
        <div>
          <h2>{record.title}</h2>
          <p className="muted">{record.subtitle}</p>
        </div>
      </div>

      {p.loading && <p className="muted">Достаём пластинку из конверта…</p>}
      {p.error && <p className="error">{p.error}</p>}

      {side && track && !p.sideEnded && (
        <div className="now-track">
          <span className="side-badge">{side.letter}</span>
          <div>
            <div className="now-title">
              {p.trackIdx + 1}. {track.title}
            </div>
            <div className="muted small">
              {track.artists} · {mmss(p.positionMs)} / {mmss(track.durationMs)} · дорожка{" "}
              {p.trackIdx + 1} из {side.tracks.length}
            </div>
          </div>
        </div>
      )}

      {p.sideEnded && (
        <div className="now-track">
          <span className="side-badge">{side?.letter}</span>
          <div>
            <div className="now-title">Сторона доиграна</div>
            <button className="primary small-btn" onClick={() => void flip()}>
              {flipLabel(p)}
            </button>
          </div>
        </div>
      )}

      {side && !p.motor && !p.sideEnded && !p.loading && (
        <p className="muted small hint">
          Красная клавиша — мотор · LIFT — пауза · клик по бороздке — нужный трек · ручка — скорость
        </p>
      )}
    </div>
  );
}
