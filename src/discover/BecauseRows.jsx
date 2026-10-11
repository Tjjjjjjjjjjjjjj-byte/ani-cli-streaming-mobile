import { useEffect, useMemo, useState } from "react";
import { fetchSimilar } from "../anilist";
import { useHistory } from "../store/history";
import { useSettings } from "../store/settings";
import { watchlistStore } from "../store/watchlist";
import { useStore } from "../store/storage";
import Row from "./Row";

const MAX_ROWS = 2;

// "Because you watched X": recommendations built from your last couple of shows.
function BecauseRows() {
  const history = useHistory();
  const [settings] = useSettings();
  const list = useStore(watchlistStore);
  const [rows, setRows] = useState([]);

  // Only the most recent shows matter, and only their ids: this keeps the effect from re-running on every progress save.
  const seeds = useMemo(
    () => history.slice(0, MAX_ROWS).map((h) => ({ id: h.id, title: h.title })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history.slice(0, MAX_ROWS).map((h) => h.id).join(",")],
  );
  const seen = useMemo(() => new Set([...history.map((h) => h.id), ...Object.keys(list).map(Number)]), [history, list]);

  useEffect(() => {
    if (!settings.saveHistory || seeds.length === 0) {
      setRows([]);
      return;
    }
    const controller = new AbortController();
    Promise.all(seeds.map((s) => fetchSimilar(s.id, controller.signal).then((items) => ({ seed: s, items })).catch(() => null)))
      .then((results) => {
        if (controller.signal.aborted) return;
        const used = new Set();
        setRows(
          results
            .filter(Boolean)
            .map(({ seed, items }) => ({
              id: `because-${seed.id}`,
              title: `Because you watched ${seed.title}`,
              // Skip anything you've already watched or saved, and anything already shown in the row above.
              items: items.filter((a) => !seen.has(a.id) && !used.has(a.id) && (used.add(a.id), true)),
            }))
            .filter((r) => r.items.length >= 4),
        );
      });
    return () => controller.abort();
  }, [seeds, seen, settings.saveHistory, settings.allowAdult]);

  return rows.map((row) => <Row key={row.id} title={row.title} items={row.items} />);
}

export default BecauseRows;
