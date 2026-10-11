import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAiringStatus } from "../anilist";
import { FORMAT_LABELS, airsIn } from "../utils/animeFormat";
import { LIST_STATUSES, setListStatus, useWatchlist } from "../store/watchlist";
import { furthestEpisode, readProgress, resumeEpisode } from "../watch/useProgress";
import { getShowPrefs } from "../store/showPrefs";

// An episode is out that's later than the last one you finished.
function hasNewEpisode(id, status) {
  if (!status?.available) return false;
  try {
    const p = JSON.parse(localStorage.getItem(`progress:${id}`));
    const watched = Array.isArray(p?.watched) ? p.watched : [];
    const latestSeen = watched.length ? Math.max(...watched) : 0;
    return status.available > latestSeen && status.next != null;
  } catch {
    return false;
  }
}

// "Ep 5 / 12" and where the Continue button should go, from what's stored for this show.
function progressFor(anime, airing) {
  const progress = readProgress(anime.id);
  const reached = furthestEpisode(progress);
  const total = anime.episodes ?? airing?.available ?? anime.available ?? null;
  const available = airing?.available ?? anime.available ?? anime.episodes ?? null;
  const resume = anime.status === "completed" ? 1 : resumeEpisode(progress, available);
  return { reached, total, resume, started: reached > 0 };
}

function WatchlistPage() {
  const list = useWatchlist();
  const [tab, setTab] = useState("watching");
  const [airing, setAiring] = useState({});
  const idsKey = list.map((a) => a.id).join(",");

  // One request for the whole list: which shows have an episode out that you haven't watched?
  useEffect(() => {
    if (!idsKey) return;
    const controller = new AbortController();
    fetchAiringStatus(idsKey.split(",").map(Number), controller.signal)
      .then(setAiring)
      .catch(() => {});
    return () => controller.abort();
  }, [idsKey]);

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
          {shown.map((anime) => {
            const mine = progressFor(anime, airing[anime.id]);
            const lang = getShowPrefs(anime.id).lang === "dub" ? "dub" : "sub";
            // The entry's `status` is the list status ("watching"), not the show's airing status,
            // so it must not travel to other pages as if it were the anime.
            const preview = { id: anime.id, title: anime.title, cover: anime.cover, format: anime.format, episodes: anime.episodes, rating: anime.rating };
            return (
            <div className="watchlist__item" key={anime.id}>
              <Link className="anime-card" to={`/anime/${anime.id}`} state={{ anime: preview }}>
                <div className="anime-card__poster">
                  {anime.cover && <img src={anime.cover} alt={anime.title} loading="lazy" />}
                  {anime.rating != null && <span className="badge badge--score">★ {(anime.rating / 10).toFixed(1)}</span>}
                  {FORMAT_LABELS[anime.format] && <span className="badge badge--format">{FORMAT_LABELS[anime.format]}</span>}
                  {anime.status === "watching" && hasNewEpisode(anime.id, airing[anime.id]) && <span className="badge badge--new">New episode</span>}
                </div>
                <h3 className="anime-card__title" title={anime.title}>{anime.title}</h3>
                <p className="anime-card__date watchlist__progress">
                  {mine.started ? `Ep ${mine.reached}${mine.total != null ? ` / ${mine.total}` : ""}` : "Not started"}
                </p>
                {airing[anime.id]?.next ? (
                  <p className="anime-card__date">
                    E{airing[anime.id].next.episode} · {airsIn(airing[anime.id].next.airingAt)}
                  </p>
                ) : (
                  anime.episodes != null && <p className="anime-card__date">{anime.episodes} episodes</p>
                )}
              </Link>
              <div className="watchlist__actions">
                <Link className="btn btn--primary watchlist__continue" to={`/anime/${anime.id}/watch/${mine.resume}?lang=${lang}`} state={{ anime: preview }}>
                  <span className="material-symbols-outlined" aria-hidden="true">play_arrow</span>
                  {anime.status === "completed" ? "Rewatch" : mine.started ? `Continue E${mine.resume}` : "Start E1"}
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
            </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

export default WatchlistPage;
