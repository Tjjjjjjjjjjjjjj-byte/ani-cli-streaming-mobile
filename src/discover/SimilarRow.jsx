import { useEffect, useState } from "react";
import { fetchSimilar } from "../anilist";
import { useSettings } from "../store/settings";
import Row from "./Row";

// "Similar to this": a poster row for the anime page and the watch page.
function SimilarRow({ animeId, className = "" }) {
  const [state, setState] = useState({ id: null, items: [], failed: false });
  // Re-run when adult filtering changes, since AniList's answer is filtered by it.
  const [settings] = useSettings();

  useEffect(() => {
    const controller = new AbortController();
    fetchSimilar(animeId, controller.signal)
      .then((items) => setState({ id: animeId, items, failed: false }))
      .catch((err) => {
        if (err.name !== "AbortError") setState({ id: animeId, items: [], failed: true });
      });
    return () => controller.abort();
  }, [animeId, settings.allowAdult]);

  const ready = String(state.id) === String(animeId);
  if (ready && state.items.length < 3) return null; // nothing useful to show: stay out of the way

  return (
    <div className={`similar ${className}`}>
      {ready ? (
        <Row title="Similar to this" items={state.items} />
      ) : (
        <section className="row" aria-busy="true" aria-label="Loading similar anime">
          <div className="skeleton skeleton--title" />
          <div className="row__track">
            {Array.from({ length: 7 }, (_, i) => (
              <div className="row__item" key={i}>
                <div className="skeleton skeleton--poster" />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default SimilarRow;
