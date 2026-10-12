// Restore from a "Download my data" backup. Everything read from the file goes through the same
// validators as data read from localStorage, so a hand-edited or corrupt file can't break the app.
//
// Two modes:
//   merge   - add what the backup knows to what this device already has. Watchlist and history
//             entries keep whichever copy is newer, resume spots keep the newer one, watched
//             episodes are combined. Settings and stats on this device are left alone (stats are
//             only taken when this device has none yet).
//   replace - this device ends up exactly like the backup.
import { DEFAULT_SETTINGS, settingsStore } from "./settings";
import { MAX_HISTORY, historyStore } from "./history";
import { statsStore } from "./stats";
import { watchlistStore } from "./watchlist";
import { showPrefsStore } from "./showPrefs";
import { presetStore, recentStore } from "./searchStore";
import { SORT_STORAGE_KEY, isSort } from "../library/sortLibrary";
import { isPersonalKey } from "./clearData";
import {
  validateAgainstDefaults,
  validateHistory,
  validatePosition,
  validatePresets,
  validateProgress,
  validateShowPrefs,
  validateStats,
  validateStringArray,
  validateWatchlist,
} from "./validators";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_RAW_KEYS = 5000;
const MAX_RECENT = 8;
const MAX_PRESETS = 12;

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Keys that hold a plain string instead of JSON. The export turns "1" into the number 1, so compare as text.
const SWITCHES = {
  "player:autoPlay": ["on", "off"],
  "player:autoNext": ["on", "off"],
  "player:autoSkip": ["on", "off"],
  "episodes:view": ["grid", "list"],
  "episodes:hideFiller": ["0", "1"],
  [SORT_STORAGE_KEY]: null, // checked with isSort
};
const validSwitch = (key, value) => {
  const text = String(value);
  return key === SORT_STORAGE_KEY ? isSort(text) : SWITCHES[key].includes(text);
};

const PROGRESS_KEY = /^progress:(\d+)$/;
const POSITION_KEY = /^pos:(\d+):(\d+(?:\.\d+)?)$/;

export class BackupError extends Error {}

// Reads and checks a backup file. Returns { clean, summary } or throws a BackupError with a readable message.
export async function readBackup(file) {
  if (!file) throw new BackupError("No file chosen.");
  if (file.size > MAX_FILE_BYTES) throw new BackupError("That file is too big to be a backup.");

  let raw;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new BackupError("That isn’t a backup file (it isn’t valid JSON).");
  }
  if (!isPlainObject(raw)) throw new BackupError("That isn’t a backup file.");

  const clean = {
    settings: "settings:v1" in raw ? validateAgainstDefaults(DEFAULT_SETTINGS)(raw["settings:v1"]) : null,
    watchlist: validateWatchlist(raw["watchlist:v1"]),
    history: validateHistory(raw["hist:v1"]),
    stats: "stats:v1" in raw ? validateStats(raw["stats:v1"]) : null,
    showPrefs: validateShowPrefs(raw["showprefs:v1"]),
    recent: validateStringArray(raw["search:recent"]),
    presets: validatePresets(raw["search:presets"]),
    progress: {},
    positions: {},
    switches: {},
  };

  let rawKeys = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (!isPersonalKey(key) || rawKeys >= MAX_RAW_KEYS) continue;
    if (PROGRESS_KEY.test(key)) {
      const progress = validateProgress(value);
      if (progress) clean.progress[key] = progress;
    } else if (POSITION_KEY.test(key)) {
      const position = validatePosition(value);
      if (position) clean.positions[key] = position;
    } else if (Object.hasOwn(SWITCHES, key) && validSwitch(key, value)) {
      // The sort choice is stored as JSON; the player and episode-list switches as bare text.
      clean.switches[key] = key === SORT_STORAGE_KEY ? JSON.stringify(String(value)) : String(value);
    } else {
      continue;
    }
    rawKeys += 1;
  }

  const summary = {
    watchlist: Object.keys(clean.watchlist).length,
    history: Object.keys(clean.history).length,
    progress: Object.keys(clean.progress).length,
    positions: Object.keys(clean.positions).length,
    settings: Boolean(clean.settings),
    stats: Boolean(clean.stats && (clean.stats.sec > 0 || clean.stats.eps > 0)),
  };
  const found =
    summary.watchlist + summary.history + summary.progress + summary.positions + clean.recent.length + clean.presets.length +
    Object.keys(clean.showPrefs).length + Object.keys(clean.switches).length;
  if (found === 0 && !clean.settings && !clean.stats) {
    throw new BackupError("That file has no list, history or settings in it. Use the file from “Download my data”.");
  }
  return { clean, summary };
}

