import { useEffect, useState } from "react";
import { fetchDiscover } from "../anilist";

export function useDiscover() {
  const [result, setResult] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchDiscover(controller.signal)
      .then((data) => setResult({ data }))
      .catch((err) => {
        if (err.name === "AbortError") return;
        setResult({
          error:
            err.status === 429
              ? "AniList is limiting requests right now. Wait a minute, then try again."
              : err.message || "Couldn’t load the home page.",
        });
      });
    return () => controller.abort();
  }, [tick]);

  function reload() {
    setResult(null);
    setTick((n) => n + 1);
  }

  const status = !result ? "loading" : result.error ? "error" : "ready";
  return [
    { status, hero: result?.data?.hero ?? [], rows: result?.data?.rows ?? [], error: result?.error ?? null },
    reload,
  ];
}
