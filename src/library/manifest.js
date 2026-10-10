const SAFE_NAME = /^[\w][\w .()-]*$/;
const VIDEO_EXT = /\.(mp4|mkv|webm|m4v)$/i;
const COVER_EXT = /\.(jpg|jpeg|png|webp)$/i;
const KEY_RE = /^E\d+\.(sub|dub)$/;

const text = (value, max) => (typeof value === "string" ? value.slice(0, max) : null);

export function cleanSkip(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (s) =>
        (s?.type === "op" || s?.type === "ed") &&
        Number.isFinite(s.start) &&
        Number.isFinite(s.end) &&
        s.end > s.start,
    )
    .map((s) => ({ type: s.type, start: s.start, end: s.end }));
}

export const byEpisode = (a, b) => a.number - b.number || a.lang.localeCompare(b.lang);

export function validateManifest(raw, available) {
  const bad = (why) => new Error(`This zip isn't a valid anime package: ${why}`);
  const a = raw?.anime;
  if (raw?.format !== "ani-library") throw bad("its manifest.json isn't from this app.");
  if (!a || !Number.isInteger(a.id) || a.id < 1 || typeof a.title !== "string") throw bad("the anime info is missing.");
  if (!Array.isArray(raw.episodes) || raw.episodes.length === 0) throw bad("it has no episodes.");

  const safe = (name, pattern) =>
    typeof name === "string" && SAFE_NAME.test(name) && pattern.test(name) && available.has(name);

  const cover = safe(a.cover, COVER_EXT) ? a.cover : null;
  const anime = {
    id: a.id,
    malId: Number.isInteger(a.malId) ? a.malId : null,
    title: text(a.title, 300),
    description: text(a.description, 5000),
    episodes: Number.isInteger(a.episodes) ? a.episodes : null,
    status: text(a.status, 40),
    format: text(a.format, 40),
    rating: Number.isFinite(a.rating) ? a.rating : null,
    genres: Array.isArray(a.genres) ? a.genres.filter((g) => typeof g === "string").slice(0, 20) : [],
    releaseDate:
      a.releaseDate && Number.isInteger(a.releaseDate.year)
        ? { year: a.releaseDate.year, month: a.releaseDate.month ?? null, day: a.releaseDate.day ?? null }
        : null,
    duration: Number.isFinite(a.duration) ? a.duration : null,
    cover,
  };

  const episodes = raw.episodes.map((e) => {
    if (!KEY_RE.test(e?.key ?? "") || !Number.isInteger(e.number) || e.number < 1) throw bad("an episode entry is broken.");
    const lang = e.key.endsWith(".dub") ? "dub" : "sub";
    if (!safe(e.video, VIDEO_EXT) || !e.video.startsWith(`${e.key}.`)) throw bad(`the video for ${e.key} is missing.`);
    const subtitle = safe(e.subtitle, /\.vtt$/i) && e.subtitle.startsWith(`${e.key}.`) ? e.subtitle : null;
    return {
      key: e.key,
      number: e.number,
      lang,
      video: e.video,
      subtitle,
      skip: cleanSkip(e.skip),
      size: Number.isFinite(e.size) ? e.size : null,
      addedAt: text(e.addedAt, 40) ?? new Date().toISOString(),
    };
  });
  return { anime, episodes };
}
