import { useEffect, useRef, useState } from "react";
import { updateSettings, useSettings } from "../settings";
import { discordAvailable } from "../discord";
import { deleteModel, downloadModel, refreshInstalled, useVoice } from "../voice";

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const { vinylSound, vinylAmount, crackleVolume, autoFlip, vinylStyle, closeToTray, discord } = useSettings();
  const [hasDiscord, setHasDiscord] = useState(false);
  const voiceOn = useSettings((s) => s.voice);
  const { installed, phase, progress } = useVoice();
  useEffect(() => {
    void discordAvailable().then(setHasDiscord);
    void refreshInstalled();
  }, []);
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

          <div className="sp-title">Голос</div>
          <label className="switch-row">
            <span>
              Голосовое управление
              <small>Зажмите кнопку-микрофон на деке или правый Ctrl и скажите: «включи Кино», «пауза», «дальше»</small>
            </span>
            <input
              type="checkbox"
              className="switch"
              checked={voiceOn}
              onChange={(e) => {
                updateSettings({ voice: e.target.checked });
                if (e.target.checked && installed === false) void downloadModel();
              }}
            />
          </label>
          {voiceOn && (
            <div className="voice-model">
              {phase === "downloading" ? (
                <>
                  <span>Скачиваю модель речи… {Math.round(progress * 100)}%</span>
                  <span className="update-bar">
                    <span style={{ width: `${Math.round(progress * 100)}%` }} />
                  </span>
                </>
              ) : installed ? (
                <>
                  <span>Модель речи установлена · 46 МБ · работает без интернета</span>
                  <button className="update-btn quiet" onClick={() => void deleteModel().then(() => updateSettings({ voice: false }))}>
                    Удалить
                  </button>
                </>
              ) : (
                <>
                  <span>Нужна модель речи (46 МБ, один раз)</span>
                  <button className="update-btn" onClick={() => void downloadModel()}>
                    Скачать
                  </button>
                </>
              )}
            </div>
          )}

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
          {hasDiscord && (
            <label className="switch-row">
              <span>
                Статус в Discord
                <small>«Слушает YM Vinil»: трек, обложка и время</small>
              </span>
              <input
                type="checkbox"
                className="switch"
                checked={discord}
                onChange={(e) => updateSettings({ discord: e.target.checked })}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
