import { API_BASE } from "./api";
import { getSettings } from "./store/settings";
import { syncListEntry } from "./store/watchlist";
import { CARD_FIELDS, DISCOVER_BATCH, chunk, firstScreenSections, discoverSections, rowFromCards, sectionQuery } from "../shared/discoverRows.js";

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

// Runs one AniList request for up to DISCOVER_BATCH sections and returns [{ sec, media }].
async function loadSections(batch) {
  const adult = allowAdult();
  const query = `query { ${batch.map((sec, i) => sectionQuery(sec, i, adult)).join("\n")} }`;
  const data = await direct(query, {});
  return batch.map((sec, i) => ({ sec, media: data[`s${i}`].media }));
}

// First screen: the hero and the first rows. Everything else is fetched on demand (fetchDiscoverRows).
async function buildDiscover() {
  const sections = firstScreenSections({ adult: allowAdult() });
  const settled = await Promise.allSettled(chunk(sections, DISCOVER_BATCH).map(loadSections));

  const loaded = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  if (loaded.length === 0) throw settled[0].reason;

  const trending = loaded.find((l) => l.sec.hero)?.media ?? [];
  const hero = trending
    .filter((m) => m.bannerImage && m.averageScore != null)
    .sort((a, b) => b.averageScore - a.averageScore)
    .slice(0, 6)
    .map((m) => ({ ...toCard(m), banner: m.bannerImage, trailer: m.trailer?.id ? { id: m.trailer.id, site: m.trailer.site } : null, description: cleanDescription(m.description) }));

  const rows = loaded
    .map(({ sec, media }) => rowFromCards(sec, media.filter((m) => m.coverImage?.large).map(toCard)))
    .filter(Boolean);

  return { hero, rows, partial: settled.some((r) => r.status !== "fulfilled") };
}

// Drop answers cached by earlier versions of the discover rows.
try {
  localStorage.removeItem("al:discover2:safe");
  localStorage.removeItem("al:discover2:adult");
} catch {
  // Storage blocked: nothing to clean.
}

export function fetchDiscover(signal) {
  const job = cached(
    `discover3:${allowAdult() ? "adult" : "safe"}`,
    LIST_TTL,
    () => directThenServer(buildDiscover, () => server(`/discover${allowAdult() ? "?adult=1" : ""}`)),
    true,
  );
  return waitFor(job, signal);
}

// Rows below the first screen: up to DISCOVER_BATCH row ids per call (one AniList request).
// Returns [{ id, title, items }], skipping rows that came back with too few items.
export function fetchDiscoverRows(ids, signal) {
  const adult = allowAdult();
  const wanted = discoverSections({ adult }).filter((s) => ids.includes(s.id)).slice(0, DISCOVER_BATCH);
  if (wanted.length === 0) return Promise.resolve([]);
  const job = cached(
    `discover4:rows:${wanted.map((s) => s.id).join(",")}:${adult ? "adult" : "safe"}`,
    LIST_TTL,
    () =>
      directThenServer(
        async () => {
          const loaded = await loadSections(wanted);
          return loaded.map(({ sec, media }) => rowFromCards(sec, media.filter((m) => m.coverImage?.large).map(toCard))).filter(Boolean);
        },
        async () => (await server(`/discover?rows=${wanted.map((s) => s.id).join(",")}${adult ? "&adult=1" : ""}`)).rows ?? [],
      ),
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
      relations {
        edges {
          relationType(version: 2)
          node {
            id type isAdult format status episodes
            title { romaji english } coverImage { large } startDate { year month day }
          }
        }
      }
    }
  }`;

// Direct relations of a title, arranged as a rough watch order:
// prequels (oldest first), then sequels and the rest. AniList only returns one hop of the graph.
const RELATION_ORDER = ["PREQUEL", "PARENT", "SEQUEL", "SIDE_STORY", "SPIN_OFF", "ALTERNATIVE", "SUMMARY", "OTHER"];
const startKey = (d) => (d?.year ?? 9999) * 10000 + (d?.month ?? 0) * 100 + (d?.day ?? 0);

function toRelations(relations) {
  const adult = allowAdult();
  const edges = relations?.edges ?? [];
  return edges
    .filter((e) => e.node?.type === "ANIME" && e.node.coverImage?.large && (adult || !e.node.isAdult))
    .filter((e) => RELATION_ORDER.includes(e.relationType))
    .map((e) => ({
      id: e.node.id,
      relation: e.relationType,
      title: e.node.title.english || e.node.title.romaji,
      cover: e.node.coverImage.large,
      format: e.node.format,
      status: e.node.status,
      episodes: e.node.episodes,
      releaseDate: e.node.startDate,
    }))
    .sort(
      (a, b) =>
        RELATION_ORDER.indexOf(a.relation) - RELATION_ORDER.indexOf(b.relation) ||
        startKey(a.releaseDate) - startKey(b.releaseDate),
    );
}

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
    relations: toRelations(m.relations),
  };
}

export function fetchDetails(id, signal) {
  const numeric = Number(id);
  const job = cached(
    `details3:${numeric}:${allowAdult() ? "adult" : "safe"}`,
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
  ).then((details) => {
    // Details are the source of truth for the episode count: keep the list entry in step with them.
    if (details?.id) syncListEntry(details);
    return details;
  });
  return waitFor(job, signal);
}

// Full details have airing info (availableEpisodes); the lightweight objects passed between pages don't.
// Returns `known` when it already is the full thing, otherwise loads the details. Falls back to `known` if offline.
export async function loadFullDetails(id, known) {
  if (known && "availableEpisodes" in known) return known;
  try {
    return (await fetchDetails(id)) ?? known ?? null;
  } catch {
    return known ?? null;
  }
}

export function animeBasics(id) {
  return fetchDetails(id)
    .then((d) => ({ title: d.title, malId: d.malId ?? null }))
    .catch(() => null);
}

// ---------- Discovery: similar titles, airing schedule, "new episode" status ----------

const similarQuery = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      recommendations(sort: RATING_DESC, perPage: 25) {
        nodes { rating mediaRecommendation { isAdult ${CARD_FIELDS} } }
      }
    }
  }`;

