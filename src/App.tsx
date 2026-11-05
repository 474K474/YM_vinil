import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useStore } from "./store";
import { LoginScreen } from "./components/LoginScreen";
import { Shelf } from "./components/Shelf";
import { Turntable } from "./components/Turntable";

export default function App() {
  const { status, error, account, init, loadShelf, logout } = useStore();

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

  return (
    <div className="room">
      <header className="topbar">
        <span className="brand">YM&nbsp;Vinil</span>
        {account && (
          <span className="who">
            {account.name}
            {!account.hasPlus && <em className="warn"> · без Плюса треки не заиграют</em>}
          </span>
        )}
        <button className="ghost" onClick={() => void logout()}>
          Выйти
        </button>
      </header>

      <main className="layout">
        <Turntable />
        <section className="shelf-wrap">
          {status === "loading" && <p className="muted">Достаём пластинки с полки…</p>}
          {status === "error" && (
            <p className="muted">
              Не получилось загрузить полку: {error}{" "}
              <button className="ghost" onClick={() => void loadShelf()}>
                Ещё раз
              </button>
            </p>
          )}
          {status === "ready" && <Shelf />}
        </section>
      </main>
    </div>
  );
}
