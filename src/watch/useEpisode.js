import { useEffect, useState } from "react";
import { API_BASE } from "../api";
import { animeBasics } from "../anilist";

const API_URL = `${API_BASE}/anime`;

export function useEpisode(animeId, episode, lang = "sub") {
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const key = episode == null ? null : `${animeId}:${episode}:${lang}:${attempt}`;

  useEffect(() => {
    if (key == null) return;
    const controller = new AbortController();

    animeBasics(animeId)
      .then((basics) => {
        const params = new URLSearchParams({ lang });
        if (basics?.title) params.set("title", basics.title);
        if (basics?.malId) params.set("mal", String(basics.malId));
        return fetch(`${API_URL}/${animeId}/episode/${episode}?${params}`, {
          method: "POST",
          signal: controller.signal,
        });
      })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
        return data;
      })
      .then((data) => setResult({ key, data, error: null }))
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("Watch failed:", err);
        setResult({ key, data: null, error: err.message });
      });

    return () => controller.abort();
  }, [key, animeId, episode, lang]);

  const retry = () => setAttempt((n) => n + 1);

  if (key == null) return [null, retry];
  if (result?.key !== key) return [{ episode, lang, status: "loading" }, retry];
  if (result.error) return [{ episode, lang, status: "error", error: result.error }, retry];
  return [
    {
      episode,
      lang,
      status: "ready",
      url: result.data.url,
      subtitles: result.data.subtitles,
    },
    retry,
  ];
}

export function usePlayerPrefs() {
  const [prefs, setPrefs] = useState(() => {
    try {
      return {
        autoPlay: localStorage.getItem("player:autoPlay") !== "off",
        autoNext: localStorage.getItem("player:autoNext") === "on",
        autoSkip: localStorage.getItem("player:autoSkip") === "on",
      };
    } catch {
      return { autoPlay: true, autoNext: false, autoSkip: false };
    }
  });

  function toggle(name) {
    setPrefs((p) => {
      const next = { ...p, [name]: !p[name] };
      try {
        localStorage.setItem(`player:${name}`, next[name] ? "on" : "off");
      } catch {
      }
      return next;
    });
  }

  return [prefs, toggle];
}
