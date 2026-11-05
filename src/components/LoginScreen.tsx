import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { startLogin } from "../api/ym";
import { Vinyl } from "./Vinyl";

export function LoginScreen() {
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    const un = listen("auth://cancelled", () => setWaiting(false));
    return () => {
      void un.then((f) => f());
    };
  }, []);

  return (
    <div className="login">
      <Vinyl cover={null} size={320} spinning className="login-disc" />
      <div className="login-copy">
        <h1>YM&nbsp;Vinil</h1>
        <p>Ваши плейлисты и альбомы из Яндекс Музыки — как пластинки на полке.</p>
        <button
          className="primary"
          disabled={waiting}
          onClick={() => {
            setWaiting(true);
            startLogin().catch(() => setWaiting(false));
          }}
        >
          {waiting ? "Ждём вход в окне Яндекса…" : "Войти через Яндекс"}
        </button>
        <p className="muted small">
          Вход проходит на странице Яндекса. Токен хранится только на этом компьютере
          в системном хранилище паролей и никуда больше не отправляется.
        </p>
      </div>
    </div>
  );
}
