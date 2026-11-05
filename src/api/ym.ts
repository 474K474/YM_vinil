import { invoke } from "@tauri-apps/api/core";

/** Пластинка на полке: плейлист или альбом из Яндекс Музыки. */
export type RecordItem = {
  key: string;
  kind: "playlist" | "album" | "likes" | "wave";
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

async function post<T>(path: string, form: Record<string, string>): Promise<T> {
  try {
    return await invoke<T>("ym_post", { path, form: Object.entries(form) });
  } catch (e) {
    if (e === "not_authorized") throw new NotAuthorizedError();
    throw new Error(String(e));
  }
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  try {
    return await invoke<T>("ym_post_json", { path, body });
  } catch (e) {
    if (e === "not_authorized") throw new NotAuthorizedError();
    throw new Error(String(e));
  }
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

  const wave: RecordItem = {
    key: "wave",
    kind: "wave",
    sourceId: "user:onyourwave",
    ownerUid: account.uid,
    title: "Моя волна",
    subtitle: "Бесконечная пластинка",
    cover: null,
    trackCount: 0,
  };

  return [wave, likes, ...fromPlaylists, ...fromAlbums];
}

// ── Треки ────────────────────────────────────────────────

export type Track = {
  id: string;
  /** id:albumId — так трек называют ротор и очередь. */
  queueId?: string;
  title: string;
  artists: string;
  durationMs: number;
};

export type RawTrack = {
  id: string | number;
  title: string;
  version?: string;
  durationMs?: number;
  available?: boolean;
  artists?: { name: string }[];
  albums?: { id: number }[];
};

export function toTrack(t: RawTrack): Track | null {
  if (t.available === false || !t.durationMs) return null;
  const albumId = t.albums?.[0]?.id;
  return {
    id: String(t.id),
    queueId: albumId ? `${t.id}:${albumId}` : String(t.id),
    title: t.version ? `${t.title} (${t.version})` : t.title,
    artists: t.artists?.map((a) => a.name).join(", ") ?? "",
    durationMs: t.durationMs,
  };
}

const clean = (list: (RawTrack | undefined)[]) =>
  list.map((t) => (t ? toTrack(t) : null)).filter((t): t is Track => t !== null);

async function tracksByIds(ids: string[]): Promise<RawTrack[]> {
  const out: RawTrack[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    out.push(...(await post<RawTrack[]>("/tracks", { "track-ids": ids.slice(i, i + 100).join(",") })));
  }
  return out;
}

/** Сколько последних лайков попадает в сборник «Мне нравится» (docs/PROJECT.md, 4.1). */
export const LIKES_COMPILATION_SIZE = 40;

/**
 * Треки пластинки. Возвращает список томов: у альбома тома — отдельные диски,
 * у плейлиста и «Мне нравится» том один.
 */
export async function fetchRecordTracks(record: RecordItem): Promise<Track[][]> {
  if (record.kind === "album") {
    const r = await get<{ volumes?: RawTrack[][] }>(`/albums/${record.sourceId}/with-tracks`);
    return (r.volumes ?? []).map(clean).filter((v) => v.length > 0);
  }

  if (record.kind === "playlist") {
    const r = await get<{ tracks?: { id: string | number; albumId?: number; track?: RawTrack }[] }>(
      `/users/${record.ownerUid}/playlists/${record.sourceId}`,
    );
    const items = r.tracks ?? [];
    const missing = items.filter((i) => !i.track).map((i) => (i.albumId ? `${i.id}:${i.albumId}` : String(i.id)));
    const fetched = missing.length ? await tracksByIds(missing) : [];
    const byId = new Map(fetched.map((t) => [String(t.id), t]));
    return [clean(items.map((i) => i.track ?? byId.get(String(i.id))))];
  }

  const r = await get<{ library?: { tracks?: { id: string; albumId?: string }[] } }>(
    `/users/${record.ownerUid}/likes/tracks`,
  );
  const ids = (r.library?.tracks ?? [])
    .slice(0, LIKES_COMPILATION_SIZE)
    .map((t) => (t.albumId ? `${t.id}:${t.albumId}` : t.id));
  return [clean(await tracksByIds(ids))];
}

export const trackUrl = (trackId: string) => invoke<string>("track_url", { trackId });
export const trackBytes = (trackId: string) => invoke<ArrayBuffer>("track_bytes", { trackId });
