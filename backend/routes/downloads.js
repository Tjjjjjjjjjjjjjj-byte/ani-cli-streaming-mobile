import { Router } from "express";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { downloadEpisode } from "../anime.mjs";
import { addEpisode, findEpisode, hasEpisodes, sendPackage, fileSafe } from "../library.mjs";
import { aniList, cleanDescription, detailsQuery } from "../lib/anilist.js";
import { getSkipSegments } from "./skipTimes.js";
import { getEpisodeInfo } from "./episodeInfo.js";

const router = Router();

const DOWNLOAD_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "downloads");
const MAX_BATCH = 50;
const jobs = new Map();

await fs.rm(DOWNLOAD_ROOT, { recursive: true, force: true });

function describeEpisodes(list) {
  const runs = [];
  for (const n of list) {
    const last = runs.at(-1);
    if (last && n === last[1] + 1) last[1] = n;
    else runs.push([n, n]);
  }
  return runs.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(", ");
}

function downloadName(job) {
  const label = job.okEpisodes.length === 1 ? "Episode" : "Episodes";
  return `${fileSafe(job.title)} (${label} ${describeEpisodes(job.okEpisodes)}).zip`;
}

function toAnimeMeta(m) {
  return {
    id: m.id,
    malId: m.idMal ?? null,
    title: m.title.english || m.title.romaji,
    description: cleanDescription(m.description),
    coverUrl: m.coverImage.extraLarge,
    episodes: m.episodes,
    status: m.status,
    format: m.format,
    rating: m.averageScore,
    genres: m.genres ?? [],
    releaseDate: m.startDate,
    duration: m.duration,
  };
}

async function folderBytes(dir) {
  try {
    let sum = 0;
    for (const name of await fs.readdir(dir)) sum += (await fs.stat(path.join(dir, name))).size;
    return sum;
  } catch {
    return 0;
  }
}

async function runJob(job) {
  for (const episode of job.episodes) {
    job.current = episode;
    try {
      const existing = await findEpisode(job.animeId, episode, job.lang);
      if (existing) {
        job.keys.push(existing.key);
        job.files.push(existing.video);
        job.okEpisodes.push(episode);
        continue;
      }

      const download = await downloadEpisode(job.title, episode, job.lang, job.dir, (stage) => {
        job.stage = stage;
      });
      const skip = await getSkipSegments(job.animeId, episode).catch(() => []);
      const info = await getEpisodeInfo(job.animeId).then((all) => all[episode] ?? null).catch(() => null);

      job.stage = "saving";
      const entry = await addEpisode(job.meta, {
        number: episode,
        lang: job.lang,
        videoPath: download.file,
        subtitleUrl: download.subtitles,
        referer: download.referer,
        skip,
        info,
      });
      job.keys.push(entry.key);
      job.files.push(entry.video);
      job.okEpisodes.push(episode);
    } catch (error) {
      console.error(`Download of episode ${episode} failed:`, error);
      job.failed.push({ episode, error: error.message });
      job.lastError = error.message;
    }
  }

  job.current = null;
  job.stage = null;
  await fs.rm(job.dir, { recursive: true, force: true });
  if (job.files.length === 0) {
    job.status = "error";
    job.error = job.failed[0]?.error ?? "Nothing was downloaded.";
  } else {
    job.status = "done";
  }
}

router.post("/anime/:id/download", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1)
    return res.status(400).json({ error: "Invalid anime id." });

  const lang = req.body?.lang === "dub" ? "dub" : "sub";
  const raw = req.body?.episodes;
  if (!Array.isArray(raw))
    return res.status(400).json({ error: "Send the episodes to download as a list." });

  const episodes = [...new Set(raw.map(Number))].sort((a, b) => a - b);
  if (episodes.length === 0 || episodes.some((n) => !Number.isInteger(n) || n < 1))
    return res.status(400).json({ error: "Pick at least one valid episode." });
  if (episodes.length > MAX_BATCH)
    return res.status(400).json({ error: `Pick ${MAX_BATCH} episodes or fewer at a time.` });

  const key = `${id}:${lang}:${episodes.join(",")}`;
  for (const job of jobs.values()) {
    if (job.key !== key) continue;
    if (job.status === "running") return res.json({ jobId: job.id });
    if (job.status === "done" && (await hasEpisodes(id, job.keys))) {
      return res.json({ jobId: job.id });
    }
  }

  try {
    const data = await aniList(detailsQuery, { id });
    const meta = toAnimeMeta(data.Media);
    const title = meta.title;

    const job = {
      id: randomUUID(),
      key,
      animeId: id,
      meta,
      title,
      lang,
      episodes,
      dir: null,
      status: "running",
      current: null,
      stage: null,
      lastError: null,
      files: [],
      keys: [],
      okEpisodes: [],
      failed: [],
      error: null,
    };
    job.dir = path.join(DOWNLOAD_ROOT, job.id);
    await fs.mkdir(job.dir, { recursive: true });
    jobs.set(job.id, job);

    runJob(job);
    res.json({ jobId: job.id });
  } catch (error) {
    console.error("Download start failed:", error);
    const status =
      error.status === 404 || error.status === 429 ? error.status : 502;
    res.status(status).json({ error: error.message });
  }
});

router.get("/downloads/:jobId", async (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Unknown download." });
  res.json({
    stage: job.stage,
    bytes: job.status === "running" ? await folderBytes(job.dir) : 0,
    lastError: job.lastError,
    status: job.status,
    error: job.error,
    title: job.title,
    total: job.episodes.length,
    completed: job.files.length,
    current: job.current,
    failed: job.failed.map((f) => f.episode),
    filename: job.status === "done" ? downloadName(job) : null,
  });
});

router.get("/downloads/:jobId/file", async (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job || job.status !== "done")
    return res.status(404).json({ error: "That file isn't ready." });

  try {
    await sendPackage(res, job.animeId, job.keys, downloadName(job));
  } catch (error) {
    console.error("Package failed:", error);
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
});

export default router;
