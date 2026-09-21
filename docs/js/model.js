// Workout model: section types, the flat list a workout is built from, and the
// expansion of a saved workout into the flat list of timed segments the player
// walks through.
//
// A workout is an ordered list of sections. Most are timed (Get ready, Work,
// Rest, Round rest). Two are repeat counts that act on what sits ABOVE them:
//   Exercises x N  repeats the sections above it since the previous repeat count
//                  (so N = how many exercises are in each set)
//   Rounds x N     repeats everything above it since the previous Rounds count
//                  (so N = how many sets you do in total)
// A Get ready at the very top plays once and is never repeated.
(function (g) {
  'use strict';
  var IT = (g.IT = g.IT || {});

  // kind 'time'  -> value is seconds
  // kind 'count' -> value is a repeat count
  var TYPES = {
    getready:  { key: 'getready',  label: 'Get ready',   kind: 'time',  def: 10, blurb: 'A countdown before you begin' },
    work:      { key: 'work',      label: 'Work',        kind: 'time',  def: 30, blurb: 'Time on the exercise' },
    rest:      { key: 'rest',      label: 'Rest',        kind: 'time',  def: 10, blurb: 'Time to recover' },
    exercises: { key: 'exercises', label: 'Exercises',   kind: 'count', def: 4,  unit: 'exercises', blurb: 'Exercises per set. Repeats what is above it' },
    rounds:    { key: 'rounds',    label: 'Rounds',      kind: 'count', def: 3,  unit: 'rounds',    blurb: 'Sets in total. Repeats everything above' },
    reset:     { key: 'reset',     label: 'Round rest', kind: 'time',  def: 30, blurb: 'A longer break between rounds' }
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
    return { id: uid(), type: type, value: TYPES[type].def };
  }

  // Give every item in a (cloned) list a fresh id.
  function reId(items) {
    items.forEach(function (it) { it.id = uid(); });
    return items;
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

  function find(items, id) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) return { item: items[i], index: i, list: items };
    }
    return null;
  }

  // Which sections does each repeat count cover? Returns
  //   cover[itemId] = { ex: markerId, rd: markerId }  (which counts repeat this row)
  //   info[markerId] = { covered: number of timed sections it repeats }
  function analyze(items) {
    var cover = {}, info = {};
    var startAny = 0, startRounds = 0, leading = true;
    items.forEach(function (it, i) {
      if (TYPES[it.type].kind === 'time') {
        if (leading && it.type === 'getready') startAny = startRounds = i + 1;
        else leading = false;
        return;
      }
      leading = false;
      var isEx = it.type === 'exercises';
      var from = isEx ? startAny : startRounds;
      var covered = 0;
      for (var j = from; j < i; j++) {
        var c = (cover[items[j].id] = cover[items[j].id] || {});
        c[isEx ? 'ex' : 'rd'] = it.id;
        if (TYPES[items[j].type].kind === 'time') covered++;
      }
      info[it.id] = { covered: covered };
      if (isEx) startAny = i + 1;
      else startRounds = startAny = i + 1;
    });
    return { cover: cover, info: info };
  }

  // Flatten a workout into timed segments. A Rest or Round rest that would be
  // the very last thing in the workout is dropped: nothing follows it.
  function expand(w) {
    var out = [];
    var startAny = 0, startRounds = 0, leading = true;

    function repeat(from, n, key) {
      var block = out.slice(from);
      if (!block.length) return;
      out.length = from;
      for (var i = 1; i <= n; i++) {
        block.forEach(function (s) {
          var ctx = { round: s.ctx.round, exercise: s.ctx.exercise };
          ctx[key] = { i: i, n: n };
          out.push({ type: s.type, seconds: s.seconds, id: s.id, ctx: ctx });
        });
      }
    }

    (w.items || []).forEach(function (it) {
      var T = TYPES[it.type];
      if (T.kind === 'time') {
        out.push({ type: it.type, seconds: it.value, id: it.id, ctx: { round: null, exercise: null } });
        if (leading && it.type === 'getready') startAny = startRounds = out.length;
        else leading = false;
      } else {
        leading = false;
        if (it.type === 'exercises') {
          repeat(startAny, it.value, 'exercise');
          startAny = out.length;
        } else {
          repeat(startRounds, it.value, 'round');
          startRounds = startAny = out.length;
        }
      }
    });

    while (out.length && (out[out.length - 1].type === 'rest' || out[out.length - 1].type === 'reset')) {
      out.pop();
    }
    var t = 0;
    out.forEach(function (s) {
      s.start = t;
      t += s.seconds;
      s.end = t;
    });
    return { segments: out, total: t };
  }

  // Returns a list of { field?, id?, msg }.
  function validate(w) {
    var errs = [];
    if (!String(w.name || '').trim()) errs.push({ field: 'name', msg: 'Give the workout a name' });
    var a = analyze(w.items || []);
    (w.items || []).forEach(function (it) {
      if (TYPES[it.type].kind === 'count' && a.info[it.id] && a.info[it.id].covered === 0) {
        errs.push({ id: it.id, msg: TYPES[it.type].label + ' has nothing above it to repeat. Add Work or Rest above it, or delete it' });
      }
    });
    if (expand(w).segments.length === 0 && !errs.some(function (e) { return e.id; })) {
      errs.push({ msg: 'Add at least one Work, Rest or Get ready section' });
    }
    return errs;
  }

  // ----- workouts saved by version 1 nested sections inside Exercises / Rounds.
  // Flatten them: a group's contents, then its repeat count.
  function needsUpgrade(w) {
    return (w.items || []).some(function (it) { return !!it.children; });
  }
  function flatten(items) {
    var out = [];
    (items || []).forEach(function (it) {
      if (it.children) {
        out = out.concat(flatten(it.children));
        out.push({ id: it.id, type: it.type, value: it.value });
      } else {
        out.push(it);
      }
    });
    return out;
  }
  function upgrade(w) {
    if (needsUpgrade(w)) w.items = flatten(w.items);
    return w;
  }

  function starterItems() {
    var items = ['getready', 'work', 'rest', 'exercises', 'reset', 'rounds'].map(newItem);
    return items; // Get ready 10, Work 30, Rest 10, Exercises 4, Round rest 30, Rounds 3
  }

  function exampleWorkout() {
    var items = ['getready', 'work', 'rest', 'exercises', 'reset', 'rounds'].map(newItem);
    items[0].value = 10; // Get ready
    items[1].value = 15; // Work
    items[2].value = 1;  // Rest
    items[3].value = 4;  // Exercises
    items[4].value = 15; // Round rest
    items[5].value = 4;  // Rounds
    var now = Date.now();
    return { id: 'example', name: 'Example: 5-min blast', items: items, createdAt: now, updatedAt: now };
  }

  IT.model = {
    TYPES: TYPES, ORDER: ORDER, MAX_SECONDS: MAX_SECONDS, MAX_COUNT: MAX_COUNT,
    uid: uid, clone: clone, newItem: newItem, reId: reId,
    clampValue: clampValue, fmt: fmt, find: find, analyze: analyze, expand: expand,
    validate: validate, needsUpgrade: needsUpgrade, upgrade: upgrade,
    starterItems: starterItems, exampleWorkout: exampleWorkout
  };
})(self);
