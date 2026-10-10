import { useEffect, useState } from "react";
import { API_BASE, STANDALONE } from "../api";
import * as local from "./localLibrary";

export const IMPORT_EVENT = "library:import-file";

async function getJson(url, signal) {
  const res = await fetch(url, { signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

export function useLibrary() {
  const [result, setResult] = useState({ items: null, error: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const urls = [];
    const request = STANDALONE
      ? local.listLibrary(urls)
      : getJson(`${API_BASE}/library`, controller.signal).then((data) => data.result);
    request
      .then((items) => {
        if (!controller.signal.aborted) setResult({ items, error: null });
      })
      .catch((err) => {
        if (err.name !== "AbortError" && !controller.signal.aborted) setResult({ items: null, error: err.message });
      })
      .finally(() => {
        if (controller.signal.aborted) urls.forEach((url) => URL.revokeObjectURL(url));
      });
    return () => {
      controller.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [tick]);

  const status = result.error ? "error" : result.items ? "ready" : "loading";
  return [{ status, items: result.items ?? [], error: result.error }, () => setTick((n) => n + 1)];
}

export function useLibraryAnime(id) {
  const [result, setResult] = useState(null);
  const [tick, setTick] = useState(0);
  const key = `${id}:${tick}`;

  useEffect(() => {
    const controller = new AbortController();
    const urls = [];
    const request = STANDALONE
      ? local.getAnime(id, urls).then((data) => {
          if (!data) throw Object.assign(new Error("Not saved."), { status: 404 });
          return data;
        })
      : getJson(`${API_BASE}/library/${id}`, controller.signal);
    request
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data });
      })
      .catch((err) => {
        if (err.name === "AbortError" || controller.signal.aborted) return;
        setResult({ key, error: err.message, missing: err.status === 404 });
      })
      .finally(() => {
        if (controller.signal.aborted) urls.forEach((url) => URL.revokeObjectURL(url));
      });
    return () => {
      controller.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [key, id]);

  const reload = () => setTick((n) => n + 1);
  if (result?.key !== key) return [{ status: "loading" }, reload];
  if (result.missing) return [{ status: "missing" }, reload];
  if (result.error) return [{ status: "error", error: result.error }, reload];
  return [{ status: "ready", anime: result.data.anime, episodes: result.data.episodes }, reload];
}

export function importZip(file, onProgress) {
  if (STANDALONE) return local.importZip(file, onProgress);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/library/import`);
    xhr.setRequestHeader("Content-Type", "application/zip");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onerror = () => reject(new Error("Couldn't reach the server."));
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || `Import failed (${xhr.status})`));
    };
    xhr.send(file);
  });
}

export async function deleteFromLibrary(path) {
  if (STANDALONE) return local.remove(path);
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
}
