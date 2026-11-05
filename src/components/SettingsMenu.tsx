import { useEffect, useRef, useState } from "react";
import { updateSettings, useSettings } from "../settings";

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const { vinylSound, vinylAmount, crackleVolume, autoFlip, vinylStyle, closeToTray } = useSettings();
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
      <button className="lamp-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Настройки
      </button>
      {open && (
        <div className="settings-panel">
          <div className="sp-title">Звук</div>

          <label className="switch-row">
            <span>
              Звук винила
              <small>Тёплый тон, ламповое насыщение, плавание скорости и треск</small>
            </span>
            <input
              type="checkbox"
              className="switch"
              checked={vinylSound}
              onChange={(e) => updateSettings({ vinylSound: e.target.checked })}
            />
          </label>

          <fieldset className="sp-group" disabled={!vinylSound}>
            <label className="setting">
              <span>Сила эффекта · {Math.round(vinylAmount * 100)}%</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={vinylAmount}
                onChange={(e) => updateSettings({ vinylAmount: Number(e.target.value) })}
              />
            </label>
            <label className="setting">
              <span>Треск · {Math.round(crackleVolume * 100)}%</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={crackleVolume}
                onChange={(e) => updateSettings({ crackleVolume: Number(e.target.value) })}
              />
            </label>
          </fieldset>

          <div className="sp-title">Винил</div>
          <div className="seg" role="radiogroup" aria-label="Стиль винила">
            {(
              [
                ["black", "Чёрный"],
                ["color", "Цветной"],
                ["clear", "Прозрачный"],
                ["picture", "Пикчер-диск"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                role="radio"
                aria-checked={vinylStyle === v}
                className={vinylStyle === v ? "on" : ""}
                onClick={() => updateSettings({ vinylStyle: v })}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="sp-title">Проигрыватель</div>
          <label className="switch-row">
            <span>
              Автопереворот
              <small>В конце стороны пластинка перевернётся и заиграет дальше</small>
            </span>
            <input
              type="checkbox"
              className="switch"
              checked={autoFlip}
              onChange={(e) => updateSettings({ autoFlip: e.target.checked })}
            />
          </label>
          <label className="switch-row">
            <span>
              Сворачивать в трей
              <small>Крестик прячет окно в трей, музыка играет дальше</small>
            </span>
            <input
              type="checkbox"
              className="switch"
              checked={closeToTray}
              onChange={(e) => updateSettings({ closeToTray: e.target.checked })}
            />
          </label>
        </div>
      )}
    </div>
  );
}
