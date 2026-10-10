import { useSyncExternalStore } from "react";

// Small safe wrappers around localStorage. Every call is wrapped in try/catch
// because storage can be full, blocked (private mode) or disabled.
export function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the app keeps working, it just won't remember.
  }
}

// A tiny observable store backed by localStorage. React components read it
// with useStore(), plain code (like the player) reads it with store.get().
export function createStore(key, fallback) {
  let value = readJson(key, fallback);
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn());

  return {
    get: () => value,
    set(next) {
      value = typeof next === "function" ? next(value) : next;
      writeJson(key, value);
      emit();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    // Used after "clear all data": forget what is in memory.
    reset() {
      value = fallback;
      emit();
    },
  };
}

export function useStore(store) {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

const today = () => new Date().toISOString().slice(0, 10);
export { today };
