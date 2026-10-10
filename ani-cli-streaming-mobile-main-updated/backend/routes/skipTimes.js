import { Router } from "express";
import { aniList, getMalId } from "../lib/anilist.js";

const router = Router();

const ANISKIP_URL = "https://api.aniskip.com/v2/skip-times";
const SKIP_TYPES = { op: "op", "mixed-op": "op", ed: "ed", "mixed-ed": "ed" };
const skipCache = new Map();

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

export async function getSkipSegments(id, episode) {
  const key = `${id}:${episode}`;
  if (skipCache.has(key)) return skipCache.get(key);

  const malId = await getMalId(id);
  const segments = malId ? await fetchSkipSegments(malId, episode) : [];
  skipCache.set(key, segments);
  return segments;
}

router.get("/anime/:id/skip-times/:episode", async (req, res) => {
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

export default router;
