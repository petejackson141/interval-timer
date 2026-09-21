// Single source of truth for the app version (DD.MM.YYYY.HHMM).
// Loaded by both the page and the service worker, so changing it here
// also makes the browser install a fresh service worker and cache.
(function (g) {
  g.IT = g.IT || {};
  g.IT.VERSION = '21.09.2026.1735';
})(self);
