import { readZip, openEntry, readEntryText } from "./zipReader.js";
import { validateManifest, byEpisode } from "./manifest.js";

const posix = {
  dirname: (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : ""),
  basename: (p) => p.slice(p.lastIndexOf("/") + 1),
};

async function writeFile(dir, name, stream, onBytes) {
  const handle = await dir.getFileHandle(name, { create: true });
  const access = await handle.createSyncAccessHandle();
  try {
    access.truncate(0);
    let at = 0;
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      let written = 0;
      while (written < value.byteLength) {
        written += access.write(value.subarray(written), { at: at + written });
      }
      at += value.byteLength;
      onBytes(value.byteLength);
    }
    access.flush();
  } finally {
    access.close();
  }
}

async function writeText(dir, name, content) {
  const data = new TextEncoder().encode(content);
  await writeFile(dir, name, new Blob([data]).stream(), () => {});
}

async function readManifest(dir) {
  try {
    const handle = await dir.getFileHandle("manifest.json");
    return JSON.parse(await (await handle.getFile()).text());
  } catch {
    return null;
  }
}

async function importZip(file, report) {
  const entries = await readZip(file);

  const manifestEntry = entries
    .filter((e) => posix.basename(e.name) === "manifest.json")
    .sort((a, b) => a.name.split("/").length - b.name.split("/").length)[0];
  if (!manifestEntry) throw new Error("This zip has no manifest.json, so it isn't an anime package.");

  const root = posix.dirname(manifestEntry.name);
  const inRoot = new Map(
    entries.filter((e) => posix.dirname(e.name) === root).map((e) => [posix.basename(e.name), e]),
  );

  let raw;
  try {
    raw = JSON.parse(await readEntryText(file, manifestEntry));
  } catch {
    throw new Error("The manifest.json in this zip can't be read.");
  }
  const incoming = validateManifest(raw, new Set(inRoot.keys()));

  const names = [incoming.anime.cover, ...incoming.episodes.flatMap((e) => [e.video, e.subtitle])].filter(Boolean);
  const total = names.reduce((sum, name) => sum + inRoot.get(name).size, 0);

  const estimate = await navigator.storage?.estimate?.();
  if (estimate?.quota != null && estimate.usage != null && total > estimate.quota - estimate.usage) {
    const mb = (n) => `${Math.round(n / 1024 / 1024)} MB`;
    throw new Error(`Not enough space on this device: needs ${mb(total)}, about ${mb(estimate.quota - estimate.usage)} free for this app.`);
  }

  const opfs = await navigator.storage.getDirectory();
  const library = await opfs.getDirectoryHandle("library", { create: true });
  const dir = await library.getDirectoryHandle(String(incoming.anime.id), { create: true });
  const existing = await readManifest(dir);
  const keep = new Set((existing?.episodes ?? []).flatMap((e) => [e.video, e.subtitle]).filter(Boolean));
  if (existing?.anime?.cover) keep.add(existing.anime.cover);

  let done = 0;
  let lastReport = 0;
  const onBytes = (n) => {
    done += n;
    const now = Date.now();
    if (now - lastReport > 200) {
      lastReport = now;
      report(total ? Math.min(done / total, 0.99) : 0);
    }
  };

  const written = [];
  try {
    for (const name of names) {
      written.push(name);
      await writeFile(dir, name, await openEntry(file, inRoot.get(name)), onBytes);
    }

    const kept = (existing?.episodes ?? []).filter((e) => !incoming.episodes.some((n) => n.key === e.key));
    await writeText(
      dir,
      "manifest.json",
      JSON.stringify({
        format: "ani-library",
        version: 1,
        anime: { ...incoming.anime, cover: incoming.anime.cover ?? existing?.anime?.cover ?? null },
        episodes: [...kept, ...incoming.episodes].sort(byEpisode),
      }),
    );
  } catch (error) {
    for (const name of written) {
      if (!keep.has(name)) await dir.removeEntry(name).catch(() => {});
    }
    if (error?.name === "QuotaExceededError") {
      throw new Error("This device ran out of space for the app. Delete something from the library and try again.");
    }
    throw error;
  }

  return { id: incoming.anime.id, title: incoming.anime.title, added: incoming.episodes.length };
}

async function removeItem(path) {
  const match = /^\/library\/(\d+)(?:\/episodes\/([\w.]+))?$/.exec(path);
  if (!match) throw new Error("Unknown item.");
  const [, id, key] = match;
  const opfs = await navigator.storage.getDirectory();
  const library = await opfs.getDirectoryHandle("library");

  if (!key) {
    await library.removeEntry(id, { recursive: true });
    return {};
  }

  const dir = await library.getDirectoryHandle(id);
  const manifest = await readManifest(dir);
  const entry = manifest?.episodes.find((e) => e.key === key);
  if (!entry) throw new Error("That episode isn't in the library.");

  manifest.episodes = manifest.episodes.filter((e) => e.key !== key);
  if (manifest.episodes.length === 0) {
    await library.removeEntry(id, { recursive: true });
    return {};
  }
  await writeText(dir, "manifest.json", JSON.stringify(manifest));
  for (const name of [entry.video, entry.subtitle]) {
    if (name) await dir.removeEntry(name).catch(() => {});
  }
  return {};
}

self.onmessage = async ({ data }) => {
  try {
    const result =
      data.op === "remove"
        ? await removeItem(data.path)
        : await importZip(data.file, (value) => self.postMessage({ type: "progress", value }));
    self.postMessage({ type: "done", result });
  } catch (error) {
    self.postMessage({ type: "error", message: error?.message || "Something went wrong." });
  }
};
