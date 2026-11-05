import { invoke } from "@tauri-apps/api/core";

/** Пластинка на полке: плейлист или альбом из Яндекс Музыки. */
export type RecordItem = {
  key: string;
  kind: "playlist" | "album" | "likes";
  /** id альбома или kind плейлиста */
  sourceId: string;
  ownerUid?: number;
  title: string;
  subtitle: string;
  cover: string | null;
  trackCount: number;
};

export type Account = {
  uid: number;
  name: string;
  hasPlus: boolean;
};

export class NotAuthorizedError extends Error {}

async function get<T>(path: string, query?: Record<string, string>): Promise<T> {
  try {
    return await invoke<T>("ym_get", {
      path,
      query: query ? Object.entries(query) : null,
    });
  } catch (e) {
    if (e === "not_authorized") throw new NotAuthorizedError();
    throw new Error(String(e));
  }
}

/** `avatars.yandex.net/get-music-content/.../%%` → полноценный https-адрес. */
export function coverUrl(uri: string | undefined | null, size = 400): string | null {
  if (!uri) return null;
  return `https://${uri.replace("%%", `${size}x${size}`)}`;
}

export const hasToken = () => invoke<boolean>("has_token");
export const startLogin = () => invoke<void>("start_login");
export const logout = () => invoke<void>("logout");

export async function fetchAccount(): Promise<Account> {
  const r = await get<{
    account: { uid: number; displayName?: string; login?: string };
    plus?: { hasPlus?: boolean };
  }>("/account/status");
  return {
    uid: r.account.uid,
    name: r.account.displayName ?? r.account.login ?? "Слушатель",
    hasPlus: Boolean(r.plus?.hasPlus),
  };
}

type RawPlaylist = {
  kind: number;
  title: string;
  trackCount: number;
  owner?: { uid: number; name?: string };
  cover?: { uri?: string; itemsUri?: string[] };
  ogImage?: string;
};

type RawAlbum = {
  id: number;
  title: string;
  year?: number;
  trackCount?: number;
  coverUri?: string;
  artists?: { name: string }[];
};

export async function fetchShelf(account: Account): Promise<RecordItem[]> {
  const [playlists, likedAlbums] = await Promise.all([
    get<RawPlaylist[]>(`/users/${account.uid}/playlists/list`),
    get<{ album?: RawAlbum }[]>(`/users/${account.uid}/likes/albums`, { rich: "true" }),
  ]);

  const likes: RecordItem = {
    key: "likes",
    kind: "likes",
    sourceId: "likes",
    ownerUid: account.uid,
    title: "Мне нравится",
    subtitle: "Ваша коллекция",
    cover: null,
    trackCount: 0,
  };

  const fromPlaylists = playlists.map<RecordItem>((p) => ({
    key: `pl-${p.kind}`,
    kind: "playlist",
    sourceId: String(p.kind),
    ownerUid: p.owner?.uid ?? account.uid,
    title: p.title,
    subtitle: `Плейлист · ${p.trackCount} тр.`,
    cover: coverUrl(p.cover?.uri ?? p.cover?.itemsUri?.[0] ?? p.ogImage),
    trackCount: p.trackCount,
  }));

  const fromAlbums = likedAlbums
    .map((l) => l.album)
    .filter((a): a is RawAlbum => Boolean(a))
    .map<RecordItem>((a) => ({
      key: `al-${a.id}`,
      kind: "album",
      sourceId: String(a.id),
      title: a.title,
      subtitle: [a.artists?.map((x) => x.name).join(", "), a.year].filter(Boolean).join(" · "),
      cover: coverUrl(a.coverUri),
      trackCount: a.trackCount ?? 0,
    }));

  return [likes, ...fromPlaylists, ...fromAlbums];
}
