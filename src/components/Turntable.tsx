import { AnimatePresence, motion } from "motion/react";
import { useStore } from "../store";
import { Vinyl } from "./Vinyl";

const PLATTER = 290;

export function Turntable() {
  const onPlatter = useStore((s) => s.onPlatter);

  return (
    <section className="deck">
      <div className="plinth">
        <div className="platter">
          <AnimatePresence mode="wait">
            {onPlatter ? (
              <motion.div
                key={onPlatter.key}
                initial={{ x: 420, opacity: 0, rotate: -90 }}
                animate={{ x: 0, opacity: 1, rotate: 0 }}
                exit={{ x: 420, opacity: 0, rotate: 90 }}
                transition={{ type: "spring", stiffness: 140, damping: 20 }}
              >
                <Vinyl cover={onPlatter.cover} size={PLATTER} />
              </motion.div>
            ) : (
              <motion.div key="mat" className="mat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
            )}
          </AnimatePresence>
          <div className="spindle" />
        </div>
        <div className={`tonearm ${onPlatter ? "ready" : ""}`}>
          <div className="tonearm-base" />
          <div className="tonearm-rod" />
        </div>
      </div>

      <div className="now">
        {onPlatter ? (
          <>
            <h2>{onPlatter.title}</h2>
            <p>{onPlatter.subtitle}</p>
            <p className="muted small">Воспроизведение появится на следующем шаге.</p>
          </>
        ) : (
          <>
            <h2>Проигрыватель пуст</h2>
            <p className="muted">Выберите пластинку на полке.</p>
          </>
        )}
      </div>
    </section>
  );
}
