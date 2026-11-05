import { useEffect, useState } from "react";
import { setFullscreen } from "../fullscreen";
import { currentSide, currentTrack, usePlayer } from "../player/engine";
import { updateSettings, useSettings } from "../settings";
import { useStore } from "../store";
import { SleeveBack } from "./SleeveBack";
import { Turntable } from "./Turntable";

/** Проигрыватель на весь экран: только дека и тонкая строка с треком. */
export function FullscreenStage() {
  const record = useStore((s) => s.onPlatter);
  const p = usePlayer();
  const track = currentTrack(p);
  const side = currentSide(p);
  const [idle, setIdle] = useState(false);
  const drawer = useSettings((s) => s.fsTracklist);

  // Строка и курсор гаснут через 3 с без движения мыши.
  useEffect(() => {
    let t = setTimeout(() => setIdle(true), 3000);
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), 3000);
    };
    window.addEventListener("pointermove", wake);
    window.addEventListener("keydown", wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);

  return (
    <div className={`stage ${idle ? "idle" : ""} ${drawer ? "drawer-open" : ""}`}>
      <aside className="fs-drawer" aria-hidden={!drawer}>
        <div className="fs-drawer-inner">
          <SleeveBack />
        </div>
      </aside>
      <button
        className="fs-tab"
        onClick={() => updateSettings({ fsTracklist: !drawer })}
        aria-expanded={drawer}
        title={drawer ? "Свернуть треклист" : "Открыть треклист"}
      >
        <span className="fs-tab-arrow">{drawer ? "‹" : "›"}</span>
        <span className="fs-tab-text">Треклист</span>
      </button>
      <div className="stage-center">
      <div className="stage-deck">
        <Turntable />
      </div>
      <div className="stage-bar">
        <div className="stage-info">
          {record ? (
            <>
              <span className="side-badge small" style={{ background: p.labelColor }}>
                {side?.letter ?? "A"}
              </span>
              <span className="stage-title">{track ? track.title : record.title}</span>
              <span className="muted">{track ? track.artists : record.subtitle}</span>
            </>
          ) : (
            <span className="muted">Поставьте пластинку — выйдите из полноэкранного режима к полке</span>
          )}
        </div>
        <button className="lamp-btn" onClick={() => void setFullscreen(false)}>
          Выйти · Esc
        </button>
      </div>
      </div>
    </div>
  );
}
