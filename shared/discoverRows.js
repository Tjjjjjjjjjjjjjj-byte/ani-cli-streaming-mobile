// The home page rows, defined once. Imported by the frontend (src/anilist.js) AND by the backend
// fallback (backend/servers.js, GET /discover), so both always produce the same rows.
// Plain data and pure functions only: no imports, so it runs in the browser and in Node.

export const DISCOVER_BATCH = 3; // sections per AniList request
export const MIN_ROW_ITEMS = 4; // a row with fewer items than this is skipped
const ROW_ITEMS = 20;

export const CARD_FIELDS =
  "id title { romaji english } coverImage { large } episodes status format seasonYear averageScore genres startDate { year month day }";
export const HERO_FIELDS = `${CARD_FIELDS} bannerImage trailer { id site } description(asHtml: false)`;

export function currentSeason(now = new Date()) {
  const month = now.getMonth();
  const year = now.getFullYear();
  if (month <= 1) return { season: "WINTER", year };
  if (month <= 4) return { season: "SPRING", year };
  if (month <= 7) return { season: "SUMMER", year };
  if (month <= 10) return { season: "FALL", year };
  return { season: "WINTER", year: year + 1 };
}

const GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror",
  "Mystery", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural",
];

const list = (values) => `[${values.map((v) => `"${v}"`).join(", ")}]`;

// A section is { id, title, args, ... }. `args` is dropped straight into media(...).
//   hero    - its results also feed the hero carousel
//   perPage - how many to ask for (default 20)
//   genres  - genres every item must have. Checked again on the returned cards, so a row is
//             right even if AniList treats genre_in as "any of" instead of "all of".
//   lazy    - below the first screen: loaded when scrolled near, not with the first request
//
// Popularity floors on the score-sorted rows keep a few votes from putting an obscure title on top.
export function discoverSections(now = new Date()) {
  const { season, year } = currentSeason(now);
  const mood = (id, title, genres, extra = "") => ({
    id,
    title,
    genres,
    // Extra items when two genres must both match, so there is still a full row if only some results qualify.
    perPage: genres.length > 1 ? 30 : undefined,
    args: `genre_in: ${list(genres)}${extra ? `, ${extra}` : ""}, sort: POPULARITY_DESC`,
    lazy: true,
  });

  return [
    { id: "trending", title: "Trending now", args: "sort: TRENDING_DESC", perPage: 25, hero: true },
    { id: "season", title: "Airing this season", args: `season: ${season}, seasonYear: ${year}, sort: POPULARITY_DESC` },
    { id: "top", title: "All-time favourites", args: "sort: SCORE_DESC" },

    mood("mood-heart", "Heart-fluttering", ["Slice of Life", "Romance"]),
    mood("mood-cozy", "Cozy and comforting", ["Slice of Life"], 'tag_in: ["Iyashikei"]'),
    mood("mood-mind", "Mind-bending", ["Psychological", "Thriller"]),
    mood("mood-hype", "Pure hype", ["Action"], 'tag_in: ["Shounen"]'),
    mood("mood-tears", "Tearjerkers", ["Drama", "Romance"], 'tag_in: ["Tragedy"]'),
    mood("mood-laugh", "Laugh out loud", ["Comedy"], 'tag_in: ["Parody"]'),
    { id: "gems", title: "Hidden gems", args: "averageScore_greater: 78, popularity_greater: 5000, popularity_lesser: 40000, sort: SCORE_DESC", lazy: true },
    { id: "short", title: "Short and sweet", args: "episodes_lesser: 14, status: FINISHED, format_in: [TV, ONA], popularity_greater: 10000, sort: SCORE_DESC", lazy: true },
    { id: "binge", title: "Binge-worthy and finished", args: "status: FINISHED, episodes_greater: 20, popularity_greater: 10000, sort: SCORE_DESC", lazy: true },
    { id: "movies", title: "Movies worth your night", args: "format: MOVIE, popularity_greater: 10000, sort: SCORE_DESC", lazy: true },

    ...GENRES.map((genre) => ({
      id: `genre-${genre.toLowerCase().replaceAll(" ", "-")}`,
      title: genre,
      args: `genre: "${genre}", sort: POPULARITY_DESC`,
      lazy: true,
    })),
  ];
}

export const firstScreenSections = (now) => discoverSections(now).filter((s) => !s.lazy);
const lazyIds = () => discoverSections().filter((s) => s.lazy).map((s) => s.id);

export function chunk(items, size = DISCOVER_BATCH) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// The below-the-fold rows, grouped into one AniList request each: [["mood-heart", ...], ...]
export const lazyBatches = () => chunk(lazyIds());

// One section as a GraphQL alias: s0: Page(...) { media(...) { ... } }
export function sectionQuery(sec, index, adult) {
  const media = `media(type: ANIME${adult ? "" : ", isAdult: false"}, ${sec.args}) { ${sec.hero ? HERO_FIELDS : CARD_FIELDS} }`;
  return `s${index}: Page(perPage: ${sec.perPage ?? ROW_ITEMS}) { ${media} }`;
}

// Turns a section's result cards into a row, or null if it isn't worth showing.
export function rowFromCards(sec, cards) {
  const required = sec.genres ?? [];
  const items = cards
    .filter((c) => required.every((g) => c.genres?.includes(g)))
    .slice(0, ROW_ITEMS);
  return items.length >= MIN_ROW_ITEMS ? { id: sec.id, title: sec.title, items } : null;
}