// Titles other AniList users recommend for this one, best-rated first.
export function fetchSimilar(id, signal) {
  const adult = allowAdult();
  const job = cached(
    `similar:${Number(id)}:${adult ? "adult" : "safe"}`,
    DETAILS_TTL,
    async () => {
      const data = await direct(similarQuery, { id: Number(id) });
      const nodes = data.Media?.recommendations?.nodes ?? [];
      return nodes
        .filter((n) => n.rating > 0 && n.mediaRecommendation?.coverImage?.large && (adult || !n.mediaRecommendation.isAdult))
        .map((n) => toCard(n.mediaRecommendation))
        .slice(0, 18);
    },
    true,
  );
  return waitFor(job, signal);
}

const airingQuery = `
  query ($from: Int, $to: Int, $page: Int) {
    Page(page: $page, perPage: 50) {
      pageInfo { hasNextPage }
      airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
        airingAt
        episode
        media { isAdult ${CARD_FIELDS} }
      }
    }
  }`;

// Everything airing in the 24 hours after dayStart (unix seconds). Cached per day for half an hour.
export function fetchAiringDay(dayStart, signal) {
  const adult = allowAdult();
  const job = cached(`airing:${dayStart}:${adult ? "adult" : "safe"}`, LIST_TTL, async () => {
    const rows = [];
    for (let page = 1; page <= 8; page++) {
      const data = await direct(airingQuery, { from: dayStart - 1, to: dayStart + 86_400, page });
      rows.push(...data.Page.airingSchedules);
      if (!data.Page.pageInfo.hasNextPage) break;
    }
    const seen = new Set();
    return rows
      .filter((r) => r.media && r.media.coverImage?.large && r.media.format !== "MUSIC" && (adult || !r.media.isAdult))
      .filter((r) => {
        const key = `${r.media.id}:${r.episode}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((r) => ({ airingAt: r.airingAt, episode: r.episode, anime: toCard(r.media) }));
  });
  return waitFor(job, signal);
}

// For a list of ids: when does the next episode air, and how many are out already?
export function fetchAiringStatus(ids, signal) {
  const list = [...new Set(ids.map(Number))].sort((a, b) => a - b).slice(0, 50);
  if (list.length === 0) return Promise.resolve({});
  const job = cached(`status:${list.join(",")}`, 15 * MINUTE, async () => {
    const data = await direct(
      `query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { id status episodes nextAiringEpisode { episode airingAt } } } }`,
      { ids: list },
    );
    return Object.fromEntries(
      data.Page.media.map((m) => [
        m.id,
        {
          next: m.nextAiringEpisode ? { episode: m.nextAiringEpisode.episode, airingAt: m.nextAiringEpisode.airingAt } : null,
          available: m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : m.episodes,
        },
      ]),
    );
  });
  return waitFor(job, signal);
}
