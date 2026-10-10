import { useContext, useEffect, useState } from "react";
import { API_BASE, STANDALONE } from "../api";
import { DownloadContext } from "../watch/useDownload";

const EMPTY = new Set();

// Which episodes of this anime (in this language) are already saved in the library?
// Refreshes whenever the download queue finishes an episode.
export function useSavedEpisodes(animeId, lang) {
  const version = useContext(DownloadContext)?.libraryVersion ?? 0;
  const [state, setState] = useState({ key: null, saved: EMPTY });
  const key = `${animeId}:${lang}:${version}`;

  useEffect(() => {
    if (STANDALONE) return;
    const controller = new AbortController();
    fetch(`${API_BASE}/library/${animeId}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { episodes: [] }))
      .then((data) => {
        const saved = new Set((data.episodes ?? []).filter((e) => e.lang === lang).map((e) => e.number));
        setState({ key, saved });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [key, animeId, lang]);

  // Keep showing the last known answer while a refresh is in flight, but only for the same anime.
  return state.key?.startsWith(`${animeId}:${lang}:`) ? state.saved : EMPTY;
}
