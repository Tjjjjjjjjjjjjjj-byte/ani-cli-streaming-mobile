import { useCallback, useEffect, useMemo, useState } from "react";

const keyFor = (animeId) => `progress:${animeId}`;
const CHANGED = "progress:changed";

function read(animeId) {
  try {
    const p = JSON.parse(localStorage.getItem(keyFor(animeId)));
    return {
      watched: Array.isArray(p?.watched) ? p.watched.filter(Number.isInteger) : [],
      last: Number.isInteger(p?.last) ? p.last : null,
    };
  } catch {
    return { watched: [], last: null };
  }
}

function write(animeId, progress) {
  try {
    localStorage.setItem(keyFor(animeId), JSON.stringify(progress));
  } catch {
    // Storage full or blocked: progress just won't be remembered.
  }
}

// Open pages re-read their progress when it changes anywhere (including from the list menu).
const notify = (animeId) => window.dispatchEvent(new CustomEvent(CHANGED, { detail: { id: String(animeId) } }));

export function rememberEpisode(animeId, episode) {
  const progress = read(animeId);
  write(animeId, { ...progress, last: episode });
}

export function markEpisodeWatched(animeId, episode) {
  const progress = read(animeId);
  if (!progress.watched.includes(episode)) progress.watched.push(episode);
  progress.last = episode;
  write(animeId, progress);
  notify(animeId);
}

// Episodes 1..count all count as watched (used when a show is marked Completed by hand).
export function markAllWatched(animeId, count) {
  const total = Math.floor(count);
  if (!(total >= 1)) return;
  const progress = read(animeId);
  const all = new Set(progress.watched);
  for (let n = 1; n <= total; n++) all.add(n);
  write(animeId, { watched: [...all].sort((a, b) => a - b), last: Math.max(progress.last ?? 0, total) });
  notify(animeId);
}

// Non-hook read, for list pages that show many shows at once.
export const readProgress = read;

// Which episode "Continue" should open: the one you were on, or the next one if you finished it.
export function resumeEpisode({ last, watched }, available) {
  if (last == null) return 1;
  const finishedLast = watched.includes(last);
  return finishedLast && (available == null || last < available) ? last + 1 : last;
}

// The furthest episode you have reached (0 = not started).
export function furthestEpisode({ last, watched }) {
  return Math.max(last ?? 0, ...watched);
}

export function useProgress(animeId) {
  // Bumped whenever this show's progress changes. The state itself is derived from
  // (animeId, version), so switching shows needs no setState during render.
  const [version, setVersion] = useState(0);
  const id = String(animeId);

  useEffect(() => {
    const onChange = (e) => e.detail?.id === id && setVersion((v) => v + 1);
    window.addEventListener(CHANGED, onChange);
    return () => window.removeEventListener(CHANGED, onChange);
  }, [id]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const state = useMemo(() => ({ id: animeId, ...read(animeId) }), [animeId, version]);
  const markWatched = useCallback((episode) => markEpisodeWatched(animeId, episode), [animeId]);

  return [state, markWatched];
}
