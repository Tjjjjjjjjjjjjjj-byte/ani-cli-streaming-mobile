import { Router } from "express";
import { JIKAN_URL } from "../config.js";
import { getMalId } from "../lib/anilist.js";
import { getJson } from "../lib/http.js";

const router = Router();

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

router.get("/anime/:id/themes", async (req, res) => {
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

export default router;
