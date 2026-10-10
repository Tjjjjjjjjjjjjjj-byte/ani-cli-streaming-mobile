const MIME = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
  vtt: "text/vtt",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export const isLocalLibrarySupported = () =>
  typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function";

async function libraryDir(create = false) {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle("library", { create });
}

async function animeDir(id) {
  return (await libraryDir()).getDirectoryHandle(String(id));
}

async function readManifest(id) {
  try {
    const handle = await (await animeDir(id)).getFileHandle("manifest.json");
    return JSON.parse(await (await handle.getFile()).text());
  } catch {
    return null;
  }
}

async function urlFor(dir, name, urls) {
  if (!name) return null;
  try {
    const file = await (await dir.getFileHandle(name)).getFile();
    const type = MIME[name.split(".").pop().toLowerCase()] ?? "";
    const url = URL.createObjectURL(file.slice(0, file.size, type));
    urls.push(url);
    return url;
  } catch {
    return null;
  }
}

function summary(manifest, coverUrl) {
  const { anime, episodes } = manifest;
  return {
    id: anime.id,
    title: anime.title,
    cover: coverUrl,
    rating: anime.rating,
    genres: anime.genres,
    format: anime.format,
    year: anime.releaseDate?.year ?? null,
    savedEpisodes: episodes.length,
    totalEpisodes: anime.episodes,
    langs: [...new Set(episodes.map((e) => e.lang))],
    size: episodes.reduce((sum, e) => sum + (e.size ?? 0), 0),
    updatedAt: episodes.reduce((latest, e) => (e.addedAt > latest ? e.addedAt : latest), ""),
  };
}

export async function listLibrary(urls = []) {
  let library;
  try {
    library = await libraryDir();
  } catch {
    return [];
  }
  const items = [];
  for await (const [name, handle] of library.entries()) {
    if (handle.kind !== "directory") continue;
    const manifest = await readManifest(name);
    if (!manifest?.episodes?.length) continue;
    items.push(summary(manifest, await urlFor(handle, manifest.anime.cover, urls)));
  }
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getAnime(id, urls = []) {
  const manifest = await readManifest(id);
  if (!manifest) return null;
  const dir = await animeDir(id);

  const episodes = [];
  for (const e of manifest.episodes) {
    const videoUrl = await urlFor(dir, e.video, urls);
    if (!videoUrl) continue;
    episodes.push({ ...e, videoUrl, subtitleUrl: await urlFor(dir, e.subtitle, urls) });
  }
  return {
    anime: { ...manifest.anime, coverUrl: await urlFor(dir, manifest.anime.cover, urls) },
    episodes,
  };
}

function runWorker(message, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./importWorker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") {
        onProgress?.(data.value);
        return;
      }
      worker.terminate();
      if (data.type === "done") resolve(data.result);
      else reject(new Error(data.message));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("The import stopped unexpectedly."));
    };
    worker.postMessage(message);
  });
}

export async function importZip(file, onProgress) {
  if (!isLocalLibrarySupported()) {
    throw new Error("This browser can't store files for the app. Try Chrome, or Safari on iOS 15.2 or newer.");
  }
  const result = await runWorker({ op: "import", file }, onProgress);
  onProgress?.(1);
  navigator.storage?.persist?.().catch(() => {});
  return result;
}

export async function remove(path) {
  await runWorker({ op: "remove", path });
}
