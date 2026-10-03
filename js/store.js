/* PaperTeX — where documents live between sessions.

   IndexedDB, not localStorage: localStorage holds about 5 MB per site, and a
   document with a few pasted photos is already past that — at which point
   every save failed in silence. IndexedDB holds hundreds of megabytes, keeps
   any number of documents, and its writes can be checked.

   When a browser will not open it (some private windows, a sandboxed copy
   of the page), the store falls back to localStorage, and failing that to
   memory — and says so through `kind`, so the app can warn that nothing
   will outlive the tab.

   Records: { id, title, updated, json, backedUp } — `json` is the document
   as saved, `backedUp` the last time it was written out to a file. */
(function () {
  'use strict';

  var DB = 'papertex', VER = 1, LEGACY = 'papertex.doc.v1';
  var db = null, kind = 'memory', mem = { docs: {}, meta: {} };

  function req(r) {
    return new Promise(function (resolve, reject) {
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error || new Error('storage request failed')); };
    });
  }
  function tx(store, mode, fn) {
    return new Promise(function (resolve, reject) {
      var t = db.transaction(store, mode), out;
      t.oncomplete = function () { resolve(out); };
      t.onerror = t.onabort = function () { reject(t.error || new Error('storage transaction failed')); };
      out = fn(t.objectStore(store));
      if (out && typeof out.then === 'function') out.then(function (v) { out = v; });
    });
  }

  function openIDB() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('no IndexedDB'));
      var r;
      try { r = indexedDB.open(DB, VER); } catch (e) { return reject(e); }
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
      };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error || new Error('IndexedDB refused')); };
      r.onblocked = function () { reject(new Error('IndexedDB blocked by another tab')); };
    });
  }

  /* ---- three backends behind one interface ---- */
  var idb = {
    get: function (id) { return tx('docs', 'readonly', function (s) { return req(s.get(id)); }); },
    put: function (rec) { return tx('docs', 'readwrite', function (s) { s.put(rec); }); },
    del: function (id) { return tx('docs', 'readwrite', function (s) { s.delete(id); }); },
    all: function () { return tx('docs', 'readonly', function (s) { return req(s.getAll()); }); },
    getMeta: function (k) { return tx('meta', 'readonly', function (s) { return req(s.get(k)); }).then(function (r) { return r ? r.value : undefined; }); },
    setMeta: function (k, v) { return tx('meta', 'readwrite', function (s) { s.put({ key: k, value: v }); }); }
  };
  var LS = 'papertex.store.';
  var local = {
    get: function (id) { return Promise.resolve(JSON.parse(localStorage.getItem(LS + 'doc.' + id) || 'null')); },
    put: function (rec) {
      return new Promise(function (resolve) {
        localStorage.setItem(LS + 'doc.' + rec.id, JSON.stringify(rec));   /* throws when full */
        var ids = JSON.parse(localStorage.getItem(LS + 'ids') || '[]');
        if (ids.indexOf(rec.id) < 0) { ids.push(rec.id); localStorage.setItem(LS + 'ids', JSON.stringify(ids)); }
        resolve();
      });
    },
    del: function (id) {
      localStorage.removeItem(LS + 'doc.' + id);
      var ids = JSON.parse(localStorage.getItem(LS + 'ids') || '[]').filter(function (x) { return x !== id; });
      localStorage.setItem(LS + 'ids', JSON.stringify(ids));
      return Promise.resolve();
    },
    all: function () {
      var ids = JSON.parse(localStorage.getItem(LS + 'ids') || '[]');
      return Promise.resolve(ids.map(function (id) { return JSON.parse(localStorage.getItem(LS + 'doc.' + id) || 'null'); }).filter(Boolean));
    },
    getMeta: function (k) { var v = localStorage.getItem(LS + 'meta.' + k); return Promise.resolve(v == null ? undefined : JSON.parse(v)); },
    setMeta: function (k, v) { localStorage.setItem(LS + 'meta.' + k, JSON.stringify(v)); return Promise.resolve(); }
  };
  var memory = {
    get: function (id) { return Promise.resolve(mem.docs[id] || null); },
    put: function (rec) { mem.docs[rec.id] = rec; return Promise.resolve(); },
    del: function (id) { delete mem.docs[id]; return Promise.resolve(); },
    all: function () { return Promise.resolve(Object.keys(mem.docs).map(function (k) { return mem.docs[k]; })); },
    getMeta: function (k) { return Promise.resolve(mem.meta[k]); },
    setMeta: function (k, v) { mem.meta[k] = v; return Promise.resolve(); }
  };
  var be = memory;

  function localWorks() {
    try { localStorage.setItem(LS + 'probe', '1'); localStorage.removeItem(LS + 'probe'); return true; }
    catch (e) { return false; }
  }

  /* The single document the app kept in localStorage before this store
     existed comes across once, and is removed only after it is safely in. */
  function migrateLegacy() {
    var s;
    try { s = localStorage.getItem(LEGACY); } catch (e) { return Promise.resolve(); }
    if (!s) return Promise.resolve();
    var d;
    try { d = JSON.parse(s); } catch (e) { return Promise.resolve(); }
    if (!d || !d.blocks) return Promise.resolve();
    var id = newId();
    return be.put(record(id, s, d)).then(function () {
      return be.setMeta('current', id);
    }).then(function () {
      try { localStorage.removeItem(LEGACY); } catch (e) { /* it stays as a spare copy */ }
    }).catch(function () { /* left where it was; legacy() still finds it */ });
  }
  function legacy() {
    try { return localStorage.getItem(LEGACY); } catch (e) { return null; }
  }

  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function titleOf(d) {
    var t = d && d.meta && d.meta.title ? String(d.meta.title) : '';
    var div = document.createElement('div');
    div.innerHTML = PT.sanitize ? PT.sanitize.clean(t) : '';
    return (div.textContent || '').trim() || 'Untitled document';
  }
  function record(id, json, doc, prev) {
    return { id: id, title: titleOf(doc), updated: Date.now(), json: json, backedUp: prev ? prev.backedUp || 0 : 0 };
  }

  var opened = null;
  function open() {
    if (opened) return opened;
    opened = openIDB().then(function (d) {
      db = d; be = idb; kind = 'idb';
      db.onversionchange = function () { db.close(); };
    }, function () {
      if (localWorks()) { be = local; kind = 'local'; }
      else { be = memory; kind = 'memory'; }
    }).then(migrateLegacy).then(function () { return kind; });
    return opened;
  }

  /* Writes are queued per document, newest wins: a burst of keystrokes is
     one write, and a slow write is never overtaken by an older one. */
  var pending = {}, writing = {};
  function save(id, json, doc) {
    pending[id] = { json: json, doc: doc };
    if (writing[id]) return writing[id];
    writing[id] = (function next() {
      var job = pending[id];
      delete pending[id];
      return be.get(id).then(function (prev) {
        return be.put(record(id, job.json, job.doc, prev));
      }).then(function () {
        if (pending[id]) return next();
      });
    })().then(function () { delete writing[id]; }, function (e) { delete writing[id]; delete pending[id]; throw e; });
    return writing[id];
  }

  function list() {
    return be.all().then(function (rs) {
      return rs.map(function (r) {
        return { id: r.id, title: r.title, updated: r.updated, backedUp: r.backedUp || 0, size: (r.json || '').length };
      }).sort(function (a, b) { return b.updated - a.updated; });
    });
  }
  function load(id) { return be.get(id).then(function (r) { return r ? r.json : null; }); }
  function markBackedUp(id) {
    return be.get(id).then(function (r) { if (!r) return; r.backedUp = Date.now(); return be.put(r); });
  }

  /* Ask the browser not to clear this site's data under storage pressure.
     Chrome and Firefox grant it to sites people use; Safari still removes
     data of sites unvisited for seven days, which is why backups matter. */
  function persist() {
    if (!navigator.storage || !navigator.storage.persist) return Promise.resolve(false);
    return navigator.storage.persisted().then(function (p) { return p || navigator.storage.persist(); })
      .catch(function () { return false; });
  }
  function estimate() {
    if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(null);
    return Promise.all([navigator.storage.estimate(), navigator.storage.persisted ? navigator.storage.persisted() : false])
      .then(function (r) { return { usage: r[0].usage, quota: r[0].quota, persisted: !!r[1] }; })
      .catch(function () { return null; });
  }

  window.PT = window.PT || {};
  window.PT.store = {
    open: open,
    kind: function () { return kind; },
    newId: newId,
    list: list,
    load: load,
    save: save,
    remove: function (id) { return be.del(id); },
    current: function () { return be.getMeta('current'); },
    setCurrent: function (id) { return be.setMeta('current', id); },
    getMeta: function (k) { return be.getMeta(k); },
    setMeta: function (k, v) { return be.setMeta(k, v); },
    markBackedUp: markBackedUp,
    /* the pre-IndexedDB document, if it could not be moved across */
    legacy: legacy,
    persist: persist,
    estimate: estimate,
    /* is anything still waiting to be written? */
    busy: function () { return Object.keys(writing).length > 0 || Object.keys(pending).length > 0; }
  };
})();
