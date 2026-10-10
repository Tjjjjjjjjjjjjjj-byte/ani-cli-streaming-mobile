import { createStore, useStore } from "./storage";
import { getSettings } from "./settings";

const MAX_HISTORY = 40;
const MIN_SAVE_SECONDS = 15;
const FINISHED_RATIO = 0.92;

// history: { [animeId]: { id, title, cover, anime, episode, lang, time, duration, total, finished, updatedAt } }
export const historyStore = createStore("hist:v1", {});

const posKey = (animeId, episode) => `pos:${animeId}:${episode}`;

export function getPosition(animeId, episode) {
  try {
    const p = JSON.parse(localStorage.getItem(posKey(animeId, episode)));
    return p && Number.isFinite(p.t) ? p : null;
  } catch {
    return null;
  }
}

function removePosition(animeId, episode) {
  try {
    localStorage.removeItem(posKey(animeId, episode));
  } catch {
    // ignore
  }
}

function dropPositionsFor(animeId) {
  try {
    const prefix = `pos:${animeId}:`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

// Called every few seconds while watching. Returns true when the episode counts as finished.
export function recordPosition({ anime, episode, lang, time, duration }) {
  if (!getSettings().saveHistory || !anime?.id) return false;
  const finished = duration > 0 && time / duration >= FINISHED_RATIO;

  if (finished) removePosition(anime.id, episode);
  else if (time >= MIN_SAVE_SECONDS) {
    try {
      localStorage.setItem(posKey(anime.id, episode), JSON.stringify({ t: time, d: duration, at: Date.now() }));
    } catch {
      // ignore
    }
  }

  if (!finished && time < MIN_SAVE_SECONDS) return false;

  historyStore.set((all) => {
    const next = {
      ...all,
      [anime.id]: {
        id: anime.id,
        title: anime.title,
        cover: anime.cover,
        anime: {
          id: anime.id,
          title: anime.title,
          cover: anime.cover,
          format: anime.format,
          status: anime.status,
          episodes: anime.episodes,
          rating: anime.rating,
          genres: anime.genres,
        },
        episode,
        lang,
        time: finished ? 0 : time,
        duration,
        total: anime.availableEpisodes ?? anime.episodes ?? null,
        finished,
        updatedAt: Date.now(),
      },
    };
    const ids = Object.keys(next);
    if (ids.length > MAX_HISTORY) {
      ids
        .sort((a, b) => next[a].updatedAt - next[b].updatedAt)
        .slice(0, ids.length - MAX_HISTORY)
        .forEach((id) => {
          delete next[id];
          dropPositionsFor(id);
        });
    }
    return next;
  });
  return finished;
}

export function removeFromHistory(animeId) {
  dropPositionsFor(animeId);
  historyStore.set((all) => {
    const next = { ...all };
    delete next[animeId];
    return next;
  });
}

export function clearHistory() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith("pos:")) localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
  historyStore.set({});
}

// Newest first.
export function useHistory() {
  const all = useStore(historyStore);
  return Object.values(all).sort((a, b) => b.updatedAt - a.updatedAt);
}
