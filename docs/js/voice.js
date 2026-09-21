// "My voice": record your own countdown and call-outs, guided phrase by phrase.
// Clips are kept in IndexedDB (audio is too big for localStorage) and played
// back through Web Audio so they can fire on time and follow the volume sliders.
// Each clip is trimmed of leading/trailing silence and levelled when recorded.
(function (g) {
  'use strict';
  var IT = (g.IT = g.IT || {});
  var ui = IT.ui, A = IT.audio;

  // What to record. `key` is what the player asks for; `label` is what to say.
  var PHRASES = [
    { key: 'n3', label: 'Three', hint: 'Say the number the way you want to hear it. Short and clear.' },
    { key: 'n2', label: 'Two', hint: 'Same style as “Three”, so the countdown sounds even.' },
    { key: 'n1', label: 'One', hint: 'Same style again. Keep it short.' },
    { key: 'half', label: 'Half way there', hint: 'Say it with some energy. It plays halfway through a Work interval.' },
    { key: 'getready', label: 'Get ready', hint: 'Plays when a Get ready section starts, if “Say section names” is on.' },
    { key: 'work', label: 'Work', hint: 'Plays when a Work section starts. Make it punchy.' },
    { key: 'rest', label: 'Rest', hint: 'Plays when a Rest section starts. Nice and relaxed.' },
    { key: 'reset', label: 'Round rest', hint: 'Plays when a Round rest starts.' },
    { key: 'finish', label: 'Workout complete', hint: 'Plays when the whole workout is done.' }
  ];

  var clips = {};  // key -> { key, ab, mime, start, dur, norm }
  var bufs = {};   // key -> decoded AudioBuffer

  // ----- IndexedDB (falls back to memory only if unavailable) -----
  function db() {
    return new Promise(function (resolve, reject) {
      try {
        var r = g.indexedDB.open('intervaltimer-voice', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('clips', { keyPath: 'key' }); };
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
      } catch (e) { reject(e); }
    });
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction('clips', mode);
        var req = fn(t.objectStore('clips'));
        t.oncomplete = function () { resolve(req ? req.result : undefined); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }
  function load() {
    return tx('readonly', function (st) { return st.getAll(); }).then(function (rows) {
      (rows || []).forEach(function (r) { clips[r.key] = r; });
    }).catch(function () { /* no saved voice */ });
  }

  // ----- decoding and playback -----
  function decodeRaw(ab) {
    var ctx = A.context();
    return new Promise(function (resolve, reject) {
      if (!ctx) { reject(new Error('no audio')); return; }
      try { ctx.decodeAudioData(ab.slice(0), resolve, reject); } catch (e) { reject(e); }
    });
  }
  function decode(key) {
    if (bufs[key]) return Promise.resolve(bufs[key]);
    var c = clips[key];
    if (!c) return Promise.resolve(null);
    return decodeRaw(c.ab).then(function (b) { bufs[key] = b; return b; }, function () { return null; });
  }
  function prepare() {
    Object.keys(clips).forEach(decode);
  }

  function playBuffer(buf, c, volume) {
    var ctx = A.context();
    if (!ctx || !buf) return;
    var src = ctx.createBufferSource();
    var gn = ctx.createGain();
    src.buffer = buf;
    gn.gain.value = Math.max(0.0001, volume * c.norm);
    src.connect(gn);
    gn.connect(ctx.destination);
    src.start(0, c.start, c.dur);
  }

  // Returns true if there is a recording for this phrase (it then plays).
  function play(key, volume) {
    var c = clips[key];
    if (!c || !A.context()) return false;
    if (bufs[key]) playBuffer(bufs[key], c, volume);
    else decode(key).then(function (b) { playBuffer(b, c, volume); });
    return true;
  }

  function has(key) { return !!clips[key]; }
  function status() {
    var have = PHRASES.filter(function (p) { return clips[p.key]; }).length;
    return { have: have, total: PHRASES.length };
  }
  function clearAll() {
    clips = {}; bufs = {};
    return tx('readwrite', function (st) { return st.clear(); }).catch(function () {});
  }

  // Find where the voice actually is, trim the silence, and work out how much to
  // lift it so quiet and loud recordings end up at a similar level.
  function analyze(buf) {
    var d = buf.getChannelData(0), sr = buf.sampleRate, peak = 0, i, j;
    for (i = 0; i < d.length; i++) { var a = Math.abs(d[i]); if (a > peak) peak = a; }
    if (peak < 0.01) return null;
    var thr = Math.max(0.015, peak * 0.1);
    var win = Math.max(1, Math.round(sr * 0.01));
    var first = -1, last = -1;
    for (i = 0; i + win <= d.length; i += win) {
      var m = 0;
      for (j = 0; j < win; j++) { var v = Math.abs(d[i + j]); if (v > m) m = v; }
      if (m >= thr) { if (first < 0) first = i; last = i + win; }
    }
    if (first < 0) return null;
    var start = Math.max(0, first / sr - 0.06);
    var end = Math.min(buf.duration, last / sr + 0.15);
    return { start: start, dur: Math.max(0.1, end - start), norm: Math.min(6, 0.9 / peak) };
  }

  // ----- recorder -----
  var R = { open: false, i: 0, state: 'idle', stream: null, rec: null, chunks: [], mime: '', timer: null, temp: null };

  function canRecord() {
    return !!(g.navigator.mediaDevices && g.navigator.mediaDevices.getUserMedia && g.MediaRecorder);
  }
  function pickMime() {
    var types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
    for (var i = 0; i < types.length; i++) {
      if (g.MediaRecorder.isTypeSupported && g.MediaRecorder.isTypeSupported(types[i])) return types[i];
    }
    return '';
  }
  function readBlob(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsArrayBuffer(blob);
    });
  }
  function stopStream() {
    if (R.stream) { R.stream.getTracks().forEach(function (t) { t.stop(); }); R.stream = null; }
  }

  function startRec() {
    if (R.state === 'recording') return;
    A.context(); // created inside this tap so the clip can be decoded afterwards
    g.navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      R.stream = stream;
      R.chunks = [];
      var mime = pickMime();
      var rec = mime ? new g.MediaRecorder(stream, { mimeType: mime }) : new g.MediaRecorder(stream);
      R.rec = rec;
      R.mime = rec.mimeType || mime || 'audio/mp4';
      rec.ondataavailable = function (e) { if (e.data && e.data.size) R.chunks.push(e.data); };
      rec.onstop = onStopped;
      rec.start();
      R.state = 'recording';
      R.temp = null;
      render();
      R.timer = setTimeout(stopRec, 4500); // phrases are short; don't record forever
    }).catch(function () {
      ui.toast('Microphone blocked. Allow it for this app, then try again.');
    });
  }
  function stopRec() {
    clearTimeout(R.timer);
    if (R.rec && R.rec.state === 'recording') R.rec.stop();
  }
  function onStopped() {
    clearTimeout(R.timer);
    stopStream();
    if (!R.open) return;
    var blob = new g.Blob(R.chunks, { type: R.mime });
    readBlob(blob).then(function (ab) {
      return decodeRaw(ab).then(function (buf) {
        var an = analyze(buf);
        if (!an) {
          R.state = 'idle';
          ui.toast('Couldn’t hear anything. Check the microphone and try again.');
          render();
          return;
        }
        R.temp = { ab: ab, mime: R.mime, start: an.start, dur: an.dur, norm: an.norm, buf: buf };
        R.state = 'review';
        render();
      });
    }).catch(function () {
      R.state = 'idle';
      ui.toast('That recording couldn’t be read. Try again.');
      render();
    });
  }

  function keep() {
    if (!R.temp) return;
    var key = PHRASES[R.i].key;
    var t = R.temp;
    var rec = { key: key, ab: t.ab, mime: t.mime, start: t.start, dur: t.dur, norm: t.norm, updated: Date.now() };
    clips[key] = rec;
    bufs[key] = t.buf;
    R.temp = null;
    tx('readwrite', function (st) { return st.put(rec); }).catch(function () {
      ui.toast('Couldn’t save the recording. It will work until you close the app.');
    });
    next();
  }
  function next() {
    R.state = 'idle';
    R.temp = null;
    if (R.i >= PHRASES.length - 1) { R.i = PHRASES.length - 1; render(true); return; }
    R.i++;
    render();
  }
  function goto(i) {
    if (R.state === 'recording') return;
    R.i = Math.max(0, Math.min(PHRASES.length - 1, i));
    R.state = 'idle';
    R.temp = null;
    render();
  }

  function onClose() {
    R.open = false;
    clearTimeout(R.timer);
    if (R.rec && R.rec.state === 'recording') { R.rec.onstop = null; try { R.rec.stop(); } catch (e) { /* ignore */ } }
    stopStream();
    R.state = 'idle';
    if (!IT.player.isRunning()) A.suspend();
  }

  function chips() {
    return '<div class="chips" role="group" aria-label="Phrases">' + PHRASES.map(function (p, i) {
      return '<button type="button" class="chip' + (clips[p.key] ? ' done' : '') + (i === R.i ? ' cur' : '') + '" data-act="v-goto" data-i="' + i + '">' + ui.esc(p.label) + '</button>';
    }).join('') + '</div>';
  }

  function render(finished) {
    if (!R.open) return;
    var st = status();
    var p = PHRASES[R.i];
    var body;
    if (finished) {
      body =
        '<div class="rec-card"><div class="rec-say">' + (st.have === st.total ? 'All recorded' : st.have + ' of ' + st.total + ' recorded') + '</div>' +
        '<p class="note">' + (st.have === st.total ? 'Your voice is ready. Pick “My voice” in Settings and use the test button to hear it.' : 'Anything you skipped uses the female voice. Tap a phrase above to record it.') + '</p></div>';
    } else if (R.state === 'recording') {
      body =
        '<div class="rec-card"><div class="rec-step">Phrase ' + (R.i + 1) + ' of ' + PHRASES.length + '</div>' +
        '<div class="rec-say">“' + ui.esc(p.label) + '”</div>' +
        '<button class="recbtn live" data-act="v-stop" aria-label="Stop recording"><span class="sq"></span></button>' +
        '<p class="note">Recording. Say it now, then tap stop.</p></div>';
    } else if (R.state === 'review') {
      body =
        '<div class="rec-card"><div class="rec-step">Phrase ' + (R.i + 1) + ' of ' + PHRASES.length + '</div>' +
        '<div class="rec-say">“' + ui.esc(p.label) + '”</div>' +
        '<div class="rec-actions">' +
          '<button class="btn ghost" data-act="v-play">Play back</button>' +
          '<button class="btn ghost" data-act="v-rec">Re-record</button></div>' +
        '<button class="btn wide" data-act="v-keep">' + (R.i >= PHRASES.length - 1 ? 'Keep' : 'Keep and next') + '</button></div>';
    } else {
      body =
        '<div class="rec-card"><div class="rec-step">Phrase ' + (R.i + 1) + ' of ' + PHRASES.length + '</div>' +
        '<div class="rec-say">“' + ui.esc(p.label) + '”</div>' +
        '<button class="recbtn" data-act="v-rec" aria-label="Start recording"><span class="dot"></span></button>' +
        '<p class="note">' + ui.esc(p.hint) + ' Tap the red button, say the phrase, then tap stop.</p>' +
        (clips[p.key] ? '<div class="rec-actions"><button class="btn ghost" data-act="v-playsaved">Play saved</button>' +
          '<button class="btn ghost" data-act="v-skip">' + (R.i >= PHRASES.length - 1 ? 'Finish' : 'Next') + '</button></div>'
          : '<div class="rec-actions"><button class="btn ghost wide" data-act="v-skip">' + (R.i >= PHRASES.length - 1 ? 'Skip and finish' : 'Skip this one') + '</button></div>') +
        '</div>';
    }
    ui.sheet(
      '<h2 class="sheet-title">Record your voice</h2>' + chips() + body +
      '<button class="btn ghost wide" data-act="v-done">Done</button>',
      { sticky: true }
    );
    ui.setCloseHook(onClose);
  }

  function open(startAtMissing) {
    if (!canRecord()) {
      ui.toast('This browser can’t record audio.');
      return;
    }
    R.open = true;
    R.state = 'idle';
    R.temp = null;
    var first = 0;
    for (var i = 0; i < PHRASES.length; i++) { if (!clips[PHRASES[i].key]) { first = i; break; } }
    R.i = startAtMissing === false ? 0 : first;
    render();
  }

  // ----- actions -----
  var on = ui.on;
  on('v-open', function () { open(); });
  on('v-rec', function () { startRec(); });
  on('v-stop', function () { stopRec(); });
  on('v-play', function () {
    if (!R.temp) return;
    A.unlock();
    playBuffer(R.temp.buf, R.temp, 0.9);
  });
  on('v-playsaved', function () {
    A.unlock();
    play(PHRASES[R.i].key, 0.9);
  });
  on('v-keep', keep);
  on('v-skip', next);
  on('v-goto', function (el) { goto(parseInt(el.getAttribute('data-i'), 10)); });
  on('v-done', function () {
    ui.closeOverlay();
    if (IT.openSettings) IT.openSettings();
  });
  on('v-clear', function () {
    ui.confirmDialog({ title: 'Delete your recordings?', body: 'Your voice will be removed from this phone.', ok: 'Delete', danger: true })
      .then(function (yes) {
        if (!yes) { if (IT.openSettings) IT.openSettings(); return; }
        clearAll().then(function () { if (IT.openSettings) IT.openSettings(); ui.toast('Recordings deleted'); });
      });
  });

  IT.voice = { PHRASES: PHRASES, load: load, prepare: prepare, play: play, has: has, status: status, open: open, clearAll: clearAll };
  load();
})(self);
