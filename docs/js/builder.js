// Workout builder: name it, add sections in the order they should play, and
// watch the total time update as you go. Exercises and Rounds are repeat
// counts that repeat the sections above them (see model.js).
(function (g) {
  'use strict';
  var IT = (g.IT = g.IT || {});
  var M = IT.model, S = IT.store, ui = IT.ui;
  var B = null;
  var drafts = {}; // unsaved drafts survive a swipe-back or a trip to the menu

  function snapshot(w) { return JSON.stringify({ name: w.name, items: w.items }); }

  function open(id) {
    var key = id || 'new';
    if (drafts[key]) {
      B = drafts[key];
    } else {
      var w = id ? S.get(id) : null;
      if (id && !w) { location.hash = '#/'; return; }
      var draft = w ? M.clone(w) : { id: M.uid(), name: '', items: [], createdAt: Date.now() };
      B = { key: key, isNew: !id, draft: draft, orig: snapshot(draft), sel: null, errIds: [], undo: null, pickAfter: '' };
      drafts[key] = B;
    }
    ui.setThemeColor('#F0343F');
    render();
  }

  function leave() { B = null; }
  function dirty() { return snapshot(B.draft) !== B.orig; }

  function render() {
    ui.app(
      '<div class="screen builder t-idle">' +
        '<header class="hero compact">' +
          '<div class="bar">' +
            '<button class="ib" data-act="b-cancel" aria-label="Close">' + ui.icon('close') + '</button>' +
            '<h1 class="title">' + (B.isNew ? 'New workout' : 'Edit workout') + '</h1>' +
            '<span class="ib" aria-hidden="true"></span>' +
          '</div>' +
          '<input id="b-name" class="name" type="text" placeholder="Name this workout" maxlength="60" autocomplete="off" enterkeyhint="done" aria-label="Workout name" value="' + ui.esc(B.draft.name) + '">' +
          '<div class="hero-body"><div class="kicker">Total time</div><div class="big" id="b-total"></div></div>' +
          '<div id="b-strip"></div>' +
        '</header>' +
        '<div class="sheetwrap flat">' +
          '<div class="sheetbg"></div>' +
          '<div class="rows gut" id="b-rows"></div>' +
        '</div>' +
        '<div class="savebar"><button class="btn" data-act="b-save">Save workout</button></div>' +
      '</div>'
    );
    renderRows();
    renderSummary();
  }

  function renderSummary() {
    var exp = M.expand(B.draft);
    var t = document.getElementById('b-total');
    if (t) t.textContent = M.fmt(exp.total);
    var s = document.getElementById('b-strip');
    if (s) s.innerHTML = ui.strip(exp, false);
  }

  function editPanel(it, idx, len) {
    var T = M.TYPES[it.type];
    var stepper;
    if (T.kind === 'count') {
      stepper =
        '<button class="st" data-act="b-step" data-d="-1" aria-label="One fewer">−1</button>' +
        '<label class="numwrap"><input class="num" id="b-val" type="number" inputmode="numeric" pattern="[0-9]*" min="1" max="' + M.MAX_COUNT + '" value="' + it.value + '" aria-label="' + T.label + ' count"><span class="unit">' + T.unit + '</span></label>' +
        '<button class="st" data-act="b-step" data-d="1" aria-label="One more">+1</button>';
    } else {
      stepper =
        '<button class="st" data-act="b-step" data-d="-10" aria-label="Ten seconds less">−10</button>' +
        '<button class="st" data-act="b-step" data-d="-1" aria-label="One second less">−1</button>' +
        '<label class="numwrap"><input class="num" id="b-val" type="number" inputmode="numeric" pattern="[0-9]*" min="1" max="' + M.MAX_SECONDS + '" value="' + it.value + '" aria-label="' + T.label + ' seconds"><span class="unit">sec</span></label>' +
        '<button class="st" data-act="b-step" data-d="1" aria-label="One second more">+1</button>' +
        '<button class="st" data-act="b-step" data-d="10" aria-label="Ten seconds more">+10</button>';
    }
    return '<div class="panel"><div class="stepper">' + stepper + '</div>' +
      '<div class="tools">' +
        '<button class="tool" data-act="b-up" aria-label="Move up"' + (idx === 0 ? ' disabled' : '') + '>' + ui.icon('up') + '</button>' +
        '<button class="tool" data-act="b-down" aria-label="Move down"' + (idx === len - 1 ? ' disabled' : '') + '>' + ui.icon('down') + '</button>' +
        '<button class="tool" data-act="b-addbelow" aria-label="Add a section below this one">' + ui.icon('plus') + '</button>' +
        '<button class="tool" data-act="b-dup" aria-label="Duplicate">' + ui.icon('copy') + '</button>' +
        '<button class="tool danger" data-act="b-del" aria-label="Delete">' + ui.icon('trash') + '</button>' +
      '</div></div>';
  }

  function valueLabel(it) {
    return M.TYPES[it.type].kind === 'count' ? it.value + 'X' : M.fmt(it.value);
  }

  // Under a repeat count: what it repeats.
  function caption(it, info) {
    var n = info[it.id] ? info[it.id].covered : 0;
    if (!n) return '<small class="cap warn">Nothing above it to repeat</small>';
    var sec = n + (n === 1 ? ' section' : ' sections');
    var what = it.type === 'rounds' ? 'Repeats all ' + sec + ' above' : 'Repeats ' + sec + ' above';
    return '<small class="cap">' + what + '</small>';
  }

  function itemHTML(it, idx, len, a) {
    var T = M.TYPES[it.type];
    var sel = B.sel === it.id;
    var cv = a.cover[it.id] || {};
    var err = B.errIds.indexOf(it.id) >= 0;
    var head = '<div class="row" data-act="b-select" data-id="' + it.id + '" role="button" tabindex="0" aria-expanded="' + sel + '">' +
      ui.tIcon(it.type) + '<span class="lbl">' + T.label + (T.kind === 'count' ? caption(it, a.info) : '') + '</span><span class="val">' + valueLabel(it) + '</span></div>';
    return '<div class="leaf t-' + it.type + (cv.ex ? ' cov-ex' : '') + (cv.rd ? ' cov-rd' : '') + (sel ? ' sel' : '') + (err ? ' err' : '') + '" data-lid="' + it.id + '">' +
      head + (sel ? editPanel(it, idx, len) : '') + '</div>';
  }

  function renderRows() {
    var el = document.getElementById('b-rows');
    if (!el) return;
    var items = B.draft.items;
    var html;
    if (!items.length) {
      html = '<div class="empty"><h2>Build your workout</h2>' +
        '<p>Add sections in the order they should play. Exercises repeats the sections above it (how many exercises in each set). Rounds repeats everything above it (how many sets in total).</p>' +
        '<button class="btn ghost" data-act="b-starter">Use a starter layout</button></div>';
    } else {
      var a = M.analyze(items);
      html = items.map(function (it, i) { return itemHTML(it, i, items.length, a); }).join('');
    }
    html += '<button class="add" data-act="b-add" data-after="">' + ui.icon('plus') + 'Add section</button>';
    var top = el.scrollTop;
    el.innerHTML = html;
    el.scrollTop = top;
  }

  function scrollToItem(id) {
    var el = document.querySelector('#b-rows [data-lid="' + id + '"]');
    var rows = document.getElementById('b-rows');
    if (!el || !rows) return;
    var er = el.getBoundingClientRect(), rr = rows.getBoundingClientRect();
    if (er.bottom > rr.bottom - 10 || er.top < rr.top + 10) {
      var top = rows.scrollTop + (er.top - rr.top) - 24;
      if (rows.scrollTo) rows.scrollTo({ top: top, behavior: 'smooth' });
      else rows.scrollTop = top;
    }
  }

  function selected() { return B.sel ? M.find(B.draft.items, B.sel) : null; }

  // ----- actions -----
  function select(id) {
    B.sel = B.sel === id ? null : id;
    renderRows();
    if (B.sel) scrollToItem(B.sel);
  }

  function updateSelectedDisplay(it) {
    var head = document.querySelector('#b-rows [data-act="b-select"][data-id="' + it.id + '"] .val');
    if (head) head.textContent = valueLabel(it);
    renderSummary();
  }

  function step(d) {
    var f = selected();
    if (!f) return;
    f.item.value = M.clampValue(f.item.type, f.item.value + d);
    var input = document.getElementById('b-val');
    if (input) input.value = f.item.value;
    updateSelectedDisplay(f.item);
  }

  function typed(input) {
    var f = selected();
    if (!f) return;
    var v = parseInt(input.value, 10);
    if (!isFinite(v) || v < 1) return; // wait until it is a valid number
    f.item.value = M.clampValue(f.item.type, v);
    updateSelectedDisplay(f.item);
  }
  function typedDone(input) {
    var f = selected();
    if (!f) return;
    input.value = f.item.value;
  }

  function setName(v) {
    B.draft.name = v;
    var n = document.getElementById('b-name');
    if (n) n.classList.remove('err');
  }

  // afterId: insert below that section; empty means the end of the list.
  function openPicker(afterId) {
    var after = afterId ? M.find(B.draft.items, afterId) : null;
    B.pickAfter = after ? afterId : '';
    var tiles = M.ORDER.map(function (k) {
      var T = M.TYPES[k];
      return '<button class="tile t-' + k + '" data-act="b-pick" data-type="' + k + '">' +
        ui.tIcon(k) + '<b>' + T.label + '</b><small>' + T.blurb + '</small></button>';
    }).join('');
    ui.sheet('<h2 class="sheet-title">' + (after ? 'Add below ' + M.TYPES[after.item.type].label : 'Add a section') + '</h2><div class="tiles">' + tiles + '</div>');
  }
  function addBelow() {
    if (B.sel) openPicker(B.sel);
  }

  function pick(type) {
    var it = M.newItem(type);
    var after = B.pickAfter ? M.find(B.draft.items, B.pickAfter) : null;
    if (after) after.list.splice(after.index + 1, 0, it);
    else B.draft.items.push(it);
    B.sel = it.id;
    B.errIds = [];
    ui.closeOverlay();
    renderRows();
    renderSummary();
    scrollToItem(it.id);
  }

  function move(dir) {
    var f = selected();
    if (!f) return;
    var j = f.index + dir;
    if (j < 0 || j >= f.list.length) return;
    var tmp = f.list[f.index]; f.list[f.index] = f.list[j]; f.list[j] = tmp;
    renderRows(); renderSummary(); scrollToItem(B.sel);
  }

  function duplicate() {
    var f = selected();
    if (!f) return;
    var copy = M.clone(f.item);
    copy.id = M.uid();
    f.list.splice(f.index + 1, 0, copy);
    B.sel = copy.id;
    renderRows(); renderSummary(); scrollToItem(copy.id);
  }

  function remove() {
    var f = selected();
    if (!f) return;
    var removed = f.list.splice(f.index, 1)[0];
    B.undo = { item: removed, index: f.index };
    B.sel = null;
    renderRows(); renderSummary();
    ui.toast('Deleted ' + M.TYPES[removed.type].label, { label: 'Undo', fn: undoRemove });
  }

  function undoRemove() {
    if (!B || !B.undo) return;
    var u = B.undo;
    var list = B.draft.items;
    list.splice(Math.min(u.index, list.length), 0, u.item);
    B.undo = null;
    B.sel = u.item.id;
    renderRows(); renderSummary(); scrollToItem(u.item.id);
    ui.hideToast();
  }

  function starter() {
    B.draft.items = M.starterItems();
    B.sel = null;
    renderRows(); renderSummary();
  }

  function save() {
    var errs = M.validate(B.draft);
    if (errs.length) {
      B.errIds = errs.map(function (e) { return e.id; }).filter(Boolean);
      renderRows();
      var first = errs[0];
      if (first.field === 'name') {
        var n = document.getElementById('b-name');
        if (n) { n.classList.add('err'); n.focus(); }
      } else if (first.id) {
        scrollToItem(first.id);
      }
      ui.toast(first.msg);
      return;
    }
    var w = M.clone(B.draft);
    w.name = String(w.name).trim();
    w.updatedAt = Date.now();
    if (!w.createdAt) w.createdAt = w.updatedAt;
    S.save(w);
    delete drafts[B.key];
    B = null;
    ui.toast('Saved');
    location.hash = '#/play/' + w.id;
  }

  function cancel() {
    var go = function () {
      var dest = B.isNew ? '#/' : '#/play/' + B.draft.id;
      delete drafts[B.key];
      B = null;
      location.hash = dest;
    };
    if (dirty()) {
      ui.confirmDialog({ title: 'Discard changes?', body: 'Your edits to this workout will be lost.', ok: 'Discard', danger: true })
        .then(function (yes) { if (yes) go(); });
    } else {
      go();
    }
  }

  IT.builder = {
    open: open, leave: leave, select: select, step: step, typed: typed, typedDone: typedDone,
    setName: setName, openPicker: openPicker, addBelow: addBelow, pick: pick, move: move, duplicate: duplicate,
    remove: remove, undoRemove: undoRemove, starter: starter, save: save, cancel: cancel
  };
})(self);
