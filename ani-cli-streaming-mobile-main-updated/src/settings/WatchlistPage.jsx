import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FORMAT_LABELS } from "../utils/animeFormat";
import { LIST_STATUSES, setListStatus, useWatchlist } from "../store/watchlist";

function WatchlistPage() {
  const list = useWatchlist();
  const [tab, setTab] = useState("watching");

  useEffect(() => {
    document.title = "My list";
    return () => {
      document.title = "ani-cli-streaming";
    };
  }, []);

  const counts = Object.fromEntries(LIST_STATUSES.map(([key]) => [key, list.filter((a) => a.status === key).length]));
  const shown = list.filter((a) => a.status === tab);

  return (
    <main className="watchlist">
      <header className="watchlist__header">
        <h1>My list</h1>
        <p>Saved on this device. No account needed.</p>
      </header>

      <div className="watchlist__tabs" role="tablist" aria-label="List status">
        {LIST_STATUSES.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}>
            {label}
            <span>{counts[key]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="empty-note">
          {list.length === 0 ? "Nothing here yet. Open an anime and press “Add to list”, or just start watching and it appears under Watching." : `Nothing under ${LIST_STATUSES.find(([k]) => k === tab)[1]} yet.`}
        </p>
      ) : (
        <div className="library-grid">
          {shown.map((anime) => (
            <div className="watchlist__item" key={anime.id}>
              <Link className="anime-card" to={`/anime/${anime.id}`} state={{ anime }}>
                <div className="anime-card__poster">
                  {anime.cover && <img src={anime.cover} alt={anime.title} loading="lazy" />}
                  {anime.rating != null && <span className="badge badge--score">★ {(anime.rating / 10).toFixed(1)}</span>}
                  {FORMAT_LABELS[anime.format] && <span className="badge badge--format">{FORMAT_LABELS[anime.format]}</span>}
                </div>
                <h3 className="anime-card__title" title={anime.title}>{anime.title}</h3>
                {anime.episodes != null && <p className="anime-card__date">{anime.episodes} episodes</p>}
              </Link>
              <select
                className="watchlist__move"
                aria-label={`Move ${anime.title}`}
                value={anime.status}
                onChange={(e) => setListStatus(anime, e.target.value || null)}
              >
                {LIST_STATUSES.map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
                <option value="">Remove</option>
              </select>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

export default WatchlistPage;
