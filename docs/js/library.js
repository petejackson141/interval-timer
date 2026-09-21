// Home screen: the library of saved workouts.
(function (g) {
  'use strict';
  var IT = (g.IT = g.IT || {});
  var M = IT.model, S = IT.store, ui = IT.ui;

  function card(w) {
    var exp = M.expand(w);
    var n = exp.segments.length;
    return '<article class="card" data-act="play" data-id="' + w.id + '" role="button" tabindex="0">' +
      '<div class="card-top"><h2>' + ui.esc(w.name) + '</h2>' +
      '<button class="ib dark" data-act="card-menu" data-id="' + w.id + '" aria-label="Options for ' + ui.esc(w.name) + '">' + ui.icon('more') + '</button></div>' +
      ui.strip(exp, false, 'mini') +
      '<div class="card-meta"><span class="time">' + M.fmt(exp.total) + '</span><span>' + n + (n === 1 ? ' interval' : ' intervals') + '</span></div>' +
      '</article>';
  }

  function open() {
    var list = S.list();
    var body = list.length
      ? list.map(card).join('')
      : '<div class="empty"><h2>No workouts yet</h2><p>Tap the + button to build one. Pick your sections, set the seconds and save it under any name.</p></div>';
    ui.setThemeColor('#F0343F');
    ui.app(
      '<div class="screen library t-idle">' +
        '<header class="hero">' +
          '<div class="bar">' +
            '<button class="ib" data-act="menu" aria-label="Menu">' + ui.icon('menu') + '</button>' +
            '<h1 class="title">Interval Timer</h1>' +
            '<button class="ib" data-act="settings" aria-label="Settings">' + ui.icon('sliders') + '</button>' +
          '</div>' +
          '<div class="hero-body"><div class="bigtitle">My workouts</div>' +
          '<div class="sub">' + (list.length === 1 ? '1 saved workout' : list.length + ' saved workouts') + '</div></div>' +
        '</header>' +
        '<div class="sheetwrap">' +
          '<div class="sheetbg"></div>' +
          '<div class="sheettop"><button class="playbtn" data-act="new" aria-label="New workout">' + ui.icon('plus') + '</button></div>' +
          '<div class="rows list">' + body + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function leave() {}

  function cardMenu(id) {
    var w = S.get(id);
    if (!w) return;
    ui.sheet(
      '<h2 class="sheet-title">' + ui.esc(w.name) + '</h2>' +
      '<div class="menu">' +
        '<button data-act="m-play" data-id="' + id + '">' + ui.icon('play') + 'Start workout</button>' +
        '<button data-act="m-edit" data-id="' + id + '">' + ui.icon('edit') + 'Edit workout</button>' +
        '<button data-act="m-dup" data-id="' + id + '">' + ui.icon('copy') + 'Duplicate</button>' +
        '<button class="danger" data-act="m-del" data-id="' + id + '">' + ui.icon('trash') + 'Delete</button>' +
      '</div>'
    );
  }

  IT.library = { open: open, leave: leave, cardMenu: cardMenu };
})(self);
