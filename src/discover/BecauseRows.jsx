import { useEffect, useMemo, useState } from "react";
import { fetchSimilar } from "../anilist";
import { useHistory } from "../store/history";
import { useSettings } from "../store/settings";
import { watchlistStore } from "../store/watchlist";
import { useStore } from "../store/storage";
import Row from "./Row";

const MAX_ROWS = 2;

const sameResults = (a, b) =>
  a.length === b.length &&
  a.every((r, i) => r.seed.id === b[i].seed.id && r.items.length === b[i].items.length && r.items.every((it, j) => it.id === b[i].items[j].id));

// "Because you watched X": recommendations built from your last couple of shows.
function BecauseRows() {
  const history = useHistory();
  const [settings] = useSettings();
  const list = useStore(watchlistStore);
  const { saveHistory, allowAdult } = settings;

  // The effect below depends only on these primitive keys, never on the history/list arrays,
  // so progress saves (which change the arrays but not the ids) can't re-trigger it.
  const seedKey = JSON.stringify(history.slice(0, MAX_ROWS).map((h) => [h.id, h.title]));
  const seenKey = [...new Set([...history.map((h) => h.id), ...Object.keys(list).map(Number)])].sort((a, b) => a - b).join(",");

  // Raw recommendations per seed. Filtering by "already seen" happens afterwards, so changing your
  // list re-filters locally instead of refetching.
  const [results, setResults] = useState([]);

  useEffect(() => {
    const seeds = saveHistory ? JSON.parse(seedKey).map(([id, title]) => ({ id, title })) : [];
    if (seeds.length === 0) return undefined;

    const controller = new AbortController();
    Promise.all(seeds.map((seed) => fetchSimilar(seed.id, controller.signal).then((items) => ({ seed, items })).catch(() => null))).then((all) => {
      if (controller.signal.aborted) return;
      const next = all.filter(Boolean);
      // Same content as before: keep the old array so nothing re-renders.
      setResults((prev) => (sameResults(prev, next) ? prev : next));
    });
    return () => controller.abort();
  }, [seedKey, saveHistory, allowAdult]);

  const rows = useMemo(() => {
    if (!saveHistory) return [];
    const currentSeeds = new Set(JSON.parse(seedKey).map(([id]) => id));
    const seen = new Set(seenKey ? seenKey.split(",").map(Number) : []);
    const used = new Set();
    return results
      .filter(({ seed }) => currentSeeds.has(seed.id))
      .map(({ seed, items }) => ({
        id: `because-${seed.id}`,
        title: `Because you watched ${seed.title}`,
        // Skip anything you've already watched or saved, and anything already shown in the row above.
        items: items.filter((a) => {
          if (seen.has(a.id) || used.has(a.id)) return false;
          used.add(a.id);
          return true;
        }),
      }))
      .filter((r) => r.items.length >= 4);
  }, [results, seedKey, seenKey, saveHistory]);

  return rows.map((row) => <Row key={row.id} title={row.title} items={row.items} />);
}

export default BecauseRows;
