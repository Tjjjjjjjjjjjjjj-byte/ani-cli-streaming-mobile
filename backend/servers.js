import express from "express";
import cors from "cors";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getLink, downloadEpisode } from "./anime.mjs";
import { DISCOVER_BATCH, chunk, discoverSections, firstScreenSections, rowFromCards, sectionQuery } from "../shared/discoverRows.js";
import {
  addEpisode,
  findEpisode,
  hasEpisodes,
  sendPackage,
  fileSafe,
  registerLibraryRoutes,
} from "./library.mjs";

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const IS_PROD = process.env.NODE_ENV === "production";
const BACKEND_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : BACKEND_DIR;

app.set("trust proxy", 1);

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
      : !IS_PROD,
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["Content-Type"],
  }),
);

app.use(express.json());

app.param("id", (req, _res, next) => {
  const mal = Number(req.query.mal);
  const id = Number(req.params.id);
  if (Number.isInteger(mal) && mal > 0 && Number.isInteger(id) && id > 0) malIds.set(id, mal);
  next();
});

const ANILIST_URL = "https://graphql.anilist.co";

// Adult titles are off unless the app asks for them (Settings > Content sends ?adult=1).
const wantsAdult = (req) => req.query?.adult === "1" || req.body?.adult === true;

const originOf = (req) => `${req.protocol}://${req.get("host")}${req.baseUrl}`;
const allowedHosts = new Set();
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function proxied(target, referer, base, origin) {
  const absolute = new URL(target, base);
  allowedHosts.add(absolute.host);
  const params = new URLSearchParams({ url: absolute.href, referer });
  return `${origin}/proxy?${params}`;
}

function rewritePlaylist(text, base, referer, origin) {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return line.replace(
          /URI="([^"]+)"/g,
          (_, uri) => `URI="${proxied(uri, referer, base, origin)}"`,
        );
      }
      return proxied(trimmed, referer, base, origin);
    })
    .join("\n");
}

const SEARCH_TYPES = {
  search: "String", genre: "String", startDate: "String",
  format: "MediaFormat", status: "MediaStatus", sort: "[MediaSort]", isAdult: "Boolean",
};
const SEARCH_ARGS = {
  search: "search", genre: "genre", startDate: "startDate_like",
  format: "format", status: "status", sort: "sort", isAdult: "isAdult",
};

function buildSearchQuery(vars) {
  const used = Object.keys(SEARCH_TYPES).filter((k) => vars[k] !== undefined && vars[k] !== null);
  const decl = ["$page: Int", "$perPage: Int", ...used.map((k) => `$${k}: ${SEARCH_TYPES[k]}`)].join(", ");
  const args = ["type: ANIME", ...used.map((k) => `${SEARCH_ARGS[k]}: $${k}`)].join(", ");
  return `
  query (${decl}) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total currentPage lastPage hasNextPage }
      media(${args}) {
        id
        title { romaji english }
        coverImage { large }
        episodes
        status
        format
        seasonYear
        averageScore
        genres
        startDate { year month day }
      }
    }
  }
`;
}

const SEARCH_FORMATS = ["TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA"];
const SEARCH_STATUSES = ["RELEASING", "FINISHED", "NOT_YET_RELEASED", "CANCELLED", "HIATUS"];
const SEARCH_SORTS = {
  relevance: "SEARCH_MATCH",
  popularity: "POPULARITY_DESC",
  score: "SCORE_DESC",
  newest: "START_DATE_DESC",
  trending: "TRENDING_DESC",
};

const alFresh = (query) => (query.includes("Page") ? 30 * 60_000 : 24 * 3600_000);
const AL_STALE_MS = 14 * 24 * 3600_000;
const AL_GAP_MS = 2100;
const AL_MAX_WAIT_MS = 20_000;
const alCache = new Map();
const AL_CACHE_FILE = path.join(DATA_DIR, "anilist-cache.json");
try {
  const saved = JSON.parse(await fs.readFile(AL_CACHE_FILE, "utf8"));
  for (const [k, v] of Object.entries(saved)) alCache.set(k, v);
  console.log(`AniList cache: loaded ${alCache.size} saved answers`);
} catch {
}
let alSaveTimer = null;
function alSaveSoon() {
  clearTimeout(alSaveTimer);
  alSaveTimer = setTimeout(() => {
    fs.writeFile(AL_CACHE_FILE, JSON.stringify(Object.fromEntries(alCache))).catch(() => {});
  }, 5000);
}
const alInflight = new Map();
let alQueue = Promise.resolve();
let alBlockedUntil = 0;
let alLastSent = 0;

const alSleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function alSend(query, variables) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = Math.max(alBlockedUntil - Date.now(), alLastSent + AL_GAP_MS - Date.now(), 0);
    if (wait > AL_MAX_WAIT_MS) {
      const err = new Error("AniList is rate limiting this server. Try again in a minute.");
      err.status = 429;
      throw err;
    }
    if (wait) await alSleep(wait);
    alLastSent = Date.now();

    let response;
    try {
      response = await fetch(ANILIST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      if (attempt === 2) throw e;
      continue;
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after")) || 30;
      alBlockedUntil = Date.now() + retryAfter * 1000;
      console.warn(`AniList 429, backing off ${retryAfter}s`);
      continue;
    }

    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.errors) {
      const err = new Error(json.errors?.[0]?.message || `AniList HTTP ${response.status}`);
      err.status = response.status;
      console.error("AniList rejected a query:", err.message, "\nvariables:", JSON.stringify(variables), "\nquery:", query.replace(/\s+/g, " ").trim().slice(0, 600));
      throw err;
    }
    return json.data;
  }
  const err = new Error("AniList is rate limiting this server. Try again in a minute.");
  err.status = 429;
  throw err;
}

async function aniList(query, variables) {
  const key = JSON.stringify([query, variables]);
  const hit = alCache.get(key);
  if (hit && Date.now() - hit.at < alFresh(query)) return hit.data;
  if (alInflight.has(key)) return alInflight.get(key);

  const job = (alQueue = alQueue.catch(() => {}).then(() => alSend(query, variables)))
    .then((data) => {
      alCache.set(key, { at: Date.now(), data });
      if (alCache.size > 300) alCache.delete(alCache.keys().next().value);
      alSaveSoon();
      return data;
    })
    .catch((err) => {
      if (hit && Date.now() - hit.at < AL_STALE_MS) return hit.data;
      throw err;
    })
    .finally(() => alInflight.delete(key));

  alInflight.set(key, job);
  return job;
}

app.post("/search", async (req, res) => {
  const searchTerm = req.body?.term?.trim() || null;
  const page = Number(req.body?.page) || 1;

  const genre = typeof req.body?.genre === "string" && req.body.genre.trim() ? req.body.genre.trim() : null;
  const year = Number(req.body?.year);
  const format = SEARCH_FORMATS.includes(req.body?.format) ? req.body.format : null;
  const status = SEARCH_STATUSES.includes(req.body?.status) ? req.body.status : null;

  let sortKey = Object.hasOwn(SEARCH_SORTS, req.body?.sort) ? req.body.sort : null;
  if (!sortKey || (sortKey === "relevance" && !searchTerm)) {
    sortKey = searchTerm ? "relevance" : "popularity";
  }

  try {
    const vars = {
      search: searchTerm,
      page,
      perPage: 30,
      genre,
      startDate: Number.isInteger(year) && year > 1900 ? `${year}%` : null,
      format,
      status,
      sort: [SEARCH_SORTS[sortKey]],
      isAdult: wantsAdult(req) ? undefined : false,
    };
    const data = await aniList(buildSearchQuery(vars), JSON.parse(JSON.stringify(vars)));
    const { pageInfo, media } = data.Page;

    res.json({
      query: searchTerm,
      pageInfo,
      result: media.map((m) => ({
        id: m.id,
        title: m.title.english || m.title.romaji,
        cover: m.coverImage.large,
        episodes: m.episodes,
        status: m.status,
        format: m.format,
        year: m.seasonYear,
        rating: m.averageScore,
        genres: m.genres ?? [],
        releaseDate: m.startDate,
      })),
    });
  } catch (error) {
    console.error("Search failed:", error);
    res.status(error.status === 429 ? 429 : 502).json({ error: error.message });
  }
});

const detailsQuery = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      id
      idMal
      isAdult
      title { romaji english }
      description(asHtml: false)
      coverImage { extraLarge }
      bannerImage
      trailer { id site }
      episodes
      nextAiringEpisode { episode airingAt }
      duration
      status
      format
      averageScore
      genres
      startDate { year month day }
    }
  }
