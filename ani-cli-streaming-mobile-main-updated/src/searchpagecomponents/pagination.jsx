function getPageList(current, last) {
  const wanted = new Set([1, last, current - 1, current, current + 1]);
  const pages = [...wanted]
    .filter((p) => p >= 1 && p <= last)
    .sort((a, b) => a - b);

  const list = [];
  pages.forEach((p, i) => {
    if (i > 0) {
      const skipped = p - pages[i - 1] - 1;
      if (skipped === 1) list.push(p - 1);
      else if (skipped > 1) list.push("gap");
    }
    list.push(p);
  });
  return list;
}

function Pagination({ current, last, onChange }) {
  const list = getPageList(current, last);

  return (
    <nav className="pagination" aria-label="Pagination">
      <button
        className="page-btn"
        type="button"
        aria-label="Previous page"
        disabled={current <= 1}
        onClick={() => onChange(current - 1)}
      >
        <span className="material-symbols-outlined">chevron_left</span>
      </button>

      {list.map((item, i) =>
        item === "gap" ? (
          <span key={`gap-${i}`} className="page-gap" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={item}
            className={`page-btn${item === current ? " is-current" : ""}`}
            type="button"
            aria-current={item === current ? "page" : undefined}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        ),
      )}

      <button
        className="page-btn"
        type="button"
        aria-label="Next page"
        disabled={current >= last}
        onClick={() => onChange(current + 1)}
      >
        <span className="material-symbols-outlined">chevron_right</span>
      </button>
    </nav>
  );
}

export default Pagination;
