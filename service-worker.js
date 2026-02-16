// service-worker.js
var CACHE_NAME = "textchess-v3";
var urlsToCache = [
  "./",
  "./index.html",
  "./script.js",
  "./chess.js",
  "./stockfish.js",
  "./stockfish.wasm",
  "./manifest.json",
  "./app_logo.png",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(urlsToCache);
    }),
  );
});

self.addEventListener("fetch", function (event) {
  event.respondWith(
    caches.match(event.request).then(function (response) {
      if (response) return response;
      return fetch(event.request);
    }),
  );
});
