// Minimal service worker so the dashboard can be installed on a phone like an app.
// It never caches anything: every page and every form always comes from the server,
// so logins, payments and client data are never shown from a stale copy.
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function (e) {
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(function () {
      return new Response("<!doctype html><meta name=viewport content='width=device-width'><title>Offline</title><body style='font-family:sans-serif;padding:2rem'><h2>You are offline</h2><p>Connect to the internet and reload.</p>", { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }));
  }
});
