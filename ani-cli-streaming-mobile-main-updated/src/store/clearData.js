import { settingsStore } from "./settings";
import { historyStore } from "./history";
import { statsStore } from "./stats";
import { watchlistStore } from "./watchlist";
import { showPrefsStore } from "./showPrefs";

const PERSONAL_PREFIXES = ["progress:", "pos:", "player:", "episodes:"];
const PERSONAL_KEYS = ["settings:v1", "hist:v1", "stats:v1", "watchlist:v1", "showprefs:v1"];

const isPersonal = (key) => PERSONAL_KEYS.includes(key) || PERSONAL_PREFIXES.some((p) => key.startsWith(p));

// Everything this app remembers about you, as one JSON object (AniList cache is left out).
export function exportPersonalData() {
  const data = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !isPersonal(key)) continue;
      try {
        data[key] = JSON.parse(localStorage.getItem(key));
      } catch {
        data[key] = localStorage.getItem(key);
      }
    }
  } catch {
    // ignore
  }
  return data;
}

export function clearHistoryData() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("pos:") || key.startsWith("progress:"))) localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
  historyStore.reset();
  historyStore.set({});
}

export function clearStatsData() {
  statsStore.set({ days: {}, shows: {}, genres: {}, sec: 0, eps: 0, since: null });
}

// Wipes watch history, progress, resume positions, watchlist, stats, per-show choices, settings,
// and the cached AniList responses. Downloaded episodes live on the server/library and are NOT touched.
export function clearAllPersonalData() {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // ignore
  }
  [settingsStore, historyStore, statsStore, watchlistStore, showPrefsStore].forEach((s) => s.reset());
}
