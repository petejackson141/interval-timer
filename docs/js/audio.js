// Sound cues and the spoken 3-2-1 countdown.
// iOS only allows audio after a tap, so unlock() is called from the Start /
// Resume / Test buttons. It also plays a silent looping clip and asks Safari
// for a "playback" audio session, which lets sound through the silent switch.
(function (g) {
  'use strict';
  var IT = (g.IT = g.IT || {});

  var ctx = null;
  var silentEl = null;

  function ensureCtx() {
    if (!ctx) {
      var AC = g.AudioContext || g.webkitAudioContext;
      if (AC) { try { ctx = new AC(); } catch (e) { ctx = null; } }
    }
    if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* ignore */ } }
    return ctx;
  }

  // 0.5 s of 8-bit mono silence as an object URL.
  function makeSilentWav() {
    var rate = 8000, n = 4000;
    var buf = new ArrayBuffer(44 + n);
    var v = new DataView(buf);
    function w(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate, true);
    v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    w(36, 'data'); v.setUint32(40, n, true);
    for (var i = 0; i < n; i++) v.setUint8(44 + i, 128);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }

  function unlock() {
    try { if (g.navigator.audioSession) g.navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ }
    ensureCtx();
    try {
      if (!silentEl) {
        silentEl = new Audio(makeSilentWav());
        silentEl.loop = true;
        silentEl.setAttribute('playsinline', '');
      }
      var p = silentEl.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) { /* ignore */ }
    try {
      if ('speechSynthesis' in g) {
        var u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        g.speechSynthesis.speak(u);
      }
    } catch (e) { /* ignore */ }
  }

  function suspend() {
    try { if (silentEl) silentEl.pause(); } catch (e) { /* ignore */ }
    try { if ('speechSynthesis' in g) g.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  }

  function tone(freq, start, dur, gain) {
    var c = ensureCtx();
    if (!c) return;
    var t = c.currentTime + start;
    var o = c.createOscillator();
    var gn = c.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(Math.max(0.0005, gain), t + 0.015);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn);
    gn.connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // A short, distinct sound for the start of each kind of section.
  function cue(type) {
    if (!IT.store.settings().beep) return;
    switch (type) {
      case 'work':     tone(880, 0, 0.16, 0.22); tone(1175, 0.18, 0.22, 0.22); break;
      case 'rest':     tone(523, 0, 0.32, 0.2); break;
      case 'getready': tone(660, 0, 0.2, 0.2); break;
      case 'reset':    tone(587, 0, 0.16, 0.2); tone(440, 0.18, 0.28, 0.2); break;
      case 'finish':   tone(659, 0, 0.18, 0.22); tone(784, 0.2, 0.18, 0.22); tone(1047, 0.4, 0.4, 0.22); break;
      default:         tone(660, 0, 0.2, 0.2);
    }
  }

  // Returns false when the browser has no speech, so callers can fall back to a beep.
  function say(text, opts) {
    try {
      if (!('speechSynthesis' in g)) return false;
      g.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.volume = opts && opts.volume != null ? opts.volume : 0.8;
      u.rate = (opts && opts.rate) || 1.05;
      g.speechSynthesis.speak(u);
      return true;
    } catch (e) { return false; }
  }

  // The last-three-seconds call: 3 beeps, spoken 3-2-1, or nothing.
  function countdown(n) {
    var s = IT.store.settings();
    if (s.countdown === 'off') return;
    if (s.countdown === 'voice' && say(String(n), { volume: s.volume })) return;
    tone(880, 0, 0.14, 0.4 * s.volume);
  }

  // The halfway call inside a Work interval: spoken, a single beep, or nothing.
  function halfway() {
    var s = IT.store.settings();
    if (s.half === 'off') return;
    if (s.half === 'voice' && say('Half way there', { volume: s.volume })) return;
    tone(1175, 0, 0.3, 0.45 * s.volume);
  }

  // Settings-screen previews (each is started by a tap, which unlocks audio).
  function testCountdown() {
    unlock();
    countdown(3);
    setTimeout(function () { countdown(2); }, 1000);
    setTimeout(function () { countdown(1); }, 2000);
  }
  function testHalfway() {
    unlock();
    halfway();
  }
  function preview() {
    unlock();
    countdown(3);
  }

  IT.audio = { unlock: unlock, suspend: suspend, cue: cue, say: say, countdown: countdown, halfway: halfway,
    testCountdown: testCountdown, testHalfway: testHalfway, preview: preview };
})(self);
