import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { searchCatalog } from "../api/catalog";
import { useHistory } from "../history";
import type { RecordItem } from "../api/ym";
import { updateSettings, useSettings } from "../settings";
import { useStore } from "../store";
import { Vinyl } from "./Vinyl";

function Sleeve({ record }: { record: RecordItem }) {
  const { onPlatter, putOnPlatter } = useStore();
  const isOut = onPlatter?.key === record.key;

  return (
    <motion.button
      className={`sleeve-slot ${isOut ? "empty" : ""}`}
      onClick={() => putOnPlatter(isOut ? null : record)}
      initial="rest"
      whileHover="hover"
      title={isOut ? "Вернуть на полку" : "Поставить на проигрыватель"}
    >
      <div className="sleeve-stage">
        {!isOut && (
          <motion.div
            className="sleeve-disc"
            variants={{ rest: { x: 0, rotate: 0 }, hover: { x: "34%", rotate: 25 } }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
          >
            <Vinyl cover={record.cover} size={150} />
          </motion.div>
        )}
        <div
          className={`sleeve sleeve-${record.kind}`}
          style={record.cover ? { backgroundImage: `url(${record.cover})` } : undefined}
        >
          {!record.cover && <span className="sleeve-fallback">{record.title}</span>}
        </div>
      </div>
      <span className="sleeve-title">{record.title}</span>
      <span className="sleeve-sub">{record.subtitle}</span>
    </motion.button>
  );
}

type Sort = "default" | "title" | "artist" | "year";

const collator = new Intl.Collator("ru", { sensitivity: "base" });
function sortRecords(items: RecordItem[], sort: Sort): RecordItem[] {
  if (sort === "default") return items;
  const out = [...items];
  if (sort === "title") out.sort((a, b) => collator.compare(a.title, b.title));
  if (sort === "artist") out.sort((a, b) => collator.compare(a.artist ?? a.subtitle, b.artist ?? b.subtitle));
  if (sort === "year") out.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  return out;
}

const matches = (r: RecordItem, q: string) =>
  !q || r.title.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q);

/** Поиск в каталоге с паузой 0,4 с после ввода. */
function useCatalogSearch(q: string) {
  const [state, setState] = useState<{ q: string; items: RecordItem[]; loading: boolean }>({
    q: "",
    items: [],
    loading: false,
  });
  useEffect(() => {
    if (q.length < 2) {
      setState({ q, items: [], loading: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    let alive = true;
    const t = setTimeout(() => {
      searchCatalog(q)
        .then((items) => alive && setState({ q, items, loading: false }))
        .catch(() => alive && setState({ q, items: [], loading: false }));
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);
  return state;
}

function Section({
  id,
  title,
  items,
  extra,
  hideable = true,
}: {
  id: string;
  title: string;
  items: RecordItem[];
  extra?: React.ReactNode;
  hideable?: boolean;
}) {
  const hidden = useSettings((s) => s.hiddenSections);
  const isHidden = hideable && hidden.includes(id);
  const toggle = () =>
    updateSettings({
      hiddenSections: hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id],
    });
  return (
    <section className="shelf-section">
      <header className="shelf-head">
        <h3>
          {title} <span className="count">{items.length || ""}</span>
        </h3>
        <div className="shelf-head-actions">
          {extra}
          {hideable && (
            <button className="lamp-btn small" onClick={toggle}>
              {isHidden ? "Показать" : "Скрыть"}
            </button>
          )}
        </div>
      </header>
      {!isHidden && items.length > 0 && (
        <div className="shelf">
          {items.map((r) => (
            <Sleeve key={r.key} record={r} />
          ))}
        </div>
      )}
    </section>
  );
}

export function Shelf() {
  const shelf = useStore((s) => s.shelf);
  const newReleases = useStore((s) => s.newReleases);
  const artistView = useStore((s) => s.artistView);
  const closeArtist = useStore((s) => s.closeArtist);
  const history = useHistory((s) => s.items);
  const sort = useSettings((s) => s.shelfSort);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const catalog = useCatalogSearch(query.trim());

  const groups = useMemo(() => {
    const by = (kinds: RecordItem["kind"][]) => shelf.filter((r) => kinds.includes(r.kind) && matches(r, q));
    return {
      picks: by(["wave", "chart"]),
      playlists: sortRecords(by(["likes", "playlist"]), sort),
      albums: sortRecords(by(["album"]), sort),
      recent: history.filter((r) => matches(r, q)),
      fresh: newReleases.filter((r) => matches(r, q)),
    };
  }, [shelf, newReleases, history, q, sort]);

  return (
    <div className="shelves">
      <div className="shelf-tools">
        <input
          className="shelf-search"
          type="search"
          placeholder="Поиск по полке и каталогу…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="shelf-sort"
          value={sort}
          onChange={(e) => updateSettings({ shelfSort: e.target.value as Sort })}
          aria-label="Сортировка"
        >
          <option value="default">Как в Яндексе</option>
          <option value="title">По названию</option>
          <option value="artist">По исполнителю</option>
          <option value="year">По году</option>
        </select>
      </div>

      {q.length >= 2 && (
        <Section
          id="catalog"
          title="В каталоге"
          items={catalog.items}
          hideable={false}
          extra={catalog.loading ? <span className="muted small">Ищем…</span> : null}
        />
      )}

      {artistView && (
        <Section
          id="artist"
          title={`Исполнитель: ${artistView.name}`}
          items={artistView.items}
          hideable={false}
          extra={
            <>
              {artistView.loading && <span className="muted small">Достаём пластинки…</span>}
              <button className="lamp-btn small" onClick={closeArtist}>
                Закрыть
              </button>
            </>
          }
        />
      )}

      {groups.recent.length > 0 && <Section id="recent" title="Недавно играли" items={groups.recent} />}
      {groups.picks.length > 0 && <Section id="wave" title="Подборки" items={groups.picks} />}
      {groups.playlists.length > 0 && <Section id="playlists" title="Плейлисты" items={groups.playlists} />}
      {groups.albums.length > 0 && <Section id="albums" title="Альбомы" items={groups.albums} />}
      {groups.fresh.length > 0 && <Section id="fresh" title="Новинки" items={groups.fresh} />}
    </div>
  );
}
