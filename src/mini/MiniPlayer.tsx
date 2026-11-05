import { useEffect, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MiniState, PlayerCmd } from "../bridge";

const empty: MiniState = {
  hasRecord: false,
  title: "Проигрыватель пуст",
  artist: "Поставьте пластинку",
  record: "",
  cover: null,
  labelColor: "#7a1f24",
  playing: false,
  motor: false,
  liked: false,
};

const send = (cmd: PlayerCmd) => void emitTo("main", "player://cmd", cmd).catch(() => {});

/** Мини-плеер поверх всех окон (docs/PROJECT.md, 4.9). Сам ничего не играет. */
export function MiniPlayer() {
  const [s, setS] = useState<MiniState>(empty);

  useEffect(() => {
    const un = listen<MiniState>("player://state", ({ payload }) => setS(payload));
    void emitTo("main", "player://hello").catch(() => {});
    return () => {
      void un.then((f) => f());
    };
  }, []);

  return (
    <div className="mini" data-tauri-drag-region>
      <div
        className={`mini-disc ${s.motor ? "spin" : ""}`}
        data-tauri-drag-region
        style={{ ["--label" as string]: s.labelColor }}
      >
        <div
          className="mini-label"
          style={s.cover ? { backgroundImage: `url(${s.cover})` } : undefined}
        />
      </div>

      <div className="mini-text" data-tauri-drag-region>
        <div className="mini-title" data-tauri-drag-region title={s.title}>
          {s.title}
        </div>
        <div className="mini-artist" data-tauri-drag-region title={s.artist}>
          {s.artist}
        </div>
        <div className="mini-keys">
          <button onClick={() => send("prev")} disabled={!s.hasRecord} aria-label="Предыдущий">
            ◀◀
          </button>
          <button className="play" onClick={() => send("toggle")} disabled={!s.hasRecord} aria-label="Пауза или играть">
            {s.playing ? "❚❚" : "▶"}
          </button>
          <button onClick={() => send("next")} disabled={!s.hasRecord} aria-label="Следующий">
            ▶▶
          </button>
          <button
            className={`heart ${s.liked ? "on" : ""}`}
            onClick={() => send("like")}
            disabled={!s.hasRecord}
            aria-label="Мне нравится"
          >
            ♥
          </button>
        </div>
      </div>

      <div className="mini-win">
        <button onClick={() => void invoke("show_main_window").catch(() => {})} title="Развернуть">
          ⤢
        </button>
        <button onClick={() => void getCurrentWindow().close()} title="Закрыть мини-плеер">
          ×
        </button>
      </div>
    </div>
  );
}
