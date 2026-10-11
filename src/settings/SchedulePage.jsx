import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAiringDay } from "../anilist";
import { FORMAT_LABELS, airsIn } from "../utils/animeFormat";
import { watchlistStore } from "../store/watchlist";
import { useStore } from "../store/storage";
import { useSettings } from "../store/settings";
import RetryButton from "../ui/RetryButton";
import { useRefreshHandler } from "../ui/PullToRefresh";

const DAYS = 7;

// Local midnight, N days from today, as unix seconds.
function dayStart(offset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return Math.floor(d.getTime() / 1000);
}

const timeOf = (airingAt) => new Date(airingAt * 1000).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

function SchedulePage() {
  const [offset, setOffset] = useState(0);
  const [mineOnly, setMineOnly] = useState(false);
  const [state, setState] = useState({ key: null, items: [], error: null });
  const [tick, setTick] = useState(0);
  useRefreshHandler(() => setTick((n) => n + 1));
  const [now, setNow] = useState(() => Date.now());
  const list = useStore(watchlistStore);
  const [settings] = useSettings();

  const days = useMemo(
    () =>
      Array.from({ length: DAYS }, (_, i) => {
        const start = dayStart(i);
        const date = new Date(start * 1000);
        return {
          offset: i,
          start,
          weekday: i === 0 ? "Today" : i === 1 ? "Tomorrow" : date.toLocaleDateString(undefined, { weekday: "short" }),
          date: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        };
      }),
    [],
  );

  const start = days[offset].start;
  const key = `${start}:${tick}:${settings.allowAdult}`;

  useEffect(() => {
    document.title = "Airing schedule";
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      document.title = "ani-cli-streaming";
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchAiringDay(start, controller.signal)
      .then((items) => setState({ key, items, error: null }))
      .catch((err) => {
        if (err.name !== "AbortError") {
          setState({ key, items: [], limited: err.status === 429, error: err.status === 429 ? "AniList is limiting requests right now. Wait a minute, then try again." : err.message });
        }
      });
    return () => controller.abort();
  }, [start, key]);

  const loading = state.key !== key;
  const shown = mineOnly ? state.items.filter((r) => list[r.anime.id]) : state.items;

  return (
    <main className="schedule">
      <header className="schedule__header">
        <h1>Airing schedule</h1>
        <p>New episodes by day, in your local time.</p>
      </header>

      <div className="schedule__bar">
        <div className="watchlist__tabs" role="tablist" aria-label="Day">
          {days.map((day) => (
            <button
              key={day.offset}
              type="button"
              role="tab"
              aria-selected={offset === day.offset}
              className={`schedule__day${offset === day.offset ? " is-active" : ""}`}
              onClick={() => setOffset(day.offset)}
            >
              <strong>{day.weekday}</strong>
              <span>{day.date}</span>
            </button>
          ))}
        </div>
        <button type="button" className={`toggle${mineOnly ? " is-on" : ""}`} aria-pressed={mineOnly} onClick={() => setMineOnly((v) => !v)}>
          <span className="material-symbols-outlined" aria-hidden="true">bookmark</span>
          My list only
        </button>
      </div>

      {loading && (
        <ul className="schedule__list" aria-busy="true" aria-label="Loading schedule">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="schedule__item schedule__item--skeleton">
              <span className="sk sk--thumb" />
              <span className="schedule__text">
                <span className="sk sk--line sk--w40" />
                <span className="sk sk--line" />
              </span>
            </li>
          ))}
        </ul>
      )}

      {!loading && state.error && (
        <div className="discover__message" role="alert">
          <span className="material-symbols-outlined" aria-hidden="true">cloud_off</span>
          <p>Couldn’t load the schedule. {state.error}</p>
          <RetryButton onRetry={() => setTick((n) => n + 1)} auto={state.limited} />
        </div>
      )}

      {!loading && !state.error && shown.length === 0 && (
        <p className="empty-note">{mineOnly ? "Nothing from your list airs this day." : "Nothing is scheduled for this day."}</p>
      )}

      {!loading && shown.length > 0 && (
        <ul className="schedule__list">
          {shown.map((r) => {
            const mine = list[r.anime.id];
            const aired = r.airingAt * 1000 <= now;
            return (
              <li key={`${r.anime.id}:${r.episode}`}>
                <Link className={`schedule__item${aired ? " is-aired" : ""}`} to={`/anime/${r.anime.id}`} state={{ anime: r.anime }}>
                  <span className="schedule__time">{timeOf(r.airingAt)}</span>
                  <img className="schedule__cover" src={r.anime.cover} alt="" loading="lazy" />
                  <span className="schedule__text">
                    <span className="schedule__title" title={r.anime.title}>{r.anime.title}</span>
                    <span className="schedule__meta">
                      Episode {r.episode}
                      {FORMAT_LABELS[r.anime.format] && ` · ${FORMAT_LABELS[r.anime.format]}`}
                      {r.anime.rating != null && ` · ★ ${(r.anime.rating / 10).toFixed(1)}`}
                    </span>
                  </span>
                  <span className="schedule__side">
                    {mine && <span className="schedule__mine">On your list</span>}
                    <span className={`schedule__when${aired ? "" : " is-soon"}`}>{airsIn(r.airingAt, now)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

export default SchedulePage;
