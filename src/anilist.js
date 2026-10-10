import { API_BASE } from "./api";
import { getSettings } from "./store/settings";

const ENDPOINT = "https://graphql.anilist.co";
// Read at call time so flipping the switch in Settings takes effect without a reload.
const allowAdult = () => getSettings().allowAdult;

const MINUTE = 60_000;
const LIST_TTL = 30 * MINUTE;
const DETAILS_TTL = 24 * 60 * MINUTE;

const memory = new Map();
const inflight = new Map();

function readStored(key) {
  try {
    const raw = localStorage.getItem(`al:${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStored(key, entry) {
  try {
    localStorage.setItem(`al:${key}`, JSON.stringify(entry));
  } catch {
  }
}

function cached(key, ttl, load, persist = false) {
  const hit = memory.get(key) ?? (persist ? readStored(key) : null);
  if (hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.data);
  if (inflight.has(key)) return inflight.get(key);

  const job = load()
    .then((data) => {
      if (data?.partial) return data;
      const entry = { at: Date.now(), data };
      memory.set(key, entry);
      if (persist) writeStored(key, entry);
      return data;
    })
    .catch((err) => {
      if (hit && err.status !== 404) return hit.data;
      throw err;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, job);
  return job;
}

function waitFor(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

async function direct(query, variables) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors) {
    const err = new Error(json.errors?.[0]?.message || `AniList HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json.data;
}

async function server(path, init) {
  const res = await fetch(`${API_BASE}${path}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const LIMITED = "AniList is limiting requests right now. Wait a minute, then try again.";

async function directThenServer(fromAniList, fromServer) {
  try {
    return await fromAniList();
  } catch (first) {
    if (first.status === 404) throw first;
    try {
      return await fromServer();
    } catch (second) {
      const limited = first.status === 429 || second.status === 429;
      const err = new Error(limited ? LIMITED : first.status ? first.message : second.message);
      err.status = limited ? 429 : second.status;
      throw err;
    }
  }
}

function cleanDescription(text) {
  if (!text) return null;
  return text
    .replace(/~!.*?!~/gs, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
const SEARCH_TYPES = {
  search: "String",
  genre: "String",
  startDate: "String",
  format: "MediaFormat",
  status: "MediaStatus",
  sort: "[MediaSort]",
  isAdult: "Boolean",
};
const SEARCH_ARGS = {
  search: "search",
  genre: "genre",
  startDate: "startDate_like",
  format: "format",
  status: "status",
  sort: "sort",
  isAdult: "isAdult",
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
          id title { romaji english } coverImage { large } episodes status format
          seasonYear averageScore genres startDate { year month day }
        }
      }
    }`;
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

export function searchAnime(body, signal) {
  const term = typeof body.term === "string" && body.term.trim() ? body.term.trim() : null;
  const page = Number(body.page) || 1;
  const genre = typeof body.genre === "string" && body.genre.trim() ? body.genre.trim() : null;
  const year = Number(body.year);
  const format = SEARCH_FORMATS.includes(body.format) ? body.format : null;
  const status = SEARCH_STATUSES.includes(body.status) ? body.status : null;

  let sortKey = Object.hasOwn(SEARCH_SORTS, body.sort) ? body.sort : null;
  if (!sortKey || (sortKey === "relevance" && !term)) sortKey = term ? "relevance" : "popularity";

  const vars = {
    search: term,
    page,
    perPage: 30,
    genre,
    startDate: Number.isInteger(year) && year > 1900 ? `${year}%` : null,
    format,
    status,
    sort: [SEARCH_SORTS[sortKey]],
    isAdult: allowAdult() ? undefined : false,
  };

  const key = `search:${JSON.stringify(vars)}`;
  const job = cached(key, LIST_TTL, () =>
    directThenServer(
      async () => {
        const data = await direct(buildSearchQuery(vars), JSON.parse(JSON.stringify(vars)));
        return { query: term, pageInfo: data.Page.pageInfo, result: data.Page.media.map(toCard) };
      },
      () =>
        server("/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, adult: allowAdult() }),
        }),
    ),
  );
  return waitFor(job, signal);
}

const DISCOVER_GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror",
  "Mystery", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural",
];
const DISCOVER_BATCH = 3;
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
            `s${i}: Page(perPage: ${sec.perPage ?? 20}) { media(type: ANIME${allowAdult() ? "" : ", isAdult: false"}, ${sec.args}) { ${sec.hero ? HERO_FIELDS : CARD_FIELDS} } }`,
        )
        .join("\n");
      const data = await direct(`query { ${lists} }`, {});
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
    .map((m) => ({ ...toCard(m), banner: m.bannerImage, trailer: m.trailer?.id ? { id: m.trailer.id, site: m.trailer.site } : null, description: cleanDescription(m.description) }));

  const rows = loaded
    .map(({ sec, media }) => ({
      id: sec.id,
      title: sec.title,
      items: media.filter((m) => m.coverImage?.large).slice(0, 20).map(toCard),
    }))
    .filter((row) => row.items.length >= 4);

  return { hero, rows, partial: settled.some((r) => r.status !== "fulfilled") };
}

export function fetchDiscover(signal) {
  const job = cached(
    `discover2:${allowAdult() ? "adult" : "safe"}`,
    LIST_TTL,
    () => directThenServer(buildDiscover, () => server(`/discover${allowAdult() ? "?adult=1" : ""}`)),
    true,
  );
  return waitFor(job, signal);
}

const detailsQuery = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      id idMal isAdult title { romaji english } description(asHtml: false)
      coverImage { extraLarge } bannerImage trailer { id site } episodes
      nextAiringEpisode { episode airingAt } duration status format averageScore genres
      startDate { year month day }
    }
  }`;

function toDetails(m) {
  return {
    id: m.id,
    malId: m.idMal ?? null,
    title: m.title.english || m.title.romaji,
    description: cleanDescription(m.description),
    cover: m.coverImage.extraLarge,
    banner: m.bannerImage ?? null,
    trailer: m.trailer?.id ? { id: m.trailer.id, site: m.trailer.site } : null,
    episodes: m.episodes,
    availableEpisodes: m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : m.episodes,
    nextEpisode: m.nextAiringEpisode
      ? { episode: m.nextAiringEpisode.episode, airingAt: m.nextAiringEpisode.airingAt }
      : null,
    duration: m.duration,
    status: m.status,
    format: m.format,
    rating: m.averageScore,
    genres: m.genres ?? [],
    releaseDate: m.startDate,
  };
}

export function fetchDetails(id, signal) {
  const numeric = Number(id);
  const job = cached(
    `details2:${numeric}:${allowAdult() ? "adult" : "safe"}`,
    DETAILS_TTL,
    () =>
      directThenServer(
        async () => {
          const data = await direct(detailsQuery, { id: numeric });
          if (data.Media.isAdult && !allowAdult()) {
            const err = new Error("This title isn't available.");
            err.status = 404;
            throw err;
          }
          return toDetails(data.Media);
        },
        () => server(`/anime/${numeric}${allowAdult() ? "?adult=1" : ""}`),
      ),
    true,
  );
  return waitFor(job, signal);
}

export function animeBasics(id) {
  return fetchDetails(id)
    .then((d) => ({ title: d.title, malId: d.malId ?? null }))
    .catch(() => null);
}