`;

function cleanDescription(text) {
  if (!text) return null;
  return text
    .replace(/~!.*?!~/gs, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

app.get("/anime/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1)
    return res.status(400).json({ error: "Invalid anime id." });

  try {
    const data = await aniList(detailsQuery, { id });
    const m = data.Media;

    if (m.isAdult && !wantsAdult(req)) {
      return res.status(404).json({ error: "This title isn't available." });
    }

    res.json({
      id: m.id,
      title: m.title.english || m.title.romaji,
      description: cleanDescription(m.description),
      cover: m.coverImage.extraLarge,
      banner: m.bannerImage ?? null,
      trailer: m.trailer?.id ? { id: m.trailer.id, site: m.trailer.site } : null,
      episodes: m.episodes,
      availableEpisodes: m.nextAiringEpisode
        ? m.nextAiringEpisode.episode - 1
        : m.episodes,
      nextEpisode: m.nextAiringEpisode
        ? { episode: m.nextAiringEpisode.episode, airingAt: m.nextAiringEpisode.airingAt }
        : null,
      duration: m.duration,
      status: m.status,
      format: m.format,
      rating: m.averageScore,
      genres: m.genres ?? [],
      releaseDate: m.startDate,
    });
  } catch (error) {
    console.error("Details failed:", error);
    const status =
      error.status === 404 || error.status === 429 ? error.status : 502;
    res.status(status).json({ error: error.message });
  }
});

app.post("/anime/:id/episode/:episode", async (req, res) => {
  const id = Number(req.params.id);
  const episode = Number(req.params.episode);
  if (!Number.isInteger(id) || id < 1)
    return res.status(400).json({ error: "Invalid anime id." });
  if (!Number.isInteger(episode) || episode < 1)
    return res.status(400).json({ error: "Invalid episode." });

  try {
    let title = typeof req.query.title === "string" ? req.query.title.trim().slice(0, 200) : "";
    if (!title) {
      const data = await aniList(detailsQuery, { id });
      title = data.Media.title.english || data.Media.title.romaji;
    }

    const lang = req.query.lang === "dub" ? "dub" : "sub";
    const { url: videoUrl, referer, subtitles } = await getLink(title, episode, lang);
    res.json({
      url: proxied(videoUrl, referer, undefined, originOf(req)),
      subtitles: subtitles ? proxied(subtitles, referer, undefined, originOf(req)) : null,
    });
  } catch (error) {
    console.error("Episode link failed:", error);
    const status =
      error.status === 404 || error.status === 429 ? error.status : 502;
    res.status(status).json({ error: error.message });
  }
});

const DISCOVER_TTL = 30 * 60_000;
const DISCOVER_PARTIAL_TTL = 2 * 60_000;

const toCard = (m) => ({
  id: m.id,
  title: m.title.english || m.title.romaji,
  cover: m.coverImage.large,
  episodes: m.episodes,
  status: m.status,
  format: m.format,
  year: m.seasonYear,
  rating: m.averageScore,
  genres: m.genres ?? [],
  releaseDate: m.startDate,
});

// One AniList request for up to DISCOVER_BATCH sections: [{ sec, media }].
async function loadSections(batch, adult) {
  const data = await aniList(`query { ${batch.map((sec, i) => sectionQuery(sec, i, adult)).join("\n")} }`, {});
  return batch.map((sec, i) => ({ sec, media: data[`s${i}`].media }));
}

const cardsOf = (media) => media.filter((m) => m.coverImage?.large).map(toCard);

// The hero and the first rows. The rows below the first screen come from /discover?rows=...
async function buildDiscover(adult = false) {
  const settled = await Promise.allSettled(
    chunk(firstScreenSections({ adult }), DISCOVER_BATCH).map((batch) => loadSections(batch, adult)),
  );

  const loaded = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  if (loaded.length === 0) throw settled[0].reason;

  const trending = loaded.find((l) => l.sec.hero)?.media ?? [];
  const hero = trending
    .filter((m) => m.bannerImage && m.averageScore != null)
    .sort((a, b) => b.averageScore - a.averageScore)
    .slice(0, 6)
    .map((m) => ({
      ...toCard(m),
      banner: m.bannerImage,
      trailer: m.trailer?.id ? { id: m.trailer.id, site: m.trailer.site } : null,
      description: cleanDescription(m.description),
    }));

  const rows = loaded.map(({ sec, media }) => rowFromCards(sec, cardsOf(media))).filter(Boolean);

  return { data: { hero, rows }, complete: settled.every((r) => r.status === "fulfilled") };
}

// Rows below the first screen, by id (at most DISCOVER_BATCH per call).
async function buildRows(ids, adult) {
  const wanted = discoverSections({ adult }).filter((s) => ids.includes(s.id)).slice(0, DISCOVER_BATCH);
  const loaded = await loadSections(wanted, adult);
  return { rows: loaded.map(({ sec, media }) => rowFromCards(sec, cardsOf(media))).filter(Boolean) };
}

const discoverCache = new Map(); // "safe" / "adult" / "rows:<ids>:<mode>" -> { at, ttl, data }
const discoverBuilding = new Map();

app.get("/discover", async (req, res) => {
  const mode = wantsAdult(req) ? "adult" : "safe";
  const adult = mode === "adult";
  const ids =
    typeof req.query.rows === "string"
      ? req.query.rows.split(",").map((id) => id.trim()).filter(Boolean).slice(0, DISCOVER_BATCH)
      : null;
  if (ids && ids.length === 0) return res.json({ rows: [] });

  const key = ids ? `rows:${ids.join(",")}:${mode}` : mode;
  const cache = discoverCache.get(key);
  if (cache && Date.now() - cache.at < cache.ttl) {
    return res.json(cache.data);
  }

  try {
    if (!discoverBuilding.has(key)) {
      const job = (ids ? buildRows(ids, adult).then((data) => ({ data, complete: true })) : buildDiscover(adult)).finally(() =>
        discoverBuilding.delete(key),
      );
      discoverBuilding.set(key, job);
    }
    const { data, complete } = await discoverBuilding.get(key);
    discoverCache.set(key, { at: Date.now(), ttl: complete ? DISCOVER_TTL : DISCOVER_PARTIAL_TTL, data });
    res.json(data);
  } catch (error) {
    console.error("Discover failed:", error);
    if (cache) return res.json(cache.data);
    res.status(error.status === 429 ? 429 : 502).json({ error: error.message });
  }
});

const ANISKIP_URL = "https://api.aniskip.com/v2/skip-times";
const SKIP_TYPES = { op: "op", "mixed-op": "op", ed: "ed", "mixed-ed": "ed" };
const malIds = new Map();
const skipCache = new Map();

async function getMalId(id) {
  if (malIds.has(id)) return malIds.get(id);
  const data = await aniList("query ($id: Int) { Media(id: $id, type: ANIME) { idMal } }", { id });
  const mal = data.Media.idMal ?? null;
  malIds.set(id, mal);
  return mal;
}

async function fetchSkipSegments(malId, episode) {
  const params = new URLSearchParams({ episodeLength: "0" });
  for (const type of Object.keys(SKIP_TYPES)) params.append("types", type);

  const response = await fetch(`${ANISKIP_URL}/${malId}/${episode}?${params}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`ani-skip HTTP ${response.status}`);

  const json = await response.json();
  if (!json.found) return [];

  return json.results
    .filter((r) => SKIP_TYPES[r.skipType] && r.interval.endTime > r.interval.startTime)
    .map((r) => ({
      type: SKIP_TYPES[r.skipType],
      start: r.interval.startTime,
      end: r.interval.endTime,
    }))
    .sort((a, b) => a.start - b.start);
}

