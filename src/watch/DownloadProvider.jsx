import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DownloadContext, MAX_BATCH, retryEpisodes } from "./useDownload";
import { API_BASE } from "../api";
import { fetchDetails } from "../anilist";
import { getSettings } from "../store/settings";

const BASE_URL = API_BASE;
const POLL_MS = 2000;
const ACTIVE = ["starting", "running", "paused"];
const FINISHED = ["done", "error", "canceled"];

let counter = 0;
const newUid = () => `job-${Date.now()}-${++counter}`;

function saveInBrowser(url) {
  const link = document.createElement("a");
  link.href = url;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// The older screens (episode list, watch panel) were written for ONE download at a time.
// This converts the queue back into that shape: "the job that matters right now".
function toLegacy(job, jobs) {
  const status = job.status === "paused" ? "running" : job.status === "queued" ? "starting" : job.status === "canceled" ? "idle" : job.status;
  const group = jobs.filter((j) => j.group === job.group);
  const overall =
    group.length > 1
      ? { total: group.reduce((n, j) => n + j.episodes.length, 0), completed: group.reduce((n, j) => n + (j.completed ?? 0), 0) }
      : null;
  return { ...job, status, jobId: job.serverId, total: job.episodes.length, overall };
}

function DownloadProvider({ children }) {
  const [jobs, setJobs] = useState([]);
  const [libraryVersion, setLibraryVersion] = useState(0);
  const jobsRef = useRef(jobs);
  const startingRef = useRef(null);

  useEffect(() => {
    jobsRef.current = jobs;
  });

  const patch = useCallback((uid, fields) => {
    setJobs((list) => list.map((j) => (j.uid === uid ? { ...j, ...fields } : j)));
  }, []);

  const active = jobs.find((j) => ACTIVE.includes(j.status)) ?? null;
  const nextQueued = jobs.find((j) => j.status === "queued") ?? null;

  // 1. Start the next waiting job whenever nothing is running.
  useEffect(() => {
    if (active || !nextQueued || startingRef.current === nextQueued.uid) return;
    const job = nextQueued;
    startingRef.current = job.uid;

    (async () => {
      patch(job.uid, { status: "starting" });
      try {
        const res = await fetch(`${BASE_URL}/anime/${job.animeId}/download`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ episodes: job.episodes, lang: job.lang, meta: job.meta }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
        patch(job.uid, { status: "running", serverId: data.jobId });
        // The user pressed Cancel while we were still asking the server to start.
        if (jobsRef.current.find((j) => j.uid === job.uid)?.cancelling) {
          fetch(`${BASE_URL}/downloads/${data.jobId}`, { method: "DELETE" }).catch(() => {});
        }
      } catch (err) {
        console.error("Download failed:", err);
        patch(job.uid, { status: "error", error: err.message });
      } finally {
        startingRef.current = null;
      }
    })();
  }, [active, nextQueued, patch]);

  // 2. Poll the running job for progress.
  const pollUid = active && (active.status === "running" || active.status === "paused") ? active.uid : null;
  const pollServerId = pollUid ? active.serverId : null;

  useEffect(() => {
    if (!pollUid || !pollServerId) return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`${BASE_URL}/downloads/${pollServerId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

        const before = jobsRef.current.find((j) => j.uid === pollUid);
        const progress = {
          title: data.title,
          completed: data.completed,
          current: data.current,
          failed: data.failed,
          stage: data.stage,
          bytes: data.bytes,
          lastError: data.lastError,
          done: data.done ?? [],
        };
        if (before && data.completed !== before.completed) setLibraryVersion((v) => v + 1);

        if (data.status === "done") {
          const fileUrl = `${BASE_URL}/downloads/${pollServerId}/file`;
          patch(pollUid, { status: "done", ...progress, filename: data.filename, fileUrl });
          setLibraryVersion((v) => v + 1);
          if (before?.saveZip) saveInBrowser(fileUrl);
        } else if (data.status === "error") {
          patch(pollUid, { status: "error", ...progress, error: data.error });
        } else if (data.status === "canceled") {
          patch(pollUid, { status: "canceled", ...progress });
          setLibraryVersion((v) => v + 1);
        } else {
          patch(pollUid, { ...progress, status: data.paused ? "paused" : "running" });
        }
      } catch (err) {
        console.error("Download status failed:", err);
        patch(pollUid, { status: "error", error: err.message });
      }
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [pollUid, pollServerId, patch]);

  const enqueue = useCallback(
    async (animeId, episodes, lang, { auto = false } = {}) => {
      const d = await fetchDetails(animeId).catch(() => null);

      // Don't queue episodes that are already waiting or downloading.
      const busyEpisodes = new Set(
        jobsRef.current
          .filter((j) => !FINISHED.includes(j.status) && String(j.animeId) === String(animeId) && j.lang === lang)
          .flatMap((j) => j.episodes),
      );
      const fresh = [...new Set(episodes)].filter((n) => !busyEpisodes.has(n)).sort((a, b) => a - b);
      if (fresh.length === 0) return;

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

      const group = newUid();
      const batches = [];
      for (let i = 0; i < fresh.length; i += MAX_BATCH) batches.push(fresh.slice(i, i + MAX_BATCH));

      setJobs((list) => [
        ...list,
        ...batches.map((batch) => ({
          uid: newUid(),
          group,
          animeId,
          title: d?.title ?? `Anime ${animeId}`,
          cover: d?.cover ?? null,
          lang,
          episodes: batch,
          meta,
          auto,
          saveZip: !auto && getSettings().saveZipToDevice,
          status: "queued",
          completed: 0,
          done: [],
          failed: [],
        })),
      ]);
    },
    [],
  );

  const start = useCallback((animeId, episodes, lang) => enqueue(animeId, episodes, lang), [enqueue]);

  const cancel = useCallback(
    (uid) => {
      const job = jobsRef.current.find((j) => j.uid === uid);
      if (!job) return;
      if (job.status === "queued") {
        setJobs((list) => list.filter((j) => j.uid !== uid));
        return;
      }
      patch(uid, { cancelling: true });
      if (job.serverId) fetch(`${BASE_URL}/downloads/${job.serverId}`, { method: "DELETE" }).catch(() => {});
    },
    [patch],
  );

  const setPaused = useCallback(
    (uid, paused) => {
      const job = jobsRef.current.find((j) => j.uid === uid);
      if (!job?.serverId) return;
      patch(uid, { status: paused ? "paused" : "running" });
      fetch(`${BASE_URL}/downloads/${job.serverId}/${paused ? "pause" : "resume"}`, { method: "POST" }).catch(() => {});
    },
    [patch],
  );

  // Queue the episodes a finished job couldn't get as a fresh job. The old job is marked `retried`
  // so its button goes away and the same episodes can't be queued twice.
  const retry = useCallback((uid) => {
    const job = jobsRef.current.find((j) => j.uid === uid);
    const episodes = job ? retryEpisodes(job) : [];
    if (episodes.length === 0) return;

    const busy = new Set(
      jobsRef.current
        .filter((j) => !FINISHED.includes(j.status) && String(j.animeId) === String(job.animeId) && j.lang === job.lang)
        .flatMap((j) => j.episodes),
    );
    const fresh = episodes.filter((n) => !busy.has(n));
    if (fresh.length === 0) return;

    setJobs((list) => [
      ...list.map((j) => (j.uid === uid ? { ...j, retried: true } : j)),
      {
        uid: newUid(),
        group: job.group,
        animeId: job.animeId,
        title: job.title,
        cover: job.cover,
        lang: job.lang,
        episodes: fresh,
        meta: job.meta,
        auto: job.auto,
        saveZip: job.saveZip,
        status: "queued",
        completed: 0,
        done: [],
        failed: [],
      },
    ]);
  }, []);

  const retryAll = useCallback(() => {
    jobsRef.current.filter((j) => retryEpisodes(j).length > 0).forEach((j) => retry(j.uid));
  }, [retry]);

  const refreshLibrary = useCallback(() => setLibraryVersion((v) => v + 1), []);

  const clearFinished = useCallback(() => setJobs((list) => list.filter((j) => !FINISHED.includes(j.status))), []);

  const value = useMemo(() => {
    const shown = active ?? [...jobs].reverse().find((j) => j.status === "done" || j.status === "error") ?? null;
    return {
      download: shown ? toLegacy(shown, jobs) : { status: "idle" },
      start,
      startAll: start,
      enqueue,
      jobs,
      pending: jobs.filter((j) => !FINISHED.includes(j.status)).length,
      libraryVersion,
      refreshLibrary,
      cancel,
      retry,
      retryAll,
      pause: (uid) => setPaused(uid, true),
      resume: (uid) => setPaused(uid, false),
      clearFinished,
    };
  }, [active, jobs, start, enqueue, libraryVersion, refreshLibrary, cancel, retry, retryAll, setPaused, clearFinished]);

  return <DownloadContext.Provider value={value}>{children}</DownloadContext.Provider>;
}

export default DownloadProvider;
