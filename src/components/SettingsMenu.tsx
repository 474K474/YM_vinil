import { useEffect, useRef, useState } from "react";
import { updateSettings, useSettings } from "../settings";

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const { crackleVolume, autoFlip } = useSettings();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div className="settings" ref={ref}>
      <button className="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Настройки
      </button>
      {open && (
        <div className="settings-panel">
          <label className="setting">
            <span>Треск винила · {Math.round(crackleVolume * 100)}%</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={crackleVolume}
              onChange={(e) => updateSettings({ crackleVolume: Number(e.target.value) })}
            />
          </label>
          <label className="setting row">
            <input
              type="checkbox"
              checked={autoFlip}
              onChange={(e) => updateSettings({ autoFlip: e.target.checked })}
            />
            <span>
              Автопереворот
              <small>В конце стороны пластинка перевернётся и заиграет дальше</small>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
