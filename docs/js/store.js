// Local storage for the workout library and settings. Every key is prefixed
// "intervaltimer:" so it can never collide with another app hosted on the same
// github.io address.
(function (g) {
  'use strict';
  var IT = (g.IT = g.IT || {});
  var M = IT.model;
  var K_WORKOUTS = 'intervaltimer:workouts';
  var K_SETTINGS = 'intervaltimer:settings';
  var K_SEEDED = 'intervaltimer:seeded';
  var DEFAULTS = { countdown: 'voice', volume: 0.7, half: 'voice', halfVolume: 0.7, beep: true, cueVolume: 0.7, names: false, namesVolume: 0.7, wake: true };
  var VOLUMES = ['volume', 'halfVolume', 'cueVolume', 'namesVolume']; // one slider per sound setting
  var CHOICES = { countdown: ['beeps', 'voice', 'off'], half: ['voice', 'beep', 'off'] };

  var memory = {}; // fallback if localStorage is unavailable

  function read(key, fallback) {
    try {
      var raw = g.localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return key in memory ? memory[key] : fallback;
    }
  }
  function write(key, value) {
    memory[key] = value;
    try { g.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* keep in memory */ }
  }

  function all() {
    var list = read(K_WORKOUTS, []);
    return Array.isArray(list) ? list : [];
  }

  // Version 1 saved Exercises / Rounds as containers; flatten those once.
  function migrateOnce() {
    var list = all();
    var changed = false;
    list.forEach(function (w) { if (M.needsUpgrade(w)) { M.upgrade(w); changed = true; } });
    if (changed) write(K_WORKOUTS, list);
  }

  function seedOnce() {
    if (read(K_SEEDED, false)) return;
    if (all().length === 0) write(K_WORKOUTS, [M.exampleWorkout()]);
    write(K_SEEDED, true);
  }

  function list() {
    return all().slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
  }
  function get(id) {
    return all().filter(function (w) { return w.id === id; })[0] || null;
  }
  function save(w) {
    var list = all();
    var i = list.map(function (x) { return x.id; }).indexOf(w.id);
    if (i >= 0) list[i] = w; else list.push(w);
    write(K_WORKOUTS, list);
  }
  function remove(id) {
    write(K_WORKOUTS, all().filter(function (w) { return w.id !== id; }));
  }
  function duplicate(id) {
    var src = get(id);
    if (!src) return null;
    var copy = M.clone(src);
    copy.id = M.uid();
    copy.name = (src.name + ' copy').slice(0, 60);
    M.reId(copy.items);
    copy.createdAt = copy.updatedAt = Date.now();
    save(copy);
    return copy;
  }

  function settings() {
    var s = read(K_SETTINGS, {}) || {};
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      var d = DEFAULTS[k], v = s[k];
      if (CHOICES[k]) out[k] = CHOICES[k].indexOf(v) >= 0 ? v : d;
      else if (VOLUMES.indexOf(k) >= 0) out[k] = typeof v === 'number' && isFinite(v) ? Math.min(1, Math.max(0.05, v)) : d;
      else out[k] = typeof v === 'boolean' ? v : d;
    });
    // version 1 had a single "voice countdown" switch
    if (CHOICES.countdown.indexOf(s.countdown) < 0 && s.voice === false) out.countdown = 'off';
    return out;
  }
  function setSetting(key, value) {
    var s = settings();
    if (CHOICES[key]) s[key] = CHOICES[key].indexOf(value) >= 0 ? value : DEFAULTS[key];
    else if (VOLUMES.indexOf(key) >= 0) s[key] = Math.min(1, Math.max(0.05, Number(value) || DEFAULTS.volume));
    else s[key] = !!value;
    write(K_SETTINGS, s);
  }

  function exportJSON() {
    return JSON.stringify({ app: 'intervaltimer', version: 1, workouts: all() }, null, 2);
  }

  // Merges by id; returns how many workouts were imported.
  function importJSON(text) {
    var data = JSON.parse(text);
    var incoming = Array.isArray(data) ? data : data && data.workouts;
    if (!Array.isArray(incoming)) throw new Error('No workouts found');
    var n = 0;
    incoming.forEach(function (w) {
      if (!w || typeof w.name !== 'string' || !Array.isArray(w.items)) return;
      M.upgrade(w);
      if (M.expand(w).segments.length === 0) return;
      w.id = w.id || M.uid();
      w.updatedAt = w.updatedAt || Date.now();
      w.createdAt = w.createdAt || w.updatedAt;
      save(w);
      n++;
    });
    if (!n) throw new Error('No valid workouts found');
    return n;
  }

  IT.store = {
    migrateOnce: migrateOnce, seedOnce: seedOnce, list: list, get: get, save: save, remove: remove, duplicate: duplicate,
    settings: settings, setSetting: setSetting, exportJSON: exportJSON, importJSON: importJSON
  };
})(self);
