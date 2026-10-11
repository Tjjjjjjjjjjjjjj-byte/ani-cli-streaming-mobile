import { Link } from "react-router-dom";
import { FORMAT_LABELS, STATUS_LABELS } from "../utils/animeFormat";

const RELATION_LABELS = {
  PREQUEL: "Prequel",
  PARENT: "Parent story",
  SEQUEL: "Sequel",
  SIDE_STORY: "Side story",
  SPIN_OFF: "Spin-off",
  ALTERNATIVE: "Alternative version",
  SUMMARY: "Recap",
  OTHER: "Related",
};

// Shown in watch order: what to see before this, then what comes next.
function RelatedList({ relations, title }) {
  if (relations.length === 0) {
    return <p className="empty-note">No related titles are listed for this anime.</p>;
  }

  const firstAfter = relations.findIndex((r) => r.relation !== "PREQUEL" && r.relation !== "PARENT");
  const before = firstAfter === -1 ? relations : relations.slice(0, firstAfter);
  const after = firstAfter === -1 ? [] : relations.slice(firstAfter);

  const renderItem = (r, index) => {
    const format = FORMAT_LABELS[r.format] ?? r.format;
    const status = STATUS_LABELS[r.status] ?? null;
    const meta = [
      r.releaseDate?.year,
      format,
      r.episodes ? `${r.episodes} ${r.episodes === 1 ? "episode" : "episodes"}` : null,
      status,
    ].filter(Boolean);
    return (
      <li key={`${r.id}-${r.relation}`} style={{ "--i": Math.min(index, 12) }}>
        <Link className="related__item" to={`/anime/${r.id}`} state={{ anime: { id: r.id, title: r.title, cover: r.cover, format: r.format, status: r.status, episodes: r.episodes, releaseDate: r.releaseDate } }}>
          <img className="related__cover" src={r.cover} alt="" loading="lazy" />
          <span className="related__text">
            <span className="related__relation">{RELATION_LABELS[r.relation] ?? "Related"}</span>
            <span className="related__title">{r.title}</span>
            <span className="related__meta">{meta.join(" · ")}</span>
          </span>
          <span className="material-symbols-outlined related__go" aria-hidden="true">chevron_right</span>
        </Link>
      </li>
    );
  };

  return (
    <section className="related" aria-label="Related anime in watch order">
      {before.length > 0 && (
        <>
          <h3 className="related__heading">Before this</h3>
          <ol className="related__list">{before.map(renderItem)}</ol>
        </>
      )}
      <div className="related__you" aria-current="true">
        <span className="material-symbols-outlined" aria-hidden="true">play_circle</span>
        <span>
          You are here<strong>{title}</strong>
        </span>
      </div>
      {after.length > 0 && (
        <>
          <h3 className="related__heading">Next</h3>
          <ol className="related__list">{after.map((r, i) => renderItem(r, i + before.length))}</ol>
        </>
      )}
    </section>
  );
}

export default RelatedList;