async function getSkipSegments(id, episode) {
  const key = `${id}:${episode}`;
  if (skipCache.has(key)) return skipCache.get(key);

  const malId = await getMalId(id);
  const segments = malId ? await fetchSkipSegments(malId, episode) : [];
  skipCache.set(key, segments);
  return segments;
}

app.get("/anime/:id/skip-times/:episode", async (req, res) => {
  const id = Number(req.params.id);
  const episode = Number(req.params.episode);
  if (!Number.isInteger(id) || id < 1 || !Number.isInteger(episode) || episode < 1)
    return res.status(400).json({ error: "Invalid anime id or episode." });

  try {
    res.json({ segments: await getSkipSegments(id, episode) });
  } catch (error) {
    console.warn("Skip times unavailable:", error.message);
    res.json({ segments: [] });
  }
});

const JIKAN_URL = "https://api.jikan.moe/v4";
const KITSU_URL = "https://kitsu.io/api/edge";
const JIKAN_MAX_PAGES = 10;
const KITSU_MAX_EPISODES = 200;
const INFO_TTL = 60 * 60_000;
const INFO_PARTIAL_TTL = 2 * 60_000;
const infoCache = new Map();
const infoInflight = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url, accept = "application/json") {
  const response = await fetch(url, {
    headers: { Accept: accept },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
  return response.json();
}

const realTitle = (t) => (t && !/^episode\s*\d+$/i.test(t.trim()) ? t.trim() : null);

async function fetchJikanEpisodes(malId) {
  const episodes = {};
  for (let page = 1; page <= JIKAN_MAX_PAGES; page++) {
    let json;
    try {
      json = await getJson(`${JIKAN_URL}/anime/${malId}/episodes?page=${page}`);
    } catch (error) {
      if (page === 1) throw error;
      return { episodes, complete: false };
    }
    for (const e of json.data ?? []) {
      episodes[e.mal_id] = {
        title: realTitle(e.title),
        aired: e.aired ?? null,
        filler: Boolean(e.filler),
        recap: Boolean(e.recap),
      };
    }
    if (!json.pagination?.has_next_page) break;
    await sleep(400);
  }
  return { episodes, complete: true };
}

async function fetchKitsuEpisodes(malId) {
  const kitsu = "application/vnd.api+json";
  const mapping = await getJson(
    `${KITSU_URL}/mappings?filter[externalSite]=myanimelist/anime&filter[externalId]=${malId}&include=item`,
    kitsu,
  );
  const kitsuId = mapping.data?.[0]?.relationships?.item?.data?.id;
  if (!kitsuId) return { episodes: {}, complete: true };

  const episodes = {};
  for (let offset = 0; offset < KITSU_MAX_EPISODES; offset += 20) {
    let json;
    try {
      json = await getJson(
        `${KITSU_URL}/anime/${kitsuId}/episodes?page[limit]=20&page[offset]=${offset}&sort=number`,
        kitsu,
      );
    } catch (error) {
      if (offset === 0) throw error;
      return { episodes, complete: false };
    }
    const rows = json.data ?? [];
    for (const row of rows) {
      const a = row.attributes;
      if (!a?.number) continue;
      episodes[a.number] = {
        title: realTitle(a.canonicalTitle) ?? realTitle(a.titles?.en_us) ?? realTitle(a.titles?.en_jp),
        aired: a.airdate ?? null,
        synopsis: a.synopsis || a.description || null,
        thumbnail: a.thumbnail?.large || a.thumbnail?.original || null,
      };
    }
    if (rows.length < 20) break;
  }
  return { episodes, complete: true };
}

async function loadEpisodeInfo(id) {
  const malId = await getMalId(id);
  if (!malId) return { episodes: {}, ttl: INFO_TTL };

  const [jikan, kitsu] = await Promise.allSettled([
    fetchJikanEpisodes(malId),
    fetchKitsuEpisodes(malId),
  ]);
  for (const r of [jikan, kitsu]) {
    if (r.status === "rejected") console.warn("Episode info source failed:", r.reason?.message);
  }

  const j = jikan.status === "fulfilled" ? jikan.value : { episodes: {}, complete: false };
  const k = kitsu.status === "fulfilled" ? kitsu.value : { episodes: {}, complete: false };

  const episodes = {};
  for (const n of new Set([...Object.keys(j.episodes), ...Object.keys(k.episodes)])) {
    const a = j.episodes[n] ?? {};
    const b = k.episodes[n] ?? {};
    episodes[n] = {
      title: a.title ?? b.title ?? null,
      aired: a.aired ?? b.aired ?? null,
      filler: a.filler ?? false,
      recap: a.recap ?? false,
      synopsis: b.synopsis ?? null,
      thumbnail: b.thumbnail ?? null,
    };
  }
  const ttl = j.complete && k.complete ? INFO_TTL : INFO_PARTIAL_TTL;
  return { episodes, ttl };
}

app.get("/anime/:id/episode-info", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1)
    return res.status(400).json({ error: "Invalid anime id." });

  const cached = infoCache.get(id);
  if (cached && Date.now() - cached.at < cached.ttl) return res.json({ episodes: cached.episodes });

  try {
    if (!infoInflight.has(id)) {
      const job = loadEpisodeInfo(id)
        .then((info) => {
          infoCache.set(id, { at: Date.now(), ...info });
          return info;
        })
        .finally(() => infoInflight.delete(id));
      infoInflight.set(id, job);
    }
    const { episodes } = await infoInflight.get(id);
    res.json({ episodes });
  } catch (error) {
    console.warn("Episode info unavailable:", error.message);
    res.json({ episodes: {} });
  }
});

