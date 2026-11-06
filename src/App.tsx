import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useStore } from "./store";
import { LoginScreen } from "./components/LoginScreen";
import { Shelf } from "./components/Shelf";
import { Turntable } from "./components/Turntable";
import { NowPlaying } from "./components/NowPlaying";
import { SleeveBack } from "./components/SleeveBack";
import { SettingsMenu } from "./components/SettingsMenu";
import { FullscreenStage } from "./components/FullscreenStage";
import { toggleFullscreen, useFullscreen } from "./fullscreen";
import { updateSettings, useSettings } from "./settings";
import { UpdateBanner } from "./components/UpdateBanner";
import { startUpdateChecks } from "./updater";
import { startBridge } from "./bridge";
import { startDiscord } from "./discord";
import { startVoice } from "./voice";
import { VoiceToast } from "./components/VoiceToast";
import { invoke } from "@tauri-apps/api/core";

export default function App() {
  const { status, error, account, init, loadShelf, logout } = useStore();
  const fullscreen = useFullscreen((s) => s.on);
  const shelfHidden = useSettings((s) => s.shelfHidden);

  useEffect(() => {
    startUpdateChecks();
    startBridge();
    startDiscord();
    startVoice();
  }, []);

  useEffect(() => {
    void init();
    // Rust присылает это событие, когда токен пойман и сохранён.
    const un = listen("auth://success", () => void loadShelf());
    return () => {
      void un.then((f) => f());
    };
  }, [init, loadShelf]);

  if (status === "checking") return <div className="splash" />;
  if (status === "logged-out") return <LoginScreen />;
  if (fullscreen)
    return (
      <>
        <FullscreenStage />
        <VoiceToast />
        <UpdateBanner />
      </>
    );

  return (
    <div className="room">
      <UpdateBanner />
      <VoiceToast />
      <div className="lamp-light" aria-hidden />
      <header className="topbar">
        <span className="brand">
          <span className="brand-dot" />
          YM&nbsp;Vinil
        </span>
        {account && (
          <span className="who">
            {account.name}
            {!account.hasPlus && <em className="warn"> · без Плюса треки не заиграют</em>}
          </span>
        )}
        <button className="lamp-btn" onClick={() => void invoke("toggle_mini").catch(() => {})}>
          Мини-плеер
        </button>
        <button className="lamp-btn" onClick={() => void toggleFullscreen()} title="F11">
          На весь экран
        </button>
        <button className="lamp-btn" onClick={() => updateSettings({ shelfHidden: !shelfHidden })}>
          {shelfHidden ? "Показать полку" : "Скрыть полку"}
        </button>
        <SettingsMenu />
        <button className="lamp-btn quiet" onClick={() => void logout()}>
          Выйти
        </button>
      </header>

      <main className={`layout ${shelfHidden ? "no-shelf" : ""}`}>
        <section className="deck">
          <Turntable />
          <NowPlaying />
          <SleeveBack />
        </section>
        {!shelfHidden && (
          <section className="shelf-wrap">
            {status === "loading" && <p className="muted">Достаём пластинки с полки…</p>}
            {status === "error" && (
              <p className="muted">
                Не получилось загрузить полку: {error}{" "}
                <button className="lamp-btn" onClick={() => void loadShelf()}>
                  Ещё раз
                </button>
              </p>
            )}
            {status === "ready" && <Shelf />}
          </section>
        )}
      </main>
    </div>
  );
}
