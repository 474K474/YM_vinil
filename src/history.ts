/** «Недавно играли» (docs/PROJECT.md, 4.8): последние 10 пластинок, локально. */
import { create } from "zustand";
import type { RecordItem } from "./api/ym";

const KEY = "ym-vinil:history";
const MAX = 10;

function read(): RecordItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export const useHistory = create<{ items: RecordItem[] }>(() => ({ items: read() }));

export function remember(r: RecordItem) {
  const items = [r, ...useHistory.getState().items.filter((x) => x.key !== r.key)].slice(0, MAX);
  useHistory.setState({ items });
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* без хранилища — история до перезапуска */
  }
}
