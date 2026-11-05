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

type Status = "checking" | "logged-out" | "loading" | "ready" | "error";

type State = {
  status: Status;
  error: string | null;
  account: Account | null;
  shelf: RecordItem[];
  /** Пластинка, лежащая на проигрывателе */
  onPlatter: RecordItem | null;

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
    if (r) void load(r);
    else eject();
  },

  logout: async () => {
    eject();
    await apiLogout();
    set({ status: "logged-out", account: null, shelf: [], onPlatter: null });
  },
}));
