/* PaperTeX — the command palette: one searchable list of everything.

   Opened with Ctrl+K anywhere, or by typing \ in running text, it searches
   the same registry the keyboard shortcuts use (js/keys.js) — every
   command, block, symbol, structure, template and snippet — so it is never
   out of date, and it shows each item's key as it goes, which is how
   people learn the shortcuts.

   It remembers where you were: the formula or the paragraph and the caret
   in it. Choosing an item puts the caret back and then runs the item
   there, so a symbol lands in the formula you were typing and a block goes
   in after the paragraph you were in. What fits where you are is listed
   first: maths in a formula, blocks and formatting in text. */
(function () {
  'use strict';

  var RECENT = 'papertex.palette.recent';
  var pal = null;

  function h(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function recent() { try { return JSON.parse(localStorage.getItem(RECENT) || '[]'); } catch (e) { return []; } }
  function remember(id) {
    var r = recent().filter(function (x) { return x !== id; });
    r.unshift(id);
    try { localStorage.setItem(RECENT, JSON.stringify(r.slice(0, 8))); } catch (e) { /* per-session only */ }
  }

  /* where the caret is, so it can be put back */
  function captureContext() {
    var ae = document.activeElement, ctx = { kind: 'none', el: null, range: null };
    if (!ae) return ctx;
    var mf = ae.classList && ae.classList.contains('mf-proxy') && ae.__mf ? ae.__mf.host   /* typing on a touch keyboard */
      : ae.closest && ae.closest('.mfield');
    if (mf && mf.__mf) { ctx.kind = 'math'; ctx.el = mf; return ctx; }
    if (ae.isContentEditable) {
      var host = ae.closest('[contenteditable="true"]');
      var sel = window.getSelection();
      ctx.kind = host && host.__rich ? 'text' : 'plain';
      ctx.el = host;
      if (sel.rangeCount) ctx.range = sel.getRangeAt(0).cloneRange();
    }
    return ctx;
  }
  function restoreContext(ctx) {
    if (!ctx.el || !document.body.contains(ctx.el)) return;
    ctx.el.focus();
    if (ctx.range) {
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(ctx.range);
    }
  }

  /* which groups suit where the caret is: lower is earlier */
  function groupRank(group, kind) {
    var maths = /^Maths/.test(group), snip = group === 'My snippets';
    var order = kind === 'math'
      ? [maths || snip, group === 'Document', group === 'New document', group === 'Insert block']
      : kind === 'text'
        ? [group === 'Insert block', group === 'Text', maths || snip, group === 'Document', group === 'New document']
        : [group === 'Document', group === 'New document', group === 'Insert block', maths || snip];
    var i = order.indexOf(true);
    return i < 0 ? order.length : i;
  }
  /* formatting needs a paragraph to format */
  function applicable(a, kind) { return a.group !== 'Text' || kind === 'text'; }

  function score(a, q) {
    if (!q) return 1;
    var label = String(a.label || '').toLowerCase(), tex = String(a.tex || '').toLowerCase();
    var id = String(a.id || '').toLowerCase().replace(/^[a-z]+\./, '');
    var hay = label + ' ' + tex + ' ' + id + ' ' + String(a.group || '').toLowerCase() + ' ' + String(a.detail || '').toLowerCase() +
      ' ' + String(a.words || '').toLowerCase();
    /* starting a new document is found by its own name only ("article",
       "new"), never by the words describing the template — "refer" must not
       offer to replace the document with the sample article */
    if (a.group === 'New document') hay = label;
    var words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.every(function (w) { return hay.indexOf(w) >= 0; })) return 0;
    var w = words[0], s = 10;
    if (label === w || tex === '\\' + w || id === w) s = 100;
    else if (label.indexOf(w) === 0 || tex.indexOf('\\' + w) === 0 || id.indexOf(w) === 0) s = 80;
    else if (new RegExp('(^|[\\s\\-—(])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(label)) s = 60;
    else if (label.indexOf(w) >= 0) s = 40;
    /* the whole word beats the start of a longer one: "reference" is a
       reference before it is "References" */
    if (s > 10 && label.split(/[^a-z0-9]+/).indexOf(w) >= 0) s += 5;
    return s;
  }

  function open(opts) {
    opts = opts || {};
    if (pal) close();
    if (!PT.keys || !PT.keys.list) return;
    var ctx = captureContext();

    var back = h('div', 'cp-back');
    var box = h('div', 'cp');
    var input = h('input', 'cp-in');
    input.type = 'text';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Search commands, blocks and symbols');
    input.placeholder = ctx.kind === 'math' ? 'Search symbols and structures…' :
      ctx.kind === 'text' ? 'Insert a block, a symbol, formatting…' : 'Search every command…';
    var listEl = h('div', 'cp-list');
    listEl.setAttribute('role', 'listbox');
    var foot = h('div', 'cp-foot', '↑↓ to move · Enter to insert · Esc to close' +
      (opts.fromBackslash ? ' · \\ again types a backslash' : ''));
    box.appendChild(input); box.appendChild(listEl); box.appendChild(foot);
    back.appendChild(box);
    document.body.appendChild(back);

    /* beside the caret when there is one, else near the top of the page */
    var at = opts.anchor || (ctx.range && ctx.range.getBoundingClientRect());
    if (at && (at.top || at.left)) {
      box.style.left = Math.max(12, Math.min(window.innerWidth - 452, at.left - 16)) + 'px';
      box.style.top = (at.bottom + 8 + 360 < window.innerHeight ? at.bottom + 8 : Math.max(12, at.top - 368)) + 'px';
    } else {
      box.classList.add('centred');
    }

    var items = [], sel = 0;
    function render() {
      var q = input.value.trim(), rec = recent();
      items = PT.keys.list().filter(function (a) { return applicable(a, ctx.kind); }).map(function (a) {
        var s = score(a, q);
        if (!s) return null;
        var r = rec.indexOf(a.id);
        return { a: a, s: s + (r >= 0 ? (q ? 8 : 200) - r : 0), g: groupRank(a.group, ctx.kind) };
      }).filter(Boolean).sort(function (x, y) {
        return (y.s - x.s) || (x.g - y.g);
      }).slice(0, q ? 60 : 120);
      listEl.textContent = '';
      sel = Math.min(sel, Math.max(0, items.length - 1));
      if (!items.length) {
        listEl.appendChild(h('div', 'cp-none', /^[A-Za-z]+\{/.test(q) && opts.fromBackslash
          ? 'Finish with } to write \\' + q.replace(/\}?$/, '}') + ' into the text.'
          : 'Nothing matches “' + q + '”.'));
      }
      var lastGroup = null;
      items.forEach(function (it, i) {
        var a = it.a;
        /* without a query the list is browsed, so show where each part begins */
        if (!q) {
          var g = rec.indexOf(a.id) >= 0 ? 'Recently used' : a.group;
          if (g !== lastGroup) { listEl.appendChild(h('div', 'cp-g', g)); lastGroup = g; }
        }
        var row = h('div', 'cp-row' + (i === sel ? ' on' : ''));
        row.setAttribute('role', 'option');
        var gl = h('span', 'cp-glyph');
        if (a.glyphHTML) gl.innerHTML = a.glyphHTML; else gl.textContent = a.glyph || '';
        row.appendChild(gl);
        var lab = h('span', 'cp-l');
        lab.appendChild(document.createTextNode(a.label));
        if (q) lab.appendChild(h('small', '', a.group));
        else if (a.detail) lab.appendChild(h('small', '', a.detail));
        row.appendChild(lab);
        var k = PT.keys.first(a.id);
        if (k) row.appendChild(h('kbd', 'cp-k', k));
        /* the pointer marks a row without scrolling the list (scrolling it
           under the pointer moved the row away between press and release,
           and the click went nowhere), and the press itself chooses */
        row.onmousemove = function () { if (sel !== i) { sel = i; mark(true); } };
        row.onmousedown = function (e) { e.preventDefault(); if (e.button === 0) choose(i); };
        listEl.appendChild(row);
      });
      mark();
    }
    function mark(byMouse) {
      [].forEach.call(listEl.querySelectorAll('.cp-row'), function (r, i) { r.classList.toggle('on', i === sel); });
      var on = listEl.querySelectorAll('.cp-row')[sel];
      if (on && !byMouse) on.scrollIntoView({ block: 'nearest' });
    }
    function choose(i) {
      var it = items[i];
      if (!it) return;
      close();
      remember(it.a.id);
      /* the caret back where it was (focus is immediate, and the field
         redraws on it), then the command at once — a timer here would let
         the next keys run into the text before a box the command opens is
         there (and a tab in the background runs timers late) */
      restoreContext(ctx);
      try { it.a.run(); } catch (e) { console.error(e); }
    }

    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
      else if (e.key === 'PageDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 8); mark(); }
      else if (e.key === 'PageUp') { e.preventDefault(); sel = Math.max(0, sel - 8); mark(); }
      else if (e.key === 'Enter') { e.preventDefault(); choose(sel); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); restoreContext(ctx); }
      else if (e.key === '\\' && opts.fromBackslash && !input.value) {
        /* \ twice: the backslash itself was wanted */
        e.preventDefault(); close(); restoreContext(ctx);
        document.execCommand('insertText', false, '\\');
      }
      e.stopPropagation();   /* typing here is not a shortcut */
    });
    input.addEventListener('input', function () {
      /* LaTeX typed on after "\": \cite{key}, \emph{words} … go into the
         text as typed, where they turn into what they write (doc.js
         texCommand) */
      if (opts.fromBackslash && ctx.kind === 'text' && /^[A-Za-z]+\{[^{}]*\}$/.test(input.value)) {
        var typed = '\\' + input.value;
        close(); restoreContext(ctx);
        document.execCommand('insertText', false, typed);
        return;
      }
      sel = 0; render();
    });
    back.addEventListener('mousedown', function (e) {
      if (e.target === back) { e.preventDefault(); close(); restoreContext(ctx); }
    });

    pal = { back: back };
    render();
    input.focus();
  }

  function close() {
    if (!pal) return;
    pal.back.remove();
    pal = null;
  }

  window.PT = window.PT || {};
  window.PT.palette = { open: open, close: close, isOpen: function () { return !!pal; } };
})();
