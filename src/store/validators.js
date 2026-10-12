// Validators for data read back from localStorage. Each one takes whatever was
// stored (anything at all) and returns a value that is safe to render.
// They never throw; unusable input becomes an empty / default value.

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const num = (v, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v, fallback = "") => (typeof v === "string" ? v : fallback);
const idOf = (v) => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return Number.isInteger(n) && n > 0 ? n : null;
};

const LIST_STATUS_VALUES = ["watching", "planning", "completed"];
const MAX_RECENT_STORED = 50;

// Recent searches: array of non-empty strings.
export function validateStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((s) => typeof s === "string" && s.trim() !== "").slice(0, MAX_RECENT_STORED);
}

// Saved search presets: array of objects with a string id and name.
export function validatePresets(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((p) => isPlainObject(p) && typeof p.id === "string" && typeof p.name === "string" && p.name !== "");
}

// Keep only keys that exist in the defaults and have the same type as the default.
// Anything else falls back to the default value when settings are read.
export function validateAgainstDefaults(defaults) {
  return (value) => {
    if (!isPlainObject(value)) return { ...defaults };
    const out = {};
    for (const [key, def] of Object.entries(defaults)) {
      if (typeof value[key] === typeof def && (typeof def !== "number" || Number.isFinite(value[key]))) out[key] = value[key];
    }
    return out;
  };
}

// Watchlist: { [animeId]: { id, title, status, ... } }. Bad entries are dropped.
export function validateWatchlist(value) {
  if (!isPlainObject(value)) return {};
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isPlainObject(entry)) continue;
    const id = idOf(entry.id ?? key);
    if (id === null || !LIST_STATUS_VALUES.includes(entry.status)) continue;
    out[id] = {
      ...entry,
      id,
      title: str(entry.title, "Untitled"),
      cover: typeof entry.cover === "string" ? entry.cover : null,
      format: typeof entry.format === "string" ? entry.format : null,
      episodes: Number.isFinite(entry.episodes) ? entry.episodes : null,
      available: Number.isFinite(entry.available) ? entry.available : null,
      rating: Number.isFinite(entry.rating) ? entry.rating : null,
      status: entry.status,
      addedAt: num(entry.addedAt),
      updatedAt: num(entry.updatedAt),
    };
  }
  return out;
}

// Watch history: { [animeId]: { id, title, episode, time, duration, ... } }.
export function validateHistory(value) {
  if (!isPlainObject(value)) return {};
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isPlainObject(entry)) continue;
    const id = idOf(entry.id ?? key);
    const episode = num(entry.episode, NaN);
    if (id === null || !Number.isFinite(episode) || episode < 0) continue;
    out[id] = {
      ...entry,
      id,
      title: str(entry.title, "Untitled"),
      cover: typeof entry.cover === "string" ? entry.cover : null,
      anime: isPlainObject(entry.anime) ? entry.anime : { id, title: str(entry.title, "Untitled"), cover: str(entry.cover, "") },
      episode,
      lang: str(entry.lang, "sub"),
      time: num(entry.time),
      duration: num(entry.duration),
      total: Number.isFinite(entry.total) ? entry.total : null,
      finished: entry.finished === true,
      updatedAt: num(entry.updatedAt),
    };
  }
  return out;
}

// Per-show preferences: { [animeId]: { ...anything } }.
export function validateShowPrefs(value) {
  if (!isPlainObject(value)) return {};
  const out = {};
  for (const [key, prefs] of Object.entries(value)) if (isPlainObject(prefs)) out[key] = prefs;
  return out;
}

// Watch statistics.
export function validateStats(value) {
  const empty = { days: {}, shows: {}, genres: {}, sec: 0, eps: 0, since: null };
  if (!isPlainObject(value)) return empty;
  return {
    ...value,
    days: isPlainObject(value.days) ? value.days : {},
    shows: isPlainObject(value.shows) ? value.shows : {},
    genres: isPlainObject(value.genres) ? value.genres : {},
    sec: num(value.sec),
    eps: num(value.eps),
    since: typeof value.since === "string" ? value.since : null,
  };
}

// Watched-episode progress for one show (the progress:<id> key): { watched: [1, 2, ...], last }.
export function validateProgress(value) {
  if (!isPlainObject(value)) return null;
  const whole = (n) => Number.isInteger(n) && n >= 0;
  return {
    watched: Array.isArray(value.watched) ? [...new Set(value.watched.filter(whole))].sort((a, b) => a - b) : [],
    last: whole(value.last) ? value.last : null,
  };
}

// A resume spot for one episode (the pos:<id>:<episode> key): { t: seconds, d: duration, at: saved-at }.
export function validatePosition(value) {
  if (!isPlainObject(value) || !Number.isFinite(value.t) || value.t < 0) return null;
  return { t: value.t, d: num(value.d), at: num(value.at) };
}
