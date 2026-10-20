const CACHE_NAME = "cwms-batch-events-shell-v4";
const APP_SHELL = ["/events/", "/events/index.html"];

const offlineResponse = () => new Response("This page is not available offline.", {
  status: 503,
  statusText: "Offline",
  headers: { "Content-Type": "text/plain; charset=utf-8" },
});

const cachedOrOffline = (request) =>
  caches
    .match(request)
    .then((cachedResponse) => cachedResponse || offlineResponse())
    .catch(() => offlineResponse());

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => cachedOrOffline("/events/index.html")),
    );
    return;
  }

  if (requestUrl.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const responseCopy = response.clone();
          void caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, responseCopy))
            .catch(() => undefined);
        }
        return response;
      })
      .catch(() => cachedOrOffline(event.request)),
  );
});
