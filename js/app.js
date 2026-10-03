/* PaperTeX — application shell: palettes, panels, storage, export. */
(function () {
  'use strict';
  var M = PT.math, D = PT.doc, L = PT.latex;

  var state = {
    doc: null, editor: null, zoom: 1,
    undo: [], redo: [], lastSnap: '', snapTimer: null,
    lastRich: null, tex: ''
  };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  function h(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }

  /* -------------------------------------------------------------- persistence */
  var KEY = 'papertex.doc.v1';
  function serialize(doc) {
    return JSON.stringify(doc, function (k, v) { return k.slice(0, 2) === '__' ? undefined : v; });
  }
  function save() {
    try { localStorage.setItem(KEY, serialize(state.doc)); } catch (e) { /* quota: embedded figures are large */ }
  }
  function load() {
    try {
      var s = localStorage.getItem(KEY);
      if (!s) return null;
      var d = JSON.parse(s);
      if (!d.blocks || !d.blocks.length) return null;
      return d;
    } catch (e) { return null; }
  }

  /* -------------------------------------------------------------------- undo */
  function snapshot() {
    var s = serialize(state.doc);
    if (s === state.lastSnap) return;
    state.undo.push(state.lastSnap || s);
    if (state.undo.length > 80) state.undo.shift();
    state.lastSnap = s;
    state.redo.length = 0;
    updateUndoBtns();
  }
  function scheduleSnap() {
    clearTimeout(state.snapTimer);
    state.snapTimer = setTimeout(snapshot, 700);
  }
  /* snapshot() skips a document that has not changed since the last one, which
     is wrong when the document is about to be thrown away wholesale — New and
     Open must always leave something to come back to. */
  function pushUndo() {
    clearTimeout(state.snapTimer);
    state.undo.push(serialize(state.doc));
    if (state.undo.length > 80) state.undo.shift();
    state.redo.length = 0;
    updateUndoBtns();
  }
  function restore(json) {
    state.doc = JSON.parse(json);
    state.lastSnap = json;
    state.editor.doc = state.doc;
    applyPaperVars();
    state.editor.render();
    buildSettings();
    refresh();
    updateUndoBtns();
  }
  function doUndo() {
    /* an edit made less than a moment ago is still waiting for its snapshot;
       take it now, or that edit could never be undone */
    clearTimeout(state.snapTimer);
    snapshot();
    if (!state.undo.length) return;
    state.redo.push(serialize(state.doc));
    restore(state.undo.pop());
  }
  function doRedo() {
    if (!state.redo.length) return;
    state.undo.push(serialize(state.doc));
    restore(state.redo.pop());
  }
  function updateUndoBtns() {
    var u = $('#btnUndo'), r = $('#btnRedo');
    if (u) u.disabled = !state.undo.length;
    if (r) r.disabled = !state.redo.length;
  }

  /* ------------------------------------------------------------- LaTeX pane */
  var texTimer = null;
  function refresh() {
    clearTimeout(texTimer);
    texTimer = setTimeout(function () {
      var tex = L.build(state.doc);
      state.tex = tex;
      var pane = $('#texout');
      if (pane) pane.innerHTML = highlight(tex);
      var st = $('#texstat');
      if (st) st.textContent = tex.split('\n').length + ' lines · ' + tex.length.toLocaleString() + ' characters';
      updateOutline();
      pageGuides();
    }, 120);
  }
  function highlight(t) {
    return t
      .replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; })
      .replace(/^(%.*)$/gm, '<i class="c">$1</i>')
      .replace(/(\\(?:begin|end))(\{)([a-zA-Z*]+)(\})/g, '<b class="e">$1</b>$2<u class="n">$3</u>$4')
      .replace(/(\\[a-zA-Z@]+\*?)/g, '<b class="k">$1</b>')
      .replace(/([{}[\]])/g, '<span class="b">$1</span>');
  }

  function updateOutline() {
    var box = $('#outline');
    if (!box) return;
    box.textContent = '';
    D.numbering(state.doc);
    state.doc.blocks.forEach(function (b) {
      if (b.t !== 'section') return;
      var e = h('button', 'ol-item lvl' + b.level);
      e.textContent = (b.__num ? b.__num + '  ' : '') + (D.stripTags(b.html) || '(untitled)');
      e.onclick = function () {
        var el = $('[data-bid="' + b.id + '"]');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
      box.appendChild(e);
    });
    if (!box.children.length) box.appendChild(h('div', 'ol-empty', 'No sections yet.'));
  }

  /* -------------------------------------------------------------- page guides */
  function pageGuides() {
    var paper = $('#paper'), layer = $('#guides');
    if (!paper || !layer) return;
    layer.textContent = '';
    var cs = getComputedStyle(paper);
    var padT = parseFloat(cs.paddingTop) || 0;
    var padB = parseFloat(cs.paddingBottom) || 0;
    var pageH = parseFloat(cs.getPropertyValue('--ph-px')) || 0;
    if (!pageH) return;
    var usable = pageH - padT - padB;
    if (usable < 100) return;
    /* the layer is a sibling of the sheet, so park it exactly over it */
    layer.style.left = paper.offsetLeft + 'px';
    layer.style.top = paper.offsetTop + 'px';
    layer.style.width = paper.offsetWidth + 'px';
    layer.style.height = paper.offsetHeight + 'px';
    var total = paper.scrollHeight;
    for (var n = 1; padT + usable * n < total - 24 && n < 80; n++) {
      var g = h('div', 'guide');
      g.style.top = (padT + usable * n) + 'px';
      g.appendChild(h('span', '', 'page ' + (n + 1)));
      layer.appendChild(g);
    }
  }

  /* ------------------------------------------------------------- symbol panel */
  function buildPalette() {
    var tabs = $('#ptabs'), body = $('#pbody');
    tabs.textContent = ''; body.textContent = '';
    var groups = [{ name: 'Blocks', blocks: true }].concat(PT.symbols.groups);

    groups.forEach(function (g, gi) {
      var t = h('button', 'ptab', g.name);
      t.onclick = function () {
        $$('.ptab').forEach(function (x) { x.classList.remove('on'); });
        $$('.pgrid').forEach(function (x) { x.classList.remove('on'); });
        t.classList.add('on');
        $('#pg' + gi).classList.add('on');
      };
      tabs.appendChild(t);

      var grid = h('div', 'pgrid' + (g.blocks ? ' blocks' : ''));
      grid.id = 'pg' + gi;
      if (g.blocks) {
        D.MENU.forEach(function (mg) {
          grid.appendChild(h('div', 'pgh', mg.g));
          var rowbox = h('div', 'pgrow');
          mg.items.forEach(function (it) {
            var b = h('button', 'pbtn wide');
            b.innerHTML = '<span class="pico">' + esc(it[2]) + '</span><span class="plab">' + esc(it[1]) + '</span>';
            b.title = it[3];
            b.dataset.act = 'block.' + it[0];
            b.onmousedown = function (e) { e.preventDefault(); };
            b.onclick = function () { insertBlockHere(it[0]); };
            rowbox.appendChild(b);
          });
          grid.appendChild(rowbox);
        });
      } else {
        g.items.forEach(function (it) {
          var b = h('button', 'pbtn');
          b.innerHTML = it.build ? it.d : '<span class="psym">' + esc(it.d) + '</span>';
          b.title = it.build ? it.label : it.tex;
          b.dataset.act = 'math.' + (it.build || it.tex);
          b.onmousedown = function (e) { e.preventDefault(); };
          b.onclick = function () { insertSymbol(it); };
          grid.appendChild(b);
        });
      }
      body.appendChild(grid);
      if (gi === 1) { t.classList.add('on'); grid.classList.add('on'); }
    });
  }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  function activeMathField() {
    var ae = document.activeElement;
    if (ae && ae.classList && ae.classList.contains('mfield') && ae.__mf) return ae.__mf;
    var f = state.editor.activeField;
    if (f && document.body.contains(f.host) && $('.mathpop')) return f;
    return null;
  }

  function insertSymbol(item) {
    var f = activeMathField();
    if (f) { f.insertSymbol(item); return; }
    var rich = state.lastRich;
    if (rich && document.body.contains(rich)) {
      rich.focus();
      state.editor.insertInlineMath(rich, function () { state.editor.change(); });
      setTimeout(function () {
        var nf = state.editor.activeField;
        if (nf) nf.insertSymbol(item);
      }, 0);
      return;
    }
    toast('Click into a formula or a paragraph first, then pick a symbol.');
  }

  function currentBlockIndex() {
    var el = document.activeElement;
    var host = el && el.closest ? el.closest('[data-bid]') : null;
    if (!host) host = state.lastRich && state.lastRich.closest ? state.lastRich.closest('[data-bid]') : null;
    var at = state.doc.blocks.length;
    if (host) state.doc.blocks.forEach(function (b, i) { if (b.id === host.dataset.bid) at = i + 1; });
    return at;
  }
  function insertBlockHere(kind) { state.editor.insertBlock(kind, currentBlockIndex()); }

  /* --------------------------------------------------------- format toolbar */
  function buildSelTools() {
    var bar = $('#seltools');
    function mk(label, title, fn, cls) {
      var b = h('button', cls || '', label);
      b.title = title;
      b.onmousedown = function (e) { e.preventDefault(); };
      b.onclick = fn;
      bar.appendChild(b);
      return b;
    }
    mk('B', 'Bold (Ctrl+B)', function () { exec('bold'); }, 'f-b');
    mk('I', 'Italic (Ctrl+I)', function () { exec('italic'); }, 'f-i');
    mk('U', 'Underline (Ctrl+U)', function () { exec('underline'); }, 'f-u');
    mk('S', 'Strikethrough', function () { exec('strikeThrough'); }, 'f-s');
    mk('</>', 'Monospace', function () { wrapSel('code'); }, 'f-c');
    mk('x²', 'Superscript', function () { exec('superscript'); });
    mk('x₂', 'Subscript', function () { exec('subscript'); });
    bar.appendChild(h('span', 'fsep'));
    mk('∑', 'Make this a formula (Ctrl+M)', function () { selToMath(); }, 'f-m');
    mk('🔗', 'Link', function () {
      /* the dialog takes focus, so hold on to the selection and put it back */
      var sel = window.getSelection();
      var saved = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      if (!saved) return;
      dialog({ title: 'Link', input: '', placeholder: 'https://…', okLabel: 'Add link' })
        .then(function (u) {
          if (!u) return;
          u = u.trim();
          if (!/^[a-z][a-z0-9+.-]*:/i.test(u) && !/^#/.test(u)) u = (/@/.test(u) && !/\//.test(u) ? 'mailto:' : 'https://') + u;
          if (!PT.sanitize.href(u)) { toast('Only web addresses (https://…) and email links can be linked.'); return; }
          var s = window.getSelection();
          s.removeAllRanges();
          s.addRange(saved);
          exec('createLink', u);
        });
    });
    mk('↪', 'Cross-reference or citation', function (e) { refMenu(e.currentTarget); });
  }
  function exec(cmd, val) {
    document.execCommand(cmd, false, val || null);
    var n = window.getSelection().focusNode;
    if (n) fireInput(n.nodeType === 3 ? n.parentElement : n);
  }
  function wrapSel(tag) {
    var s = window.getSelection();
    if (!s.rangeCount || s.isCollapsed) return;
    var r = s.getRangeAt(0);
    var el = document.createElement(tag);
    try { r.surroundContents(el); }
    catch (e) { el.appendChild(r.extractContents()); r.insertNode(el); }
    fireInput(el);
  }
  function fireInput(node) {
    var host = node && node.closest ? node.closest('[contenteditable="true"]') : null;
    if (host) host.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function selToMath() {
    var s = window.getSelection();
    if (!s.rangeCount) return;
    var host = s.getRangeAt(0).commonAncestorContainer;
    if (host.nodeType === 3) host = host.parentElement;
    host = host && host.closest ? host.closest('[contenteditable="true"]') : null;
    if (!host || !$('#paper').contains(host)) return;
    var text = s.toString();
    var span = document.createElement('span');
    span.className = 'imath';
    span.contentEditable = 'false';
    var tree = text ? M.parseTex(text) : M.row();
    span.dataset.m = JSON.stringify(tree);
    var r = s.getRangeAt(0);
    r.deleteContents();
    r.insertNode(span);
    M.renderStatic(span, tree);
    fireInput(span);
    state.editor.editInlineMath(span, host, function () { fireInput(span); });
  }

  function refMenu(anchor) {
    D.closeAllPop();
    var labels = D.numbering(state.doc);
    var m = h('div', 'popmenu small');
    var any = false;
    m.appendChild(h('div', 'popg', 'Reference'));
    state.doc.blocks.forEach(function (b) {
      if (!b.label) return;
      any = true;
      var kind = b.t === 'eq' ? 'eqref' : 'ref';
      var it = h('button', 'popitem');
      it.appendChild(h('span', 'poptx', b.label + '  →  ' + (kind === 'eqref' ? '(' + labels[b.label] + ')' : labels[b.label])));
      it.onmousedown = function (e) { e.preventDefault(); };
      it.onclick = function () { D.closeAllPop(); putXref(kind, b.label, labels); };
      m.appendChild(it);
    });
    if (state.doc.bib.length) {
      m.appendChild(h('div', 'popg', 'Citations'));
      state.doc.bib.forEach(function (e) {
        var it2 = h('button', 'popitem');
        it2.appendChild(h('span', 'poptx', e.key + (e.title ? ' — ' + e.title.slice(0, 28) : '')));
        it2.onmousedown = function (ev) { ev.preventDefault(); };
        it2.onclick = function () { D.closeAllPop(); putXref('cite', e.key, labels); };
        m.appendChild(it2);
      });
      any = true;
    }
    if (!any) m.appendChild(h('div', 'popnone', 'Nothing to point at yet — give a heading, equation or figure a label with the ⋮ button.'));
    document.body.appendChild(m);
    var r = anchor.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 10, r.left + window.scrollX - 40)) + 'px';
    m.style.top = (r.bottom + window.scrollY + 6) + 'px';
    setTimeout(function () {
      document.addEventListener('mousedown', function off(ev) {
        if (m.contains(ev.target)) return;
        D.closeAllPop();
        document.removeEventListener('mousedown', off, true);
      }, true);
    }, 0);
  }
  function putXref(kind, label, labels) {
    var span = document.createElement('span');
    span.className = 'xref';
    span.contentEditable = 'false';
    span.dataset.kind = kind;
    span.dataset.label = label;
    var v = labels[label];
    span.textContent = kind === 'eqref' ? '(' + v + ')' : (kind === 'cite' ? '[' + v + ']' : v);
    if (state.lastRich) state.lastRich.focus();
    D.insertNodeAtCaret(span);
    fireInput(span);
  }

  /* ------------------------------------------------------------- settings UI */
  function buildSettings() {
    var box = $('#settings');
    if (!box) return;
    box.textContent = '';
    var S = state.doc.settings, meta = state.doc.meta;

    function group(t) { box.appendChild(h('div', 'sg', t)); }
    function field(label, node) {
      var w = h('label', 'sf');
      w.appendChild(h('span', 'sfl', label));
      w.appendChild(node);
      box.appendChild(w);
      return node;
    }
    function sel(val, opts, fn) {
      var s = h('select');
      opts.forEach(function (o) {
        var v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o;
        var e = h('option', '', t);
        e.value = v;
        if (String(v) === String(val)) e.selected = true;
        s.appendChild(e);
      });
      s.onchange = function () { fn(s.value); };
      return s;
    }
    function chk(val, fn) {
      var c = h('input');
      c.type = 'checkbox';
      c.checked = !!val;
      c.onchange = function () { fn(c.checked); };
      return c;
    }
    function apply() {
      state.editor.change(true);
      applyPaperVars();
      state.editor.render();
      refresh();
    }

    group('Document class');
    field('Class', sel(S.docclass, ['article', 'report', 'book'], function (v) { S.docclass = v; apply(); }));
    field('Base font', sel(S.fontsize, ['10pt', '11pt', '12pt'], function (v) { S.fontsize = v; apply(); }));
    field('Paper', sel(S.paper, [['a4paper', 'A4'], ['letterpaper', 'US Letter'], ['a5paper', 'A5']], function (v) { S.paper = v; apply(); }));
    field('Columns', sel(S.columns, [[1, 'One column'], [2, 'Two columns']], function (v) { S.columns = parseInt(v, 10); apply(); }));
    field('Margin', sel(S.margin, ['2cm', '2.5cm', '3cm', '3.5cm', '1in', '1.25in'], function (v) { S.margin = v; apply(); }));
    field('Line spacing', sel(S.lineSpacing, [[1, 'Single'], [1.25, 'One and a quarter'], [1.5, 'One and a half'], [2, 'Double']], function (v) { S.lineSpacing = parseFloat(v); apply(); }));
    field('Language', sel(S.lang, ['english', 'ngerman', 'french', 'spanish', 'italian', 'turkish', 'portuguese'], function (v) { S.lang = v; apply(); }));

    group('Front matter');
    field('Number sections', chk(S.numbered, function (v) { S.numbered = v; apply(); }));
    field('Show abstract', chk(S.showAbstract, function (v) { S.showAbstract = v; apply(); }));
    field('Separate title page', chk(S.titlepage, function (v) { S.titlepage = v; apply(); }));

    group('Formulas');
    field('Recognise typed names', chk(S.autoMath !== false, function (v) {
      S.autoMath = v;
      M.setAutoWords(v);
      state.editor.change(true);
    }));
    box.appendChild(h('div', 'shint', 'Type “int”, “sum”, “alpha”, “sqrt”, “->” and they become what they name. A digit after a letter becomes a subscript, so “x1” gives x₁. Backspace right after undoes one.'));
    var kw = h('input');
    kw.type = 'text';
    kw.value = meta.keywords || '';
    kw.placeholder = 'comma, separated';
    kw.oninput = function () { meta.keywords = kw.value; state.editor.change(); refresh(); };
    field('Keywords', kw);
    var dt = h('input');
    dt.type = 'text';
    dt.value = meta.date;
    dt.placeholder = '\\today';
    dt.oninput = function () { meta.date = dt.value; state.editor.change(); refresh(); };
    field('Date', dt);

    group('View');
    var zw = h('div', 'sfz');
    var z = h('input');
    z.type = 'range'; z.min = '60'; z.max = '160'; z.value = String(Math.round(state.zoom * 100));
    var zl = h('span', 'sfv', Math.round(state.zoom * 100) + '%');
    z.oninput = function () {
      state.zoom = parseInt(z.value, 10) / 100;
      applyPaperVars();
      zl.textContent = z.value + '%';
      state.editor.render();
      pageGuides();
    };
    zw.appendChild(z); zw.appendChild(zl);
    field('Zoom', zw);

    group('Keyboard');
    var kb = h('button', 'sbtn', 'Customize shortcuts…');
    kb.onclick = function () { K.open(); };
    box.appendChild(kb);
    box.appendChild(h('div', 'shint', 'Give any command, block, symbol or LaTeX snippet a key of your own. ' +
      'Shortcuts are kept between sessions, separately from the document.'));
  }

  var PAPER = { a4paper: [21, 29.7], letterpaper: [21.59, 27.94], a5paper: [14.8, 21] };
  var PAGESIZE = { a4paper: 'A4', letterpaper: 'Letter', a5paper: 'A5' };
  function applyPaperVars() {
    var S = state.doc.settings;
    var dims = PAPER[S.paper] || PAPER.a4paper;
    var px = 37.8 * state.zoom;
    var mm = parseMargin(S.margin);
    var paper = $('#paper');
    paper.style.setProperty('--pw', (dims[0] * px) + 'px');
    paper.style.setProperty('--ph-px', (dims[1] * px) + 'px');
    paper.style.setProperty('--pm', (mm * px) + 'px');
    /* now that the page sets in real Computer Modern, use the true
       point-to-pixel conversion so 11pt on screen is 11pt on paper */
    paper.style.setProperty('--fs', (parseFloat(S.fontsize) * (96 / 72) * state.zoom) + 'px');
    paper.style.setProperty('--ls', String(S.lineSpacing || 1));
    paper.style.setProperty('--print-pad', S.margin);
  }
  function parseMargin(m) {
    var v = parseFloat(m);
    if (/in/.test(m)) return v * 2.54;
    if (/mm/.test(m)) return v / 10;
    return v;
  }

  /* ------------------------------------------------------------------ export */
  /* Two worlds: opened as a file or served locally, an anchor downloads
     directly; inside the claude.ai viewer, the page must ask the host to
     save, and the host only accepts certain extensions. */
  var dlNS, dlAsked = false;
  function downloadsNS() {
    if (dlAsked) return Promise.resolve(dlNS);
    dlAsked = true;
    try {
      if (typeof claude === 'undefined' || !claude.use) return Promise.resolve(null);
      return claude.use('downloads').then(function (ns) { dlNS = ns; return ns; },
        function () { dlNS = null; return null; });
    } catch (e) { return Promise.resolve(null); }
  }
  function anchorSave(name, data, mime) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 300);
    return Promise.resolve('anchor');
  }
  var NATIVE = window.papertexNative || null;

  function download(name, data, mime, opts) {
    opts = opts || {};
    /* On the desktop this is a real Save dialog writing a real file, with no
       extension allowlist to work around. */
    if (NATIVE) {
      var payload = data instanceof Blob
        ? data.arrayBuffer().then(function (b) { return new Uint8Array(b); })
        : Promise.resolve(data);
      return payload.then(function (d) { return NATIVE.save(name, d); })
        .then(function (r) { return r.status === 'saved' ? 'saved' : 'declined'; });
    }
    return downloadsNS().then(function (ns) {
      if (!ns) return anchorSave(name, data, mime);
      return ns.save({ filename: name, data: data }).then(
        function () { return 'saved'; },
        function (err) {
          var code = err && err.code;
          if (code === 'declined') return 'declined';
          if (code === 'rejected_extension' || code === 'extension_not_enabled') {
            if (opts.noTextFallback) return 'rejected';
            /* .tex is not on this host's allowlist — hand it over as text */
            return ns.save({ filename: name + '.txt', data: data }).then(function () {
              return 'renamed';
            }, function () { return 'declined'; });
          }
          if (code === 'too_large') { toast('That file is too large for the browser to save here.'); return 'failed'; }
          return anchorSave(name, data, mime);
        });
    });
  }

  /* ------------------------------------------------------------------- print */
  /* A sandboxed page cannot open a print dialog: the call is ignored and
     returns at once, where a real dialog blocks. Fall back to handing over a
     self-contained copy that prints itself when opened. */
  function printDoc() {
    var t0 = performance.now();
    try { window.print(); } catch (e) { /* ignored below */ }
    if (performance.now() - t0 >= 30) return;          /* a dialog really opened */

    /* a separate window is not sandboxed the same way, so try that next */
    var w = null;
    try { w = window.open('', '_blank'); } catch (e) { w = null; }
    if (w && w.document) {
      w.document.open();
      w.document.write(printableHTML(false));
      w.document.close();
      try {
        (w.document.fonts ? w.document.fonts.ready : Promise.resolve())
          .then(function () { setTimeout(function () { w.print(); }, 250); });
      } catch (e) { /* the tab is open; printing from it still works */ }
      toast('Opened a printable copy in a new tab — choose “Save as PDF” there.');
      return;
    }

    downloadsNS().then(function (ns) {
      if (!ns) { toast('Your browser would not open the print dialog.'); return; }
      dialog({
        title: 'Printing is blocked here',
        body: 'This viewer will not let an embedded page open a print dialog. ' +
              'Download a printable copy instead — opening it brings up the print ' +
              'dialog, where you can choose “Save as PDF”.',
        okLabel: 'Download printable copy'
      }).then(function (yes) {
        if (!yes) return;
        download(docName() + '-print.html', printableHTML(), 'text/html', { noTextFallback: true })
          .then(function (r) {
            if (r === 'rejected') {
              toast('This viewer will not save HTML either. Open papertex.html on your own computer — printing works normally there.');
            }
          });
      });
    });
  }

  /* The page as a standalone document: styles and fonts inlined, editing
     furniture stripped, and it opens its own print dialog. */
  function printableHTML(selfPrinting) {
    var css = '';
    [].forEach.call(document.styleSheets, function (ss) {
      try {
        [].forEach.call(ss.cssRules, function (r) { css += r.cssText + '\n'; });
      } catch (e) { /* a sheet we may not read */ }
    });

    var paper = $('#paper').cloneNode(true);
    ['.gutter', '.pt-tailadd', '.pt-addauth', '.pt-xauth', '.pt-figctl', '.pt-tabctl',
      '.pt-codebar', '.pt-rawl', '.pt-bibx', '.pt-bibkey', '.mcaret', '.pt-drop']
      .forEach(function (sel) {
        [].forEach.call(paper.querySelectorAll(sel), function (e) { e.remove(); });
      });
    [].forEach.call(paper.querySelectorAll('[contenteditable]'), function (e) {
      e.removeAttribute('contenteditable');
    });
    [].forEach.call(paper.querySelectorAll('[data-ph]'), function (e) {
      e.removeAttribute('data-ph');
    });
    /* print at the document's real size, not the on-screen zoom */
    paper.style.removeProperty('--pw');
    paper.style.setProperty('--fs', parseFloat(state.doc.settings.fontsize) * (96 / 72) + 'px');

    var title = D.stripTags(state.doc.meta.title) || 'Document';
    /* the margin comes from the document, so from whoever wrote the file:
       only a plain length goes into the stylesheet */
    var margin = /^\d+(\.\d+)?(cm|mm|in|pt)$/.test(state.doc.settings.margin) ? state.doc.settings.margin : '2.5cm';
    return '<!DOCTYPE html>\n<html><head><meta charset="utf-8">\n<title>' +
      title.replace(/[<&]/g, '') + '</title>\n<style>\n' + css + '\n</style>\n' +
      '<style>\n' +
      '  body { background:#fff; margin:0; overflow:visible; }\n' +
      '  .paper { margin:0 auto; box-shadow:none; width:auto; max-width:none;\n' +
      '           padding:' + margin + ' !important; }\n' +
      '  /* a zero page margin leaves the browser no room to draw its\n' +
      '     URL-and-date header, so the sheet prints clean */\n' +
      '  @page { size:' + (PAGESIZE[state.doc.settings.paper] || 'A4') + '; margin:0; }\n' +
      '</style>\n</head>\n<body>\n' + paper.outerHTML + '\n' +
      /* A downloaded copy prints itself when opened. A copy written into a
         new tab does not carry a script: that tab inherits this page's
         Content-Security-Policy, so this page asks it to print instead. */
      (selfPrinting === false ? '' :
        '<script>\n' +
        '  (document.fonts ? document.fonts.ready : Promise.resolve())\n' +
        '    .then(function(){ setTimeout(function(){ window.print(); }, 250); });\n' +
        '<\/script>\n') +
      '</body></html>\n';
  }
  function dataURLToBytes(u) {
    var parts = String(u).split(','), bin = atob(parts[1]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }
  function dataURLToBlob(u) {
    var parts = String(u).split(','), m = /:(.*?);/.exec(parts[0]);
    var bin = atob(parts[1]), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: m ? m[1] : 'application/octet-stream' });
  }
  function docName() {
    return (D.stripTags(state.doc.meta.title) || 'document')
      .replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'document';
  }
  function exportTex() {
    var figs = state.doc.blocks.filter(function (b) { return b.t === 'figure' && b.src; });
    /* One dialog, one folder: the .tex and its images land together, so
       \includegraphics resolves without the user shepherding each download. */
    if (NATIVE) {
      NATIVE.exportProject(docName() + '.tex', L.build(state.doc), figs.map(function (b, i) {
        return { name: b.filename || ('figure' + (i + 1) + '.png'), data: dataURLToBytes(b.src) };
      })).then(function (r) {
        if (r.status !== 'saved') return;
        toast(r.count
          ? 'Saved the .tex and ' + r.count + ' image file' + (r.count > 1 ? 's' : '') + ' beside it.'
          : 'Saved ' + docName() + '.tex');
      });
      return;
    }
    download(docName() + '.tex', L.build(state.doc), 'application/x-tex').then(function (r) {
      if (r === 'declined' || r === 'failed') return;
      if (r === 'renamed') {
        toast('This viewer only saves a short list of file types, so it arrived as ' +
          docName() + '.tex.txt — delete the .txt and it is your LaTeX source. ' +
          'The downloadable papertex.html saves a real .tex.');
      } else if (!figs.length) {
        toast('Saved ' + docName() + '.tex');
      } else {
        toast('Saved the .tex — now the ' + figs.length + ' image file' +
          (figs.length > 1 ? 's' : '') + '. Keep them in the same folder as the .tex.');
      }
      if (!figs.length) return;
      /* one save prompt at a time, so chain rather than fire them together */
      figs.reduce(function (chain, b, i) {
        return chain.then(function () {
          return download(b.filename || ('figure' + (i + 1) + '.png'), dataURLToBlob(b.src));
        });
      }, Promise.resolve());
    });
  }
  /* ------------------------------------------------------- compile to PDF */
  function compilePDF() {
    var box = $('#pdfview');
    var body = $('#pdfbody');
    var stat = $('#pdfstat');
    box.classList.add('on');
    body.innerHTML = '';
    body.appendChild(h('div', 'pdf-wait', 'Starting the LaTeX engine…'));
    stat.textContent = '';
    var waitEl = body.firstChild;
    var t0 = performance.now();

    PT.compile.run(L.build(state.doc), state.doc, function (stage, detail) {
      if (waitEl.isConnected) waitEl.textContent = detail || stage || 'Working…';
    }).then(function (r) {
      var secs = ((performance.now() - t0) / 1000).toFixed(1);
      body.innerHTML = '';
      if (r.error) {
        var err = h('div', 'pdf-err');
        err.appendChild(h('div', 'pdf-errh', 'LaTeX could not typeset this document'));
        err.appendChild(h('pre', 'pdf-errm', r.error));
        err.appendChild(h('div', 'pdf-errn',
          'The .tex itself is still valid — Export .tex and compile it anywhere. ' +
          'A missing .sty usually means the package is outside the engine’s bundled set.'));
        body.appendChild(err);
        stat.textContent = 'failed after ' + secs + ' s';
        return;
      }
      var blob = new Blob([r.pdf], { type: 'application/pdf' });
      lastPdf = { blob: blob, url: URL.createObjectURL(blob) };
      var frame = h('iframe', 'pdf-frame');
      frame.src = lastPdf.url;
      frame.title = 'Compiled PDF';
      body.appendChild(frame);
      stat.textContent = (r.pdf.length / 1024).toFixed(0) + ' kB · typeset in ' + secs + ' s';
      $('#pdfsave').disabled = false;
    }, function (e) {
      body.innerHTML = '';
      var msg = String(e && e.message || e);
      var err = h('div', 'pdf-err');
      if (msg === 'file-origin') {
        err.appendChild(h('div', 'pdf-errh', 'Opened from disk — compiling needs it served'));
        err.appendChild(h('div', 'pdf-errn',
          'The compiler runs in a Web Worker, and browsers refuse to start one on a ' +
          'page opened with file://. Everything else on this page works from disk; ' +
          'only Compile needs an address.'));
        var cmd = h('pre', 'pdf-errm', 'cd "' + 'the folder holding papertex.html' + '"\npython -m http.server 8777');
        err.appendChild(cmd);
        err.appendChild(h('div', 'pdf-errn',
          'then open http://localhost:8777/papertex.html — or just double-click ' +
          'start-papertex.cmd, which does both. A published site is served over ' +
          'https, so this never comes up there.'));
      } else if (msg === 'no-engine') {
        err.appendChild(h('div', 'pdf-errh', 'The LaTeX engine is not available here'));
        err.appendChild(h('div', 'pdf-errn',
          'This copy cannot reach engine/siglum.js — the published preview is sandboxed ' +
          'and blocks it. Open papertex.html from the folder that contains engine/, ' +
          'where compiling works. Copy LaTeX and Export .tex work everywhere.'));
      } else {
        err.appendChild(h('div', 'pdf-errh', 'The engine could not start'));
        err.appendChild(h('pre', 'pdf-errm', msg));
      }
      body.appendChild(err);
      stat.textContent = '';
    });
  }

  var lastPdf = null;
  function closePdf() {
    $('#pdfview').classList.remove('on');
    $('#pdfbody').innerHTML = '';
    $('#pdfsave').disabled = true;
    if (lastPdf) { URL.revokeObjectURL(lastPdf.url); lastPdf = null; }
  }

  function copyTex() {
    var t = L.build(state.doc);
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = t;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      toast('LaTeX copied to the clipboard.');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { toast('LaTeX copied to the clipboard.'); }, fallback);
    } else fallback();
  }

  /* Native confirm() and prompt() are suppressed in a sandboxed page — they
     return false immediately without showing anything — so ask in the page. */
  function dialog(opts) {
    return new Promise(function (resolve) {
      var back = h('div', 'dlg-back');
      var box = h('div', 'dlg');
      box.appendChild(h('div', 'dlg-t', opts.title));
      if (opts.body) box.appendChild(h('div', 'dlg-b', opts.body));
      var input = null;
      if (opts.input != null) {
        input = h('input', 'dlg-i');
        input.type = 'text';
        input.value = opts.input;
        if (opts.placeholder) input.placeholder = opts.placeholder;
        box.appendChild(input);
      }
      var row = h('div', 'dlg-r');
      var cancel = h('button', 'dlg-btn', opts.cancelLabel || 'Cancel');
      var ok = h('button', 'dlg-btn primary', opts.okLabel || 'OK');
      row.appendChild(cancel);
      row.appendChild(ok);
      box.appendChild(row);
      back.appendChild(box);
      document.body.appendChild(back);

      function close(v) {
        back.remove();
        document.removeEventListener('keydown', onKey, true);
        resolve(v);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(input ? input.value : true); }
      }
      document.addEventListener('keydown', onKey, true);
      cancel.onclick = function () { close(null); };
      ok.onclick = function () { close(input ? input.value : true); };
      back.onclick = function (e) { if (e.target === back) close(null); };
      (input || ok).focus();
      if (input) input.select();
    });
  }

  /* --------------------------------------------------------- keyboard shortcuts
     Every command, block and palette entry is registered with PT.keys, which
     stores the user's own bindings and dispatches them. */
  var K = PT.keys;

  /* the paragraph-like editable the caret is in, if any */
  function richHost() {
    var ae = document.activeElement;
    if (!ae || !ae.isContentEditable || ae.closest('.mfield')) return null;
    var host = ae.closest('[contenteditable="true"]');
    return host && host.__rich && $('#paper').contains(host) ? host : null;
  }
  function textCmd(cmd) {
    return function () {
      var host = richHost();
      if (!host) return false;
      document.execCommand(cmd);
      return true;
    };
  }

  /* A snippet: parse the LaTeX and drop it in at the caret, into the formula
     being edited or, in running text, into a new inline formula. */
  function insertTexSnippet(tex) {
    var nodes;
    try { nodes = M.parseTex(tex).k; } catch (e) { toast('That snippet is not LaTeX PaperTeX can read.'); return true; }
    var f = activeMathField();
    if (f) { f.insertNodes(nodes); return true; }
    var rich = richHost() || (state.lastRich && document.body.contains(state.lastRich) ? state.lastRich : null);
    if (rich) {
      rich.focus();
      state.editor.insertInlineMath(rich, function () { fireInput(rich); });
      setTimeout(function () {
        var nf = state.editor.activeField;
        if (nf) nf.insertNodes(M.parseTex(tex).k);
      }, 0);
      return true;
    }
    toast('Click into a formula or a paragraph first.');
    return true;
  }

  function setupKeys(openProject) {
    var desk = !!NATIVE;
    var acts = [];
    function add(group, id, label, keys, run, extra) {
      var a = { group: group, id: id, label: label, keys: keys || [], run: run };
      if (extra) Object.keys(extra).forEach(function (k) { a[k] = extra[k]; });
      acts.push(a);
    }
    var click = function (sel) { return function () { $(sel).click(); }; };

    /* Browsers keep Ctrl+N, Ctrl+O and the like for themselves, so those
       defaults are only given in the desktop app. */
    add('Document', 'edit.undo', 'Undo', ['Ctrl+Z'], doUndo, { menu: 'undo', fieldsNative: true, glyph: '↶' });
    add('Document', 'edit.redo', 'Redo', ['Ctrl+Y', 'Ctrl+Shift+Z'], doRedo, { menu: 'redo', fieldsNative: true, glyph: '↷' });
    add('Document', 'doc.export', 'Export .tex', ['Ctrl+S'], exportTex, { menu: 'export', glyph: '⤓' });
    add('Document', 'doc.save', 'Save project', ['Ctrl+Shift+S'], click('#btnSave'), { menu: 'save', glyph: '💾' });
    add('Document', 'doc.open', 'Open project', desk ? ['Ctrl+O'] : [], openProject, { menu: 'open', glyph: '📂' });
    add('Document', 'doc.new', 'New document', desk ? ['Ctrl+N'] : [], click('#btnNew'), { menu: 'new', glyph: '＋' });
    add('Document', 'doc.compile', 'Compile PDF', desk ? ['Ctrl+R'] : [], compilePDF, { menu: 'compile', glyph: '▶' });
    add('Document', 'doc.print', 'Print / PDF', desk ? ['Ctrl+P'] : [], printDoc, { menu: 'print', glyph: '⎙' });
    add('Document', 'doc.copy', 'Copy LaTeX', [], copyTex, { glyph: '⧉' });
    add('Document', 'view.palette', 'Show or hide the symbol palette', [], click('#btnPal'), { glyph: '▤' });
    add('Document', 'view.panel', 'Show or hide the LaTeX panel', [], click('#btnPanel'), { glyph: '▥' });
    add('Document', 'view.help', 'Tips and shortcuts', [], function () { $('#help').classList.add('on'); }, { menu: 'help', glyph: '?' });
    add('Document', 'view.keys', 'Customize keyboard shortcuts', [], function () { K.open(); }, { menu: 'keys', glyph: '⌨' });

    add('Text', 'text.bold', 'Bold', ['Ctrl+B'], textCmd('bold'), { glyphHTML: '<b>B</b>' });
    add('Text', 'text.italic', 'Italic', ['Ctrl+I'], textCmd('italic'), { glyphHTML: '<i>I</i>' });
    add('Text', 'text.underline', 'Underline', ['Ctrl+U'], textCmd('underline'), { glyphHTML: '<u>U</u>' });
    add('Text', 'text.math', 'Inline formula', ['Ctrl+M'], function () {
      var host = richHost();
      if (!host) return false;
      state.editor.insertInlineMath(host, function () { fireInput(host); });
      return true;
    }, { glyph: '$', detail: 'also: type $' });

    D.MENU.forEach(function (mg) {
      mg.items.forEach(function (it) {
        add('Insert block', 'block.' + it[0], it[1], it[0] === 'eq' ? ['Ctrl+Enter'] : [],
          function () { insertBlockHere(it[0]); }, { glyph: it[2], detail: it[3] });
      });
    });

    PT.symbols.groups.forEach(function (g) {
      g.items.forEach(function (it) {
        var id = 'math.' + (it.build || it.tex);
        var label = it.build ? (it.label || it.build).replace(/\s{2,}.*$/, '') : it.tex;
        add('Maths — ' + g.name, id, label, [], function () { insertSymbol(it); },
          it.build ? { glyphHTML: it.d } : { glyph: it.d, tex: it.tex });
      });
    });

    K.init({ actions: acts, toast: toast, runSnippet: insertTexSnippet });
    K.onChange(showKeys);
    showKeys();
  }

  /* Wherever a key is mentioned — button tooltips, the palette, the tips,
     the desktop menu — show the one actually bound now. */
  var TITLED = {
    btnUndo: 'edit.undo', btnRedo: 'edit.redo', btnTex: 'doc.export', btnSave: 'doc.save',
    btnOpen: 'doc.open', btnNew: 'doc.new', btnCompile: 'doc.compile', btnPrint: 'doc.print',
    btnCopy: 'doc.copy', btnPal: 'view.palette', btnPanel: 'view.panel', btnHelp: 'view.help'
  };
  function showKeys() {
    Object.keys(TITLED).forEach(function (bid) {
      var b = document.getElementById(bid);
      if (!b) return;
      if (b.dataset.title == null) b.dataset.title = (b.title || '').replace(/\s*\((Ctrl|⌘)[^)]*\)\s*$/, '');
      var k = K.first(TITLED[bid]);
      b.title = b.dataset.title + (k ? ' (' + k + ')' : '');
    });
    $$('.pbtn[data-act]').forEach(function (b) {
      if (b.dataset.title == null) b.dataset.title = b.title;
      var k = K.first(b.dataset.act);
      b.title = b.dataset.title + (k ? '  —  ' + k : '');
    });
    $$('[data-key]').forEach(function (e) {
      var k = K.first(e.dataset.key);
      e.textContent = k || 'unbound';
      e.classList.toggle('unbound', !k);
    });
    if (NATIVE && NATIVE.setShortcuts) NATIVE.setShortcuts(K.menuKeys());
  }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(t.__t);
    t.__t = setTimeout(function () { t.classList.remove('on'); }, 3600);
  }

  /* -------------------------------------------------------------------- boot */
  function boot() {
    state.doc = load() || D.newDoc();
    state.lastSnap = serialize(state.doc);

    state.editor = new D.Editor($('#paper'), state.doc, {
      onChange: function (structural) {
        if (structural) snapshot(); else scheduleSnap();
        save();
        refresh();
      },
      onRendered: function () { pageGuides(); },
      onImage: function (b) {
        toast('Image added as ' + b.filename + ' — Export .tex sends the file with it.');
      },
      onFieldFocus: function (f) { state.editor.activeField = f; }
    });

    M.setAutoWords(state.doc.settings.autoMath !== false);
    applyPaperVars();
    state.editor.render();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { state.editor.render(); pageGuides(); });
    }
    buildPalette();
    buildSelTools();
    buildSettings();
    refresh();
    updateUndoBtns();

    document.addEventListener('focusin', function (e) {
      var t = e.target;
      if (t && t.classList && t.classList.contains('mfield')) {
        if (t.__mf) state.editor.activeField = t.__mf;
        return;
      }
      if (t && t.getAttribute && t.getAttribute('contenteditable') === 'true' && $('#paper').contains(t)) {
        state.lastRich = t;
        state.editor.activeField = null;
      }
    });

    $('#btnTex').onclick = exportTex;
    $('#btnCopy').onclick = copyTex;
    $('#btnCompile').onclick = compilePDF;
    $('#pdfclose').onclick = closePdf;
    $('#pdfsave').onclick = function () {
      if (lastPdf) download(docName() + '.pdf', lastPdf.blob, 'application/pdf');
    };
    $('#pdfview').addEventListener('click', function (e) { if (e.target === $('#pdfview')) closePdf(); });
    $('#btnPrint').onclick = printDoc;
    $('#btnUndo').onclick = doUndo;
    $('#btnRedo').onclick = doRedo;
    $('#btnHelp').onclick = function () { $('#help').classList.add('on'); };
    $('#helpClose').onclick = function () { $('#help').classList.remove('on'); };
    $('#help').addEventListener('click', function (e) { if (e.target === $('#help')) $('#help').classList.remove('on'); });
    $('#helpKeys').onclick = function () { $('#help').classList.remove('on'); K.open(); };

    $('#btnNew').onclick = function () {
      dialog({
        title: 'Start a new document?',
        body: 'This one will be replaced. Undo brings it back, and Save keeps a copy on disk.',
        okLabel: 'New document'
      }).then(function (yes) {
        if (!yes) return;
        pushUndo();
        state.doc = D.newDoc();
        state.lastSnap = serialize(state.doc);
        state.editor.doc = state.doc;
        applyPaperVars();
        state.editor.render();
        buildSettings();
        refresh();
        save();
        toast('New document started.');
      });
    };
    $('#btnSave').onclick = function () {
      download(docName() + '.papertex.json', serialize(state.doc), 'application/json')
        .then(function (r) { if (r === 'saved' || r === 'anchor') toast('Project saved — reopen it with Open.'); });
    };
    function openProject() {
      if (NATIVE) {
        NATIVE.open().then(function (r) {
          if (r.status !== 'ok') return;
          try {
            var d = JSON.parse(r.text);
            if (!d.blocks) throw new Error('not a document');
            pushUndo();
            restore(JSON.stringify(d));
            save();
            toast('Opened “' + D.stripTags(d.meta.title) + '”.');
          } catch (e) { toast('That file is not a PaperTeX document.'); }
        });
        return;
      }
      browserOpen();
    }
    $('#btnOpen').onclick = openProject;
    function browserOpen() {
      var inp = h('input');
      inp.type = 'file';
      inp.accept = '.json,application/json';
      inp.onchange = function () {
        var f = inp.files[0];
        if (!f) return;
        var fr = new FileReader();
        fr.onload = function () {
          try {
            var d = JSON.parse(fr.result);
            if (!d.blocks) throw new Error('not a document');
            pushUndo();
            restore(JSON.stringify(d));
            save();
            toast('Opened “' + D.stripTags(d.meta.title) + '”.');
          } catch (err) { toast('That file is not a PaperTeX document.'); }
        };
        fr.readAsText(f);
      };
      inp.click();
    }

    $$('.rtab').forEach(function (t) {
      t.onclick = function () {
        $$('.rtab').forEach(function (x) { x.classList.remove('on'); });
        $$('.rpane').forEach(function (x) { x.classList.remove('on'); });
        t.classList.add('on');
        $('#' + t.dataset.pane).classList.add('on');
      };
    });
    $('#btnPanel').onclick = function () {
      document.body.classList.toggle('nopanel');
      setTimeout(pageGuides, 260);
    };
    $('#btnPal').onclick = function () {
      document.body.classList.toggle('nopal');
      setTimeout(pageGuides, 260);
    };
    $('#btnCopy2').onclick = copyTex;
    $('#btnTex2').onclick = exportTex;

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') D.closeAllPop();
    });

    setupKeys(openProject);

    if (NATIVE) {
      NATIVE.onMenu({
        'new': function () { $('#btnNew').click(); },
        open: openProject,
        save: function () { $('#btnSave').click(); },
        export: exportTex,
        compile: compilePDF,
        print: printDoc,
        undo: doUndo,
        redo: doRedo,
        help: function () { $('#help').classList.add('on'); },
        keys: function () { K.open(); }
      });
      document.body.classList.add('desktop');
    }

    window.addEventListener('resize', pageGuides);
    window.addEventListener('beforeunload', save);

    if (!localStorage.getItem('papertex.seen')) {
      localStorage.setItem('papertex.seen', '1');
      setTimeout(function () { $('#help').classList.add('on'); }, 500);
    }
  }

  window.PT.app = { state: state, toast: toast, refresh: refresh, insertSymbol: insertSymbol };
  document.addEventListener('DOMContentLoaded', boot);
})();
