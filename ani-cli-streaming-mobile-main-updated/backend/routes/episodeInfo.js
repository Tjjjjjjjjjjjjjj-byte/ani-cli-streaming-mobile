import { Router } from "express";
import { JIKAN_URL } from "../config.js";
import { getMalId } from "../lib/anilist.js";
import { getJson, sleep } from "../lib/http.js";

const router = Router();

const KITSU_URL = "https://kitsu.io/api/edge";
const JIKAN_MAX_PAGES = 10;
const KITSU_MAX_EPISODES = 200;
const INFO_TTL = 60 * 60_000;
const INFO_PARTIAL_TTL = 2 * 60_000;
const infoCache = new Map();
const infoInflight = new Map();

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

export async function getEpisodeInfo(id) {
  const cached = infoCache.get(id);
  if (cached && Date.now() - cached.at < cached.ttl) return cached.episodes;

  if (!infoInflight.has(id)) {
    const job = loadEpisodeInfo(id)
      .then((info) => {
        infoCache.set(id, { at: Date.now(), ...info });
        return info;
      })
      .finally(() => infoInflight.delete(id));
    infoInflight.set(id, job);
  }
  return (await infoInflight.get(id)).episodes;
}

router.get("/anime/:id/episode-info", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1)
    return res.status(400).json({ error: "Invalid anime id." });

  try {
    res.json({ episodes: await getEpisodeInfo(id) });
  } catch (error) {
    console.warn("Episode info unavailable:", error.message);
    res.json({ episodes: {} });
  }
});

export default router;
