import { useEffect, useRef, useState } from "react";
import { updateSettings, useSettings } from "../settings";
import { WAVE_LABELS, type WaveSettings } from "../player/wave";

const GROUPS: { key: keyof WaveSettings; title: string }[] = [
  { key: "diversity", title: "Характер" },
  { key: "mood", title: "Настроение" },
  { key: "language", title: "Язык" },
];

/** Настройки «Моей волны» (docs/PROJECT.md, 4.11). */
export function WavePanel() {
  const [open, setOpen] = useState(false);
  const wave = useSettings((s) => s.wave);
  const ref = useRef<HTMLDivElement>(null);
  const custom = Boolean(wave.diversity || wave.mood || wave.language);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const pick = (key: keyof WaveSettings, value: string) =>
    updateSettings({ wave: { ...wave, [key]: value } as WaveSettings });

  return (
    <div className="wave-panel-wrap" ref={ref}>
      <button className={`lamp-btn small ${custom ? "lit" : ""}`} onClick={() => setOpen((v) => !v)}>
        Настроить волну
      </button>
      {open && (
        <div className="settings-panel wave-panel">
          {GROUPS.map(({ key, title }) => (
            <div key={key} className="wave-group">
              <div className="sp-title">{title}</div>
              <div className="seg">
                {Object.entries(WAVE_LABELS[key]).map(([v, label]) => (
                  <button
                    key={v || "any"}
                    className={wave[key] === v ? "on" : ""}
                    aria-pressed={wave[key] === v}
                    onClick={() => pick(key, v)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <small className="wave-note">
            Если волна уже играет, новые настройки начнутся со следующего диска.
          </small>
          {custom && (
            <button
              className="update-btn quiet wave-reset"
              onClick={() => updateSettings({ wave: { diversity: "", mood: "", language: "" } })}
            >
              Сбросить
            </button>
          )}
        </div>
      )}
    </div>
  );
}
