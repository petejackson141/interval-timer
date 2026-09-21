// The workout screen: idle preview, running timer, pause, skip and finish.
// Time is always derived from wall-clock timestamps (Date.now), never by
// counting ticks, so the display stays right if the phone stalls briefly.
(function (g) {
  'use strict';
  var IT = (g.IT = g.IT || {});
  var M = IT.model, S = IT.store, ui = IT.ui, A = IT.audio;
  var P = null;

  var THEME = {
    idle: '#F0343F', getready: '#7C4AE8', work: '#0E9A66', rest: '#EE2A4F',
    exercises: '#0B86A6', rounds: '#3F5AE6', reset: '#D8730A'
  };

  function roTree(items) {
    var info = M.analyze(items);
    return items.map(function (it) {
      var T = M.TYPES[it.type];
      var cv = info.cover[it.id] || {};
      var val = T.kind === 'count' ? it.value + 'X' : M.fmt(it.value);
      return '<div class="leaf t-' + it.type + (cv.ex ? ' cov-ex' : '') + (cv.rd ? ' cov-rd' : '') + '"' +
        (T.kind === 'time' ? ' data-id="' + it.id + '"' : '') + '>' +
        '<div class="row">' + ui.tIcon(it.type) + '<span class="lbl">' + T.label + '</span><span class="val">' + val + '</span></div></div>';
    }).join('');
  }

  function open(id) {
    var w = S.get(id);
    if (!w) { location.hash = '#/'; return; }
    P = {
      w: w, exp: M.expand(w), idx: 0, acc: 0, runStart: 0, status: 'idle',
      timer: null, lastR: null, halfIdx: -1, showElapsed: false, wake: null, subKey: null, els: {}
    };
    render();
  }

  function render() {
    var w = P.w;
    ui.app(
      '<div class="screen player t-idle is-idle" id="p-screen">' +
        '<header class="hero">' +
          '<div class="bar">' +
            '<button class="ib" data-act="menu" aria-label="Menu">' + ui.icon('menu') + '</button>' +
            '<h1 class="title">' + ui.esc(w.name) + '</h1>' +
            '<button class="ib" id="p-reset" data-act="p-reset" aria-label="Reset workout" hidden>' + ui.icon('reset') + '</button>' +
          '</div>' +
          '<div class="hero-body">' +
            '<button class="pill" id="p-pill" data-act="p-pill" hidden></button>' +
            '<div class="kicker" id="p-label"></div>' +
            '<div class="big" id="p-big" aria-live="off"></div>' +
            '<div class="sub" id="p-sub"></div>' +
          '</div>' +
          ui.strip(P.exp, true) +
        '</header>' +
        '<div class="sheetwrap">' +
          '<div class="sheetbg"></div>' +
          '<div class="sheettop">' +
            '<button class="skip prev" id="p-prev" data-act="p-prev" aria-label="Previous section" hidden>' + ui.icon('prev') + '</button>' +
            '<button class="playbtn" id="p-play" data-act="p-play"></button>' +
            '<button class="skip next" id="p-next" data-act="p-next" aria-label="Next section" hidden>' + ui.icon('next') + '</button>' +
          '</div>' +
          '<div class="rows gut" id="p-rows">' + roTree(w.items) + '</div>' +
        '</div>' +
      '</div>'
    );
    var $ = function (id) { return document.getElementById(id); };
    P.els = {
      screen: $('p-screen'), label: $('p-label'), big: $('p-big'), sub: $('p-sub'), pill: $('p-pill'),
      head: $('p-head'), play: $('p-play'), prev: $('p-prev'), next: $('p-next'), reset: $('p-reset'), rows: $('p-rows')
    };
    renderState();
  }

  function setText(el, s) { if (el.textContent !== s) el.textContent = s; }

  function nowSec() {
    return P.status === 'running' ? (P.acc + Date.now() - P.runStart) / 1000 : P.acc / 1000;
  }

  function setHead(f) {
    P.els.head.style.left = 'calc(5px + (100% - 10px) * ' + Math.max(0, Math.min(1, f)).toFixed(4) + ')';
  }

  function paint() {
    var e = P.els, st = P.status, total = P.exp.total, segs = P.exp.segments;
    if (st === 'idle') {
      setText(e.label, 'Total time'); setText(e.big, M.fmt(total));
      subHTML('idle', 'Tap play to start'); e.pill.hidden = true; setHead(0);
      return;
    }
    if (st === 'done') {
      setText(e.label, 'Workout complete'); setText(e.big, M.fmt(total));
      subHTML('done', ''); e.pill.hidden = true; setHead(1);
      return;
    }
    var t = nowSec();
    var seg = segs[P.idx];
    var r = Math.max(1, Math.ceil(seg.end - t - 0.001));
    setText(e.label, M.TYPES[seg.type].label);
    setText(e.big, M.fmt(r));
    var sub;
    if (st === 'paused') {
      sub = 'Paused';
      subHTML('paused', 'Paused');
    } else {
      var parts = [];
      if (seg.ctx.round) parts.push('Round ' + seg.ctx.round.i + ' of ' + seg.ctx.round.n);
      if (seg.ctx.exercise) parts.push('Exercise ' + seg.ctx.exercise.i + ' of ' + seg.ctx.exercise.n);
      sub = parts.map(function (p) { return '<span>' + p + '</span>'; }).join('');
      subHTML(parts.join('|'), sub);
    }
    e.pill.hidden = false;
    var shown = P.showElapsed ? Math.floor(t + 0.001) : Math.max(0, Math.ceil(total - t - 0.001));
    setText(e.pill, (P.showElapsed ? 'Total elapsed ' : 'Total left ') + M.fmt(shown));
    setHead(total ? t / total : 0);
  }

  function subHTML(key, html) {
    if (P.subKey === key) return;
    P.subKey = key;
    P.els.sub.innerHTML = html;
  }

  function highlight() {
    var e = P.els;
    var prev = e.rows.querySelector('.now');
    if (prev) prev.classList.remove('now');
    if (P.status !== 'running' && P.status !== 'paused') return;
    var seg = P.exp.segments[P.idx];
    var el = e.rows.querySelector('[data-id="' + seg.id + '"]');
    if (!el) return;
    el.classList.add('now');
    var er = el.getBoundingClientRect(), rr = e.rows.getBoundingClientRect();
    var top = e.rows.scrollTop + (er.top - rr.top) - rr.height / 2 + er.height / 2;
    if (e.rows.scrollTo) e.rows.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    else e.rows.scrollTop = Math.max(0, top);
  }

  function renderState() {
    var e = P.els, st = P.status;
    var active = st === 'running' || st === 'paused';
    var seg = P.exp.segments[P.idx];
    var cls = 'screen player is-' + st + ' ' + (active ? 't-' + seg.type : 't-idle');
    if (e.screen.className !== cls) e.screen.className = cls;
    ui.setThemeColor(active ? THEME[seg.type] : THEME.idle);
    e.play.innerHTML = ui.icon(st === 'running' ? 'pause' : st === 'done' ? 'replay' : 'play');
    e.play.setAttribute('aria-label', st === 'running' ? 'Pause' : st === 'done' ? 'Start again' : st === 'paused' ? 'Resume' : 'Start workout');
    e.prev.hidden = e.next.hidden = !active;
    e.reset.hidden = st === 'idle';
    P.subKey = null;
    highlight();
    paint();
  }

  // ----- keeping the screen awake -----
  function acquireWake() {
    if (!S.settings().wake || !P) return;
    try {
      if ('wakeLock' in g.navigator && !P.wake) {
        g.navigator.wakeLock.request('screen').then(function (lock) {
          if (!P) { lock.release(); return; }
          P.wake = lock;
          lock.addEventListener('release', function () { if (P && P.wake === lock) P.wake = null; });
        }).catch(function () {});
      }
    } catch (e) { /* ignore */ }
  }
  function releaseWake() {
    try { if (P && P.wake) P.wake.release(); } catch (e) { /* ignore */ }
    if (P) P.wake = null;
  }

  // ----- run control -----
  function startTimer() {
    stopTimer();
    P.timer = setInterval(tick, 100);
  }
  function stopTimer() {
    if (P && P.timer) { clearInterval(P.timer); P.timer = null; }
  }

  function segmentStart() {
    var seg = P.exp.segments[P.idx];
    A.cue(seg.type);
    A.announce(seg.type, M.TYPES[seg.type].label);
  }

  function tick() {
    if (!P || P.status !== 'running') return;
    var t = nowSec(), segs = P.exp.segments;
    if (t >= P.exp.total) { finish(); return; }
    var i = P.idx;
    while (i < segs.length - 1 && t >= segs[i].end) i++;
    if (i !== P.idx) {
      P.idx = i; P.lastR = null;
      segmentStart();
      renderState();
      return;
    }
    var seg = segs[P.idx];
    var r = Math.max(1, Math.ceil(seg.end - t - 0.001));
    if (r !== P.lastR) {
      P.lastR = r;
      if (r <= 3 && seg.seconds > 3) A.countdown(r);
    }
    // Halfway through a Work interval (10s or longer). Skipped if the phone was
    // stalled and we only notice after the moment has passed.
    if (seg.type === 'work' && seg.seconds >= 10 && P.halfIdx !== P.idx) {
      var into = t - seg.start;
      if (into >= seg.seconds / 2) {
        P.halfIdx = P.idx;
        if (into < seg.seconds - 4) A.halfway();
      }
    }
    paint();
  }

  function start() {
    if (!P.exp.segments.length) return;
    A.unlock();
    P.idx = 0; P.acc = 0; P.lastR = null; P.halfIdx = -1;
    P.status = 'running'; P.runStart = Date.now();
    acquireWake();
    segmentStart();
    renderState();
    startTimer();
  }
  function pause() {
    P.acc += Date.now() - P.runStart;
    P.status = 'paused';
    stopTimer(); releaseWake();
    A.suspend();
    renderState();
  }
  function resume() {
    A.unlock();
    P.status = 'running'; P.runStart = Date.now();
    acquireWake();
    renderState();
    startTimer();
  }
  function finish() {
    stopTimer();
    P.status = 'done';
    P.acc = P.exp.total * 1000;
    P.idx = P.exp.segments.length - 1;
    A.cue('finish');
    A.announce('finish', 'Workout complete');
    releaseWake();
    renderState();
    setTimeout(function () { if (P && P.status === 'done') A.suspend(); }, 2500);
  }

  function toggle() {
    if (!P) return;
    if (P.status === 'idle' || P.status === 'done') start();
    else if (P.status === 'running') pause();
    else resume();
  }
  function reset() {
    if (!P) return;
    stopTimer(); releaseWake(); A.suspend();
    P.status = 'idle'; P.acc = 0; P.idx = 0; P.lastR = null; P.halfIdx = -1;
    renderState();
  }

  function seek(i) {
    var segs = P.exp.segments;
    P.idx = i; P.acc = segs[i].start * 1000; P.lastR = null; P.halfIdx = -1;
    if (P.status === 'running') { P.runStart = Date.now(); segmentStart(); }
    renderState();
  }
  function next() {
    if (!P || (P.status !== 'running' && P.status !== 'paused')) return;
    if (P.idx >= P.exp.segments.length - 1) { finish(); return; }
    seek(P.idx + 1);
  }
  function prev() {
    if (!P || (P.status !== 'running' && P.status !== 'paused')) return;
    var seg = P.exp.segments[P.idx];
    seek(P.idx === 0 || nowSec() - seg.start > 2 ? P.idx : P.idx - 1);
  }
  function togglePill() {
    if (!P) return;
    P.showElapsed = !P.showElapsed;
    paint();
  }

  function leave() {
    if (!P) return;
    stopTimer(); releaseWake(); A.suspend();
    P = null;
  }
  function currentId() { return P ? P.w.id : null; }
  function isRunning() { return !!(P && P.status === 'running'); }

  g.document.addEventListener('visibilitychange', function () {
    if (!g.document.hidden && P && P.status === 'running') { acquireWake(); tick(); }
  });

  IT.player = { open: open, leave: leave, toggle: toggle, reset: reset, next: next, prev: prev, togglePill: togglePill, currentId: currentId, isRunning: isRunning };
})(self);
