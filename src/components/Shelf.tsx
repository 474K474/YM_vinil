import { motion } from "motion/react";
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
          className={`sleeve ${record.kind === "likes" ? "sleeve-likes" : ""} ${record.kind === "wave" ? "sleeve-wave" : ""}`}
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

const SECTIONS: { id: string; title: string; kinds: RecordItem["kind"][] }[] = [
  { id: "wave", title: "Моя волна", kinds: ["wave"] },
  { id: "playlists", title: "Плейлисты", kinds: ["likes", "playlist"] },
  { id: "albums", title: "Альбомы", kinds: ["album"] },
];

export function Shelf() {
  const shelf = useStore((s) => s.shelf);
  const hidden = useSettings((s) => s.hiddenSections);

  const toggle = (id: string) =>
    updateSettings({
      hiddenSections: hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id],
    });

  return (
    <div className="shelves">
      {SECTIONS.map((sec) => {
        const items = shelf.filter((r) => sec.kinds.includes(r.kind));
        if (items.length === 0) return null;
        const isHidden = hidden.includes(sec.id);
        return (
          <section key={sec.id} className="shelf-section">
            <header className="shelf-head">
              <h3>
                {sec.title} <span className="count">{items.length}</span>
              </h3>
              <button className="lamp-btn small" onClick={() => toggle(sec.id)}>
                {isHidden ? "Показать" : "Скрыть"}
              </button>
            </header>
            {!isHidden && (
              <div className="shelf">
                {items.map((r) => (
                  <Sleeve key={r.key} record={r} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