const THEMES_TTL = 24 * 60 * 60_000;
const themesCache = new Map();

function parseTheme(raw, index) {
  let text = String(raw).replace(/^#?\s*\d+\s*:\s*/, "").trim();
  let episodes = null;

  const eps = text.match(/\s*\(\s*eps?\.?\s*([^)]*)\)\s*$/i);
  if (eps) {
    episodes = eps[1].trim() || null;
    text = text.slice(0, eps.index).trim();
  }

  const parts = text.match(/^["\u201c](.+)["\u201d](?:\s+by\s+(.+))?$/is);
  return {
    order: index + 1,
    title: (parts?.[1] ?? text).trim(),
    artist: parts?.[2]?.trim() ?? null,
    episodes,
  };
}

app.get("/anime/:id/themes", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1)
    return res.status(400).json({ error: "Invalid anime id." });

  const cached = themesCache.get(id);
  if (cached && Date.now() - cached.at < THEMES_TTL) return res.json(cached.themes);

  try {
    const malId = await getMalId(id);
    if (!malId) return res.json({ openings: [], endings: [] });

    const json = await getJson(`${JIKAN_URL}/anime/${malId}/themes`);
    const themes = {
      openings: (json.data?.openings ?? []).map(parseTheme),
      endings: (json.data?.endings ?? []).map(parseTheme),
    };
    themesCache.set(id, { at: Date.now(), themes });
    res.json(themes);
  } catch (error) {
    console.warn("Themes unavailable:", error.message);
    res.json({ openings: [], endings: [] });
  }
});

