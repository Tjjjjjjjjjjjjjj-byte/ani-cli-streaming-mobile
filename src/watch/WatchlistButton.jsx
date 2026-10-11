import { useEffect, useRef, useState } from "react";
import { LIST_STATUSES, setListStatus, useListStatus } from "../store/watchlist";

const MENU_HEIGHT = 190; // roughly: four rows plus padding
const MENU_WIDTH = 190;

// "Add to list" with Watching / Planning / Completed. Lives on your device only.
function WatchlistButton({ anime }) {
  const status = useListStatus(anime.id);
  const [open, setOpen] = useState(false);
  const [flip, setFlip] = useState({ up: false, right: false });
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

  // Decide where the menu opens from the button's position, so it never runs off the screen.
  function toggle() {
    if (!open && wrap.current) {
      const rect = wrap.current.getBoundingClientRect();
      const roomBelow = window.innerHeight - rect.bottom;
      setFlip({ up: roomBelow < MENU_HEIGHT && rect.top > roomBelow, right: rect.left + MENU_WIDTH > window.innerWidth - 8 });
    }
    setOpen((o) => !o);
  }

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
        onClick={toggle}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          {status ? "bookmark_added" : "bookmark_add"}
        </span>
        {label ?? "Add to list"}
      </button>

      {open && (
        <div className={`listbtn__menu${flip.up ? " listbtn__menu--up" : ""}${flip.right ? " listbtn__menu--right" : ""}`} role="menu">
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
