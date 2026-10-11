import { useMemo } from "react";
import { createStore, useStore } from "./storage";
import { validateWatchlist } from "./validators";
import { markAllWatched } from "../watch/useProgress";

export const LIST_STATUSES = [
  ["watching", "Watching"],
  ["planning", "Planning"],
  ["completed", "Completed"],
];

// { [animeId]: { id, title, cover, format, episodes, available, rating, status, addedAt, updatedAt } }
//   episodes  = the real total from AniList (null while unknown)
//   available = how many have aired so far
export const watchlistStore = createStore("watchlist:v1", {}, { validate: validateWatchlist });

// Only fields that actually have a value, so a lightweight object (no cover, unknown rating)
// never wipes what an earlier, fuller save knew.
const pick = (anime) => {
  const fields = {
    id: anime.id,
    title: anime.title,
    cover: anime.cover,
    format: anime.format,
    // The real total. Falls back to the aired count for shows with no known total.
    episodes: anime.episodes ?? anime.availableEpisodes ?? null,
    available: anime.availableEpisodes ?? anime.available ?? null,
    rating: anime.rating,
  };
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null));
};

// How many episodes exist right now (aired, and no more than the total).
const airedCount = (anime) => anime.availableEpisodes ?? anime.available ?? anime.episodes ?? null;

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
  // Completed by hand means every episode is watched. Done after the list update; it only touches progress:<id>.
  if (status === "completed") markAllWatched(anime.id, airedCount(anime));
}

export function getListStatus(animeId) {
  return watchlistStore.get()[animeId]?.status ?? null;
}

// Keep the numbers on a list entry current when fresh details arrive.
// Does not touch status or updatedAt, so the list order doesn't jump around.
export function syncListEntry(anime) {
  const entry = watchlistStore.get()[anime?.id];
  if (!entry) return;
  const fresh = pick(anime);
  const changed = Object.keys(fresh).some((k) => entry[k] !== fresh[k]);
  if (!changed) return;
  watchlistStore.set((all) => (all[anime.id] ? { ...all, [anime.id]: { ...all[anime.id], ...fresh } } : all));
}

// True when every episode of the show has aired. A lightweight preview object (no airing info)
// can only prove this through a FINISHED status; real details prove it through the aired count.
export function isFullyAired(anime) {
  const total = anime?.episodes;
  if (!(total > 0)) return false;
  if (anime.status === "FINISHED") return true;
  return Number.isFinite(anime.availableEpisodes) && anime.availableEpisodes >= total;
}

// The rule behind autoTrack, kept pure so it can be tested. Returns the new status, or null for "leave it".
//  - Completed is never overridden.
//  - Finishing the last episode of a show that has fully aired completes it.
//  - Otherwise a show you're watching goes on the list as Watching (Planning moves to Watching).
//  - Anything else (Watching stays Watching) is left alone.
export function nextListStatus(current, { anime, episode, watched = false }) {
  if (current === "completed") return null;
  if (watched && isFullyAired(anime) && episode >= anime.episodes) return "completed";
  if (!current || current === "planning") return "watching";
  return null;
}

// watched: false = playback started (called once the first position is saved),
//          true  = the episode was finished (85% watched).
export function autoTrack(anime, episode, { watched = false } = {}) {
  const next = nextListStatus(getListStatus(anime.id), { anime, episode, watched });
  if (next) setListStatus(anime, next);
}

export function useWatchlist() {
  const all = useStore(watchlistStore);
  return useMemo(() => Object.values(all).sort((a, b) => b.updatedAt - a.updatedAt), [all]);
}
export const useListStatus = (animeId) => useStore(watchlistStore)[animeId]?.status ?? null;
