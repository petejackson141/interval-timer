// Shared UI helpers: icons, the timeline strip, overlays (sheets, drawer,
// dialogs), toasts and the click-action registry.
(function (g) {
  'use strict';
  var IT = (g.IT = g.IT || {});
  var M = IT.model;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var FILL = 'fill="currentColor" stroke="none"';
  var PATHS = {
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    up: '<path d="M6 14l6-6 6 6"/>',
    down: '<path d="M6 10l6 6 6-6"/>',
    trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10 11v5M14 11v5"/>',
    copy: '<rect x="8" y="8" width="11" height="11" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/>',
    more: '<circle cx="5" cy="12" r="1.8" ' + FILL + '/><circle cx="12" cy="12" r="1.8" ' + FILL + '/><circle cx="19" cy="12" r="1.8" ' + FILL + '/>',
    edit: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14 7l3 3"/>',
    reset: '<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v5h5"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" ' + FILL + '/><circle cx="4.5" cy="12" r="1.2" ' + FILL + '/><circle cx="4.5" cy="18" r="1.2" ' + FILL + '/>',
    play: '<path d="M8 5.2v13.6a.6.6 0 0 0 .9.5l11-6.8a.6.6 0 0 0 0-1L8.9 4.7a.6.6 0 0 0-.9.5z" ' + FILL + '/>',
    pause: '<rect x="6" y="5" width="4.2" height="14" rx="1.4" ' + FILL + '/><rect x="13.8" y="5" width="4.2" height="14" rx="1.4" ' + FILL + '/>',
    next: '<path d="M5 5.6v12.8a.5.5 0 0 0 .8.4l9-6.4a.5.5 0 0 0 0-.8l-9-6.4a.5.5 0 0 0-.8.4z" ' + FILL + '/><rect x="16.5" y="5" width="2.8" height="14" rx="1.2" ' + FILL + '/>',
    prev: '<path d="M19 5.6v12.8a.5.5 0 0 1-.8.4l-9-6.4a.5.5 0 0 1 0-.8l9-6.4a.5.5 0 0 1 .8.4z" ' + FILL + '/><rect x="4.7" y="5" width="2.8" height="14" rx="1.2" ' + FILL + '/>',
    replay: '<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v5h5"/>',
    // section icons (drawn inside a 24px box, outlined like the reference design)
    t_getready: '<circle cx="12" cy="12" r="9.5"/><path d="M9.6 7.2v9.8"/><path d="M9.6 7.8h6.2l-1.7 2.6 1.7 2.6H9.6" ' + FILL + '/>',
    t_work: '<circle cx="12" cy="12" r="9.5"/><path d="M10 8.3v7.4a.4.4 0 0 0 .6.35l6-3.7a.4.4 0 0 0 0-.7l-6-3.7a.4.4 0 0 0-.6.35z" ' + FILL + '/>',
    t_rest: '<circle cx="12" cy="12" r="9.5"/><rect x="8.7" y="8" width="2.3" height="8" rx="1.1" ' + FILL + '/><rect x="13" y="8" width="2.3" height="8" rx="1.1" ' + FILL + '/>',
    t_exercises: '<circle cx="12" cy="12" r="9.5"/><path d="M13.2 6.2 8.4 12.9h3.3l-.9 4.9 4.8-6.7h-3.3z" ' + FILL + '/>',
    t_rounds: '<path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 4v5h-5"/>',
    t_reset: '<circle cx="12" cy="12" r="9.5"/><path d="M12 7v5.2l3.2 2"/>'
  };

  function icon(name, cls) {
    return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + PATHS[name] + '</svg>';
  }
  function tIcon(type) { return icon('t_' + type, 'ti'); }

  // Timeline of the whole workout: one coloured block per segment, sized by seconds.
  function strip(exp, playhead, cls) {
    var total = exp.total || 1;
    var rects = exp.segments.map(function (s) {
      return '<rect x="' + s.start + '" y="0" width="' + s.seconds + '" height="1" class="s-' + s.type + '"/>';
    }).join('');
    return '<div class="strip ' + (cls || '') + '" aria-hidden="true">' +
      '<svg viewBox="0 0 ' + total + ' 1" preserveAspectRatio="none" shape-rendering="crispEdges">' + rects + '</svg>' +
      (playhead ? '<i class="playhead" id="p-head"></i>' : '') + '</div>';
  }

  function app(html) {
    document.getElementById('app').innerHTML = html;
  }

  // ----- overlays -----
  var overlayEl = null;
  var dialogResolve = null;

  function openOverlay(html, cls) {
    if (!overlayEl) overlayEl = document.getElementById('overlay');
    settleDialog(false);
    overlayEl.innerHTML = '<div class="scrim" data-act="close-overlay"></div><div class="' + cls + '" role="dialog" aria-modal="true">' + html + '</div>';
    overlayEl.classList.add('on');
  }
  function closeOverlay() {
    if (!overlayEl) overlayEl = document.getElementById('overlay');
    settleDialog(false);
    overlayEl.classList.remove('on');
    overlayEl.innerHTML = '';
  }
  function isOverlayOpen() {
    return !!(overlayEl && overlayEl.classList.contains('on'));
  }
  function sheet(html) { openOverlay('<div class="grab"></div>' + html, 'sheet'); }
  function drawer(html) { openOverlay(html, 'drawer'); }

  function settleDialog(v) {
    if (dialogResolve) { var r = dialogResolve; dialogResolve = null; r(v); }
  }

  // Promise-based confirm. opts: { title, body, ok, danger }
  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      openOverlay(
        '<h2>' + esc(opts.title) + '</h2>' +
        (opts.body ? '<p>' + esc(opts.body) + '</p>' : '') +
        '<div class="dlg-btns"><button class="btn ghost" data-act="dlg-no">Cancel</button>' +
        '<button class="btn ' + (opts.danger ? 'danger' : '') + '" data-act="dlg-yes">' + esc(opts.ok || 'OK') + '</button></div>',
        'dialog'
      );
      dialogResolve = resolve;
    });
  }

  // ----- toast -----
  var toastTimer = null;
  function toast(msg, action) {
    var el = document.getElementById('toast');
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button data-act="toast-action">' + esc(action.label) + '</button>' : '');
    el._action = action || null;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, action ? 5000 : 2600);
  }
  function hideToast() {
    var el = document.getElementById('toast');
    el.hidden = true;
  }

  // ----- action registry -----
  var actions = {};
  function on(name, fn) { actions[name] = fn; }
  function dispatch(el, ev) {
    var fn = actions[el.getAttribute('data-act')];
    if (fn) fn(el, ev);
  }

  function setThemeColor(c) {
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', c);
  }

  IT.ui = {
    esc: esc, icon: icon, tIcon: tIcon, strip: strip, app: app,
    sheet: sheet, drawer: drawer, closeOverlay: closeOverlay, isOverlayOpen: isOverlayOpen,
    settleDialog: settleDialog, confirmDialog: confirmDialog,
    toast: toast, hideToast: hideToast, on: on, dispatch: dispatch, setThemeColor: setThemeColor
  };
})(self);
