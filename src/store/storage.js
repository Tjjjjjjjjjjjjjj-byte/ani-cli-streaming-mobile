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

// Run stored data through an optional validator. A validator returns a safe
// value; if it throws or returns nothing usable, the fallback is used instead.
// Corrupt data in localStorage must never reach a render.
export function sanitize(raw, fallback, validate) {
  if (!validate) return raw;
  try {
    const safe = validate(raw);
    return safe === undefined || safe === null ? fallback : safe;
  } catch {
    return fallback;
  }
}

// A tiny observable store backed by localStorage. React components read it
// with useStore(), plain code (like the player) reads it with store.get().
// options.validate(value) is applied to whatever is read from storage.
export function createStore(key, fallback, { validate } = {}) {
  let value = sanitize(readJson(key, fallback), fallback, validate);
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
