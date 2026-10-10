import { useState } from "react";

const TABS = [
  ["details", "Details"],
  ["themes", "OP & ED"],
];

function SongList({ title, songs }) {
  if (songs.length === 0) return null;
  return (
    <section className="songs">
      <h3 className="songs__heading">{title}</h3>
      <ol className="songs__list">
        {songs.map((song) => (
          <li key={`${song.order}-${song.title}`} className="songs__item" style={{ "--i": song.order }}>
            <span className="songs__num">{song.order}</span>
            <span className="songs__body">
              <span className="songs__title">{song.title}</span>
              {song.artist && <span className="songs__artist">{song.artist}</span>}
            </span>
            {song.episodes && <span className="songs__eps">Ep {song.episodes}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function SeriesSidebar({ details, genres = [], themes = null }) {
  const [tab, setTab] = useState("details");
  const tabs = themes ? TABS : TABS.slice(0, 1);
  const songCount = themes ? themes.openings.length + themes.endings.length : 0;

  return (
    <section className="series-details" aria-label="About this anime">
      {tabs.length > 1 && (
      <div className="series-tabs" role="tablist" aria-label="About this anime">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`series-tab-${key}`}
            aria-selected={tab === key}
            aria-controls="series-panel"
            className={`series-tabs__tab${tab === key ? " is-on" : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      )}

      <div className="series-details__panel" id="series-panel" role={themes ? "tabpanel" : undefined} aria-labelledby={themes ? `series-tab-${tab}` : undefined} key={tab}>
        {tab === "details" && (
          <>
            <dl className="series-details__list">
              {details.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {genres.length > 0 && (
              <ul className="series-details__genres" aria-label="Genres">
                {genres.map((g) => (
                  <li key={g} className="genre-chip">
                    {g}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {themes && tab === "themes" && (
          <>
            {themes.loading && (
              <div className="songs__skeleton" role="status" aria-label="Loading songs">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className="sk sk--song" style={{ "--i": i }} />
                ))}
              </div>
            )}
            {!themes.loading && songCount === 0 && (
              <p className="empty-note">No opening or ending songs are listed for this anime.</p>
            )}
            {!themes.loading && (
              <>
                <SongList title="Openings" songs={themes.openings} />
                <SongList title="Endings" songs={themes.endings} />
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export default SeriesSidebar;
