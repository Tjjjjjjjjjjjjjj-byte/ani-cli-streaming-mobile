import { useEffect, useMemo, useRef, useState } from "react";
import { fetchDiscoverRows } from "../anilist";
import { lazyBatches } from "../../shared/discoverRows.js";
import { useSettings } from "../store/settings";
import RetryButton from "../ui/RetryButton";
import Row from "./Row";

// Start loading the next rows while they are still this far below the screen.
const LOOK_AHEAD = "900px 0px";

function RowSkeleton() {
  return (
    <section className="row" aria-hidden="true">
      <div className="skeleton skeleton--title" />
      <div className="row__track">
        {Array.from({ length: 8 }, (_, i) => (
          <div className="row__item" key={i}>
            <div className="skeleton skeleton--poster" />
          </div>
        ))}
      </div>
    </section>
  );
}

// The rows below the first screen (moods, genres and, with adult content on, the adult rows).
// They are fetched a few at a time, only once you scroll near them, so opening the app stays light.
function Batches({ adult }) {
  const batches = useMemo(() => lazyBatches({ adult }), [adult]);
  const sentinel = useRef(null);
  // status: "idle" (waiting for the bottom to come into view), "loading", or "error"
  const [state, setState] = useState({ rows: [], next: 0, status: "idle", limited: false, error: null });
  const done = state.next >= batches.length;

  // Idle: wake up when the end of the list is near. A new observer after every batch means a
  // short list that still doesn't fill the screen keeps loading by itself.
  useEffect(() => {
    const el = sentinel.current;
    if (done || state.status !== "idle" || !el) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setState((s) => (s.status === "idle" ? { ...s, status: "loading" } : s));
      },
      { rootMargin: LOOK_AHEAD },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [done, state.status]);

  useEffect(() => {
    if (state.status !== "loading") return undefined;
    const controller = new AbortController();
    const index = state.next;
    fetchDiscoverRows(batches[index].map((s) => s.id), controller.signal)
      .then((rows) => setState((s) => ({ rows: [...s.rows, ...rows], next: index + 1, status: "idle", limited: false, error: null })))
      .catch((err) => {
        if (err.name === "AbortError") return;
        setState((s) => ({ ...s, status: "error", limited: err.status === 429, error: err.message }));
      });
    return () => controller.abort();
  }, [state.status, state.next, batches]);

  return (
    <>
      {state.rows.map((row) => (
        <Row key={row.id} title={row.title} items={row.items} />
      ))}
      {state.status === "loading" && <RowSkeleton />}
      {state.status === "error" && (
        <div className="discover__message discover__message--inline" role="alert">
          <p>{state.limited ? "AniList is limiting requests right now. Wait a minute, then try again." : state.error || "Couldn’t load more rows."}</p>
          <RetryButton onRetry={() => setState((s) => ({ ...s, status: "idle" }))} auto={state.limited} />
        </div>
      )}
      {!done && <div ref={sentinel} aria-hidden="true" style={{ height: 1 }} />}
    </>
  );
}

function LazyRows() {
  const [settings] = useSettings();
  // Turning adult content on or off starts the list over, since the rows themselves change.
  return <Batches key={settings.allowAdult ? "adult" : "safe"} adult={settings.allowAdult} />;
}

export default LazyRows;
