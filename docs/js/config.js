// Single source of truth for the app version (DD.MM.YYYY.HHMM) and release number.
// Loaded by both the page and the service worker, so changing it here
// also makes the browser install a fresh service worker and cache.
(function (g) {
  g.IT = g.IT || {};
  g.IT.RELEASE = 'v1.15'; // release number shown in Settings (matches the zip name)
  g.IT.VERSION = '22.10.2026.1600';
})(self);
