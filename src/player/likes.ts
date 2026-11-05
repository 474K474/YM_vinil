/**
 * Лайки и дизлайки (docs/PROJECT.md, 4.7).
 * Список «Мне нравится» грузится один раз после входа; дальше меняем его локально
 * вместе с запросом к API.
 */
import { create } from "zustand";
import { type Track, get, post } from "../api/ym";

type LikesState = { ids: Set<string>; uid: number | null };

export const useLikes = create<LikesState>(() => ({ ids: new Set(), uid: null }));

/** Лайки хранятся по id трека без альбома. */
const baseId = (id: string) => id.split(":")[0];
const trackRef = (t: Track) => t.queueId ?? t.id;

export const isLiked = (ids: Set<string>, t: Track | null) => (t ? ids.has(baseId(t.id)) : false);

export async function loadLikes(uid: number) {
  useLikes.setState({ uid });
  try {
    const r = await get<{ library?: { tracks?: { id: string }[] } }>(`/users/${uid}/likes/tracks`);
    useLikes.setState({ ids: new Set((r.library?.tracks ?? []).map((t) => baseId(String(t.id)))) });
  } catch {
    /* без списка лайков сердечко просто не подсвечено */
  }
}

/** Отметки «лайкнуто» из ответа ротора «Моей волны». */
export function markLiked(trackIds: string[]) {
  if (trackIds.length === 0) return;
  const ids = new Set(useLikes.getState().ids);
  for (const id of trackIds) ids.add(baseId(id));
  useLikes.setState({ ids });
}

function setLocal(id: string, liked: boolean) {
  const ids = new Set(useLikes.getState().ids);
  if (liked) ids.add(baseId(id));
  else ids.delete(baseId(id));
  useLikes.setState({ ids });
}

/** ♥ — добавить в «Мне нравится» или убрать оттуда. */
export async function toggleLike(t: Track) {
  const { uid, ids } = useLikes.getState();
  if (!uid) return;
  const liked = ids.has(baseId(t.id));
  setLocal(t.id, !liked); // сразу подсвечиваем, не ждём сеть
  try {
    await post(`/users/${uid}/likes/tracks/${liked ? "remove" : "add-multiple"}`, { "track-ids": trackRef(t) });
  } catch {
    setLocal(t.id, liked);
  }
}

/** ✕ — дизлайк. Переход к следующему треку делает движок. */
export async function dislike(t: Track) {
  const { uid } = useLikes.getState();
  if (!uid) return;
  setLocal(t.id, false);
  try {
    await post(`/users/${uid}/dislikes/tracks/add-multiple`, { "track-ids": trackRef(t) });
  } catch {
    /* дизлайк не дошёл — трек всё равно пропущен */
  }
}
