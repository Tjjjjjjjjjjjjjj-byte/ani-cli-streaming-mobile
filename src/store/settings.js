import { useMemo } from "react";
import { createStore, useStore } from "./storage";
import { validateAgainstDefaults } from "./validators";

export const DEFAULT_SETTINGS = {
  // Content
  allowAdult: false,
  // Player
  gestures: true,
  haptics: true,
  countdownSeconds: 5,
  // Playback and caching
  saveEverySeconds: 5, // how often the watched position is saved: 2 / 5 / 10 / 30
  bufferAheadSeconds: 0, // 0 = hls.js default; otherwise 120 / 300 / 600 seconds kept ready ahead
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

export const settingsStore = createStore("settings:v1", DEFAULT_SETTINGS, { validate: validateAgainstDefaults(DEFAULT_SETTINGS) });

// Spread defaults first so settings added in a later version still get a value.
export const getSettings = () => ({ ...DEFAULT_SETTINGS, ...settingsStore.get() });

export function updateSettings(patch) {
  settingsStore.set((s) => ({ ...DEFAULT_SETTINGS, ...s, ...patch }));
}

export function useSettings() {
  const stored = useStore(settingsStore);
  // Memoized: a new object on every render would re-trigger any effect that depends on it.
  return useMemo(() => [{ ...DEFAULT_SETTINGS, ...stored }, updateSettings], [stored]);
}

export function vibrate(ms = 10) {
  if (!getSettings().haptics) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Not supported (iOS Safari, desktop): silently skip.
  }
}
