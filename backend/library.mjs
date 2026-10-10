import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import archiver from "archiver";
import unzipper from "unzipper";

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.dirname(fileURLToPath(import.meta.url));
export const LIBRARY_ROOT = path.join(DATA_DIR, "library");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const VIDEO_EXT = /\.(mp4|mkv|webm|m4v)$/i;
const COVER_EXT = /\.(jpg|jpeg|png|webp)$/i;
const SAFE_NAME = /^[\w][\w .()-]*$/;
const KEY_RE = /^E\d+\.(sub|dub)$/;

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function fileSafe(name) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim() || "anime";
}

export function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const animeDir = (id) => path.join(LIBRARY_ROOT, String(id));
export const episodeKey = (number, lang) => `E${String(number).padStart(2, "0")}.${lang}`;

const exists = (file) => fs.access(file).then(() => true, () => false);

const locks = new Map();
function withLock(id, fn) {
  const previous = locks.get(id) ?? Promise.resolve();
  const next = previous.then(() => fn());
  locks.set(id, next.catch(() => {}));
  return next;
}

export async function readManifest(id) {
  try {
    return JSON.parse(await fs.readFile(path.join(animeDir(id), "manifest.json"), "utf8"));
  } catch {
    return null;
  }
}

async function writeManifest(id, manifest) {
  const file = path.join(animeDir(id), "manifest.json");
  await fs.writeFile(`${file}.tmp`, JSON.stringify(manifest, null, 2));
  await fs.rename(`${file}.tmp`, file);
}

const byEpisode = (a, b) => a.number - b.number || a.lang.localeCompare(b.lang);

function cleanSkip(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (s) =>
        (s?.type === "op" || s?.type === "ed") &&
        Number.isFinite(s.start) &&
        Number.isFinite(s.end) &&
        s.end > s.start,
    )
    .map((s) => ({ type: s.type, start: s.start, end: s.end }));
}

function animeFields(meta) {
  return {
    id: meta.id,
    malId: meta.malId ?? null,
    title: meta.title,
    description: meta.description ?? null,
    episodes: meta.episodes ?? null,
    status: meta.status ?? null,
    format: meta.format ?? null,
    rating: meta.rating ?? null,
    genres: meta.genres ?? [],
    releaseDate: meta.releaseDate ?? null,
    duration: meta.duration ?? null,
  };
}

function vttTime(h, m, s, fraction) {
  const ms = String(fraction).padEnd(3, "0").slice(0, 3);
  return `${String(h).padStart(2, "0")}:${m}:${s}.${ms}`;
}

function assToVtt(text) {
  const lines = text.split(/\r?\n/);
  let fields = ["Layer", "Start", "End", "Style", "Name", "MarginL", "MarginR", "MarginV", "Effect", "Text"];
  const cues = [];

  for (const line of lines) {
    if (line.startsWith("Format:") && line.includes("Text")) {
      fields = line.slice(7).split(",").map((f) => f.trim());
    } else if (line.startsWith("Dialogue:")) {
      const parts = line.slice(9).trim().split(",");
      const textAt = fields.indexOf("Text");
      const row = { ...Object.fromEntries(fields.slice(0, textAt).map((f, i) => [f, parts[i]])) };
      const body = parts
        .slice(textAt)
        .join(",")
        .replace(/\{[^}]*\}/g, "")
        .replace(/\\[Nn]/g, "\n")
        .replace(/\\h/g, " ")
        .trim();
      const time = (t) => {
        const m = /^(\d+):(\d\d):(\d\d)[.](\d+)$/.exec(String(t).trim());
        return m ? vttTime(m[1], m[2], m[3], m[4]) : null;
      };
      const start = time(row.Start);
      const end = time(row.End);
      if (start && end && body) cues.push({ start, end, body });
    }
  }
  cues.sort((a, b) => a.start.localeCompare(b.start));
  return `WEBVTT\n\n${cues.map((c) => `${c.start} --> ${c.end}\n${c.body}`).join("\n\n")}\n`;
}

export function toVtt(raw) {
  const text = raw.replace(/^\uFEFF/, "");
  if (text.startsWith("WEBVTT")) return text;
  if (/^\[Script Info\]/m.test(text) || /^Dialogue:/m.test(text)) return assToVtt(text);
  return `WEBVTT\n\n${text.replace(/(\d\d:\d\d:\d\d),(\d{3})/g, "$1.$2").trim()}\n`;
}

