import { createStore } from "./storage";
import { validateShowPrefs } from "./validators";

// One entry per anime: { lang, speed, subSize }.
const store = createStore("showprefs:v1", {}, { validate: validateShowPrefs });

export const getShowPrefs = (animeId) => store.get()[animeId] ?? {};

export function setShowPrefs(animeId, patch) {
  store.set((all) => ({ ...all, [animeId]: { ...all[animeId], ...patch } }));
}

export const showPrefsStore = store;
