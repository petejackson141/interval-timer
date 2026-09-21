// Service worker: makes the app open instantly and work offline.
// Network-first (always revalidated) so a new push shows up the next time the
// app opens, falling back to the cached copy when there's no signal.
importScripts('js/config.js');

var CACHE = 'intervaltimer-' + self.IT.VERSION;
var ASSETS = [
  './', 'index.html', 'manifest.json', 'css/style.css',
  'js/config.js', 'js/model.js', 'js/store.js', 'js/ui.js', 'js/audio.js', 'js/voice.js',
  'js/library.js', 'js/builder.js', 'js/player.js', 'js/app.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(ASSETS.map(function (u) {
        return fetch(new Request(u, { cache: 'reload' })).then(function (r) { if (r.ok) return c.put(u, r); });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf('intervaltimer-') === 0 && k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(networkFirst(req));
});

function networkFirst(req) {
  return new Promise(function (resolve) {
    var settled = false;
    var timer = setTimeout(function () { fromCache(); }, 3000);
    function fromCache() {
      caches.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit && !settled) { settled = true; resolve(hit); }
      });
    }
    fetch(req, { cache: 'no-cache' }).then(function (res) {
      clearTimeout(timer);
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      if (!settled) { settled = true; resolve(res); }
    }).catch(function () {
      clearTimeout(timer);
      caches.match(req, { ignoreSearch: true }).then(function (hit) {
        if (!settled) { settled = true; resolve(hit || Response.error()); }
      });
    });
  });
}
