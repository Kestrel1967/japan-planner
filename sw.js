/* Japan Planner - lets the app open with no internet.
   Always tries the network first (so updates arrive at once) and falls back to the saved copy. */
var CACHE = 'japan-planner-v8';
var FILES = ['./', 'index.html', 'style.css', 'config.js', 'fflate.js', 'schema.js', 'xl.js', 'api.js', 'app.js', 'template.js', 'manifest.webmanifest', 'icon-192.png', 'icon-180.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;      // Microsoft and OneDrive calls go straight out
  e.respondWith(fetch(e.request).then(function (r) {
    if (r && r.ok) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); }
    return r;
  }).catch(function () { return caches.match(e.request, { ignoreSearch: true }).then(function (m) { return m || caches.match('index.html'); }); }));
});
