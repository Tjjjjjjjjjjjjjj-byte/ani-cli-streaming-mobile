import { ANILIST_URL } from "../config.js";

export async function aniList(query, variables) {
  const response = await fetch(ANILIST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await response.json();

  if (!response.ok || json.errors) {
    const msg = json.errors?.[0]?.message || `AniList HTTP ${response.status}`;
    const err = new Error(msg);
    err.status = response.status;
    throw err;
  }
  return json.data;
}

export const detailsQuery = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      id
      idMal
      isAdult
      title { romaji english }
      description(asHtml: false)
      coverImage { extraLarge }
      bannerImage
      trailer { id site }
      episodes
      nextAiringEpisode { episode airingAt }
      duration
      status
      format
      averageScore
      genres
      startDate { year month day }
      relations {
        edges {
          relationType(version: 2)
          node {
            id
            type
            isAdult
            format
            status
            episodes
            title { romaji english }
            coverImage { large }
            startDate { year month day }
          }
        }
      }
    }
  }
`;

// Direct relations of a title, arranged as a rough watch order:
// prequels (oldest first), then sequels and the rest. AniList only returns one hop of the graph.
const RELATION_ORDER = ["PREQUEL", "PARENT", "SEQUEL", "SIDE_STORY", "SPIN_OFF", "ALTERNATIVE", "SUMMARY", "OTHER"];
const startKey = (d) => (d?.year ?? 9999) * 10000 + (d?.month ?? 0) * 100 + (d?.day ?? 0);

export function toRelations(relations, allowAdult = false) {
  const edges = relations?.edges ?? [];
  return edges
    .filter((e) => e.node?.type === "ANIME" && e.node.coverImage?.large && (allowAdult || !e.node.isAdult))
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

export function cleanDescription(text) {
  if (!text) return null;
  return text
    .replace(/~!.*?!~/gs, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const malIds = new Map();

export async function getMalId(id) {
  if (malIds.has(id)) return malIds.get(id);
  const data = await aniList("query ($id: Int) { Media(id: $id, type: ANIME) { idMal } }", { id });
  const mal = data.Media.idMal ?? null;
  malIds.set(id, mal);
  return mal;
}