const DOWNLOAD_ROOT = path.join(DATA_DIR, "downloads");
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

function metaFromBrowser(raw, id) {
  if (!raw || typeof raw !== "object") return null;
  const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : null);
  const num = (v) => (Number.isFinite(v) ? v : null);
  const title = str(raw.title, 200)?.trim();
  if (!title) return null;

  let coverUrl = null;
  try {
    const u = new URL(String(raw.coverUrl));
    if (u.protocol === "https:" && /(^|\.)anilist\.co$/.test(u.hostname)) coverUrl = u.href;
  } catch {
  }

  const date = raw.releaseDate && typeof raw.releaseDate === "object" ? raw.releaseDate : {};
  return {
    id,
    malId: Number.isInteger(raw.malId) && raw.malId > 0 ? raw.malId : null,
    title,
    description: str(raw.description, 5000),
    coverUrl,
    episodes: num(raw.episodes),
    status: str(raw.status, 30),
    format: str(raw.format, 30),
    rating: num(raw.rating),
    genres: Array.isArray(raw.genres) ? raw.genres.filter((g) => typeof g === "string").slice(0, 20) : [],
    releaseDate: { year: num(date.year), month: num(date.month), day: num(date.day) },
    duration: num(raw.duration),
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
    // Pause and cancel take effect between episodes: the episode being fetched right now is allowed to finish.
    while (job.paused && !job.cancelled) await sleep(500);
    if (job.cancelled) break;
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

      job.stage = "saving";
      const entry = await addEpisode(job.meta, {
        number: episode,
        lang: job.lang,
        videoPath: download.file,
        subtitleUrl: download.subtitles,
        referer: download.referer,
        skip,
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
  if (job.cancelled) {
    job.status = "canceled";
  } else if (job.files.length === 0) {
    job.status = "error";
    job.error = job.failed[0]?.error ?? "Nothing was downloaded.";
  } else {
    job.status = "done";
  }
}

app.post("/anime/:id/download", async (req, res) => {
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
    const meta = metaFromBrowser(req.body?.meta, id) ?? toAnimeMeta((await aniList(detailsQuery, { id })).Media);
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
      paused: false,
      cancelled: false,
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

app.get("/downloads/:jobId", async (req, res) => {
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
    done: job.okEpisodes,
    episodes: job.episodes,
    paused: job.paused,
    filename: job.status === "done" ? downloadName(job) : null,
  });
});

app.post("/downloads/:jobId/pause", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Unknown download." });
  if (job.status === "running") job.paused = true;
  res.json({ paused: job.paused });
});

app.post("/downloads/:jobId/resume", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Unknown download." });
  job.paused = false;
  res.json({ paused: job.paused });
});

