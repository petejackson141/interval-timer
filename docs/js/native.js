// Bridge to the Android lock-screen workout card (WorkoutPlugin.java).
// Only does anything inside the Android app; in the browser version
// IT.native.available is false and every call is ignored.
//
// There's no bundler in this project, so instead of importing @capacitor/core
// this talks to the native plugin through the window.Capacitor object that the
// Android app injects into the page.
(function (g) {
  'use strict';
  var IT = (g.IT = g.IT || {});
  var C = g.Capacitor;
  var NAME = 'WorkoutNotification';
  var ok = false;
  var active = false;

  try {
    ok = !!(C && C.isNativePlatform && C.isNativePlatform() && C.getPlatform() === 'android' &&
      C.nativePromise && C.addListener && (!C.isPluginAvailable || C.isPluginAvailable(NAME)));
    if (ok) {
      // Button presses on the card (prev / toggle / play / pause / next) and the
      // 4-times-a-second "tick" that keeps the timer going with the screen off.
      C.addListener(NAME, 'action', function (e) {
        var a = e && e.action;
        if (!a || !IT.player) return;
        if (a === 'tick') IT.player.pulse();
        else IT.player.remote(a);
      });
    }
  } catch (e) { ok = false; }

  function call(method, data) {
    try {
      var p = C.nativePromise(NAME, method, data || {});
      if (p && p.catch) p.catch(function () {});
    } catch (e) { /* ignore */ }
  }

  function update(state) {
    if (!ok) return;
    active = true;
    call('update', state);
  }

  function stop() {
    if (!ok || !active) return;
    active = false;
    call('stop');
  }

  IT.native = { available: ok, update: update, stop: stop };
})(self);
