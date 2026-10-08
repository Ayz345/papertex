/* PaperTeX — keyboard shortcuts.

   Everything a key can do is an action in one registry: document commands,
   text formatting, block insertion, every symbol and structure in the
   palette, and LaTeX snippets of your own. Each action has default keys; the
   user's changes are stored on top of those (only the differences), in
   localStorage, so they survive restarts in the browser and in the desktop
   app alike. One capture-phase listener dispatches every binding, so a
   custom key wins over whatever the formula or text editor would have done
   with it. */
(function () {
  'use strict';

  var STORE = 'papertex.keys.v1';
  var IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || '');

  var actions = [], byId = {}, index = {};
  var user = { bind: {}, snippets: [] };
  var cfg = { toast: function () {}, runSnippet: function () { return false; } };
  var listeners = [];
  var editor = null;          /* the open shortcuts dialog, if any */
  var recording = null;       /* {id, done} while a new key is being captured */

  function h(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }

  /* ----------------------------------------------------------- persistence */
  var storageOk = true;
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (s && typeof s === 'object') {
        user.bind = s.bind && typeof s.bind === 'object' ? s.bind : {};
        user.snippets = Array.isArray(s.snippets) ? s.snippets : [];
      }
    } catch (e) { storageOk = false; }
  }
  function persist() {
    try { localStorage.setItem(STORE, JSON.stringify({ v: 1, bind: user.bind, snippets: user.snippets })); }
    catch (e) { storageOk = false; }
  }

  /* --------------------------------------------------------------- combos
     A combo is written "Ctrl+Shift+K". Ctrl stands for ⌘ on a Mac. Letters
     and digits are named by their physical key, so Shift and keyboard layout
     do not change what a shortcut is called; other keys by what they type. */
  function keyName(e) {
    var c = e.code || '', k = e.key || '', m;
    if ((m = /^Key([A-Z])$/.exec(c))) return m[1];
    if ((m = /^Digit([0-9])$/.exec(c))) return m[1];
    if ((m = /^Numpad([0-9])$/.exec(c))) return 'Num' + m[1];
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(k)) return k;
    var named = { ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Escape: 'Esc' };
    if (named[k]) return named[k];
    if (/^(Enter|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown)$/.test(k)) return k;
    if (k.length === 1) return k.toUpperCase();
    return null;   /* a modifier on its own, a dead key, an unknown key */
  }
  function comboOf(e) {
    var k = keyName(e);
    if (!k) return null;
    var p = [];
    if (e.ctrlKey || e.metaKey) p.push('Ctrl');
    if (e.altKey) p.push('Alt');
    if (e.shiftKey) p.push('Shift');
    p.push(k);
    return p.join('+');
  }
  function splitCombo(c) {
    var parts = String(c).split('+');
    var key = parts.pop();
    if (key === '' && parts[parts.length - 1] === '') { parts.pop(); key = '+'; }
    return { mods: parts, key: key };
  }
  /* what the user sees */
  function pretty(c) {
    if (!c) return '';
    var s = splitCombo(c);
    var names = IS_MAC ? { Ctrl: '⌘', Alt: '⌥', Shift: '⇧' } : { Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift' };
    var keys = { Up: '↑', Down: '↓', Left: '←', Right: '→', Enter: IS_MAC ? '↩' : 'Enter' };
    var out = s.mods.map(function (m) { return names[m] || m; });
    out.push(keys[s.key] || s.key);
    return out.join(IS_MAC ? '' : '+');
  }
  /* Only keys that cannot be typed: a shortcut needs Ctrl or Alt, unless it
     is a function key. Escape is left alone — everything uses it to back out. */
  function validity(c) {
    var s = splitCombo(c);
    if (s.key === 'Esc') return 'Esc is kept for leaving formulas and closing menus.';
    if (/^F\d+$/.test(s.key)) return '';
    if (s.mods.indexOf('Ctrl') < 0 && s.mods.indexOf('Alt') < 0) return 'Add Ctrl or Alt — on its own that key types text. (F1–F12 work alone.)';
    return '';
  }
  /* Keys the system or editor already gives a meaning to: allowed, but worth
     a word before they are taken over. */
  var RESERVED = {
    'Ctrl+C': 'Copy', 'Ctrl+X': 'Cut', 'Ctrl+V': 'Paste', 'Ctrl+A': 'Select all',
    'Ctrl+=': 'Zoom in', 'Ctrl+-': 'Zoom out', 'Ctrl+0': 'Reset zoom', 'Ctrl+F': 'Find',
    'Ctrl+W': 'Close the window', 'Ctrl+Q': 'Quit', 'Ctrl+T': 'New tab'
  };

  /* -------------------------------------------------------------- registry */
  function bindingsOf(id) {
    var a = byId[id];
    if (!a) return [];
    return (user.bind.hasOwnProperty(id) ? user.bind[id] : a.keys || []).slice();
  }
  function isCustom(id) { return user.bind.hasOwnProperty(id); }
  function rebuild() {
    index = {};
    actions.forEach(function (a) {
      bindingsOf(a.id).forEach(function (c) { if (!index[c]) index[c] = a.id; });
    });
  }
  function changed() {
    rebuild();
    persist();
    listeners.forEach(function (fn) { try { fn(); } catch (e) { /* a listener must not break the rest */ } });
  }
  function setBindings(id, list) {
    var a = byId[id];
    if (!a) return;
    var uniq = [];
    list.forEach(function (c) { if (c && uniq.indexOf(c) < 0) uniq.push(c); });
    var def = (a.keys || []).slice();
    if (uniq.length === def.length && uniq.every(function (c, i) { return c === def[i]; })) delete user.bind[id];
    else user.bind[id] = uniq;
  }
  /* bind a combo to an action, taking it away from whatever had it */
  function assign(id, combo) {
    var owner = ownerOf(combo);
    if (owner && owner !== id) setBindings(owner, bindingsOf(owner).filter(function (c) { return c !== combo; }));
    var mine = bindingsOf(id);
    if (mine.indexOf(combo) < 0) mine.push(combo);
    setBindings(id, mine);
    changed();
  }
  function unassign(id, combo) {
    setBindings(id, bindingsOf(id).filter(function (c) { return c !== combo; }));
    changed();
  }
  function resetOne(id) { delete user.bind[id]; changed(); }
  function resetAll() { user.bind = {}; changed(); }
  function ownerOf(combo) {
    for (var i = 0; i < actions.length; i++) if (bindingsOf(actions[i].id).indexOf(combo) >= 0) return actions[i].id;
    return null;
  }

  function addAction(a) {
    if (byId[a.id]) { actions.splice(actions.indexOf(byId[a.id]), 1); }
    actions.push(a);
    byId[a.id] = a;
  }

  /* Snippets are actions too: the user's own LaTeX, inserted into the
     formula under the caret (or a new inline formula in running text). */
  function snippetAction(s) {
    return {
      id: 'snip.' + s.id, group: 'My snippets', label: s.tex, tex: s.tex, snippet: true, keys: [],
      run: function () { return cfg.runSnippet(s.tex); }
    };
  }
  function addSnippet(tex) {
    tex = String(tex || '').trim();
    if (!tex) return null;
    var s = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), tex: tex };
    user.snippets.push(s);
    addAction(snippetAction(s));
    changed();
    return 'snip.' + s.id;
  }
  function removeSnippet(id) {
    var sid = id.replace(/^snip\./, '');
    user.snippets = user.snippets.filter(function (s) { return s.id !== sid; });
    delete user.bind[id];
    var a = byId[id];
    if (a) { actions.splice(actions.indexOf(a), 1); delete byId[id]; }
    changed();
  }

  /* -------------------------------------------------------------- dispatch */
  function inFormField(t) {
    /* not the text box a formula keeps the focus in: undo there is the
       document's */
    return t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !(t.classList && t.classList.contains('mf-proxy'));
  }
  function onKeyDown(e) {
    if (recording || editor) return;                /* the shortcuts dialog has the keyboard */
    if (PT.palette && PT.palette.isOpen()) return;  /* so does the command palette */
    if (document.querySelector('.dlg-back')) return; /* an in-page confirm/prompt is open */
    if (document.querySelector('.studio:not(.closing)')) return;   /* so is the chart or table editor */
    if (e.isComposing) return;
    /* AltGr+key types a character (@ \ { } on many layouts), never a shortcut */
    if (e.getModifierState && e.getModifierState('AltGraph')) return;
    var c = comboOf(e);
    if (!c) return;
    var id = index[c];
    if (!id) return;
    var a = byId[id];
    /* inside a settings field, undo and the like belong to the field */
    if (inFormField(e.target) && a.fieldsNative) return;
    var r;
    try { r = a.run(e); } catch (err) { console.error(err); }
    if (r === false) return;                      /* not applicable here: let the key through */
    e.preventDefault();
    e.stopPropagation();
  }

  /* --------------------------------------------------- the shortcuts dialog */
  function matches(a, q) {
    if (!q) return true;
    var hay = (a.label + ' ' + (a.group || '') + ' ' + (a.tex || '') + ' ' + (a.detail || '') + ' ' +
      bindingsOf(a.id).map(pretty).join(' ')).toLowerCase();
    return q.toLowerCase().split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
  }

  function open(focusId) {
    if (editor) return;
    var back = h('div', 'kb-back');
    var box = h('div', 'kb');
    back.appendChild(box);

    var head = h('div', 'kb-head');
    head.appendChild(h('div', 'kb-t', 'Keyboard shortcuts'));
    var search = h('input', 'kb-search');
    search.type = 'search';
    search.placeholder = 'Search actions, symbols or keys…';
    head.appendChild(search);
    var x = h('button', 'kb-x', '×');
    x.title = 'Close (Esc)';
    head.appendChild(x);
    box.appendChild(head);

    box.appendChild(h('div', 'kb-sub', 'Click + beside an action and press the keys you want. A shortcut needs ' +
      (IS_MAC ? '⌘ or ⌥' : 'Ctrl or Alt') + ', or can be a function key on its own. ' +
      (storageOk ? 'Your shortcuts are saved ' + (window.papertexNative ? 'on this computer' : 'in this browser') + ' and kept between sessions.'
                 : 'This page cannot store anything, so changes last only until it is closed.')));

    var body = h('div', 'kb-body');
    box.appendChild(body);

    var foot = h('div', 'kb-foot');
    var resetAllBtn = h('button', 'dlg-btn', 'Reset all to defaults');
    var count = h('span', 'kb-count');
    var done = h('button', 'dlg-btn primary', 'Done');
    foot.appendChild(resetAllBtn); foot.appendChild(count); foot.appendChild(done);
    box.appendChild(foot);

    document.body.appendChild(back);
    editor = { back: back, render: render };

    function close() {
      stopRecording();
      back.remove();
      document.removeEventListener('keydown', escClose, true);
      editor = null;
    }
    function escClose(e) {
      if (recording) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    }
    document.addEventListener('keydown', escClose, true);
    x.onclick = close;
    done.onclick = close;
    back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
    resetAllBtn.onclick = function () {
      var n = Object.keys(user.bind).length;
      if (!n) { cfg.toast('Every shortcut is already at its default.'); return; }
      resetAll();
      render();
      cfg.toast('All shortcuts are back to their defaults. Snippets are kept.');
    };
    search.oninput = function () { render(); };

    function render() {
      var keepScroll = body.scrollTop;
      body.textContent = '';
      var q = search.value.trim();
      var groups = [], seen = {};
      actions.forEach(function (a) {
        if (!seen[a.group]) { seen[a.group] = []; groups.push(a.group); }
        seen[a.group].push(a);
      });
      if (groups.indexOf('My snippets') < 0) { groups.push('My snippets'); seen['My snippets'] = []; }
      var shown = 0, formShown = false;
      groups.forEach(function (g) {
        var list = seen[g].filter(function (a) { return matches(a, q); });
        var isSnip = g === 'My snippets';
        /* the add-a-snippet form shows unless the search is clearly about something else */
        var snipForm = isSnip && (!q || /^(my\s*)?(snip|latex|macro)/i.test(q) || list.length);
        if (!list.length && !snipForm) return;
        var sec = h('div', 'kb-sec');
        sec.appendChild(h('div', 'kb-h', g));
        list.forEach(function (a) { sec.appendChild(row(a)); shown++; });
        if (snipForm) { sec.appendChild(snippetForm()); formShown = true; }
        body.appendChild(sec);
      });
      if (!shown && !formShown && q) body.appendChild(h('div', 'kb-empty', 'Nothing matches “' + q + '”.'));
      var n = Object.keys(user.bind).length;
      count.textContent = n ? n + ' changed from the defaults' : 'All defaults';
      body.scrollTop = keepScroll;
    }

    function row(a) {
      var r = h('div', 'kb-row' + (isCustom(a.id) ? ' custom' : ''));
      r.dataset.id = a.id;
      var g = h('span', 'kb-glyph');
      if (a.snippet && PT.math) {
        try { PT.math.renderStatic(g, PT.math.parseTex(a.tex)); } catch (e) { g.textContent = '…'; }
      } else if (a.glyphHTML) g.innerHTML = a.glyphHTML;
      else if (a.glyph) g.textContent = a.glyph;
      r.appendChild(g);
      var lab = h('span', 'kb-l');
      if (a.snippet) lab.appendChild(h('code', 'kb-tex', a.tex));
      else lab.appendChild(document.createTextNode(a.label));
      if (a.detail) lab.appendChild(h('small', '', a.detail));
      r.appendChild(lab);

      var keys = h('span', 'kb-keys');
      bindingsOf(a.id).forEach(function (c) {
        var chip = h('span', 'kb-chip');
        chip.appendChild(h('kbd', '', pretty(c)));
        var rm = h('button', 'kb-rm', '×');
        rm.title = 'Remove ' + pretty(c);
        rm.onclick = function () { unassign(a.id, c); render(); };
        chip.appendChild(rm);
        keys.appendChild(chip);
      });
      if (recording && recording.id === a.id) {
        var rec = h('span', 'kb-rec', 'Press keys…');
        keys.appendChild(rec);
        recording.el = rec;
      } else {
        var add = h('button', 'kb-add', '+');
        add.title = 'Add a shortcut';
        add.onclick = function () { startRecording(a.id); };
        keys.appendChild(add);
      }
      if (isCustom(a.id) && !a.snippet) {
        var rs = h('button', 'kb-reset', '↺');
        rs.title = 'Back to the default' + ((a.keys || []).length ? ' (' + a.keys.map(pretty).join(', ') + ')' : ' (none)');
        rs.onclick = function () { resetOne(a.id); render(); };
        keys.appendChild(rs);
      }
      if (a.snippet) {
        var del = h('button', 'kb-del', 'Delete');
        del.title = 'Delete this snippet';
        del.onclick = function () { removeSnippet(a.id); render(); };
        keys.appendChild(del);
      }
      r.appendChild(keys);
      if (recording && recording.id === a.id && recording.note) r.appendChild(recording.note);
      return r;
    }

    function snippetForm() {
      var f = h('div', 'kb-snipform');
      var inp = h('input', 'kb-snipin');
      inp.type = 'text';
      inp.placeholder = 'LaTeX to insert, e.g.  \\mathbb{R}   \\frac{d}{dx}   \\int_{0}^{\\infty}';
      inp.spellcheck = false;
      var prev = h('span', 'kb-glyph kb-snipprev');
      var add = h('button', 'dlg-btn', 'Add snippet');
      inp.oninput = function () {
        prev.textContent = '';
        if (inp.value.trim() && PT.math) { try { PT.math.renderStatic(prev, PT.math.parseTex(inp.value)); } catch (e) { /* half-typed */ } }
      };
      function go() {
        var id = addSnippet(inp.value);
        if (!id) { inp.focus(); return; }
        search.value = '';
        startRecording(id);
      }
      add.onclick = go;
      inp.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } };
      f.appendChild(prev); f.appendChild(inp); f.appendChild(add);
      f.appendChild(h('div', 'kb-sniphint', 'An empty {} becomes a slot: the caret lands in the first one, so \\frac{}{} or x^{} work as templates.'));
      return f;
    }

    function startRecording(id) {
      stopRecording();
      recording = { id: id, el: null, note: null };
      document.addEventListener('keydown', onRecordKey, true);
      document.addEventListener('click', onRecordClick, true);
      render();
      var r = body.querySelector('.kb-row[data-id="' + cssEsc(id) + '"]');
      if (r) r.scrollIntoView({ block: 'nearest' });
    }
    function stopRecording() {
      if (!recording) return;
      recording = null;
      document.removeEventListener('keydown', onRecordKey, true);
      document.removeEventListener('click', onRecordClick, true);
    }
    /* A click anywhere else gives up on the recording; the click itself still
       goes through, so pressing + on another row starts recording there. */
    function onRecordClick(e) {
      if (e.target.closest && e.target.closest('.kb-note')) return;
      stopRecording();
      setTimeout(function () { if (!recording && editor) render(); }, 0);
    }
    function note(text, buttons) {
      var n = h('div', 'kb-note');
      n.appendChild(h('span', '', text));
      (buttons || []).forEach(function (b) {
        var bt = h('button', b.primary ? 'dlg-btn primary' : 'dlg-btn', b.label);
        bt.onclick = b.fn;
        n.appendChild(bt);
      });
      return n;
    }
    function onRecordKey(e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) { stopRecording(); render(); return; }
      var c = comboOf(e);
      if (!c) {
        /* modifiers so far: show them as they are held */
        var held = [];
        if (e.ctrlKey || e.metaKey) held.push(IS_MAC ? '⌘' : 'Ctrl');
        if (e.altKey) held.push(IS_MAC ? '⌥' : 'Alt');
        if (e.shiftKey) held.push(IS_MAC ? '⇧' : 'Shift');
        if (recording.el) recording.el.textContent = held.length ? held.join('+') + '+…' : 'Press keys…';
        return;
      }
      var id = recording.id, bad = validity(c);
      if (bad) {
        recording.note = note(pretty(c) + ' can’t be used. ' + bad);
        render();
        return;
      }
      if (bindingsOf(id).indexOf(c) >= 0) { stopRecording(); render(); return; }
      var owner = ownerOf(c);
      if (owner && owner !== id) {
        recording.note = note(pretty(c) + ' is already “' + byId[owner].label + '”.', [
          { label: 'Use it here instead', primary: true, fn: function () { stopRecording(); assign(id, c); render(); } },
          { label: 'Cancel', fn: function () { stopRecording(); render(); } }
        ]);
        render();
        return;
      }
      stopRecording();
      assign(id, c);
      render();
      if (RESERVED[c]) cfg.toast(pretty(c) + ' normally means ' + RESERVED[c] + ' — in PaperTeX it now runs this instead.');
    }

    render();
    if (focusId) startRecording(focusId);
    else search.focus();
  }
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'); }

  /* ------------------------------------------------------------------ api */
  function init(opts) {
    cfg.toast = opts.toast || cfg.toast;
    cfg.runSnippet = opts.runSnippet || cfg.runSnippet;
    (opts.actions || []).forEach(addAction);
    user.snippets.forEach(function (s) { addAction(snippetAction(s)); });
    /* drop stored bindings for actions that no longer exist */
    Object.keys(user.bind).forEach(function (id) { if (!byId[id]) delete user.bind[id]; });
    rebuild();
    listeners.forEach(function (fn) { fn(); });
  }

  load();
  window.addEventListener('keydown', onKeyDown, true);

  window.PT = window.PT || {};
  window.PT.keys = {
    init: init,
    open: open,
    isOpen: function () { return !!editor; },
    /* every registered action — the command palette searches these */
    list: function () { return actions.slice(); },
    bindingsOf: bindingsOf,
    first: function (id) { var b = bindingsOf(id); return b.length ? pretty(b[0]) : ''; },
    pretty: pretty,
    onChange: function (fn) { listeners.push(fn); },
    /* for the desktop menu: its items, by menu name, and their first key */
    menuKeys: function () {
      var m = {};
      actions.forEach(function (a) { if (a.menu) m[a.menu] = bindingsOf(a.id)[0] || ''; });
      return m;
    }
  };
})();