async function saveSubtitle(dir, key, url, referer) {
  if (!url) return null;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, ...(referer && { Referer: referer }) },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const name = `${key}.en.vtt`;
    await fs.writeFile(path.join(dir, name), toVtt(await response.text()));
    return name;
  } catch (error) {
    console.warn(`Subtitles for ${key} couldn't be saved:`, error.message);
    return null;
  }
}

async function ensureCover(dir, url) {
  const found = (await fs.readdir(dir)).find((f) => /^cover\.(jpg|png|webp)$/.test(f));
  if (found) return found;
  if (!url) return null;
  try {
    const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const type = response.headers.get("content-type") ?? "";
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    await fs.writeFile(path.join(dir, `cover.${ext}`), Buffer.from(await response.arrayBuffer()));
    return `cover.${ext}`;
  } catch (error) {
    console.warn("Cover couldn't be saved:", error.message);
    return null;
  }
}

async function moveFile(from, to) {
  try {
    await fs.rename(from, to);
  } catch (error) {
    if (error.code !== "EXDEV") throw error;
    await fs.copyFile(from, to);
    await fs.rm(from, { force: true });
  }
}

export async function addEpisode(meta, { number, lang, videoPath, subtitleUrl, referer, skip }) {
  const dir = animeDir(meta.id);
  await fs.mkdir(dir, { recursive: true });

  const key = episodeKey(number, lang);
  const video = `${key}${path.extname(videoPath).toLowerCase() || ".mp4"}`;
  await moveFile(videoPath, path.join(dir, video));

  const subtitle = await saveSubtitle(dir, key, subtitleUrl, referer);
  const cover = await ensureCover(dir, meta.coverUrl);
  const size = (await fs.stat(path.join(dir, video))).size;

  return withLock(meta.id, async () => {
    const manifest = (await readManifest(meta.id)) ?? { format: "ani-library", version: 1, anime: null, episodes: [] };
    const old = manifest.episodes.find((e) => e.key === key);

    manifest.anime = { ...animeFields(meta), cover: cover ?? manifest.anime?.cover ?? null };
    const entry = { key, number, lang, video, subtitle, skip: cleanSkip(skip), size, addedAt: new Date().toISOString() };
    manifest.episodes = [...manifest.episodes.filter((e) => e.key !== key), entry].sort(byEpisode);
    await writeManifest(meta.id, manifest);

    for (const name of [old?.video, old?.subtitle]) {
      if (name && name !== video && name !== subtitle) await fs.rm(path.join(dir, name), { force: true });
    }
    return entry;
  });
}

export async function findEpisode(id, number, lang) {
  const manifest = await readManifest(id);
  const entry = manifest?.episodes.find((e) => e.key === episodeKey(number, lang));
  if (!entry) return null;
  return (await exists(path.join(animeDir(id), entry.video))) ? entry : null;
}

export async function hasEpisodes(id, keys) {
  const manifest = await readManifest(id);
  if (!manifest) return false;
  for (const key of keys) {
    const entry = manifest.episodes.find((e) => e.key === key);
    if (!entry || !(await exists(path.join(animeDir(id), entry.video)))) return false;
  }
  return true;
}

function summary(manifest) {
  const { anime, episodes } = manifest;
  return {
    id: anime.id,
    title: anime.title,
    cover: anime.cover ? `/library/${anime.id}/cover` : null,
    rating: anime.rating,
    genres: anime.genres,
    format: anime.format,
    year: anime.releaseDate?.year ?? null,
    savedEpisodes: episodes.length,
    totalEpisodes: anime.episodes,
    langs: [...new Set(episodes.map((e) => e.lang))],
    size: episodes.reduce((sum, e) => sum + (e.size ?? 0), 0),
    updatedAt: episodes.reduce((latest, e) => (e.addedAt > latest ? e.addedAt : latest), ""),
  };
}

async function listLibrary() {
  const dirs = await fs.readdir(LIBRARY_ROOT, { withFileTypes: true }).catch(() => []);
  const items = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const manifest = await readManifest(d.name);
    if (manifest?.episodes?.length) items.push(summary(manifest));
  }
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function present(manifest) {
  const id = manifest.anime.id;
  const file = (name) => (name ? `/library/${id}/files/${encodeURIComponent(name)}` : null);
  return {
    anime: { ...manifest.anime, coverUrl: manifest.anime.cover ? `/library/${id}/cover` : null },
    episodes: manifest.episodes.map((e) => ({ ...e, videoUrl: file(e.video), subtitleUrl: file(e.subtitle) })),
  };
}

