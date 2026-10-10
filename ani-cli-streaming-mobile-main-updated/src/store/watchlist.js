import { createStore, useStore } from "./storage";

export const LIST_STATUSES = [
  ["watching", "Watching"],
  ["planning", "Planning"],
  ["completed", "Completed"],
];

// { [animeId]: { id, title, cover, format, episodes, status, addedAt, updatedAt } }
export const watchlistStore = createStore("watchlist:v1", {});

const pick = (anime) => ({
  id: anime.id,
  title: anime.title,
  cover: anime.cover,
  format: anime.format,
  episodes: anime.availableEpisodes ?? anime.episodes ?? null,
  rating: anime.rating ?? null,
});

export function setListStatus(anime, status) {
  watchlistStore.set((all) => {
    const next = { ...all };
    if (!status) {
      delete next[anime.id];
      return next;
    }
    next[anime.id] = { ...all[anime.id], ...pick(anime), status, addedAt: all[anime.id]?.addedAt ?? Date.now(), updatedAt: Date.now() };
    return next;
  });
}

export function getListStatus(animeId) {
  return watchlistStore.get()[animeId]?.status ?? null;
}

// Watching an episode puts a show on the list for you. It never overrides a choice you made yourself,
// except that finishing the last episode moves "watching" shows to "completed".
export function autoTrack(anime, episode, total) {
  const current = getListStatus(anime.id);
  if (total != null && episode >= total && anime.status === "FINISHED" && current !== "completed") {
    setListStatus(anime, "completed");
  } else if (!current) {
    setListStatus(anime, "watching");
  } else if (current === "planning") {
    setListStatus(anime, "watching");
  }
}

export const useWatchlist = () => Object.values(useStore(watchlistStore)).sort((a, b) => b.updatedAt - a.updatedAt);
export const useListStatus = (animeId) => useStore(watchlistStore)[animeId]?.status ?? null;
