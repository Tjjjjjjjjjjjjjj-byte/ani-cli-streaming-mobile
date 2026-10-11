import { createStore, useStore } from "./storage";

export const DEFAULT_SETTINGS = {
  // Content
  allowAdult: false,
  // Player
  gestures: true,
  haptics: true,
  countdownSeconds: 5,
  // Subtitles (size can also be overridden per show)
  subEnabled: true,
  subSize: "medium",
  subBg: 0.6,
  subPos: "low",
  // Library
  autoDownloadNext: 0,
  wifiOnly: true,
  deleteAfterWatching: false,
  saveZipToDevice: true,
  // Search
  searchAsYouType: true,
  saveSearches: true,
  // Privacy
  saveHistory: true,
  collectStats: true,
};

export const settingsStore = createStore("settings:v1", DEFAULT_SETTINGS);

// Spread defaults first so settings added in a later version still get a value.
export const getSettings = () => ({ ...DEFAULT_SETTINGS, ...settingsStore.get() });

export function updateSettings(patch) {
  settingsStore.set((s) => ({ ...DEFAULT_SETTINGS, ...s, ...patch }));
}

export function useSettings() {
  const stored = useStore(settingsStore);
  return [{ ...DEFAULT_SETTINGS, ...stored }, updateSettings];
}

export function vibrate(ms = 10) {
  if (!getSettings().haptics) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Not supported (iOS Safari, desktop): silently skip.
  }
}
