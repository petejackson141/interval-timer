// App shell: routing, menus, settings, backup, and wiring every click to its action.
(function (g) {
  'use strict';
  var IT = (g.IT = g.IT || {});
  var M = IT.model, S = IT.store, ui = IT.ui, A = IT.audio;
  var doc = g.document;

  // ----- routing (#/ , #/new, #/edit/<id>, #/play/<id>) -----
  function route() {
    var parts = (g.location.hash || '#/').replace(/^#\/?/, '').split('/');
    var page = parts[0], id = parts[1];
    IT.library.leave(); IT.player.leave(); IT.builder.leave();
    ui.closeOverlay();
    if (page === 'play' && id) IT.player.open(id);
    else if (page === 'edit' && id) IT.builder.open(id);
    else if (page === 'new') IT.builder.open(null);
    else IT.library.open();
  }
  function go(hash) {
    if ((g.location.hash || '#/') === hash) route();
    else g.location.hash = hash;
  }

  // ----- menus -----
  function navBtn(act, ic, label, extra) {
    return '<button data-act="' + act + '"' + (extra || '') + '>' + ui.icon(ic) + label + '</button>';
  }
  function openDrawer() {
    var pid = IT.player.currentId();
    ui.drawer(
      '<div class="drawer-head"><strong>Interval Timer</strong><span>Version ' + IT.VERSION + '</span></div>' +
      '<nav class="menu">' +
        navBtn('nav-home', 'list', 'My workouts') +
        navBtn('nav-new', 'plus', 'New workout') +
        (pid ? navBtn('nav-edit', 'edit', 'Edit this workout', ' data-id="' + pid + '"') : '') +
        navBtn('settings', 'sliders', 'Settings') +
      '</nav>'
    );
  }

  function setSwitch(key, title, desc) {
    var s = S.settings();
    return '<label class=\"setrow\"><span><b>' + title + '</b><small>' + desc + '</small></span>' +
      '<span class=\"switch\"><input type=\"checkbox\" data-set=\"' + key + '\"' + (s[key] ? ' checked' : '') + '><i></i></span></label>';
  }
  function setSeg(key, options) {
    var cur = S.settings()[key];
    return '<div class=\"seg\" role=\"group\">' + options.map(function (o) {
      var on = o[0] === cur;
      return '<button type=\"button\" class=\"' + (on ? 'on' : '') + '\" aria-pressed=\"' + on + '\" data-act=\"set-choice\" data-key=\"' + key + '\" data-val=\"' + o[0] + '\">' + o[1] + '</button>';
    }).join('') + '</div>';
  }

  // One volume slider per sound setting; it dims while that sound is switched off.
  function setSlider(key, forKey, label) {
    var st = S.settings();
    var pct = Math.round(st[key] * 100);
    var off = st[forKey] === 'off' || st[forKey] === false;
    return '<div class="slider' + (off ? ' off' : '') + '" data-for="' + forKey + '"><span class="k">' + label + '</span>' +
      '<input type="range" min="5" max="100" step="5" value="' + pct + '" data-range="' + key + '" style="--p:' + pct + '%" aria-label="' + label + '">' +
      '<output>' + pct + '%</output></div>';
  }

  function myVoicePanel() {
    var st = IT.voice.status();
    return '<p class="setdesc">Record yourself saying the countdown and call-outs. You’ll be prompted for each phrase, one at a time.</p>' +
      '<div class="setbtns"><button class="btn" data-act="v-open">' + (st.have ? 'Record or re-record' : 'Record my voice') + '</button>' +
      (st.have ? '<button class="btn ghost" data-act="v-clear">Delete recordings</button>' : '') + '</div>';
  }

  function openSettings() {
    ui.sheet(
      '<h2 class="sheet-title">Settings</h2>' +

      '<section class="setsec"><h3>Voice</h3>' +
        '<p class="setdesc">Used wherever a setting below is set to Voice, and for section names.</p>' +
        setSeg('voiceType', [['female', 'Female'], ['male', 'Male'], ['mine', 'My voice']]) +
        '<p class="setdesc" id="voice-info">' + ui.esc(A.voiceInfo()) + '</p>' +
        '<div id="myvoice"' + (S.settings().voiceType === 'mine' ? '' : ' hidden') + '>' + myVoicePanel() + '</div>' +
        '<button class="btn ghost wide" data-act="test-voice">Test voice</button>' +
      '</section>' +

      '<section class="setsec"><h3>Countdown</h3>' +
        '<p class="setdesc">Plays in the last 3 seconds of every section: three beeps, or a spoken 3, 2, 1.</p>' +
        setSeg('countdown', [['beeps', '3 beeps'], ['voice', 'Voice'], ['off', 'Muted']]) +
        setSlider('volume', 'countdown', 'Volume') +
        '<button class="btn ghost wide" data-act="test-countdown">Test countdown</button>' +
      '</section>' +

      '<section class="setsec"><h3>Halfway call</h3>' +
        '<p class="setdesc">Halfway through each Work interval (10 seconds or longer). Voice says “Half way there”.</p>' +
        setSeg('half', [['voice', 'Voice'], ['beep', 'Beep'], ['off', 'Muted']]) +
        setSlider('halfVolume', 'half', 'Volume') +
        '<button class="btn ghost wide" data-act="test-halfway">Test halfway call</button>' +
      '</section>' +

      '<section class="setsec"><h3>Section sounds</h3>' +
        setSwitch('beep', 'Sound cues', 'A short tone when a section starts') +
        setSlider('cueVolume', 'beep', 'Volume') +
        setSwitch('names', 'Say section names', 'Announces Work, Rest and so on') +
        setSlider('namesVolume', 'names', 'Volume') +
      '</section>' +

      '<section class="setsec"><h3>Music</h3>' +
        setSwitch('mix', 'Keep music playing', 'Your music keeps playing under the beeps and voice. The phone’s silent switch then mutes these sounds too.') +
      '</section>' +

      '<section class="setsec"><h3>Screen</h3>' +
        setSwitch('wake', 'Keep screen on', 'Stops the phone locking mid-workout') +
      '</section>' +

      '<section class="setsec"><h3>Library backup</h3>' +
        '<div class="setbtns"><button class="btn ghost" data-act="export">Export library</button>' +
        '<button class="btn ghost" data-act="import">Import library</button></div>' +
      '</section>' +

      '<p class="version">Version ' + IT.VERSION + '</p>'
    );
  }

  function openExport() {
    ui.sheet(
      '<h2 class="sheet-title">Export library</h2>' +
      '<p class="note">Copy this text and keep it somewhere safe, like a note or an email to yourself. Paste it into Import to restore your workouts.</p>' +
      '<textarea id="bk-text" readonly rows="8">' + ui.esc(S.exportJSON()) + '</textarea>' +
      '<button class="btn wide" data-act="copy-export">Copy to clipboard</button>'
    );
  }
  function openImport() {
    ui.sheet(
      '<h2 class="sheet-title">Import library</h2>' +
      '<p class="note">Paste text you exported earlier. Workouts with the same ID are replaced; everything else is kept.</p>' +
      '<textarea id="bk-text" rows="8" placeholder="Paste exported text here"></textarea>' +
      '<button class="btn wide" data-act="do-import">Import</button>'
    );
  }

  // ----- actions -----
  var on = ui.on;
  on('menu', openDrawer);
  on('settings', openSettings);
  on('close-overlay', function () { ui.closeOverlay(); });
  on('dlg-yes', function () { ui.settleDialog(true); ui.closeOverlay(); });
  on('dlg-no', function () { ui.settleDialog(false); ui.closeOverlay(); });
  on('toast-action', function () {
    var t = doc.getElementById('toast');
    var a = t._action;
    t.hidden = true;
    if (a && a.fn) a.fn();
  });

  on('nav-home', function () { ui.closeOverlay(); go('#/'); });
  on('nav-new', function () { ui.closeOverlay(); go('#/new'); });
  on('nav-edit', function (el) { ui.closeOverlay(); go('#/edit/' + el.getAttribute('data-id')); });
  on('new', function () { go('#/new'); });
  on('play', function (el) { go('#/play/' + el.getAttribute('data-id')); });

  on('card-menu', function (el) { IT.library.cardMenu(el.getAttribute('data-id')); });
  on('m-play', function (el) { ui.closeOverlay(); go('#/play/' + el.getAttribute('data-id')); });
  on('m-edit', function (el) { ui.closeOverlay(); go('#/edit/' + el.getAttribute('data-id')); });
  on('m-dup', function (el) {
    S.duplicate(el.getAttribute('data-id'));
    ui.closeOverlay();
    route();
    ui.toast('Duplicated');
  });
  on('m-del', function (el) {
    var id = el.getAttribute('data-id');
    var w = S.get(id);
    if (!w) return;
    ui.confirmDialog({ title: 'Delete “' + w.name + '”?', body: 'This can’t be undone.', ok: 'Delete', danger: true })
      .then(function (yes) {
        if (!yes) return;
        S.remove(id);
        route();
        ui.toast('Deleted');
      });
  });

  on('p-play', function () { IT.player.toggle(); });
  on('p-reset', function () { IT.player.reset(); });
  on('p-next', function () { IT.player.next(); });
  on('p-prev', function () { IT.player.prev(); });
  on('p-pill', function () { IT.player.togglePill(); });

  var b = IT.builder;
  on('b-cancel', function () { b.cancel(); });
  on('b-save', function () { b.save(); });
  on('b-select', function (el) { b.select(el.getAttribute('data-id')); });
  on('b-step', function (el) { b.step(parseInt(el.getAttribute('data-d'), 10)); });
  on('b-add', function (el) { b.openPicker(el.getAttribute('data-after')); });
  on('b-addbelow', function () { b.addBelow(); });
  on('b-pick', function (el) { b.pick(el.getAttribute('data-type')); });
  on('b-up', function () { b.move(-1); });
  on('b-down', function () { b.move(1); });
  on('b-dup', function () { b.duplicate(); });
  on('b-del', function () { b.remove(); });
  on('b-starter', function () { b.starter(); });

  function dimSlider(key, off) {
    var sl = doc.querySelector('.slider[data-for="' + key + '"]');
    if (sl) sl.classList.toggle('off', off);
  }
  on('set-choice', function (el) {
    S.setSetting(el.getAttribute('data-key'), el.getAttribute('data-val'));
    dimSlider(el.getAttribute('data-key'), el.getAttribute('data-val') === 'off');
    if (el.getAttribute('data-key') === 'voiceType') {
      var mv = doc.getElementById('myvoice');
      if (mv) mv.hidden = el.getAttribute('data-val') !== 'mine';
      var vi = doc.getElementById('voice-info');
      if (vi) vi.textContent = A.voiceInfo();
    }
    var sibs = el.parentNode.querySelectorAll('button');
    for (var i = 0; i < sibs.length; i++) {
      var on = sibs[i] === el;
      sibs[i].classList.toggle('on', on);
      sibs[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  });
  function stopTestSound() {
    setTimeout(function () { if (!IT.player.isRunning()) A.suspend(); }, 3500);
  }
  on('test-countdown', function () { A.testCountdown(); stopTestSound(); });
  on('test-voice', function () { A.testVoice(); stopTestSound(); });
  on('test-halfway', function () { A.testHalfway(); stopTestSound(); });
  on('export', openExport);
  on('import', openImport);
  on('copy-export', function () {
    var ta = doc.getElementById('bk-text');
    var text = ta.value;
    function fallback() {
      ta.focus(); ta.select();
      try { doc.execCommand('copy'); ui.toast('Copied'); } catch (e) { ui.toast('Select the text and copy it'); }
    }
    if (g.navigator.clipboard && g.navigator.clipboard.writeText) {
      g.navigator.clipboard.writeText(text).then(function () { ui.toast('Copied'); }, fallback);
    } else fallback();
  });
  on('do-import', function () {
    var ta = doc.getElementById('bk-text');
    try {
      var n = S.importJSON(ta.value);
      ui.closeOverlay();
      route();
      ui.toast('Imported ' + n + (n === 1 ? ' workout' : ' workouts'));
    } catch (e) {
      ui.toast('That text isn’t a valid export');
    }
  });

  // ----- global listeners -----
  doc.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (el) ui.dispatch(el, e);
  });
  doc.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && ui.isOverlayOpen() && !ui.isOverlaySticky()) { ui.closeOverlay(); return; }
    var t = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && t.getAttribute && t.getAttribute('role') === 'button') {
      e.preventDefault();
      t.click();
      return;
    }
    if (e.key === 'Enter' && t.tagName === 'INPUT') t.blur();
  });
  doc.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'b-name') b.setName(t.value);
    else if (t.id === 'b-val') b.typed(t);
    else if (t.getAttribute && t.getAttribute('data-range')) {
      var pct = parseInt(t.value, 10);
      S.setSetting(t.getAttribute('data-range'), pct / 100);
      t.style.setProperty('--p', pct + '%');
      var out = t.parentNode.querySelector('output');
      if (out) out.textContent = pct + '%';
    }
  });
  doc.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'b-val') b.typedDone(t);
    else if (t.getAttribute && t.getAttribute('data-range')) { A.preview(t.getAttribute('data-range')); if (!IT.player.isRunning()) setTimeout(A.suspend, 3000); }
    else if (t.getAttribute && t.getAttribute('data-set')) { S.setSetting(t.getAttribute('data-set'), t.checked); dimSlider(t.getAttribute('data-set'), !t.checked); if (t.getAttribute('data-set') === 'mix') A.applySession(); }
  });
  doc.addEventListener('focusin', function (e) {
    if (e.target.classList && e.target.classList.contains('num')) {
      var t = e.target;
      setTimeout(function () { try { t.select(); } catch (err) { /* ignore */ } }, 0);
    }
  });

  IT.openSettings = openSettings;
  g.addEventListener('hashchange', route);

  S.migrateOnce();
  S.seedOnce();
  route();

  if ('serviceWorker' in g.navigator) {
    g.addEventListener('load', function () {
      g.navigator.serviceWorker.register('sw.js').then(function (reg) { return reg.update(); }).catch(function () {});
    });
  }
})(self);