async function deleteEpisode(id, key) {
  return withLock(id, async () => {
    const manifest = await readManifest(id);
    const entry = manifest?.episodes.find((e) => e.key === key);
    if (!entry) throw httpError(404, "That episode isn't in the library.");

    for (const name of [entry.video, entry.subtitle]) {
      if (name) await fs.rm(path.join(animeDir(id), name), { force: true });
    }
    manifest.episodes = manifest.episodes.filter((e) => e.key !== key);
    if (manifest.episodes.length === 0) await fs.rm(animeDir(id), { recursive: true, force: true });
    else await writeManifest(id, manifest);
  });
}

export async function sendPackage(res, id, keys, zipName) {
  const manifest = await readManifest(id);
  if (!manifest) return res.status(404).json({ error: "That anime isn't in the library." });

  const dir = animeDir(id);
  const wanted = keys ? manifest.episodes.filter((e) => keys.includes(e.key)) : manifest.episodes;
  const episodes = [];
  for (const entry of wanted) {
    if (!(await exists(path.join(dir, entry.video)))) continue;
    const subtitleThere = entry.subtitle && (await exists(path.join(dir, entry.subtitle)));
    episodes.push({ ...entry, subtitle: subtitleThere ? entry.subtitle : null });
  }
  if (episodes.length === 0) return res.status(404).json({ error: "Those files are no longer in the library." });

  const folder = fileSafe(manifest.anime.title);
  const archive = archiver("zip", { store: true });
  archive.on("error", (error) => {
    console.error("Zip failed:", error);
    if (!res.headersSent) res.status(500).json({ error: error.message });
    else res.destroy(error);
  });
  res.on("close", () => archive.abort());

  res.attachment(zipName);
  archive.pipe(res);
  archive.append(JSON.stringify({ ...manifest, episodes }, null, 2), { name: `${folder}/manifest.json` });

  const cover = manifest.anime.cover;
  if (cover && (await exists(path.join(dir, cover)))) {
    archive.file(path.join(dir, cover), { name: `${folder}/${cover}` });
  }
  for (const entry of episodes) {
    archive.file(path.join(dir, entry.video), { name: `${folder}/${entry.video}` });
    if (entry.subtitle) archive.file(path.join(dir, entry.subtitle), { name: `${folder}/${entry.subtitle}` });
  }
  await archive.finalize();
}

const text = (value, max) => (typeof value === "string" ? value.slice(0, max) : null);

function validateManifest(raw, available) {
  const bad = (why) => httpError(400, `This zip isn't a valid anime package: ${why}`);
  const a = raw?.anime;
  if (raw?.format !== "ani-library") throw bad("its manifest.json isn't from this app.");
  if (!a || !Number.isInteger(a.id) || a.id < 1 || typeof a.title !== "string") throw bad("the anime info is missing.");
  if (!Array.isArray(raw.episodes) || raw.episodes.length === 0) throw bad("it has no episodes.");

  const safe = (name, pattern) =>
    typeof name === "string" && SAFE_NAME.test(name) && pattern.test(name) && available.has(name);

  const cover = safe(a.cover, COVER_EXT) ? a.cover : null;
  const anime = {
    id: a.id,
    malId: Number.isInteger(a.malId) ? a.malId : null,
    title: text(a.title, 300),
    description: text(a.description, 5000),
    episodes: Number.isInteger(a.episodes) ? a.episodes : null,
    status: text(a.status, 40),
    format: text(a.format, 40),
    rating: Number.isFinite(a.rating) ? a.rating : null,
    genres: Array.isArray(a.genres) ? a.genres.filter((g) => typeof g === "string").slice(0, 20) : [],
    releaseDate: a.releaseDate && Number.isInteger(a.releaseDate.year)
      ? { year: a.releaseDate.year, month: a.releaseDate.month ?? null, day: a.releaseDate.day ?? null }
      : null,
    duration: Number.isFinite(a.duration) ? a.duration : null,
    cover,
  };

  const episodes = raw.episodes.map((e) => {
    if (!KEY_RE.test(e?.key ?? "") || !Number.isInteger(e.number) || e.number < 1) throw bad("an episode entry is broken.");
    const lang = e.key.endsWith(".dub") ? "dub" : "sub";
    if (!safe(e.video, VIDEO_EXT) || !e.video.startsWith(`${e.key}.`)) throw bad(`the video for ${e.key} is missing.`);
    const subtitle = safe(e.subtitle, /\.vtt$/i) && e.subtitle.startsWith(`${e.key}.`) ? e.subtitle : null;
    return {
      key: e.key,
      number: e.number,
      lang,
      video: e.video,
      subtitle,
      skip: cleanSkip(e.skip),
      size: Number.isFinite(e.size) ? e.size : null,
      addedAt: text(e.addedAt, 40) ?? new Date().toISOString(),
    };
  });
  return { anime, episodes };
}

