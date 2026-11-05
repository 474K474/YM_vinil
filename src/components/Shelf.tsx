import { motion } from "motion/react";
import type { RecordItem } from "../api/ym";
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
          className={`sleeve ${record.kind === "likes" ? "sleeve-likes" : ""}`}
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

export function Shelf() {
  const shelf = useStore((s) => s.shelf);
  return (
    <div className="shelf">
      {shelf.map((r) => (
        <Sleeve key={r.key} record={r} />
      ))}
    </div>
  );
}
