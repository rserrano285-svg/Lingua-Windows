const CACHE_NAME = "lingua-pwa-shell-v8";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch("/precache-manifest.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load the offline asset manifest.");
      const assets = await response.json();
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll([...APP_SHELL, ...assets]);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name.startsWith("lingua-pwa-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  ) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cacheKey = request.mode === "navigate" ? "/" : request;
      const cached = await cache.match(cacheKey, { ignoreVary: true });
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        await cache.put(cacheKey, response.clone());
      }
      return response;
    })()
  );
});
