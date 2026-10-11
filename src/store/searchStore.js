import { createStore, useStore } from "./storage";
import { validatePresets, validateStringArray } from "./validators";
import { getSettings } from "./settings";

const MAX_RECENT = 8;
const MAX_PRESETS = 12;

// ---- Recent searches: ["frieren", "one piece", ...] newest first ----
export const recentStore = createStore("search:recent", [], { validate: validateStringArray });

export function rememberSearch(term) {
  const text = term.trim();
  if (text.length < 2 || !getSettings().saveSearches) return;
  recentStore.set((list) => [text, ...list.filter((t) => t.toLowerCase() !== text.toLowerCase())].slice(0, MAX_RECENT));
}

export const forgetSearch = (term) => recentStore.set((list) => list.filter((t) => t !== term));
export const clearRecentSearches = () => recentStore.set([]);
export const useRecentSearches = () => useStore(recentStore);

// ---- Saved filter presets: [{ id, name, genre, year, format, status, sort }] ----
export const presetStore = createStore("search:presets", [], { validate: validatePresets });

export function savePreset(name, filters) {
  const clean = name.trim().slice(0, 30);
  if (!clean) return;
  presetStore.set((list) =>
    [{ id: Date.now().toString(36), name: clean, ...filters }, ...list.filter((p) => p.name.toLowerCase() !== clean.toLowerCase())].slice(0, MAX_PRESETS),
  );
}

export const deletePreset = (id) => presetStore.set((list) => list.filter((p) => p.id !== id));
export const usePresets = () => useStore(presetStore);
