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
    }
  }
`;

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
