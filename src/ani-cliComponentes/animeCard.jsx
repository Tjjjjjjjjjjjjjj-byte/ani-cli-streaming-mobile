import { useNavigate } from "react-router-dom";
import { FORMAT_LABELS, formatReleaseDate } from "../utils/animeFormat";

function AnimeCard({ anime }) {
  const releaseDate = formatReleaseDate(anime.releaseDate);
  const formatLabel = FORMAT_LABELS[anime.format] ?? anime.format;
  const genres = anime.genres?.slice(0, 3) ?? [];

  const navigate = useNavigate()
  return (
    <article className="anime-card" onClick={() => navigate(`/anime/${anime.id}`, { state: { anime } })}>
      <div className="anime-card__poster">
        <img src={anime.cover} alt={anime.title} loading="lazy" />

        {anime.rating != null && (
          <span className="badge badge--score">
            ★ {(anime.rating / 10).toFixed(1)}
          </span>
        )}
        {formatLabel && (
          <span className="badge badge--format">{formatLabel}</span>
        )}
      </div>

      <h3 className="anime-card__title" title={anime.title}>
        {anime.title}
      </h3>

      {releaseDate && <p className="anime-card__date">{releaseDate}</p>}

      {genres.length > 0 && (
        <ul className="genre-list">
          {genres.map((g) => (
            <li key={g} className="genre-chip">
              {g}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
export default AnimeCard;
