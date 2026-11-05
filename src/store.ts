import { create } from "zustand";
import {
  type Account,
  type RecordItem,
  NotAuthorizedError,
  fetchAccount,
  fetchShelf,
  hasToken,
  logout as apiLogout,
} from "./api/ym";
import { eject, load } from "./player/engine";
import { loadLikes } from "./player/likes";
import { fetchArtistShelf, fetchNewReleases } from "./api/catalog";
import { remember } from "./history";

type Status = "checking" | "logged-out" | "loading" | "ready" | "error";

type State = {
  status: Status;
  error: string | null;
  account: Account | null;
  shelf: RecordItem[];
  /** Пластинка, лежащая на проигрывателе */
  onPlatter: RecordItem | null;
  /** Новинки с главной Яндекс Музыки. */
  newReleases: RecordItem[];
  /** Витрина исполнителя вверху полки. */
  artistView: { id: string; name: string; items: RecordItem[]; loading: boolean } | null;
  openArtist: (id: string, name: string) => Promise<void>;
  closeArtist: () => void;

  init: () => Promise<void>;
  loadShelf: () => Promise<void>;
  putOnPlatter: (r: RecordItem | null) => void;
  logout: () => Promise<void>;
};

export const useStore = create<State>((set, get) => ({
  status: "checking",
  error: null,
  account: null,
  shelf: [],
  onPlatter: null,
  newReleases: [],
  artistView: null,

  openArtist: async (id, name) => {
    set({ artistView: { id, name, items: [], loading: true } });
    try {
      const items = await fetchArtistShelf(id, name);
      if (get().artistView?.id === id) set({ artistView: { id, name, items, loading: false } });
    } catch {
      if (get().artistView?.id === id) set({ artistView: { id, name, items: [], loading: false } });
    }
  },
  closeArtist: () => set({ artistView: null }),

  init: async () => {
    if (await hasToken()) await get().loadShelf();
    else set({ status: "logged-out" });
  },

  loadShelf: async () => {
    set({ status: "loading", error: null });
    try {
      const account = await fetchAccount();
      void loadLikes(account.uid);
      const shelf = await fetchShelf(account);
      set({ status: "ready", account, shelf });
      void fetchNewReleases()
        .then((newReleases) => set({ newReleases }))
        .catch(() => {});
    } catch (e) {
      if (e instanceof NotAuthorizedError) {
        await apiLogout();
        set({ status: "logged-out", account: null, shelf: [] });
      } else {
        set({ status: "error", error: e instanceof Error ? e.message : String(e) });
      }
    }
  },

  putOnPlatter: (r) => {
    set({ onPlatter: r });
    if (r) {
      remember(r);
      void load(r);
    }
    else eject();
  },

  logout: async () => {
    eject();
    await apiLogout();
    set({ status: "logged-out", account: null, shelf: [], onPlatter: null });
  },
}));
