import { useEffect, useState } from "react";
import { API_BASE } from "../api";
import { animeBasics } from "../anilist";

const API_URL = `${API_BASE}/anime`;

export function useSkipTimes(animeId, episode) {
  const [result, setResult] = useState({ key: null, segments: [] });
  const key = episode == null ? null : `${animeId}:${episode}`;

  useEffect(() => {
    if (key == null) return;
    const controller = new AbortController();

    animeBasics(animeId)
      .then((b) => fetch(`${API_URL}/${animeId}/skip-times/${episode}${b?.malId ? `?mal=${b.malId}` : ""}`, { signal: controller.signal }))
      .then((res) => (res.ok ? res.json() : { segments: [] }))
      .then((data) => setResult({ key, segments: data.segments ?? [] }))
      .catch((err) => {
        if (err.name !== "AbortError") console.warn("Skip times failed:", err);
      });

    return () => controller.abort();
  }, [key, animeId, episode]);

  return result.key === key ? result.segments : [];
}
