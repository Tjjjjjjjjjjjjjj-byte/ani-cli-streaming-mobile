// Service worker for the app.
// It only makes the app installable and shows a friendly page when the
// dev server isn't running. It never caches app files, so Vite's hot
// reload and your edits keep working.
const CACHE = "app-offline-v1";
const OFFLINE = "/server-offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(OFFLINE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.mode !== "navigate") return;
  event.respondWith(
    fetch(request).catch(async () => (await caches.match(OFFLINE)) ?? Response.error()),
  );
});
