import { useEffect, useRef, useState } from "react";
import { vibrate } from "../store/settings";

export const REFRESH_EVENT = "app:refresh";
const THRESHOLD = 72;
const MAX_PULL = 120;

// Touch-only pull-to-refresh at the top of any page. A page can handle it itself by calling
// event.preventDefault() in an `app:refresh` listener (see useRefreshHandler). Pages that do not
// listen get a plain reload, which is the right thing for a PWA.
function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef(null);
  const armed = useRef(false);
  const pullRef = useRef(0);

  useEffect(() => {
    const coarse = window.matchMedia("(hover: none) and (pointer: coarse)");
    if (!coarse.matches) return undefined;

    const insideScroller = (el) => {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        if (n.scrollTop > 0 && n.scrollHeight > n.clientHeight) return true;
        if (n.matches?.("video, input, textarea, select, .player, [data-no-pull]")) return true;
      }
      return false;
    };

    const onStart = (e) => {
      if (window.scrollY > 0 || e.touches.length !== 1 || insideScroller(e.target)) {
        start.current = null;
        return;
      }
      start.current = e.touches[0].clientY;
      armed.current = false;
    };

    const onMove = (e) => {
      if (start.current == null) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) {
        if (pullRef.current) {
          pullRef.current = 0;
          setPull(0);
        }
        return;
      }
      const eased = Math.min(MAX_PULL, dy * 0.5);
      pullRef.current = eased;
      setPull(eased);
      if (eased >= THRESHOLD && !armed.current) {
        armed.current = true;
        vibrate(12);
      } else if (eased < THRESHOLD) {
        armed.current = false;
      }
    };

    const onEnd = () => {
      const done = pullRef.current >= THRESHOLD;
      start.current = null;
      pullRef.current = 0;
      if (!done) {
        setPull(0);
        return;
      }
      setBusy(true);
      setPull(THRESHOLD * 0.7);
      const event = new CustomEvent(REFRESH_EVENT, { cancelable: true });
      const handledByPage = !window.dispatchEvent(event);
      if (!handledByPage) {
        window.location.reload();
        return;
      }
      setTimeout(() => {
        setBusy(false);
        setPull(0);
      }, 900);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  if (pull <= 0 && !busy) return null;
  const ready = pull >= THRESHOLD;
  return (
    <div
      className={`ptr${busy ? " is-busy" : ""}${ready ? " is-ready" : ""}`}
      style={{ transform: `translate(-50%, ${pull - 44}px)`, opacity: Math.min(1, pull / 40) }}
      role="status"
      aria-live="polite"
    >
      <span className="material-symbols-outlined ptr__icon" aria-hidden="true" style={busy ? undefined : { transform: `rotate(${pull * 3}deg)` }}>
        {busy ? "progress_activity" : "refresh"}
      </span>
      <span className="visually-hidden">{busy ? "Refreshing" : ready ? "Release to refresh" : "Pull to refresh"}</span>
    </div>
  );
}

export default PullToRefresh;

// Lets a page take over the refresh (reload just its own data, no full page reload).
export function useRefreshHandler(handler) {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    const onRefresh = (e) => {
      e.preventDefault();
      latest.current?.();
    };
    window.addEventListener(REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(REFRESH_EVENT, onRefresh);
  }, []);
}
