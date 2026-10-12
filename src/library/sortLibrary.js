// Sort orders for the Downloads grid.
export const SORT_STORAGE_KEY = "downloads:sort";
export const SORTS = [
  ["recent", "Recent"],
  ["size", "Size"],
  ["title", "Title"],
];

const byTitle = (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true });

// Newest first, biggest first, A to Z. Ties fall back to the title so the order never jumps around.
const COMPARE = {
  recent: (a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")),
  size: (a, b) => (b.size ?? 0) - (a.size ?? 0),
  title: byTitle,
};

export const isSort = (value) => typeof value === "string" && Object.hasOwn(COMPARE, value);

export function sortLibrary(items, sort) {
  const compare = COMPARE[sort] ?? COMPARE.recent;
  return [...items].sort((a, b) => compare(a, b) || byTitle(a, b));
}