const newest = (a, b) => ((b?.updatedAt ?? 0) > (a?.updatedAt ?? 0) ? b : a);

function mergeNewest(current, incoming) {
  const out = { ...current };
  for (const [id, entry] of Object.entries(incoming)) out[id] = out[id] ? newest(out[id], entry) : entry;
  return out;
}

const capHistory = (all) =>
  Object.fromEntries(Object.entries(all).sort(([, a], [, b]) => b.updatedAt - a.updatedAt).slice(0, MAX_HISTORY));

const readRaw = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const readParsed = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
};

const writeRaw = (key, text) => {
  try {
    localStorage.setItem(key, text);
  } catch {
    // Storage full or blocked: skip this one.
  }
};

function removePersonalKeys() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (PROGRESS_KEY.test(key) || POSITION_KEY.test(key) || Object.hasOwn(SWITCHES, key))) localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

// Applies a checked backup. Returns nothing; the stores notify the open pages themselves.
export function applyBackup(clean, mode) {
  if (mode === "replace") {
    removePersonalKeys();
    watchlistStore.set(clean.watchlist);
    historyStore.set(capHistory(clean.history));
    showPrefsStore.set(clean.showPrefs);
    recentStore.set(clean.recent.slice(0, MAX_RECENT));
    presetStore.set(clean.presets.slice(0, MAX_PRESETS));
    if (clean.settings) settingsStore.set({ ...DEFAULT_SETTINGS, ...clean.settings });
    if (clean.stats) statsStore.set(clean.stats);
    for (const [key, progress] of Object.entries(clean.progress)) writeRaw(key, JSON.stringify(progress));
    for (const [key, position] of Object.entries(clean.positions)) writeRaw(key, JSON.stringify(position));
    for (const [key, text] of Object.entries(clean.switches)) writeRaw(key, text);
    return;
  }

  watchlistStore.set((all) => mergeNewest(all, clean.watchlist));
  historyStore.set((all) => capHistory(mergeNewest(all, clean.history)));
  showPrefsStore.set((all) => {
    const out = { ...all };
    for (const [id, prefs] of Object.entries(clean.showPrefs)) out[id] = { ...prefs, ...all[id] };
    return out;
  });
  recentStore.set((all) => [...new Set([...all, ...clean.recent])].slice(0, MAX_RECENT));
  presetStore.set((all) => {
    const names = new Set(all.map((p) => p.name.toLowerCase()));
    return [...all, ...clean.presets.filter((p) => !names.has(p.name.toLowerCase()))].slice(0, MAX_PRESETS);
  });
  const here = statsStore.get();
  if (clean.stats && here.sec === 0 && here.eps === 0) statsStore.set(clean.stats);

  for (const [key, incoming] of Object.entries(clean.progress)) {
    const current = validateProgress(readParsed(key));
    const last = Math.max(current?.last ?? -1, incoming.last ?? -1);
    const merged = current
      ? { watched: [...new Set([...current.watched, ...incoming.watched])].sort((a, b) => a - b), last: last >= 0 ? last : null }
      : incoming;
    writeRaw(key, JSON.stringify(merged));
  }
  for (const [key, incoming] of Object.entries(clean.positions)) {
    const current = validatePosition(readParsed(key));
    if (!current || incoming.at > current.at) writeRaw(key, JSON.stringify(incoming));
  }
  for (const [key, text] of Object.entries(clean.switches)) {
    if (readRaw(key) === null) writeRaw(key, text);
  }
}
