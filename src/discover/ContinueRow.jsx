import { Link } from "react-router-dom";
import { removeFromHistory, useHistory } from "../store/history";
import { useSettings } from "../store/settings";

function formatLeft(seconds) {
  const m = Math.max(1, Math.round(seconds / 60));
  return `${m} min left`;
}

// First row on the home page: pick up where you stopped, or jump to the next episode.
function ContinueRow() {
  const history = useHistory();
  const [settings] = useSettings();
  if (!settings.saveHistory) return null;

  const items = history
    .map((h) => {
      const total = h.total;
      const next = h.finished ? h.episode + 1 : h.episode;
      // Finished the last episode? Nothing left to continue.
      if (h.finished && total != null && next > total) return null;
      const ratio = !h.finished && h.duration > 0 ? Math.min(1, h.time / h.duration) : 0;
      return { ...h, next, ratio };
    })
    .filter(Boolean)
    .slice(0, 12);

  if (items.length === 0) return null;

  return (
    <section className="row continue" aria-label="Continue watching">
      <h2 className="row__title">Continue watching</h2>
      <ul className="row__track">
        {items.map((item) => (
          <li className="row__item continue__item" key={item.id}>
            <Link
              className="poster continue__card"
              to={`/anime/${item.id}/watch/${item.next}?lang=${item.lang ?? "sub"}`}
              state={{ anime: item.anime }}
            >
              <div className="poster__frame continue__frame">
                {item.cover && <img src={item.cover} alt="" loading="lazy" />}
                <span className="continue__play material-symbols-outlined" aria-hidden="true">
                  play_arrow
                </span>
                {item.ratio > 0 && (
                  <span className="continue__bar" aria-hidden="true">
                    <span style={{ width: `${Math.round(item.ratio * 100)}%` }} />
                  </span>
                )}
              </div>
              <h3 className="poster__title" title={item.title}>
                {item.title}
              </h3>
              <p className="poster__meta">
                {item.finished ? `Up next: Episode ${item.next}` : `Episode ${item.next} · ${formatLeft(item.duration - item.time)}`}
              </p>
            </Link>
            <button
              type="button"
              className="continue__remove"
              aria-label={`Remove ${item.title} from continue watching`}
              onClick={() => removeFromHistory(item.id)}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                close
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default ContinueRow;
