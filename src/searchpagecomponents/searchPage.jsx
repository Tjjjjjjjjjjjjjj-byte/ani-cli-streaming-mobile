import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AnimeCard from "../ani-cliComponentes/animeCard";
import Pagination from "./pagination";
import SearchFilters from "./SearchFilters";
import { searchAnime } from "../anilist";
import RetryButton from "../ui/RetryButton";
import { useRefreshHandler } from "../ui/PullToRefresh";

function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q")?.trim() ?? "";
  const page = Math.max(1, Math.floor(Number(params.get("page"))) || 1);
  const filters = {
    genre: params.get("genre") ?? "",
    year: params.get("year") ?? "",
    format: params.get("format") ?? "",
    status: params.get("status") ?? "",
    sort: params.get("sort") ?? "",
  };
  const { genre, year, format, status, sort } = filters;
  const filtered = Boolean(genre || year || format || status);
  const key = [q, genre, year, format, status, sort, page].join("|");

  const [state, setState] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const retry = () => {
    setState(null);
    setAttempt((n) => n + 1);
  };
  useRefreshHandler(retry);

  useEffect(() => {
    const controller = new AbortController();

    searchAnime({ term: q, page, genre, year, format, status, sort }, controller.signal)
      .then((data) => {
        setState({
          key,
          results: Array.isArray(data.result) ? data.result : [],
          pageInfo: data.pageInfo ?? null,
          error: null,
        });
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("Search failed:", err);
        setState({ key, results: [], pageInfo: null, error: err.message, limited: err.status === 429 });
      });

    return () => controller.abort();
  }, [q, page, genre, year, format, status, sort, key, attempt]);

  function updateParams(changes) {
    const next = { q, ...filters, ...changes };
    const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v));
    setParams(clean);
  }

  function goToPage(n) {
    updateParams({ page: String(n) });
    window.scrollTo({ top: 0 });
  }

  const loading = state?.key !== key;
  const results = state?.results ?? [];
  const pageInfo = state?.pageInfo ?? null;
  const error = !loading ? state?.error : null;
  return (
    <main className="search-page">
      <header className="search-header">
        <h2>{q ? <>Results for “{q}”</> : filtered ? "Browse anime" : "Popular anime"}</h2>
        {pageInfo?.total > 0 && (
          <p className="result-count">
            {pageInfo.total} {pageInfo.total === 1 ? "title" : "titles"}
          </p>
        )}
      </header>

      <SearchFilters
        values={filters}
        hasTerm={Boolean(q)}
        onChange={(name, value) => updateParams({ [name]: value, page: "" })}
        onClear={() => updateParams({ genre: "", year: "", format: "", status: "", page: "" })}
        onApply={(p) => updateParams({ genre: p.genre ?? "", year: p.year ?? "", format: p.format ?? "", status: p.status ?? "", sort: p.sort ?? "", page: "" })}
      />

      {loading && results.length === 0 && (
        <div className="search-results search-results--loading" role="status" aria-label="Searching">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="search-skeleton" style={{ "--i": i }}>
              <span className="sk sk--poster" />
              <span className="sk sk--line" />
              <span className="sk sk--line sk--w60" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="discover__message" role="alert">
          <span className="material-symbols-outlined" aria-hidden="true">cloud_off</span>
          <p>Couldn’t load results. {error}</p>
          <RetryButton onRetry={retry} auto={state?.limited} />
        </div>
      )}

      {!loading && !error && results.length === 0 && (
        <p className="empty-note">
          {filtered
            ? "Nothing matched these filters. Try removing one."
            : "Nothing matched. Try a different spelling or the romaji title."}
        </p>
      )}

      {results.length > 0 && (
        <div
          className={`search-results${loading ? " is-loading" : ""}`}
          aria-busy={loading}
        >
          {results.map((r) => (
            <AnimeCard key={r.id} anime={r} />
          ))}
        </div>
      )}

      {pageInfo?.lastPage > 1 && (
        <Pagination current={page} last={pageInfo.lastPage} onChange={goToPage} />
      )}
    </main>
  );
}
export default SearchPage;
