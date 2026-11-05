import { dismissUpdate, installUpdate, useUpdate } from "../updater";

/** Латунная плашка «Доступна версия X» (docs/PROJECT.md, 4.7). */
export function UpdateBanner() {
  const { available, progress, error, dismissed } = useUpdate();
  if (!available || dismissed) return null;

  return (
    <div className="update-plate" role="status">
      <span className="update-dot" />
      {progress === null ? (
        <>
          <span>
            Доступна версия <b>{available.version}</b>
          </span>
          <button className="update-btn" onClick={() => void installUpdate()}>
            Обновить
          </button>
          <button className="update-btn quiet" onClick={dismissUpdate}>
            Позже
          </button>
        </>
      ) : (
        <>
          <span>Загружаем обновление… {Math.round(progress * 100)}%</span>
          <span className="update-bar">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        </>
      )}
      {error && <span className="update-err">Не получилось: {error}</span>}
    </div>
  );
}
