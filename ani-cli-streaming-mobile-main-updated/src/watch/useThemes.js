import { useEffect, useState } from "react";
import { API_BASE } from "../api";
import { animeBasics } from "../anilist";

const EMPTY = { openings: [], endings: [] };

export function useThemes(animeId) {
  const [result, setResult] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    animeBasics(animeId)
      .then((b) => fetch(`${API_BASE}/anime/${animeId}/themes${b?.malId ? `?mal=${b.malId}` : ""}`, { signal: controller.signal }))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setResult({ id: animeId, themes: data ?? EMPTY }))
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("Themes failed:", err);
        setResult({ id: animeId, themes: EMPTY });
      });
    return () => controller.abort();
  }, [animeId]);

  const ready = result?.id === animeId;
  return { ...(ready ? result.themes : EMPTY), loading: !ready };
}
