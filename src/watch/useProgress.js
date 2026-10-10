import { useCallback, useState } from "react";

const keyFor = (animeId) => `progress:${animeId}`;

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
  }
}

export function rememberEpisode(animeId, episode) {
  const progress = read(animeId);
  write(animeId, { ...progress, last: episode });
}

export function useProgress(animeId) {
  const [state, setState] = useState(() => ({ id: animeId, ...read(animeId) }));

  let current = state;
  if (state.id !== animeId) {
    current = { id: animeId, ...read(animeId) };
    setState(current);
  }

  const markWatched = useCallback(
    (episode) => {
      const progress = read(animeId);
      if (!progress.watched.includes(episode)) progress.watched.push(episode);
      progress.last = episode;
      write(animeId, progress);
      setState({ id: animeId, ...progress });
    },
    [animeId],
  );

  return [current, markWatched];
}
