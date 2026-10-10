import { useEffect, useRef, useState } from "react";
import { DownloadContext, MAX_BATCH } from "./useDownload";
import { API_BASE } from "../api";
import { fetchDetails } from "../anilist";

const BASE_URL = API_BASE;
const POLL_MS = 2000;

function saveInBrowser(url) {
  const link = document.createElement("a");
  link.href = url;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function DownloadProvider({ children }) {
  const [download, setDownload] = useState({ status: "idle" });
  const { status, jobId } = download;
  const saved = useRef(null);

  const [queue, setQueue] = useState(null);

  useEffect(() => {
    if (status !== "running") return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`${BASE_URL}/downloads/${jobId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

        const progress = {
          title: data.title,
          total: data.total,
          completed: data.completed,
          current: data.current,
          failed: data.failed,
          stage: data.stage,
          bytes: data.bytes,
          lastError: data.lastError,
        };

        if (data.status === "done") {
          setDownload({
            status: "done",
            jobId,
            ...progress,
            filename: data.filename,
            fileUrl: `${BASE_URL}/downloads/${jobId}/file`,
          });
        } else if (data.status === "error") {
          setDownload({ status: "error", jobId, ...progress, error: data.error });
        } else {
          setDownload((d) => ({ ...d, ...progress }));
        }
      } catch (err) {
        console.error("Download status failed:", err);
        setDownload({ status: "error", error: err.message });
      }
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [status, jobId]);

  useEffect(() => {
    if (status === "done" && saved.current !== jobId) {
      saved.current = jobId;
      saveInBrowser(download.fileUrl);
    }
  }, [status, jobId, download.fileUrl]);

  useEffect(() => {
    if (!queue || (status !== "done" && status !== "error")) return;

    const [next, ...rest] = queue.rest;
    if (!next) {
      setQueue(null);
      return;
    }
    setQueue({ ...queue, rest, finished: queue.finished + (download.total ?? 0) });
    start(queue.animeId, next, queue.lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, queue]);

  async function start(animeId, episodes, lang) {
    if (status === "starting" || status === "running") return;

    setDownload({ status: "starting", total: episodes.length, completed: 0 });
    try {
      const d = await fetchDetails(animeId).catch(() => null);
      const meta = d && {
        malId: d.malId ?? null,
        title: d.title,
        description: d.description,
        coverUrl: d.cover,
        episodes: d.episodes,
        status: d.status,
        format: d.format,
        rating: d.rating,
        genres: d.genres,
        releaseDate: d.releaseDate,
        duration: d.duration,
      };
      const res = await fetch(`${BASE_URL}/anime/${animeId}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodes, lang, meta }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setDownload({
        status: "running",
        jobId: data.jobId,
        total: episodes.length,
        completed: 0,
      });
    } catch (err) {
      console.error("Download failed:", err);
      setDownload({ status: "error", error: err.message });
    }
  }

  function startAll(animeId, episodes, lang) {
    if (status === "starting" || status === "running" || episodes.length === 0) return;

    const batches = [];
    for (let i = 0; i < episodes.length; i += MAX_BATCH) batches.push(episodes.slice(i, i + MAX_BATCH));

    setQueue(
      batches.length > 1
        ? { animeId, lang, rest: batches.slice(1), total: episodes.length, finished: 0 }
        : null,
    );
    start(animeId, batches[0], lang);
  }

  const overall = queue
    ? { total: queue.total, completed: queue.finished + (download.completed ?? 0) }
    : null;

  return (
    <DownloadContext.Provider value={{ download: { ...download, overall }, start, startAll }}>
      {children}
    </DownloadContext.Provider>
  );
}

export default DownloadProvider;
