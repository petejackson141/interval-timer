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
    if (IT.voice) IT.voice.prepare();
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
  // Levels were tuned at a 70% slider, so scale around that.
  function cue(type) {
    var s = IT.store.settings();
    if (!s.beep) return;
    var k = s.cueVolume / 0.7;
    switch (type) {
      case 'work':     tone(880, 0, 0.16, 0.22 * k); tone(1175, 0.18, 0.22, 0.22 * k); break;
      case 'rest':     tone(523, 0, 0.32, 0.2 * k); break;
      case 'getready': tone(660, 0, 0.2, 0.2 * k); break;
      case 'reset':    tone(587, 0, 0.16, 0.2 * k); tone(440, 0.18, 0.28, 0.2 * k); break;
      case 'finish':   tone(659, 0, 0.18, 0.22 * k); tone(784, 0.2, 0.18, 0.22 * k); tone(1047, 0.4, 0.4, 0.22 * k); break;
      default:         tone(660, 0, 0.2, 0.2 * k);
    }
  }

  // Phones don't say which voices are male or female, so match well-known names.
  var FEMALE = ['samantha', 'nicky', 'karen', 'moira', 'tessa', 'allison', 'ava', 'susan', 'victoria', 'kate', 'serena', 'fiona', 'zoe', 'joelle', 'martha', 'catherine', 'microsoft zira', 'google us english', 'google uk english female'];
  var MALE = ['aaron', 'alex', 'fred', 'daniel', 'rishi', 'gordon', 'arthur', 'oliver', 'lee', 'evan', 'tom', 'reed', 'ralph', 'eddy', 'microsoft david', 'microsoft mark', 'google uk english male'];

  function pickVoice(kind) {
    var vs;
    try { vs = g.speechSynthesis.getVoices() || []; } catch (e) { return null; }
    var en = vs.filter(function (v) { return /^en([-_]|$)/i.test(v.lang); });
    var names = kind === 'male' ? MALE : FEMALE;
    for (var i = 0; i < names.length; i++) {
      var hits = en.filter(function (v) { return v.name.toLowerCase().indexOf(names[i]) === 0; });
      if (hits.length) {
        var us = hits.filter(function (v) { return /en[-_]US/i.test(v.lang); });
        return us[0] || hits[0];
      }
    }
    return null;
  }

  // Which system voice is used, in words, for the Settings screen.
  function voiceInfo() {
    var s = IT.store.settings();
    if (s.voiceType === 'mine') {
      var st = IT.voice ? IT.voice.status() : { have: 0, total: 9 };
      return st.have ? st.have + ' of ' + st.total + ' phrases recorded. Anything not recorded uses the female voice.' : 'No phrases recorded yet.';
    }
    var v = pickVoice(s.voiceType);
    if (v) return 'Using the “' + v.name.replace(/\s*\(.*\)\s*$/, '') + '” voice on this phone.';
    return s.voiceType === 'male'
      ? 'No male voice found on this phone, so this is a deeper version of the default voice.'
      : 'Using the phone’s default voice.';
  }
  try {
    if ('speechSynthesis' in g) {
      g.speechSynthesis.getVoices(); // kicks off loading on iOS
      g.speechSynthesis.addEventListener('voiceschanged', function () {
        var el = g.document.getElementById('voice-info');
        if (el) el.textContent = voiceInfo();
      });
    }
  } catch (e) { /* ignore */ }

  // Synthesised speech in the chosen male / female voice.
  // Returns false when the browser has no speech, so callers can fall back to a beep.
  function say(text, opts) {
    try {
      if (!('speechSynthesis' in g)) return false;
      var kind = IT.store.settings().voiceType === 'male' ? 'male' : 'female';
      g.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      var v = pickVoice(kind);
      if (v) { u.voice = v; u.lang = v.lang; }
      else { u.lang = 'en-US'; if (kind === 'male') u.pitch = 0.7; }
      u.volume = opts && opts.volume != null ? opts.volume : 0.8;
      u.rate = (opts && opts.rate) || 1.05;
      g.speechSynthesis.speak(u);
      return true;
    } catch (e) { return false; }
  }

  // Say a phrase in whichever voice is chosen: my own recording if there is one
  // for this phrase, otherwise the synthesised voice.
  function speak(key, text, volume) {
    if (IT.store.settings().voiceType === 'mine' && IT.voice && IT.voice.play(key, volume)) return true;
    return say(text, { volume: volume });
  }

  // The last-three-seconds call: 3 beeps, spoken 3-2-1, or nothing.
  function countdown(n) {
    var s = IT.store.settings();
    if (s.countdown === 'off') return;
    if (s.countdown === 'voice' && speak('n' + n, String(n), s.volume)) return;
    tone(880, 0, 0.14, 0.4 * s.volume);
  }

  // The halfway call inside a Work interval: spoken, a single beep, or nothing.
  function halfway() {
    var s = IT.store.settings();
    if (s.half === 'off') return;
    if (s.half === 'voice' && speak('half', 'Half way there', s.halfVolume)) return;
    tone(1175, 0, 0.3, 0.45 * s.halfVolume);
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
  // Spoken section names ("Work", "Rest", ...) when that setting is on.
  function announce(key, text) {
    var s = IT.store.settings();
    if (s.names) speak(key, text, s.namesVolume);
  }

  // Settings-screen sample of the chosen voice, whatever the countdown mode is.
  function testVoice() {
    unlock();
    var s = IT.store.settings();
    speak('n3', '3', s.volume);
    setTimeout(function () { speak('n2', '2', s.volume); }, 1000);
    setTimeout(function () { speak('n1', '1', s.volume); }, 2000);
  }

  // Slider previews: one sample of whatever that slider controls.
  function preview(key) {
    unlock();
    if (key === 'halfVolume') halfway();
    else if (key === 'cueVolume') cue('work');
    else if (key === 'namesVolume') announce('work', 'Work');
    else countdown(3);
  }

  IT.audio = { unlock: unlock, suspend: suspend, cue: cue, say: say, countdown: countdown, halfway: halfway, announce: announce, testVoice: testVoice, voiceInfo: voiceInfo, context: ensureCtx,
    testCountdown: testCountdown, testHalfway: testHalfway, preview: preview };
})(self);
