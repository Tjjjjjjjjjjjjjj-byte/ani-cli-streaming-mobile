import { Router } from "express";
import { ALLOW_ADULT } from "../config.js";
import { aniList, cleanDescription } from "../lib/anilist.js";

const router = Router();

const DISCOVER_TTL = 30 * 60_000;
const DISCOVER_PARTIAL_TTL = 2 * 60_000;
const DISCOVER_BATCH = 3;
const DISCOVER_GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror",
  "Mystery", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural",
];
const CARD_FIELDS =
  "id title { romaji english } coverImage { large } episodes status format seasonYear averageScore genres startDate { year month day }";
const HERO_FIELDS = `${CARD_FIELDS} bannerImage trailer { id site } description(asHtml: false)`;

function currentSeason(now = new Date()) {
  const month = now.getMonth();
  const year = now.getFullYear();
  if (month <= 1) return { season: "WINTER", year };
  if (month <= 4) return { season: "SPRING", year };
  if (month <= 7) return { season: "SUMMER", year };
  if (month <= 10) return { season: "FALL", year };
  return { season: "WINTER", year: year + 1 };
}

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

async function buildDiscover() {
  const { season, year } = currentSeason();
  const sections = [
    { id: "trending", title: "Trending now", args: "sort: TRENDING_DESC", perPage: 25, hero: true },
    { id: "season", title: "Airing this season", args: `season: ${season}, seasonYear: ${year}, sort: POPULARITY_DESC` },
    { id: "top", title: "All-time favourites", args: "sort: SCORE_DESC" },
    ...DISCOVER_GENRES.map((genre) => ({
      id: `genre-${genre.toLowerCase().replaceAll(" ", "-")}`,
      title: genre,
      args: `genre: "${genre}", sort: POPULARITY_DESC`,
    })),
  ];

  const batches = [];
  for (let i = 0; i < sections.length; i += DISCOVER_BATCH) batches.push(sections.slice(i, i + DISCOVER_BATCH));

  const settled = await Promise.allSettled(
    batches.map(async (batch) => {
      const lists = batch
        .map(
          (sec, i) =>
            `s${i}: Page(perPage: ${sec.perPage ?? 20}) { media(type: ANIME${ALLOW_ADULT ? "" : ", isAdult: false"}, ${sec.args}) { ${sec.hero ? HERO_FIELDS : CARD_FIELDS} } }`,
        )
        .join("\n");
      const data = await aniList(`query { ${lists} }`, {});
      return batch.map((sec, i) => ({ sec, media: data[`s${i}`].media }));
    }),
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

  const rows = loaded
    .map(({ sec, media }) => ({
      id: sec.id,
      title: sec.title,
      items: media.filter((m) => m.coverImage?.large).slice(0, 20).map(toCard),
    }))
    .filter((row) => row.items.length >= 4);

  return { data: { hero, rows }, complete: settled.every((r) => r.status === "fulfilled") };
}

let discoverCache = null;
let discoverBuilding = null;

router.get("/discover", async (_req, res) => {
  if (discoverCache && Date.now() - discoverCache.at < discoverCache.ttl) {
    return res.json(discoverCache.data);
  }

  try {
    discoverBuilding ??= buildDiscover().finally(() => {
      discoverBuilding = null;
    });
    const { data, complete } = await discoverBuilding;
    discoverCache = { at: Date.now(), ttl: complete ? DISCOVER_TTL : DISCOVER_PARTIAL_TTL, data };
    res.json(data);
  } catch (error) {
    console.error("Discover failed:", error);
    if (discoverCache) return res.json(discoverCache.data);
    res.status(error.status === 429 ? 429 : 502).json({ error: error.message });
  }
});

export default router;
