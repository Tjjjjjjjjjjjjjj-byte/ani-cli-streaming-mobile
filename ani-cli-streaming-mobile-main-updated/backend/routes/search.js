import { Router } from "express";
import { ALLOW_ADULT } from "../config.js";
import { aniList } from "../lib/anilist.js";

const router = Router();

const query = `
  query (
    $search: String, $page: Int, $perPage: Int,
    $genre: String, $startDate: String, $format: MediaFormat,
    $status: MediaStatus, $sort: [MediaSort], $isAdult: Boolean
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total currentPage lastPage hasNextPage }
      media(
        search: $search, type: ANIME, genre: $genre, startDate_like: $startDate,
        format: $format, status: $status, sort: $sort, isAdult: $isAdult
      ) {
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

const SEARCH_FORMATS = ["TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA"];
const SEARCH_STATUSES = ["RELEASING", "FINISHED", "NOT_YET_RELEASED", "CANCELLED", "HIATUS"];
const SEARCH_SORTS = {
  relevance: "SEARCH_MATCH",
  popularity: "POPULARITY_DESC",
  score: "SCORE_DESC",
  newest: "START_DATE_DESC",
  trending: "TRENDING_DESC",
};

router.post("/search", async (req, res) => {
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
    const variables = {
      search: searchTerm,
      page,
      perPage: 30,
      genre,
      startDate: Number.isInteger(year) && year > 1900 ? `${year}%` : null,
      format,
      status,
      sort: [SEARCH_SORTS[sortKey]],
      isAdult: ALLOW_ADULT ? undefined : false,
    };
    for (const key of Object.keys(variables)) {
      if (variables[key] == null) delete variables[key];
    }
    const data = await aniList(query, variables);
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

export default router;
