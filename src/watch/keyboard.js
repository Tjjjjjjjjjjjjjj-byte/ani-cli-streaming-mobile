import { useEffect, useRef } from "react";

export function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
  return target.tagName === "INPUT" && target.type !== "range";
}

export function useEpisodeNavKeys({ onPrev, onNext }) {
  const latest = useRef({ onPrev, onNext });
  useEffect(() => {
    latest.current = { onPrev, onNext };
  });

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      if (isTypingTarget(e.target)) return;

      const go = e.key === "ArrowUp" ? latest.current.onNext : latest.current.onPrev;
      if (!go) return;
      e.preventDefault();
      go();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
