import { useEffect, useRef, useState } from "react";
import { LIST_STATUSES, setListStatus, useListStatus } from "../store/watchlist";

// "Add to list" with Watching / Planning / Completed. Lives on your device only.
function WatchlistButton({ anime }) {
  const status = useListStatus(anime.id);
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (!wrap.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = LIST_STATUSES.find(([key]) => key === status)?.[1];

  function choose(next) {
    setListStatus(anime, next);
    setOpen(false);
  }

  return (
    <div className="listbtn" ref={wrap}>
      <button
        type="button"
        className={`btn btn--outline${status ? " is-on" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          {status ? "bookmark_added" : "bookmark_add"}
        </span>
        {label ?? "Add to list"}
      </button>

      {open && (
        <div className="listbtn__menu" role="menu">
          {LIST_STATUSES.map(([key, text]) => (
            <button
              key={key}
              type="button"
              role="menuitemradio"
              aria-checked={status === key}
              className={status === key ? "is-active" : ""}
              onClick={() => choose(key)}
            >
              {text}
            </button>
          ))}
          {status && (
            <button type="button" role="menuitem" className="listbtn__remove" onClick={() => choose(null)}>
              Remove from list
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default WatchlistButton;
