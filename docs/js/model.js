// Workout model: section types, the nested structure, and the expansion of a
// saved workout into the flat list of timed segments the player walks through.
(function (g) {
  'use strict';
  var IT = (g.IT = g.IT || {});

  // kind 'time'  -> value is seconds
  // kind 'count' -> value is a repeat count and the item holds children
  var TYPES = {
    getready:  { key: 'getready',  label: 'Get ready',   kind: 'time',  def: 10, blurb: 'A countdown before you begin' },
    work:      { key: 'work',      label: 'Work',        kind: 'time',  def: 30, blurb: 'Time on the exercise' },
    rest:      { key: 'rest',      label: 'Rest',        kind: 'time',  def: 10, blurb: 'Time to recover' },
    exercises: { key: 'exercises', label: 'Exercises',   kind: 'count', def: 4,  blurb: 'Repeats the Work and Rest inside' },
    rounds:    { key: 'rounds',    label: 'Rounds',      kind: 'count', def: 3,  blurb: 'Repeats everything inside' },
    reset:     { key: 'reset',     label: 'Round reset', kind: 'time',  def: 30, blurb: 'A longer break between rounds' }
  };
  var ORDER = ['getready', 'work', 'rest', 'exercises', 'rounds', 'reset'];
  var MAX_SECONDS = 7200;
  var MAX_COUNT = 99;

  function uid() {
    return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function newItem(type) {
    var T = TYPES[type];
    var it = { id: uid(), type: type, value: T.def };
    if (T.kind === 'count') it.children = [];
    return it;
  }

  // Give every item in a (cloned) tree a fresh id.
  function reId(items) {
    items.forEach(function (it) {
      it.id = uid();
      if (it.children) reId(it.children);
    });
    return items;
  }

  // Which section types may be added inside a given parent (null = top level).
  function canContain(parentType, childType) {
    if (!parentType) return { ok: true };
    if (parentType === 'rounds') {
      if (childType === 'rounds') return { ok: false, reason: 'Rounds can’t go inside Rounds' };
      return { ok: true };
    }
    if (parentType === 'exercises') {
      if (TYPES[childType].kind === 'count') return { ok: false, reason: 'Only timed sections fit inside Exercises' };
      return { ok: true };
    }
    return { ok: false, reason: 'Not a container' };
  }

  function clampValue(type, v) {
    v = Math.round(Number(v));
    if (!isFinite(v)) v = TYPES[type].def;
    var max = TYPES[type].kind === 'count' ? MAX_COUNT : MAX_SECONDS;
    return Math.max(1, Math.min(max, v));
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  // 75 -> "01:15", 3725 -> "1:02:05"
  function fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
  }

  function walk(items, fn, parent) {
    items.forEach(function (it, i) {
      fn(it, parent || null, i, items);
      if (it.children) walk(it.children, fn, it);
    });
  }

  function find(items, id) {
    var out = null;
    walk(items, function (it, parent, i, list) {
      if (!out && it.id === id) out = { item: it, parent: parent, index: i, list: list };
    });
    return out;
  }

  function expandInto(items, ctx, out) {
    items.forEach(function (it) {
      var T = TYPES[it.type];
      if (T.kind === 'count') {
        for (var i = 0; i < it.value; i++) {
          var c = { round: ctx.round, exercise: ctx.exercise };
          c[it.type === 'rounds' ? 'round' : 'exercise'] = { i: i + 1, n: it.value };
          expandInto(it.children || [], c, out);
        }
      } else {
        out.push({ type: it.type, seconds: it.value, ctx: ctx, id: it.id });
      }
    });
  }

  // Flatten a workout into timed segments. A Rest or Round reset that would be
  // the very last thing in the workout is dropped: nothing follows it.
  function expand(w) {
    var segs = [];
    expandInto(w.items || [], { round: null, exercise: null }, segs);
    while (segs.length && (segs[segs.length - 1].type === 'rest' || segs[segs.length - 1].type === 'reset')) {
      segs.pop();
    }
    var t = 0;
    segs.forEach(function (s) {
      s.start = t;
      t += s.seconds;
      s.end = t;
    });
    return { segments: segs, total: t };
  }

  // Returns a list of { field?, id?, msg }.
  function validate(w) {
    var errs = [];
    if (!String(w.name || '').trim()) errs.push({ field: 'name', msg: 'Give the workout a name' });
    walk(w.items || [], function (it) {
      if (TYPES[it.type].kind === 'count' && (!it.children || !it.children.length)) {
        errs.push({ id: it.id, msg: TYPES[it.type].label + ' is empty. Add a section inside it or delete it' });
      }
    });
    if (expand(w).segments.length === 0 && !errs.some(function (e) { return e.id; })) {
      errs.push({ msg: 'Add at least one Work, Rest or Get ready section' });
    }
    return errs;
  }

  function starterItems() {
    var g = newItem('getready'); g.value = 10;
    var rounds = newItem('rounds'); rounds.value = 3;
    var ex = newItem('exercises'); ex.value = 4;
    var work = newItem('work'); work.value = 30;
    var rest = newItem('rest'); rest.value = 10;
    var reset = newItem('reset'); reset.value = 30;
    ex.children.push(work, rest);
    rounds.children.push(ex, reset);
    return [g, rounds];
  }

  function exampleWorkout() {
    var g = newItem('getready'); g.value = 10;
    var rounds = newItem('rounds'); rounds.value = 4;
    var ex = newItem('exercises'); ex.value = 4;
    var work = newItem('work'); work.value = 15;
    var rest = newItem('rest'); rest.value = 1;
    var reset = newItem('reset'); reset.value = 15;
    ex.children.push(work, rest);
    rounds.children.push(ex, reset);
    var now = Date.now();
    return { id: 'example', name: 'Example: 5-min blast', items: [g, rounds], createdAt: now, updatedAt: now };
  }

  IT.model = {
    TYPES: TYPES, ORDER: ORDER, MAX_SECONDS: MAX_SECONDS, MAX_COUNT: MAX_COUNT,
    uid: uid, clone: clone, newItem: newItem, reId: reId, canContain: canContain,
    clampValue: clampValue, fmt: fmt, walk: walk, find: find, expand: expand,
    validate: validate, starterItems: starterItems, exampleWorkout: exampleWorkout
  };
})(self);
