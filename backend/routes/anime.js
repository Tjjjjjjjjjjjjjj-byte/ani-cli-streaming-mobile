import { Router } from "express";
import { ALLOW_ADULT } from "../config.js";
import { getLink } from "../anime.mjs";
import { aniList, cleanDescription, detailsQuery, toRelations } from "../lib/anilist.js";
import { originOf, proxied } from "./proxy.js";

const router = Router();

router.get("/anime/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1)
    return res.status(400).json({ error: "Invalid anime id." });

  try {
    const data = await aniList(detailsQuery, { id });
    const m = data.Media;

    if (m.isAdult && !ALLOW_ADULT) {
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
      relations: toRelations(m.relations, ALLOW_ADULT),
    });
  } catch (error) {
    console.error("Details failed:", error);
    const status =
      error.status === 404 || error.status === 429 ? error.status : 502;
    res.status(status).json({ error: error.message });
  }
});

router.post("/anime/:id/episode/:episode", async (req, res) => {
  const id = Number(req.params.id);
  const episode = Number(req.params.episode);
  if (!Number.isInteger(id) || id < 1)
    return res.status(400).json({ error: "Invalid anime id." });
  if (!Number.isInteger(episode) || episode < 1)
    return res.status(400).json({ error: "Invalid episode." });

  try {
    const data = await aniList(detailsQuery, { id });
    const m = data.Media;
    const title = m.title.english || m.title.romaji;

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

export default router;
