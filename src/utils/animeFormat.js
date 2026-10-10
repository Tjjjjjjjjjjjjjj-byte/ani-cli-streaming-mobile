export const FORMAT_LABELS = {
  TV: "TV",
  TV_SHORT: "TV Short",
  MOVIE: "Movie",
  SPECIAL: "Special",
  OVA: "OVA",
  ONA: "ONA",
  MUSIC: "Music",
};

export const STATUS_LABELS = {
  FINISHED: "Finished",
  RELEASING: "Airing",
  NOT_YET_RELEASED: "Not yet released",
  CANCELLED: "Cancelled",
  HIATUS: "On hiatus",
};

export function formatReleaseDate(date) {
  if (!date?.year) return null;
  const { year, month, day } = date;

  if (!month) return String(year);

  if (!day) {
    return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  }

  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatAired(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export const SEARCH_GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Ecchi", "Fantasy", "Horror", "Mahou Shoujo",
  "Mecha", "Music", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life",
  "Sports", "Supernatural", "Thriller",
];

export const SEARCH_FORMATS = ["TV", "MOVIE", "OVA", "ONA", "SPECIAL", "TV_SHORT"];

export const SEARCH_STATUSES = ["RELEASING", "FINISHED", "NOT_YET_RELEASED", "HIATUS", "CANCELLED"];

export const SEARCH_SORTS = [
  ["relevance", "Best match"],
  ["popularity", "Most popular"],
  ["trending", "Trending"],
  ["score", "Highest rated"],
  ["newest", "Newest first"],
];

export function searchYears(now = new Date()) {
  const latest = now.getFullYear() + 1;
  return Array.from({ length: latest - 1980 + 1 }, (_, i) => latest - i);
}
