/* PaperTeX — the lasting copy of every document.

   PT.store (IndexedDB) is the working copy: fast, written on every change,
   and gone when the browser's data for this site is cleared — or, in
   Safari, after seven days without a visit. This file keeps a second copy
   somewhere the user owns, written a few seconds after each change:

     folder    a folder on this computer the user picks once (the File
               System Access API — Chrome, Edge, Opera and other Chromium
               browsers on a computer). Nothing leaves the machine; a folder
               that a sync app (Dropbox, Google Drive, OneDrive, iCloud)
               watches carries the copies to the cloud by itself.
     dropbox   the app's own folder (Apps/<app name>) in the user's own Dropbox,
               written straight from this page to Dropbox's API. Only
               when the site's owner has registered a Dropbox app and put
               its key in <meta name="papertex-dropbox"> (see DEPLOY.md);
               otherwise it is not offered at all.

   Each document is one file, "<title> [<id>].papertex.json", holding the
   document exactly as Save project writes it, so Open reads it back too.
   The id in brackets lets a restore put it back in its place.

   And for every browser, one .zip with every document in it (zipAll).

   Nothing here runs until the user turns it on. */
(function () {
  'use strict';

  var S = PT.store;
  var listeners = [];
  var st = { target: null, phase: 'off', where: '', last: 0, error: '' };
  var dir = null;                 /* the folder's handle */
  var dbx = null;                 /* { refresh, access, exp } */
  var names = {};                 /* id → file name last written, per target */
  var dirty = {}, timer = null, running = null;
  var DELAY = 2500;               /* after the last change: one write per pause */

  function set(p) {
    Object.keys(p).forEach(function (k) { st[k] = p[k]; });
    listeners.forEach(function (fn) { try { fn(status()); } catch (e) { /* a listener's problem */ } });
  }
  function status() { return Object.assign({}, st); }

  /* ------------------------------------------------------------- file names */
  var EXT = '.papertex.json';
  function fileName(rec) {
    var t = String(rec.title || 'Untitled document')
      .replace(/[\\/:*?"<>|\u0000-\u001f\u007f\[\]]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (t.length > 60) t = t.slice(0, 60).trim();
    t = t.replace(/^\.+/, '') || 'Untitled document';
    return t + ' [' + rec.id + ']' + EXT;
  }
  function idOf(name) {
    var m = /\[([0-9a-z]{4,40})\]\.papertex\.json$/i.exec(name || '');
    return m ? m[1] : null;
  }

  /* ----------------------------------------------------------------- folder */
  var folderSupported = typeof window.showDirectoryPicker === 'function' && window.isSecureContext !== false;

  function folderPermission(ask) {
    if (!dir) return Promise.resolve('denied');
    var o = { mode: 'readwrite' };
    return (ask ? dir.requestPermission(o) : dir.queryPermission(o)).catch(function () { return 'denied'; });
  }
  var folder = {
    write: function (name, text) {
      return dir.getFileHandle(name, { create: true }).then(function (fh) {
        return fh.createWritable();        /* written aside, swapped in on close */
      }).then(function (w) {
        return w.write(text).then(function () { return w.close(); }, function (e) {
          return w.abort().then(function () { throw e; }, function () { throw e; });
        });
      });
    },
    remove: function (name) { return dir.removeEntry(name).catch(function () { /* already gone */ }); },
    list: function () {
      var out = [];
      var it = dir.values();
      function next() {
        return it.next().then(function (r) {
          if (r.done) return out;
          var h = r.value;
          if (h.kind === 'file' && idOf(h.name)) {
            out.push({
              name: h.name, id: idOf(h.name),
              meta: function () { return h.getFile().then(function (f) { return f.lastModified; }); },
              read: function () { return h.getFile().then(function (f) { return f.text(); }); }
            });
          }
          return next();
        });
      }
      return next();
    }
  };

  /* ---------------------------------------------------------------- Dropbox
     OAuth 2 with PKCE: the page is a public client, so there is no secret
     to hide and no server in between. The user signs in on dropbox.com,
     which sends them back to app.html with a one-time code; the page trades
     it for a refresh token, kept in this browser (IndexedDB) and used only
     to talk to Dropbox. "Stop backing up" revokes it. */
  function dropboxKey() {
    var m = document.querySelector('meta[name="papertex-dropbox"]');
    var v = m ? (m.getAttribute('content') || '').trim() : '';
    return /^[a-z0-9]{6,40}$/i.test(v) ? v : '';
  }
  var API = 'https://api.dropboxapi.com', CONTENT = 'https://content.dropboxapi.com';
  function redirectUri() {
    /* the editor's own address, as registered in the Dropbox app console */
    return location.origin + location.pathname.replace(/[^/]*$/, '') + 'app.html';
  }
  function b64url(bytes) {
    var s = '';
    bytes.forEach(function (b) { s += String.fromCharCode(b); });
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function randomString(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); }
  /* Dropbox-API-Arg is an HTTP header: JSON, with anything past ASCII
     written as \uXXXX (a title like “Çalışma” would otherwise break it) */
  function headerJSON(o) {
    return JSON.stringify(o).replace(/[\u007f-￿]/g, function (c) { return '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4); });
  }
  function dbxError(r) {
    return r.text().then(function (t) {
      var e = new Error('Dropbox answered ' + r.status + (t ? ': ' + t.slice(0, 160) : ''));
      e.status = r.status;
      if (r.status === 401) e.auth = true;
      if (r.status === 409 && /insufficient_space/.test(t)) e.message = 'Your Dropbox is full.';
      throw e;
    }, function () { var e = new Error('Dropbox answered ' + r.status); e.status = r.status; throw e; });
  }
  function token(force) {
    if (!dbx) return Promise.reject(Object.assign(new Error('Not connected to Dropbox'), { auth: true }));
    if (!force && dbx.access && dbx.exp > Date.now() + 60e3) return Promise.resolve(dbx.access);
    var body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: dbx.refresh, client_id: dropboxKey() });
    return fetch(API + '/oauth2/token', { method: 'POST', body: body }).then(function (r) {
      if (r.status === 400 || r.status === 401) { var e = new Error('Dropbox needs you to sign in again'); e.auth = true; throw e; }
      if (!r.ok) return dbxError(r);
      return r.json();
    }).then(function (j) {
      dbx.access = j.access_token;
      dbx.exp = Date.now() + (j.expires_in || 14400) * 1000;
      S.setMeta('backup.dropbox', dbx);
      return dbx.access;
    });
  }
  /* one call, retried once with a fresh token if the old one expired */
  function call(fn) {
    return token().then(fn).then(function (r) {
      if (r.status !== 401) return r;
      return token(true).then(fn);
    }).then(function (r) { return r.ok ? r : dbxError(r); });
  }
  function rpc(path, arg) {
    return call(function (t) {
      return fetch(API + path, { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify(arg) });
    });
  }
  var dropbox = {
    write: function (name, text, rec) {
      return call(function (t) {
        return fetch(CONTENT + '/2/files/upload', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + t,
            'Content-Type': 'application/octet-stream',
            'Dropbox-API-Arg': headerJSON({ path: '/' + name, mode: 'overwrite', mute: true,
              client_modified: new Date(rec.updated).toISOString().replace(/\.\d+Z$/, 'Z') })
          },
          body: new Blob([text])
        });
      });
    },
    remove: function (name) {
      return rpc('/2/files/delete_v2', { path: '/' + name }).catch(function (e) { if (e.status !== 409) throw e; });
    },
    list: function () {
      var out = [];
      function page(j) {
        (j.entries || []).forEach(function (en) {
          if (en['.tag'] !== 'file' || !idOf(en.name)) return;
          out.push({
            name: en.name, id: idOf(en.name),
            meta: function () { return Promise.resolve(Date.parse(en.client_modified || en.server_modified) || 0); },
            read: function () {
              return call(function (t) {
                return fetch(CONTENT + '/2/files/download', { method: 'POST',
                  headers: { Authorization: 'Bearer ' + t, 'Dropbox-API-Arg': headerJSON({ path: en.path_lower || '/' + en.name }) } });
              }).then(function (r) { return r.text(); });
            }
          });
        });
        if (j.has_more) return rpc('/2/files/list_folder/continue', { cursor: j.cursor }).then(function (r) { return r.json(); }).then(page);
        return out;
      }
      return rpc('/2/files/list_folder', { path: '' }).then(function (r) { return r.json(); }).then(page);
    }
  };

  function connectDropbox() {
    var key = dropboxKey();
    if (!key) return Promise.reject(new Error('Dropbox is not set up on this site'));
    var verifier = randomString(48), stateTag = randomString(16);
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)).then(function (h) {
      try {
        sessionStorage.setItem('papertex.dbx', JSON.stringify({ v: verifier, s: stateTag }));
      } catch (e) { throw new Error('This browser will not keep the sign-in step; try a normal (not private) window'); }
      var q = new URLSearchParams({
        client_id: key, response_type: 'code', token_access_type: 'offline',
        code_challenge: b64url(new Uint8Array(h)), code_challenge_method: 'S256',
        redirect_uri: redirectUri(), state: stateTag
      });
      location.assign('https://www.dropbox.com/oauth2/authorize?' + q.toString());
    });
  }
  /* Back from dropbox.com: app.html?code=…&state=… (or ?error=…). The
     address is cleaned straight away, so a reload does not try again.
     Resolves 'connected', 'declined', or null when this was no such return. */
  function finishDropbox() {
    var q = new URLSearchParams(location.search);
    if (!q.has('state') || !(q.has('code') || q.has('error'))) return Promise.resolve(null);
    var saved = null;
    try { saved = JSON.parse(sessionStorage.getItem('papertex.dbx') || 'null'); sessionStorage.removeItem('papertex.dbx'); } catch (e) { saved = null; }
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* file: */ }
    if (!saved || saved.s !== q.get('state')) return Promise.resolve(null);
    if (!q.has('code')) return Promise.resolve('declined');
    var body = new URLSearchParams({ code: q.get('code'), grant_type: 'authorization_code', code_verifier: saved.v,
      client_id: dropboxKey(), redirect_uri: redirectUri() });
    return fetch(API + '/oauth2/token', { method: 'POST', body: body }).then(function (r) {
      if (!r.ok) return dbxError(r);
      return r.json();
    }).then(function (j) {
      if (!j.refresh_token) throw new Error('Dropbox gave no lasting sign-in');
      dbx = { refresh: j.refresh_token, access: j.access_token, exp: Date.now() + (j.expires_in || 14400) * 1000 };
      names = {};
      return Promise.all([S.setMeta('backup.dropbox', dbx), S.setMeta('backup', { target: 'dropbox' }), S.setMeta('backup.names', {})]);
    }).then(function () {
      dir = null;
      set({ target: 'dropbox', phase: 'ok', where: 'Dropbox', error: '' });
      return 'connected';
    });
  }

  /* --------------------------------------------------------------- the copy */
  function backend() { return st.target === 'folder' ? folder : st.target === 'dropbox' ? dropbox : null; }

  /* Write each document waiting for a copy, one at a time. A document
     renamed since its last copy is written under the new name, then the old
     file is removed. */
  function flush() {
    if (running) return running;
    var be = backend();
    if (!be || st.phase === 'paused' || st.phase === 'auth') return Promise.resolve();
    var ids = Object.keys(dirty);
    if (!ids.length) return Promise.resolve();
    set({ phase: 'saving' });
    running = (function next() {
      var id = Object.keys(dirty)[0];
      if (!id) return Promise.resolve();
      delete dirty[id];
      return S.record(id).then(function (rec) {
        if (!rec || !rec.json) return;
        var name = fileName(rec), old = names[id];
        return be.write(name, rec.json, rec).then(function () {
          names[id] = name;
          var tail = old && old !== name ? be.remove(old) : null;
          return Promise.all([tail, S.markBackedUp(id, rec.updated), S.setMeta('backup.names', names)]);
        });
      }).then(next, function (e) { dirty[id] = true; throw e; });
    })().then(function () {
      running = null;
      set({ phase: 'ok', last: Date.now(), error: '' });
      if (Object.keys(dirty).length) schedule();
    }, function (e) {
      running = null;
      fail(e);
    });
    return running;
  }
  function fail(e) {
    var name = e && e.name;
    if (st.target === 'folder' && (name === 'NotAllowedError' || name === 'SecurityError')) {
      set({ phase: 'paused', error: 'The browser no longer lets PaperTeX write to the folder.' });
    } else if (st.target === 'folder' && name === 'NotFoundError') {
      set({ phase: 'failed', error: 'The folder “' + st.where + '” is gone — moved, renamed or deleted.' });
    } else if (st.target === 'dropbox' && e && e.auth) {
      set({ phase: 'auth', error: 'Dropbox needs you to sign in again.' });
    } else if (e && e.name === 'TypeError' && !navigator.onLine) {
      set({ phase: 'failed', error: 'You are offline. The copy is written when the connection is back.' });
    } else if (e && e.name === 'QuotaExceededError') {
      set({ phase: 'failed', error: 'The disk is full.' });
    } else {
      set({ phase: 'failed', error: (e && e.message) || 'The copy could not be written.' });
    }
  }
  function schedule(now) {
    clearTimeout(timer);
    timer = setTimeout(function () { timer = null; flush(); }, now ? 0 : DELAY);
  }
  /* after each save of a document to the store */
  function queue(id) {
    if (!st.target || !id) return;
    dirty[id] = true;
    if (st.phase === 'ok' || st.phase === 'saving' || st.phase === 'failed') schedule();
  }
  /* every document whose copy is missing or behind */
  function queueAll(all) {
    return S.list().then(function (docs) {
      docs.forEach(function (d) { if (all || !d.backedUp || d.updated > d.backedUp) dirty[d.id] = true; });
      schedule(true);
    });
  }
  /* Just turned on, against a folder or Dropbox that may already hold
     copies (from another computer, or an earlier time): every document here
     is written, except one whose copy there is newer — that waits for the
     user to restore it (or for their next change to it). */
  function adopt() {
    return listBackup().then(function (es) {
      var hold = {};
      es.forEach(function (e) { if (e.how === 'newer') hold[e.id] = true; });
      return S.list().then(function (docs) {
        docs.forEach(function (d) { if (!hold[d.id]) dirty[d.id] = true; });
        schedule(true);
      });
    }, function (e) { fail(e); });
  }
  /* write what is waiting now (leaving the page, pressing Retry) */
  function now() { clearTimeout(timer); timer = null; return flush(); }

  /* ------------------------------------------------------- turning it on/off */
  function chooseFolder() {
    if (!folderSupported) return Promise.reject(new Error('This browser cannot write to a folder'));
    if (S.kind() !== 'idb') return Promise.reject(new Error('This browser’s storage cannot remember a folder'));
    return window.showDirectoryPicker({ id: 'papertex-backup', mode: 'readwrite', startIn: 'documents' }).then(function (h) {
      return h.requestPermission({ mode: 'readwrite' }).then(function (p) {
        if (p !== 'granted') { var e = new Error('Writing to that folder was not allowed'); e.name = 'NotAllowedError'; throw e; }
        dir = h; dbx = null; names = {};
        return Promise.all([S.setMeta('backup', { target: 'folder' }), S.setMeta('backup.dir', h), S.setMeta('backup.names', {}),
          S.setMeta('backup.dropbox', null)]);
      });
    }).then(function () {
      set({ target: 'folder', phase: 'ok', where: dir.name, error: '' });
      return adopt();
    });
  }
  /* a user's click: ask the browser again (it asks the user) */
  function resume() {
    if (st.target === 'folder') {
      return folderPermission(true).then(function (p) {
        if (p !== 'granted') { set({ phase: 'paused' }); return false; }
        set({ phase: 'ok', error: '' });
        return queueAll(false).then(function () { return true; });
      });
    }
    if (st.target === 'dropbox') {
      if (st.phase === 'auth') return connectDropbox().then(function () { return false; });
      set({ phase: 'ok', error: '' });
      return queueAll(false).then(function () { return true; });
    }
    return Promise.resolve(false);
  }
  function turnOff() {
    var revoke = st.target === 'dropbox' && dbx
      ? token().then(function (t) { return fetch(API + '/2/auth/token/revoke', { method: 'POST', headers: { Authorization: 'Bearer ' + t } }); }).catch(function () { /* forgotten here all the same */ })
      : Promise.resolve();
    clearTimeout(timer);
    dirty = {};
    return revoke.then(function () {
      dir = null; dbx = null; names = {};
      return Promise.all([S.setMeta('backup', null), S.setMeta('backup.dir', null), S.setMeta('backup.dropbox', null), S.setMeta('backup.names', {})]);
    }).then(function () { set({ target: null, phase: 'off', where: '', error: '', last: 0 }); });
  }

  /* On every page load: pick up where it was. A folder's permission may
     have lapsed with the tab (unless the user chose "Allow on every
     visit"); then the backup waits, paused, for one click. */
  function start() {
    /* a return from dropbox.com comes first: it may be switching targets */
    return finishDropbox().catch(function (e) {
      return { error: e };
    }).then(function (got) {
      if (got === 'connected') return adopt().then(function () { return got; });
      return Promise.all([S.getMeta('backup'), S.getMeta('backup.dir'), S.getMeta('backup.dropbox'), S.getMeta('backup.names')]).then(function (r) {
        var cfg = r[0];
        names = r[3] || {};
        if (!cfg || !cfg.target) return got;
        if (cfg.target === 'folder' && r[1] && folderSupported && typeof r[1].queryPermission === 'function') {
          dir = r[1];
          return folderPermission(false).then(function (p) {
            set({ target: 'folder', where: dir.name, phase: p === 'granted' ? 'ok' : 'paused' });
            if (p === 'granted') queueAll(false);
            return got;
          });
        }
        if (cfg.target === 'dropbox' && r[2] && dropboxKey()) {
          dbx = r[2];
          set({ target: 'dropbox', where: 'Dropbox', phase: 'ok' });
          queueAll(false);
          return got;
        }
        /* turned on in a browser that can no longer do it (or the site's
           Dropbox key was removed): say so, rather than seem to back up */
        set({ target: cfg.target, where: cfg.target === 'dropbox' ? 'Dropbox' : 'folder', phase: 'failed',
          error: cfg.target === 'dropbox' ? 'Dropbox backup is no longer offered on this site.' : 'The backup folder can no longer be reached from this browser.' });
        return got;
      });
    }).catch(function () { return null; });
  }
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('online', function () { if (st.phase === 'failed' && st.target) { set({ phase: 'ok' }); schedule(true); } });
  }

  /* ------------------------------------------------------------------ restore
     What the backup holds, one entry per document (the newest copy, where a
     renamed document left two), with how it compares to the copy here. */
  function listBackup() {
    var be = backend();
    if (!be) return Promise.reject(new Error('No backup is turned on'));
    return Promise.all([be.list(), S.list()]).then(function (r) {
      return entries(r[0], r[1]);
    });
  }
  function entries(files, local) {
    var here = {};
    local.forEach(function (d) { here[d.id] = d; });
    return Promise.all(files.map(function (f) {
      return f.meta().then(function (t) { f.modified = t; return f; }, function () { f.modified = 0; return f; });
    })).then(function (fs) {
      var best = {};
      fs.forEach(function (f) { if (!best[f.id] || f.modified > best[f.id].modified) best[f.id] = f; });
      return Promise.all(Object.keys(best).map(function (id) {
        var f = best[id];
        return f.read().then(function (text) {
          var doc = null;
          try { doc = JSON.parse(text); } catch (e) { doc = null; }
          if (!doc || !Array.isArray(doc.blocks)) return null;
          var mine = here[id] || null;
          /* how it compares with the copy here: settled below, against the stored text */
          return { id: id, name: f.name, modified: f.modified, text: text, doc: doc, how: mine ? null : 'missing', local: mine };
        });
      })).then(function (list) {
        list = list.filter(Boolean);
        return Promise.all(list.map(function (e) {
          if (e.how) return e;
          return S.load(e.id).then(function (json) {
            if (json === e.text) e.how = 'same';
            else e.how = e.modified > e.local.updated ? 'newer' : 'older';
            return e;
          });
        }));
      }).then(function (list) {
        return list.sort(function (a, b) { return b.modified - a.modified; });
      });
    });
  }
  /* a .zip of documents, opened with Open: the same entries, from its files */
  function entriesFromZip(files) {
    var list = Object.keys(files).filter(function (k) { return idOf(k.replace(/^.*\//, '')); }).map(function (k) {
      var bytes = files[k];
      return { name: k.replace(/^.*\//, ''), id: idOf(k.replace(/^.*\//, '')),
        meta: function () {
          /* the time the zip was made is no guide; the stored one is */
          return Promise.resolve(0);
        },
        read: function () { return Promise.resolve(new TextDecoder().decode(bytes)); } };
    });
    return S.list().then(function (local) { return entries(list, local); }).then(function (es) {
      /* without dates, a copy that differs is simply "different" */
      es.forEach(function (e) { if (e.how === 'older' || e.how === 'newer') e.how = 'different'; });
      return es;
    });
  }
  function isDocZip(files) {
    var keys = Object.keys(files).filter(function (k) { return !/\/$/.test(k) && !/(^|\/)(__MACOSX|\.DS_Store)/.test(k); });
    return keys.length > 0 && keys.every(function (k) { return idOf(k.replace(/^.*\//, '')); });
  }

  /* -------------------------------------------------------------------- .zip
     Every document in one file, for browsers with no folder access and as a
     copy to keep anywhere. Stored, not compressed: the parts are small text
     and photos that are compressed already. */
  var CRC = null;
  function crc32(d) {
    if (!CRC) {
      CRC = new Uint32Array(256);
      for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; }
    }
    var x = 0xffffffff;
    for (var i = 0; i < d.length; i++) x = CRC[(x ^ d[i]) & 255] ^ (x >>> 8);
    return (x ^ 0xffffffff) >>> 0;
  }
  function zip(files) {          /* [{ name, data: Uint8Array, time }] → Blob */
    var parts = [], central = [], offset = 0, enc = new TextEncoder();
    function le(n, bytes) { var a = []; for (var i = 0; i < bytes; i++) { a.push(n & 255); n = Math.floor(n / 256); } return a; }
    files.forEach(function (f) {
      var name = enc.encode(f.name), dt = new Date(f.time || Date.now());
      var time = (dt.getHours() << 11) | (dt.getMinutes() << 5) | (dt.getSeconds() >> 1);
      var date = ((Math.max(1980, dt.getFullYear()) - 1980) << 9) | ((dt.getMonth() + 1) << 5) | dt.getDate();
      var crc = crc32(f.data), size = f.data.length;
      /* version 20, flag 0x0800: the name is UTF-8 */
      var common = [].concat(le(20, 2), le(0x0800, 2), le(0, 2), le(time, 2), le(date, 2), le(crc, 4), le(size, 4), le(size, 4), le(name.length, 2), le(0, 2));
      var local = new Uint8Array([].concat(le(0x04034b50, 4), common));
      parts.push(local, name, f.data);
      central.push(new Uint8Array([].concat(le(0x02014b50, 4), le(20, 2), common, le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(offset, 4))), name);
      offset += local.length + name.length + size;
    });
    var csize = central.reduce(function (s, p) { return s + p.length; }, 0);
    var end = new Uint8Array([].concat(le(0x06054b50, 4), le(0, 2), le(0, 2), le(files.length, 2), le(files.length, 2), le(csize, 4), le(offset, 4), le(0, 2)));
    return new Blob(parts.concat(central, [end]), { type: 'application/zip' });
  }
  /* → { blob, ids: [[id, updated]…], count } */
  function zipAll() {
    var enc = new TextEncoder();
    return S.list().then(function (docs) {
      return Promise.all(docs.map(function (d) { return S.record(d.id); }));
    }).then(function (recs) {
      recs = recs.filter(function (r) { return r && r.json; });
      var used = {};
      var files = recs.map(function (r) {
        var n = fileName(r);
        while (used[n]) n = n.replace(/ \[/, '_ [');
        used[n] = true;
        return { name: n, data: enc.encode(r.json), time: r.updated };
      });
      return { blob: zip(files), versions: recs.map(function (r) { return [r.id, r.updated]; }), count: recs.length };
    });
  }

  window.PT = window.PT || {};
  window.PT.backup = {
    folderSupported: function () { return folderSupported; },
    dropboxOffered: function () { return !!dropboxKey(); },
    status: status,
    onChange: function (fn) { listeners.push(fn); },
    start: start,
    chooseFolder: chooseFolder,
    connectDropbox: connectDropbox,
    resume: resume,
    turnOff: turnOff,
    queue: queue,
    now: now,
    retry: function () { if (st.target) { set({ phase: 'ok', error: '' }); return queueAll(false).then(now); } return Promise.resolve(); },
    pending: function () { return Object.keys(dirty).length > 0 || !!running; },
    list: listBackup,
    entriesFromZip: entriesFromZip,
    isDocZip: isDocZip,
    zipAll: zipAll,
    fileName: fileName
  };
})();
