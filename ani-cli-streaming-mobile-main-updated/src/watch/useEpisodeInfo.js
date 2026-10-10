import { useEffect, useState } from "react";
import { API_BASE } from "../api";
import { animeBasics } from "../anilist";

const EMPTY = {};

export function useEpisodeInfo(animeId) {
  const [result, setResult] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    animeBasics(animeId)
      .then((b) => fetch(`${API_BASE}/anime/${animeId}/episode-info${b?.malId ? `?mal=${b.malId}` : ""}`, { signal: controller.signal }))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setResult({ id: animeId, episodes: data?.episodes ?? EMPTY }))
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("Episode info failed:", err);
        setResult({ id: animeId, episodes: EMPTY });
      });
    return () => controller.abort();
  }, [animeId]);

  const ready = result?.id === animeId;
  return { episodes: ready ? result.episodes : EMPTY, loading: !ready };
}
