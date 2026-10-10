import { createStore } from "./storage";

// One entry per anime: { lang, speed, subSize }.
const store = createStore("showprefs:v1", {});

export const getShowPrefs = (animeId) => store.get()[animeId] ?? {};

export function setShowPrefs(animeId, patch) {
  store.set((all) => ({ ...all, [animeId]: { ...all[animeId], ...patch } }));
}

export const showPrefsStore = store;
