// The home page rows, defined once. Imported by the frontend (src/anilist.js) AND by the backend
// fallback (backend/servers.js, GET /discover), so both always produce the same rows.
// Plain data and pure functions only: no imports, so it runs in the browser and in Node.

export const DISCOVER_BATCH = 3; // sections per AniList request
export const MIN_ROW_ITEMS = 4; // a row with fewer items than this is skipped
const ROW_ITEMS = 20;
const COMBO_PER_PAGE = 50; // rows that need two genres to match ask for more, then keep the ones that qualify

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

// Every AniList genre that has a row of its own. Ecchi and Hentai are not here: they are the adult
// rows, below, and only exist while "Allow adult content" is on.
const GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror",
  "Mahou Shoujo", "Mecha", "Music", "Mystery", "Psychological", "Romance",
  "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller",
];

const list = (values) => `[${values.map((v) => `"${v}"`).join(", ")}]`;
const slug = (text) => text.toLowerCase().replaceAll(" ", "-");

// A section is { id, title, args, ... }. `args` is dropped straight into media(...).
//   hero    - its results also feed the hero carousel
//   perPage - how many to ask for (default 20)
//   genres  - genres every item must have. AniList's genre_in means "any of", so the query asks for the
//             first genre and the returned cards are checked for all of them.
//   lazy    - below the first screen: loaded when scrolled near, not with the first request
//   adult   - only offered while adult content is allowed
//
// Popularity floors on the score-sorted rows keep a few votes from putting an obscure title on top.
export function discoverSections({ now = new Date(), adult = false } = {}) {
  const { season, year } = currentSeason(now);

  // A mood row: titles with all of `genres` (may be none), optionally narrowed by tags, most popular first.
  const mood = (id, title, genres, tags = [], extra = {}) => ({
    id,
    title,
    genres,
    perPage: genres.length > 1 ? COMBO_PER_PAGE : undefined,
    args: [genres.length ? `genre: "${genres[0]}"` : null, tags.length ? `tag_in: ${list(tags)}` : null, "sort: POPULARITY_DESC"]
      .filter(Boolean)
      .join(", "),
    lazy: true,
    ...extra,
  });

  const genreRow = (genre, extra = {}) => ({
    id: `genre-${slug(genre)}`,
    title: genre,
    genres: [genre],
    args: `genre: "${genre}", sort: POPULARITY_DESC`,
    lazy: true,
    ...extra,
  });

  const sections = [
    { id: "trending", title: "Trending now", args: "sort: TRENDING_DESC", perPage: 25, hero: true },
    { id: "season", title: "Airing this season", args: `season: ${season}, seasonYear: ${year}, sort: POPULARITY_DESC` },
    { id: "top", title: "All-time favourites", args: "sort: SCORE_DESC" },

    // Feelings
    mood("mood-heart", "Heartwarming", ["Slice of Life", "Romance"]),
    mood("mood-flutter", "Makes your heart flutter", ["Romance", "Comedy"], ["Shoujo"]),
    mood("mood-cozy", "Cozy and comforting", ["Slice of Life"], ["Iyashikei"]),
    mood("mood-grownup", "Grown-up slice of life", ["Slice of Life"], ["Adult Cast", "Workplace"]),
    mood("mood-tears", "Tearjerkers", ["Drama", "Romance"], ["Tragedy"]),
    mood("mood-laugh", "Laugh out loud", ["Comedy"], ["Parody"]),
    mood("mood-hype", "Pure hype", ["Action"], ["Shounen"]),
    mood("mood-mind", "Mind-bending", ["Psychological", "Thriller"]),
    mood("mood-thrill", "Edge of your seat", ["Thriller", "Mystery"]),
    mood("mood-detective", "Whodunit", ["Mystery"], ["Detective"]),
    mood("mood-dark", "Dark and gritty", ["Horror"], ["Gore"]),

    // Worlds
    mood("mood-epic", "Epic adventures", ["Adventure", "Fantasy"]),
    mood("mood-isekai", "Whisked away to another world", ["Fantasy"], ["Isekai"]),
    mood("mood-cyber", "Neon-soaked sci-fi", ["Sci-Fi"], ["Cyberpunk", "Dystopian"]),
    mood("mood-space", "Out of this world", ["Sci-Fi"], ["Space"]),
    mood("mood-apocalypse", "Survive the end of the world", [], ["Post-Apocalyptic", "Survival"]),
    mood("mood-time", "Time warp", [], ["Time Manipulation", "Time Loop"]),
    mood("mood-school-spooky", "Supernatural school days", ["Supernatural"], ["School"]),
    mood("mood-night", "Creatures of the night", [], ["Vampire", "Werewolf"]),
    mood("mood-blades", "Blades and honour", [], ["Samurai", "Swordplay"]),
    mood("mood-power", "Power fantasies", ["Action"], ["Super Power"]),
    mood("mood-games", "Press start", [], ["Video Games"]),
    mood("mood-food", "Hungry yet?", [], ["Food"]),

    { id: "gems", title: "Hidden gems", args: "averageScore_greater: 78, popularity_greater: 5000, popularity_lesser: 40000, sort: SCORE_DESC", lazy: true },
    { id: "short", title: "Short and sweet", args: "episodes_lesser: 14, status: FINISHED, format_in: [TV, ONA], popularity_greater: 10000, sort: SCORE_DESC", lazy: true },
    { id: "binge", title: "Binge-worthy and finished", args: "status: FINISHED, episodes_greater: 20, popularity_greater: 10000, sort: SCORE_DESC", lazy: true },
    { id: "movies", title: "Movies worth your night", args: "format: MOVIE, popularity_greater: 10000, sort: SCORE_DESC", lazy: true },
    { id: "year", title: `Best of ${year}`, args: `seasonYear: ${year}, popularity_greater: 5000, sort: SCORE_DESC`, lazy: true },
    { id: "classics", title: "Classics worth the age", args: "startDate_lesser: 20050101, popularity_greater: 15000, sort: SCORE_DESC", lazy: true },

    ...GENRES.map((genre) => genreRow(genre)),
  ];

  if (adult) {
    sections.push(
      genreRow("Ecchi", { adult: true }),
      mood("adult-ecchi-romance", "Ecchi romance", ["Ecchi", "Romance"], [], { adult: true }),
      mood("adult-ecchi-comedy", "Ecchi comedies", ["Ecchi", "Comedy"], [], { adult: true }),
      mood("adult-ecchi-fantasy", "Ecchi fantasy", ["Ecchi", "Fantasy"], [], { adult: true }),
      genreRow("Hentai", { adult: true }),
      {
        id: "adult-hentai-top",
        title: "Hentai, top rated",
        genres: ["Hentai"],
        args: 'genre: "Hentai", popularity_greater: 2000, sort: SCORE_DESC',
        lazy: true,
        adult: true,
      },
    );
  }

  return sections;
}

export const firstScreenSections = (options) => discoverSections(options).filter((s) => !s.lazy);

export function chunk(items, size = DISCOVER_BATCH) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// The below-the-fold rows, grouped into one AniList request each: [[section, section, section], ...]
export const lazyBatches = (options) => chunk(discoverSections(options).filter((s) => s.lazy));

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