async function importZip(zipPath) {
  const directory = await unzipper.Open.file(zipPath);
  const files = directory.files
    .filter((f) => f.type === "File")
    .map((f) => ({ file: f, path: f.path.replaceAll("\\", "/") }));

  const manifestFile = files
    .filter((f) => path.posix.basename(f.path) === "manifest.json")
    .sort((a, b) => a.path.split("/").length - b.path.split("/").length)[0];
  if (!manifestFile) throw httpError(400, "This zip has no manifest.json, so it isn't an anime package.");

  const root = path.posix.dirname(manifestFile.path);
  const inRoot = new Map(
    files.filter((f) => path.posix.dirname(f.path) === root).map((f) => [path.posix.basename(f.path), f.file]),
  );

  let raw;
  try {
    raw = JSON.parse((await manifestFile.file.buffer()).toString("utf8"));
  } catch {
    throw httpError(400, "The manifest.json in this zip can't be read.");
  }
  const incoming = validateManifest(raw, new Set(inRoot.keys()));

  const id = incoming.anime.id;
  const dir = animeDir(id);
  await fs.mkdir(dir, { recursive: true });

  const names = [incoming.anime.cover, ...incoming.episodes.flatMap((e) => [e.video, e.subtitle])].filter(Boolean);
  for (const name of names) {
    await pipeline(inRoot.get(name).stream(), createWriteStream(path.join(dir, name)));
  }

  await withLock(id, async () => {
    const existing = await readManifest(id);
    const kept = (existing?.episodes ?? []).filter((e) => !incoming.episodes.some((n) => n.key === e.key));
    await writeManifest(id, {
      format: "ani-library",
      version: 1,
      anime: { ...incoming.anime, cover: incoming.anime.cover ?? existing?.anime?.cover ?? null },
      episodes: [...kept, ...incoming.episodes].sort(byEpisode),
    });
  });

  return { id, title: incoming.anime.title, added: incoming.episodes.length };
}

export function registerLibraryRoutes(app) {
  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      console.error("Library request failed:", error);
      if (!res.headersSent) res.status(error.status ?? 500).json({ error: error.message });
    }
  };

  const loadAnime = async (req) => {
    const id = parseId(req.params.id);
    if (!id) throw httpError(400, "Invalid anime id.");
    const manifest = await readManifest(id);
    if (!manifest) throw httpError(404, "That anime isn't in the library.");
    return { id, manifest };
  };

  app.get("/library", handle(async (_req, res) => res.json({ result: await listLibrary() })));

  app.post("/library/import", handle(async (req, res) => {
    const tmp = path.join(os.tmpdir(), `ani-import-${randomUUID()}.zip`);
    try {
      await pipeline(req, createWriteStream(tmp));
      res.json(await importZip(tmp));
    } finally {
      fs.rm(tmp, { force: true }).catch(() => {});
    }
  }));

  app.get("/library/:id", handle(async (req, res) => {
    const { manifest } = await loadAnime(req);
    res.json(present(manifest));
  }));

  app.get("/library/:id/cover", handle(async (req, res) => {
    const { id, manifest } = await loadAnime(req);
    if (!manifest.anime.cover) throw httpError(404, "No cover saved.");
    res.sendFile(path.join(animeDir(id), manifest.anime.cover));
  }));

  app.get("/library/:id/files/:name", handle(async (req, res) => {
    const { id, manifest } = await loadAnime(req);
    const allowed = new Set(manifest.episodes.flatMap((e) => [e.video, e.subtitle]).filter(Boolean));
    if (!allowed.has(req.params.name)) throw httpError(404, "No such file.");
    res.sendFile(path.join(animeDir(id), req.params.name), (error) => {
      if (error && !res.headersSent) res.status(404).json({ error: "That file is missing from disk." });
    });
  }));

  app.get("/library/:id/export", handle(async (req, res) => {
    const { id, manifest } = await loadAnime(req);
    await sendPackage(res, id, null, `${fileSafe(manifest.anime.title)}.zip`);
  }));

  app.delete("/library/:id/episodes/:key", handle(async (req, res) => {
    const { id } = await loadAnime(req);
    await deleteEpisode(id, req.params.key);
    res.json({ ok: true });
  }));

  app.delete("/library/:id", handle(async (req, res) => {
    const { id } = await loadAnime(req);
    await withLock(id, () => fs.rm(animeDir(id), { recursive: true, force: true }));
    res.json({ ok: true });
  }));
}
