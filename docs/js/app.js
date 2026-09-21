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

  function openSettings() {
    var s = S.settings();
    function sw(key, title, desc) {
      return '<label class="setrow"><span><b>' + title + '</b><small>' + desc + '</small></span>' +
        '<span class="switch"><input type="checkbox" data-set="' + key + '"' + (s[key] ? ' checked' : '') + '><i></i></span></label>';
    }
    ui.sheet(
      '<h2 class="sheet-title">Settings</h2>' +
      sw('voice', 'Voice countdown', 'Says 3, 2, 1 at the end of each section') +
      sw('names', 'Say section names', 'Announces Work, Rest and so on') +
      sw('beep', 'Sound cues', 'A short tone when a section starts') +
      sw('wake', 'Keep screen on', 'Stops the phone locking mid-workout') +
      '<button class="btn ghost wide" data-act="test-sound">Test sound and voice</button>' +
      '<div class="setbtns"><button class="btn ghost" data-act="export">Export library</button>' +
      '<button class="btn ghost" data-act="import">Import library</button></div>' +
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
  on('b-add', function (el) { b.openPicker(el.getAttribute('data-parent')); });
  on('b-pick', function (el) { b.pick(el.getAttribute('data-type')); });
  on('b-up', function () { b.move(-1); });
  on('b-down', function () { b.move(1); });
  on('b-dup', function () { b.duplicate(); });
  on('b-del', function () { b.remove(); });
  on('b-starter', function () { b.starter(); });

  on('test-sound', function () {
    A.unlock();
    A.cue('work');
    setTimeout(function () { A.say('3, 2, 1', { volume: 0.8 }); }, 500);
    setTimeout(function () { if (!IT.player.isRunning()) A.suspend(); }, 4500);
  });
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
    if (e.key === 'Escape' && ui.isOverlayOpen()) { ui.closeOverlay(); return; }
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
  });
  doc.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'b-val') b.typedDone(t);
    else if (t.getAttribute && t.getAttribute('data-set')) S.setSetting(t.getAttribute('data-set'), t.checked);
  });
  doc.addEventListener('focusin', function (e) {
    if (e.target.classList && e.target.classList.contains('num')) {
      var t = e.target;
      setTimeout(function () { try { t.select(); } catch (err) { /* ignore */ } }, 0);
    }
  });

  g.addEventListener('hashchange', route);

  S.seedOnce();
  route();

  if ('serviceWorker' in g.navigator) {
    g.addEventListener('load', function () {
      g.navigator.serviceWorker.register('sw.js').then(function (reg) { return reg.update(); }).catch(function () {});
    });
  }
})(self);
