/** Каталог Яндекс Музыки: поиск, исполнители, новинки (docs/PROJECT.md, 4.8). */
import { type RawAlbum, type RecordItem, albumRecord, coverUrl, get, post } from "./ym";

type RawArtist = { id: number | string; name: string; cover?: { uri?: string }; ogImage?: string };
type RawPlaylist = {
  kind: number;
  title: string;
  trackCount?: number;
  owner?: { uid: number; name?: string };
  cover?: { uri?: string; itemsUri?: string[] };
  ogImage?: string;
};

export function artistRecord(a: { id: number | string; name: string; cover?: string | null }): RecordItem {
  return {
    key: `ar-${a.id}`,
    kind: "artist",
    sourceId: String(a.id),
    title: a.name,
    subtitle: "Лучшее исполнителя",
    cover: a.cover ?? null,
    trackCount: 30,
    artist: a.name,
  };
}

const artistCover = (a: RawArtist) => coverUrl(a.cover?.uri ?? a.ogImage);

function playlistRecord(p: RawPlaylist): RecordItem {
  return {
    key: `pl-${p.owner?.uid}-${p.kind}`,
    kind: "playlist",
    sourceId: String(p.kind),
    ownerUid: p.owner?.uid,
    title: p.title,
    subtitle: [p.owner?.name, p.trackCount ? `${p.trackCount} тр.` : ""].filter(Boolean).join(" · "),
    cover: coverUrl(p.cover?.uri ?? p.cover?.itemsUri?.[0] ?? p.ogImage),
    trackCount: p.trackCount ?? 0,
    artist: p.owner?.name,
  };
}

/** Поиск по каталогу: исполнители, альбомы, плейлисты. */
export async function searchCatalog(text: string): Promise<RecordItem[]> {
  const r = await get<{
    artists?: { results?: RawArtist[] };
    albums?: { results?: RawAlbum[] };
    playlists?: { results?: RawPlaylist[] };
  }>("/search", { text, page: "0", type: "all", nocorrect: "false" });
  return [
    ...(r.artists?.results ?? []).slice(0, 4).map((a) => artistRecord({ id: a.id, name: a.name, cover: artistCover(a) })),
    ...(r.albums?.results ?? []).slice(0, 8).map(albumRecord),
    ...(r.playlists?.results ?? []).slice(0, 4).map(playlistRecord),
  ];
}

/** Витрина исполнителя: «Лучшее» + альбомы по году. */
export async function fetchArtistShelf(id: string, name: string): Promise<RecordItem[]> {
  const [info, albums] = await Promise.all([
    get<{ artist?: RawArtist }>(`/artists/${id}/brief-info`).catch(() => ({ artist: undefined })),
    get<{ albums?: RawAlbum[] }>(`/artists/${id}/direct-albums`, {
      page: "0",
      "page-size": "24",
      "sort-by": "year",
    }),
  ]);
  const cover = info.artist ? artistCover(info.artist) : null;
  return [artistRecord({ id, name, cover }), ...(albums.albums ?? []).map(albumRecord)];
}

/** Новинки с главной Яндекс Музыки. */
export async function fetchNewReleases(): Promise<RecordItem[]> {
  const r = await get<{ newReleases?: number[] }>("/landing3/new-releases");
  const ids = (r.newReleases ?? []).slice(0, 12);
  if (ids.length === 0) return [];
  const albums = await post<RawAlbum[]>("/albums", { "album-ids": ids.join(",") });
  return albums.map(albumRecord);
}
