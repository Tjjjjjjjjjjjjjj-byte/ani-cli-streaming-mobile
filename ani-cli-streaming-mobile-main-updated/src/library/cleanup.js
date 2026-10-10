import { API_BASE } from "../api";
import { deleteFromLibrary } from "./useLibrary";

const getJson = async (path) => {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
};

export const episodeKey = (number, lang) => `E${String(number).padStart(2, "0")}.${lang}`;

function watchedFor(animeId) {
  try {
    const p = JSON.parse(localStorage.getItem(`progress:${animeId}`));
    return new Set(Array.isArray(p?.watched) ? p.watched : []);
  } catch {
    return new Set();
  }
}

// Everything in the library you've already finished watching, with sizes (for the "free up space" button).
export async function findWatchedDownloads() {
  const { result: items } = await getJson("/library");
  const found = [];
  for (const item of items) {
    const watched = watchedFor(item.id);
    if (watched.size === 0) continue;
    const data = await getJson(`/library/${item.id}`).catch(() => null);
    for (const ep of data?.episodes ?? []) {
      if (watched.has(ep.number)) found.push({ animeId: item.id, key: ep.key, size: ep.size ?? 0 });
    }
  }
  return found;
}

export async function deleteDownloads(list) {
  let deleted = 0;
  let bytes = 0;
  for (const ep of list) {
    try {
      await deleteFromLibrary(`/library/${ep.animeId}/episodes/${encodeURIComponent(ep.key)}`);
      deleted++;
      bytes += ep.size;
    } catch (err) {
      console.warn("Couldn't delete", ep.key, err);
    }
  }
  return { deleted, bytes };
}
