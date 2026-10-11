import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const KEY = "scroll:v1";

function load() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function save(map) {
  try {
    const keys = Object.keys(map);
    // Keep the last 60 pages so this can't grow forever.
    for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete map[k];
    sessionStorage.setItem(KEY, JSON.stringify(map));
  } catch {
  }
}

// Remembers how far down each page you were, and puts you back there on Back/Forward.
// New navigations (clicking a link) start at the top. Pages load their content asynchronously,
// so a restore keeps trying for a couple of seconds until the page is tall enough.
export default function ScrollMemory() {
  const location = useLocation();
  const type = useNavigationType();
  const positions = useRef(null);
  const current = useRef(location.key);
  const lastPath = useRef(location.pathname);

  if (positions.current === null) positions.current = load();

  useEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  }, []);

  useEffect(() => {
    let frame = 0;
    const key = location.key;
    current.current = key;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        positions.current[key] = Math.round(window.scrollY);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const flush = () => {
      positions.current[key] = Math.round(window.scrollY);
      save(positions.current);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", flush);
      cancelAnimationFrame(frame);
      flush();
    };
  }, [location.key]);

  useLayoutEffect(() => {
    const samePage = lastPath.current === location.pathname;
    lastPath.current = location.pathname;
    // Changing a filter or page number on the same page keeps whatever scrolling the page does itself.
    if (type !== "POP" && samePage) return undefined;
    const target = type === "POP" ? positions.current[location.key] : 0;
    if (!target) {
      window.scrollTo({ top: 0, behavior: "instant" });
      return undefined;
    }
    let tries = 0;
    let timer = 0;
    const attempt = () => {
      window.scrollTo({ top: target, behavior: "instant" });
      tries += 1;
      const reached = Math.abs(window.scrollY - target) < 4;
      if (!reached && tries < 20) timer = setTimeout(attempt, 120);
    };
    attempt();
    return () => clearTimeout(timer);
  }, [location.key, type]);

  return null;
}