app.delete("/downloads/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Unknown download." });
  if (job.status === "running") {
    job.cancelled = true;
    job.paused = false;
  }
  res.json({ ok: true });
});

app.get("/downloads/:jobId/file", async (req, res) => {
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

registerLibraryRoutes(app);

app.get("/proxy", async (req, res) => {
  let target;
  try {
    target = new URL(String(req.query.url));
  } catch {
    return res.status(400).json({ error: "Bad url." });
  }
  if (!["http:", "https:"].includes(target.protocol) || !allowedHosts.has(target.host)) {
    console.warn("Proxy blocked a host that isn't allowed:", target.host);
    return res.status(403).json({ error: "Host not allowed." });
  }

  const referer = String(req.query.referer ?? "");

  try {
    const headers = { "User-Agent": UA, ...(referer && { Referer: referer }) };
    let upstream = await fetch(target, { headers });

    if (upstream.status === 403) {
      console.warn(`Got 403 for ${target.pathname}, retrying with a fresh address`);
      await upstream.body?.cancel();
      const retry = new URL(target);
      retry.searchParams.set("cb", Date.now());
      upstream = await fetch(retry, { headers });
    }

    if (!upstream.ok) {
      console.warn(`Video host answered ${upstream.status} for ${target.href}`);
      return res.status(upstream.status).end();
    }

    const type = upstream.headers.get("content-type") ?? "";
    const isPlaylist = type.includes("mpegurl") || target.pathname.endsWith(".m3u8");

    if (isPlaylist) {
      const text = await upstream.text();
      res.type("application/vnd.apple.mpegurl");
      return res.send(rewritePlaylist(text, target, referer, originOf(req)));
    }

    res.type(type || "application/octet-stream");
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (error) {
    if (error.code === "ERR_STREAM_PREMATURE_CLOSE") return;
    console.error("Proxy failed:", error);
    if (!res.headersSent) res.status(502).json({ error: error.message });
  }
});

const APP_USER = process.env.APP_USER || "family";
const APP_PASSWORD = process.env.APP_PASSWORD || "";

if (IS_PROD && !APP_PASSWORD && process.env.ALLOW_NO_PASSWORD !== "true") {
  console.error(
    "Refusing to start: set APP_PASSWORD. Without it anyone who finds the address could use this server" +
      " (including its video proxy). To run open on purpose, set ALLOW_NO_PASSWORD=true.",
  );
  process.exit(1);
}

const safeEqual = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const failures = new Map();
function requirePassword(req, res, next) {
  if (!APP_PASSWORD) return next();

  const record = failures.get(req.ip);
  if (record && Date.now() - record.since > 10 * 60_000) failures.delete(req.ip);
  if ((failures.get(req.ip)?.count ?? 0) >= 10) return res.status(429).send("Too many wrong passwords. Try again in a few minutes.");

  const header = req.headers.authorization ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const split = decoded.indexOf(":");
    if (split >= 0 && safeEqual(decoded.slice(0, split), APP_USER) && safeEqual(decoded.slice(split + 1), APP_PASSWORD)) {
      return next();
    }
    const entry = failures.get(req.ip) ?? { count: 0, since: Date.now() };
    failures.set(req.ip, { ...entry, count: entry.count + 1 });
  }
  res.set("WWW-Authenticate", 'Basic realm="Anime", charset="UTF-8"').status(401).send("Password required.");
}

const site = express();
site.set("trust proxy", 1);
site.disable("x-powered-by");
site.get("/healthz", (_req, res) => res.type("text").send("ok"));
site.use(requirePassword);

if (IS_PROD) {
  const DIST = path.join(BACKEND_DIR, "..", "dist");
  site.use("/api", app);
  site.use(express.static(DIST));
  site.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(DIST, "index.html"), (error) => error && next());
  });
} else {
  site.use("/", app);
}

site.listen(PORT, process.env.HOST || "127.0.0.1", () => {
  console.log(
    IS_PROD
      ? `Server is running on port ${PORT} (password ${APP_PASSWORD ? "on" : "OFF"}).`
      : `Server is running on http://localhost:${PORT} (this phone only)`,
  );
});
