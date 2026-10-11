import { createStore, today, useStore } from "./storage";
import { getSettings } from "./settings";
import { validateStats } from "./validators";

// Everything stays on this device. Nothing here is ever sent anywhere.
// { days: { "2026-10-10": { sec, eps } }, shows: { [id]: { title, sec, eps } }, genres: { Action: sec }, sec, eps, since }
const EMPTY = { days: {}, shows: {}, genres: {}, sec: 0, eps: 0, since: null };
export const statsStore = createStore("stats:v1", EMPTY, { validate: validateStats });

const MAX_DAYS = 120;

function update(fn) {
  if (!getSettings().collectStats) return;
  statsStore.set((s) => {
    const next = fn({
      ...EMPTY,
      ...s,
      days: { ...s.days },
      shows: { ...s.shows },
      genres: { ...s.genres },
      since: s.since ?? today(),
    });
    const keys = Object.keys(next.days).sort();
    keys.slice(0, Math.max(0, keys.length - MAX_DAYS)).forEach((k) => delete next.days[k]);
    return next;
  });
}

export function addWatchTime({ anime, seconds }) {
  if (!anime?.id || !(seconds > 0)) return;
  update((s) => {
    const day = today();
    s.days[day] = { sec: (s.days[day]?.sec ?? 0) + seconds, eps: s.days[day]?.eps ?? 0 };
    s.shows[anime.id] = { title: anime.title, sec: (s.shows[anime.id]?.sec ?? 0) + seconds, eps: s.shows[anime.id]?.eps ?? 0 };
    for (const g of anime.genres ?? []) s.genres[g] = (s.genres[g] ?? 0) + seconds;
    s.sec += seconds;
    return s;
  });
}

export function addFinishedEpisode({ anime }) {
  if (!anime?.id) return;
  update((s) => {
    const day = today();
    s.days[day] = { sec: s.days[day]?.sec ?? 0, eps: (s.days[day]?.eps ?? 0) + 1 };
    s.shows[anime.id] = { title: anime.title, sec: s.shows[anime.id]?.sec ?? 0, eps: (s.shows[anime.id]?.eps ?? 0) + 1 };
    s.eps += 1;
    return s;
  });
}

export function summarize(stats) {
  const dayKey = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return d.toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
  };
  const week = Array.from({ length: 7 }, (_, i) => {
    const key = dayKey(6 - i);
    return { key, label: new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" }), sec: stats.days[key]?.sec ?? 0 };
  });

  let streak = 0;
  for (let i = 0; i < 400; i++) {
    if ((stats.days[dayKey(i)]?.sec ?? 0) > 0) streak++;
    else if (i > 0) break; // today may not have started yet, so allow a gap on day 0 only
  }

  const top = (obj, n, pick) =>
    Object.entries(obj)
      .map(([key, v]) => ({ key, ...pick(v) }))
      .sort((a, b) => b.sec - a.sec)
      .slice(0, n);

  const weekSec = week.reduce((sum, d) => sum + d.sec, 0);
  return {
    week,
    weekSec,
    streak,
    totalSec: stats.sec,
    totalEps: stats.eps,
    shows: top(stats.shows, 5, (v) => ({ title: v.title, sec: v.sec, eps: v.eps })),
    genres: top(stats.genres, 5, (v) => ({ title: undefined, sec: v })),
    since: stats.since,
  };
}

export const useStats = () => useStore(statsStore);

export function formatDuration(seconds) {
  const total = Math.round(seconds || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h >= 1) return `${h}h ${m}m`;
  if (m >= 1) return `${m}m`;
  return total > 0 ? "<1m" : "0m";
}
