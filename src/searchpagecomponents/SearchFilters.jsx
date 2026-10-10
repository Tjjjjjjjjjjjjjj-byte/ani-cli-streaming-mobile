import {
  FORMAT_LABELS,
  SEARCH_FORMATS,
  SEARCH_GENRES,
  SEARCH_SORTS,
  SEARCH_STATUSES,
  STATUS_LABELS,
  searchYears,
} from "../utils/animeFormat";

const YEARS = searchYears();

function FilterSelect({ label, icon, value, onChange, highlight = true, children }) {
  return (
    <label className={`filter${highlight && value ? " is-set" : ""}`}>
      <span className="filter__label">
        <span className="material-symbols-outlined" aria-hidden="true">
          {icon}
        </span>
        {label}
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  );
}

function SearchFilters({ values, hasTerm, onChange, onClear }) {
  const active = ["genre", "year", "format", "status"].filter((k) => values[k]).length;
  const sorts = SEARCH_SORTS.filter(([key]) => hasTerm || key !== "relevance");
  const sort = sorts.some(([key]) => key === values.sort) ? values.sort : sorts[0][0];

  return (
    <form className="filters" aria-label="Filter results" onSubmit={(e) => e.preventDefault()}>
      <FilterSelect label="Genre" icon="category" value={values.genre} onChange={(v) => onChange("genre", v)}>
        <option value="">Any genre</option>
        {SEARCH_GENRES.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect label="Year" icon="calendar_month" value={values.year} onChange={(v) => onChange("year", v)}>
        <option value="">Any year</option>
        {YEARS.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect label="Format" icon="tv" value={values.format} onChange={(v) => onChange("format", v)}>
        <option value="">Any format</option>
        {SEARCH_FORMATS.map((f) => (
          <option key={f} value={f}>
            {FORMAT_LABELS[f] ?? f}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect label="Status" icon="sensors" value={values.status} onChange={(v) => onChange("status", v)}>
        <option value="">Any status</option>
        {SEARCH_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s] ?? s}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        label="Sort by"
        icon="sort"
        value={sort}
        highlight={false}
        onChange={(v) => onChange("sort", v)}
      >
        {sorts.map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </FilterSelect>

      {active > 0 && (
        <button type="button" className="filters__clear" onClick={onClear}>
          <span className="material-symbols-outlined" aria-hidden="true">
            filter_alt_off
          </span>
          Clear {active === 1 ? "filter" : `${active} filters`}
        </button>
      )}
    </form>
  );
}

export default SearchFilters;
