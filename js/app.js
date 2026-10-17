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

  /* -------------------------------------------------------------- persistence
     Documents live in PT.store (IndexedDB), any number of them. A change is
     written a moment after it is made; whether that worked is always shown,
     and a write that fails is never swallowed. */
  var S = PT.store;
  function serialize(doc) {
    return JSON.stringify(doc, function (k, v) { return k.slice(0, 2) === '__' ? undefined : v; });
  }

  var saveTimer = null;
  function save(now) {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!state.docId || state.staleTab) return;
    setSaveState('saving');
    function run() {
      saveTimer = null;
      var id = state.docId;
      S.save(id, serialize(state.doc), state.doc).then(function () {
        if (id !== state.docId) return;
        setSaveState(S.kind() === 'memory' ? 'volatile' : 'saved');
        announce(id);
        if (!state.persistAsked) { state.persistAsked = true; S.persist(); }
        checkBackup();
      }, function (err) {
        if (id === state.docId) setSaveState('failed', err);
      });
    }
    if (now) run(); else saveTimer = setTimeout(run, 400);
  }
  function flushSave() { if (saveTimer) save(true); }

  /* A document read from a file is somebody else's data: give it every
     field the editor relies on, and drop anything that is not a block. */
  function normalizeDoc(d) {
    if (!d || typeof d !== 'object' || !Array.isArray(d.blocks)) throw new Error('not a document');
    var base = D.newDoc();
    var meta = d.meta && typeof d.meta === 'object' ? d.meta : {};
    var plainHead = !meta.headHtml, plainBib = !meta.bibHtml;
    d.meta = Object.assign({}, base.meta, meta);
    if (plainBib && Array.isArray(d.bib)) {
      /* Written before reference entries took italics and formulas: their
         plain text becomes the same text as rich text. */
      var esc1 = function (s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); };
      d.bib.forEach(function (e) {
        if (!e || typeof e !== 'object') return;
        ['author', 'title', 'journal', 'year', 'note'].forEach(function (k) { if (e[k]) e[k] = esc1(e[k]); });
      });
    }
    d.meta.bibHtml = true;
    if (plainHead) {
      /* Written before titles, names, dates and theorem titles could hold
         formulas: their plain text becomes the same text as rich text. */
      var asHTML = function (s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); };
      d.meta.title = asHTML(d.meta.title);
      if (d.meta.date !== '\\today') d.meta.date = asHTML(d.meta.date);
      d.meta.authors = (Array.isArray(d.meta.authors) ? d.meta.authors : []).map(function (a) {
        a = a && typeof a === 'object' ? a : {};
        return Object.assign({}, a, { name: asHTML(a.name), affil: asHTML(a.affil) });
      });
      (Array.isArray(d.blocks) ? d.blocks : []).forEach(function (b) {
        if (b && b.t === 'theorem' && b.title) b.title = asHTML(b.title);
      });
      d.meta.headHtml = true;
    }
    d.settings = Object.assign({}, base.settings, d.settings && typeof d.settings === 'object' ? d.settings : {});
    d.bib = Array.isArray(d.bib) ? d.bib.filter(function (e) { return e && typeof e === 'object'; }) : [];
    d.blocks = d.blocks.filter(function (b) { return b && typeof b === 'object' && typeof b.t === 'string'; });
    if (!d.blocks.length) d.blocks = base.blocks;
    return d;
  }

  /* --- what the user is told about saving --- */
  function setSaveState(s, err) {
    state.saveState = s;
    var el = $('#saveState');
    if (el) {
      el.className = 'savestate ' + s;
      el.textContent = { saving: 'Saving…', saved: 'Saved', failed: 'Not saved', volatile: 'Not stored' }[s] || '';
      el.title = {
        saving: 'Writing your changes to this ' + (NATIVE ? 'computer' : 'browser'),
        saved: 'Every change is kept in this ' + (NATIVE ? 'app' : 'browser') + ' — open it again any time from Open',
        failed: 'The last change could not be stored: ' + (err && err.message || 'storage refused'),
        volatile: 'This page cannot store anything here; your work lasts only as long as the tab'
      }[s] || '';
    }
    if (s === 'failed') showBar('failed', 'Not saved. This ' + (NATIVE ? 'app' : 'browser') + ' refused to store your latest changes' +
      ' — its storage may be full or switched off. Save project to keep a copy on disk now.');
    else if (s === 'volatile') showBar('volatile', 'This page cannot store anything, so your work disappears when the tab closes.' +
      ' Use Save project to keep it.');
    else if (s === 'saved' && (state.bar === 'failed' || state.bar === 'volatile')) hideBar();
  }
  function showBar(kind, text, later) {
    var bar = $('#savebar');
    if (!bar) return;
    state.bar = kind;
    bar.className = 'savebar on ' + kind;
    bar.textContent = '';
    bar.appendChild(h('span', 'savebar-t', text));
    var act = h('button', 'savebar-b primary', kind === 'stale' ? 'Reload' : 'Save project');
    act.onclick = function () { if (kind === 'stale') location.reload(); else saveProject(); };
    bar.appendChild(act);
    if (later) {
      var no = h('button', 'savebar-b', 'Later');
      no.onclick = function () { later(); hideBar(); };
      bar.appendChild(no);
    }
  }
  function hideBar() { var bar = $('#savebar'); if (bar) bar.className = 'savebar'; state.bar = null; }

  /* A document that exists only in browser storage is one cleared cache
     away from gone. Once it has real content and has gone a week without
     being written to a file, say so — once a session, and not again for
     three days after "Later". */
  function checkBackup() {
    if (state.backupNudged || state.bar || !state.docId) return;
    var id = state.docId;
    Promise.all([S.list(), S.getMeta('snooze.' + id)]).then(function (r) {
      var rec = r[0].filter(function (x) { return x.id === id; })[0], snooze = r[1] || 0;
      if (!rec || id !== state.docId || state.bar || state.backupNudged) return;
      var week = 7 * 864e5;
      if (Date.now() < snooze) return;
      /* a week without a copy on disk, counted from the last copy or, for a
         document never saved to a file, from when it was started — not the
         moment a template fills a fresh one */
      if (Date.now() - (rec.backedUp || rec.created) < week) return;
      if (rec.backedUp && rec.updated <= rec.backedUp) return;
      /* a starter page or template nobody has touched is not worth a copy */
      if (rec.updated - rec.created < 60e3) return;
      state.backupNudged = true;
      showBar('backup', '“' + rec.title + '” is kept only in this ' + (NATIVE ? 'app' : 'browser') +
        (rec.backedUp ? ', and has changed since you last saved a copy.' : '.') +
        ' Save project keeps a copy on disk that clearing ' + (NATIVE ? 'app data' : 'the browser') + ' cannot touch.',
        function () { S.setMeta('snooze.' + id, Date.now() + 3 * 864e5); });
    });
  }

  /* Two tabs on one document would overwrite each other's work. The tab
     that saves tells the others; one still showing the older copy stops
     saving and offers to reload. */
  var channel = null;
  try { channel = new BroadcastChannel('papertex'); } catch (e) { channel = null; }
  var TAB = Math.random().toString(36).slice(2);
  function announce(id) { if (channel) channel.postMessage({ saved: id, tab: TAB }); }
  if (channel) channel.onmessage = function (e) {
    var m = e.data || {};
    if (m.tab === TAB || m.saved !== state.docId || state.staleTab) return;
    state.staleTab = true;
    clearTimeout(saveTimer);
    showBar('stale', 'This document was changed in another tab. To keep both from overwriting each other,' +
      ' this tab has stopped saving — reload it to continue with the latest version.');
  };

  function saveProject() {
    flushSave();
    var id = state.docId;
    return download(docName() + '.papertex.json', serialize(state.doc), 'application/json')
      .then(function (r) {
        if (r === 'saved' || r === 'anchor') {
          toast('Project saved — reopen it with Open.');
          S.markBackedUp(id);
          if (state.bar === 'backup') hideBar();
        }
        return r;
      });
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
    /* the block the caret was in keeps it, through undo and redo */
    var ae = document.activeElement, blk = ae && ae.closest ? ae.closest('[data-bid]') : null;
    var part = ae && ae.closest ? ae.closest('[data-part]') : null;
    state.doc = JSON.parse(json);
    state.lastSnap = json;
    state.editor.doc = state.doc;
    applyPaperVars();
    if (blk) state.editor.focusBlock(blk.dataset.bid, part ? part.dataset.part : 'main');
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
      /* while you type in the pane it is yours: the page follows it, not
         the other way round (applyTex) */
      var typing = texIn && document.activeElement === texIn;
      var pane = $('#texout');
      if (pane && !typing) pane.innerHTML = highlight(tex) + '\n';
      if (texIn && !typing && texIn.value !== tex) texIn.value = tex;
      var st = $('#texstat');
      if (st && !typing) st.textContent = tex.split('\n').length + ' lines · ' + tex.length.toLocaleString() + ' characters';
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

  /* The pane is an editor too: type LaTeX there and, when you pause, the
     page follows (texread.js reads it back). Blocks whose LaTeX did not
     change are kept as they were — a chart stays a chart you can edit, a
     figure keeps its image — so only what you changed is read again. When
     you leave the pane it shows the LaTeX the page writes. */
  var texIn = null, texTimer2 = null, texDirty = false;
  /* every block this document has had since you first edited in the pane:
     a half-typed egin{…} may swallow a chart for a while (even while you
     are elsewhere), and it is still found when the LaTeX is whole again */
  var texSeen = [], texSeenDoc = null;
  function seeBlocks() {
    if (texSeenDoc !== state.doc) { texSeen = []; texSeenDoc = state.doc; }
    state.doc.blocks.forEach(function (b) { if (texSeen.indexOf(b) < 0) texSeen.push(b); });
    if (texSeen.length > 3000) texSeen = texSeen.slice(-3000);
  }
  function setupTexEditor() {
    texIn = $('#texin');
    var pre = $('#texout'), box = $('#texed'), st = $('#texstat');
    if (!texIn || !pre) return;
    texIn.addEventListener('focus', function () { box.classList.add('editing'); seeBlocks(); });
    texIn.addEventListener('input', function () {
      if (texSeenDoc !== state.doc) seeBlocks();
      pre.innerHTML = highlight(texIn.value) + '\n';
      pre.scrollTop = texIn.scrollTop;
      texDirty = true;
      if (st) { st.textContent = 'Editing — the page follows when you pause'; st.title = ''; }
      clearTimeout(texTimer2);
      texTimer2 = setTimeout(applyTex, 600);
    });
    texIn.addEventListener('scroll', function () { pre.scrollTop = texIn.scrollTop; });
    texIn.addEventListener('blur', function () {
      box.classList.remove('editing');
      clearTimeout(texTimer2);
      /* unfinished LaTeX stays as you left it, not applied */
      if ((texDirty ? applyTex() : true) !== false) refresh();   /* back to the LaTeX the page writes */
    });
    texIn.addEventListener('keydown', function (e) {
      /* Tab indents (Escape gives the keyboard back to the page) */
      if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); document.execCommand('insertText', false, '  '); }
      else if (e.key === 'Escape') { e.preventDefault(); texIn.blur(); }
    });
  }
  function applyTex() {
    texDirty = false;
    var st = $('#texstat'), r;
    try { r = PT.texread.read(texIn.value); }
    catch (e) { if (st) st.textContent = 'Not readable yet — keep typing'; texDirty = true; return false; }
    /* half-typed: egin{equation} with no end yet would take the rest of
       the document into the formula — wait for it */
    if (r.broken && r.broken.length) {
      if (st) { st.textContent = 'Waiting: ' + r.broken[0]; st.title = 'The page follows once the LaTeX is whole again.'; }
      texDirty = true;
      return false;
    }
    var od = state.doc, nd = r.doc;
    seeBlocks();
    /* the reader leaves an empty line at the end to go on writing; here
       the page has its own, or none */
    var blankEnd = function (bl) { var b = bl[bl.length - 1]; return b && b.t === 'para' && D.isBlank(b.html); };
    if (blankEnd(nd.blocks) && !blankEnd(od.blocks)) nd.blocks.pop();
    var norm = function (t) { return String(t || '').replace(/(^|[^\\])%.*$/gm, '$1').replace(/\s+/g, ' ').trim(); };
    /* the old blocks, by the LaTeX they write */
    var pool = {};
    texSeen.forEach(function (b) {
      var k = norm(L.texOf(b, od)); (pool[k] = pool[k] || []).push(b);
    });
    var used = [];
    var take = function (b) { used.push(b); return b; };
    nd.blocks = nd.blocks.map(function (b) {
      var same = (pool[norm(L.texOf(b, nd))] || []).filter(function (o) {
        /* LaTeX code may be what a chart wrote: it is that chart again */
        return used.indexOf(o) < 0 && (o.t === b.t || b.t === 'raw');
      })[0];
      if (same) { same.inEnv = b.inEnv; return take(same); }
      /* a figure is read without its image: the one it had, by file name */
      if (b.t === 'figure' && b.filename) {
        var fig = texSeen.filter(function (o) { return o.t === 'figure' && o.src && o.filename === b.filename && used.indexOf(o) < 0; })[0];
        if (fig) {
          ['caption', 'label', 'width', 'placement'].forEach(function (k) { fig[k] = b[k]; });
          fig.inEnv = b.inEnv;
          return take(fig);
        }
      }
      return b;
    });
    /* what the page writes by itself for these blocks is not "extra" */
    var auto = L.build({ meta: od.meta, settings: Object.assign({}, od.settings, nd.settings, { preamble: '' }), blocks: nd.blocks, bib: nd.bib })
      .split('\\begin{document}')[0].split('\n').map(function (x) { return x.trim(); });
    nd.settings.preamble = String(nd.settings.preamble || '').split('\n').filter(function (x) { return x.trim() && auto.indexOf(x.trim()) < 0; }).join('\n');
    ['docclass', 'fontsize', 'paper', 'columns', 'margin', 'lineSpacing', 'lang', 'titlepage', 'numbered', 'thmWithin', 'preamble'].forEach(function (k) {
      if (nd.settings[k] !== undefined) od.settings[k] = nd.settings[k];
    });
    ['title', 'authors', 'date', 'abstract', 'keywords'].forEach(function (k) { od.meta[k] = nd.meta[k]; });
    if (od.meta.abstract) od.settings.showAbstract = true;
    od.blocks = nd.blocks;
    od.bib = nd.bib;
    state.editor.render();
    state.editor.change(false);
    if (st) {
      st.textContent = r.notes.length ? 'Page updated · ' + r.notes.length + ' note' + (r.notes.length > 1 ? 's' : '') : 'Page updated';
      st.title = r.notes.join('\n');
    }
  }

  function updateOutline() {
    var box = $('#outline');
    if (!box) return;
    box.textContent = '';
    D.numbering(state.doc);
    state.doc.blocks.forEach(function (b) {
      /* the headings, and the list of references and the contents, which
         have headings of their own on the page */
      if (b.t !== 'section' && !(b.t === 'bib' && state.doc.bib.length) && b.t !== 'toc') return;
      var e = h('button', 'ol-item lvl' + (b.level || 1));
      if (b.t === 'bib') e.appendChild(document.createTextNode('References'));
      else if (b.t === 'toc') e.appendChild(document.createTextNode('Contents'));
      else if (b.__num) e.appendChild(document.createTextNode(b.__num + '  '));
      if (b.t !== 'section') { /* named above */ }
      else if (D.isBlank(b.html)) e.appendChild(document.createTextNode('(untitled)'));
      else e.appendChild(D.headingInto(h('span'), b.html));
      e.onclick = function () {
        var el = $('[data-bid="' + b.id + '"]');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
      box.appendChild(e);
    });
    if (!box.children.length) box.appendChild(h('div', 'ol-empty', 'No sections yet.'));
    M.layout(box);   /* formulas in headings (again when the tab is shown) */
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
    /* A page break ends its page: it takes up the rest of that page, so what
       follows starts at the top of the next one, as in the PDF; the pages
       after it are counted from there. Worked out top to bottom: a break's
       place depends only on the breaks above it, which are already fitted.
       Positions are taken against the sheet as it is at that moment — the
       view may scroll while the breaks change height. */
    var y = function (e) { return e.getBoundingClientRect().top - paper.getBoundingClientRect().top; };
    var page = 1, pageTop = padT, marks = [];
    function guide(at, forced) { marks.push([at, forced, ++page]); }
    /* drawn as two sheets: the rest of this page, its bottom margin, a
       strip of desk, and the next page's top margin */
    var GAP = 26;
    [].forEach.call(paper.querySelectorAll('.pt-pagebreak'), function (b) {
      var at = y(b);
      while (pageTop + usable <= at && page < 400) { guide(pageTop + usable); pageTop += usable; }
      var end = pageTop + usable, start = end + padB + GAP + padT, fill = start - at;
      b.style.setProperty('--pb-rest', Math.max(0, end - at) + 'px');
      b.style.setProperty('--pb-gap-at', Math.max(0, end - at + padB) + 'px');
      b.style.setProperty('--pb-gap', GAP + 'px');
      /* whatever spacing sits between the break and the next block is
         taken out, so the next block starts at the top of the new page */
      var blk = b.closest('.blk'), after = blk && blk.nextElementSibling;
      if (after) {
        b.style.height = Math.max(0, fill) + 'px';
        fill -= y(after) - start;
      }
      b.style.height = Math.max(0, fill) + 'px';
      guide(end + padB + GAP / 2, true);
      pageTop = start;
    });
    /* the pages the writing runs on to, and the sheet as long as all of
       them, so the last page is a whole page too */
    var end = 0;
    [].forEach.call(paper.children, function (c) {
      var r = c.getBoundingClientRect();
      if (r.height) end = Math.max(end, r.bottom - paper.getBoundingClientRect().top);
    });
    while (pageTop + usable < end - 2 && page < 400) { guide(pageTop + usable); pageTop += usable; }
    paper.style.minHeight = page > 1 ? (pageTop + usable + padB) + 'px' : '';

    /* the layer is a sibling of the sheet, so park it exactly over it */
    layer.style.left = paper.offsetLeft + 'px';
    layer.style.top = paper.offsetTop + 'px';
    layer.style.width = paper.offsetWidth + 'px';
    layer.style.height = paper.offsetHeight + 'px';
    marks.forEach(function (mk) {
      var g = h('div', 'guide' + (mk[1] ? ' forced' : ''));
      g.style.top = mk[0] + 'px';
      g.appendChild(h('span', '', 'page ' + mk[2]));
      layer.appendChild(g);
    });
  }
  /* the sheet's height changes without an edit too: a chart is drawn, an
     image or a font loads. The breaks are fitted again when it does. */
  var guideTimer = 0;
  function watchGuides() {
    var paper = $('#paper');
    if (!paper || !window.ResizeObserver) return;
    var last = 0;
    new ResizeObserver(function () {
      var hgt = paper.offsetHeight;
      if (Math.abs(hgt - last) < 1) return;
      last = hgt;
      clearTimeout(guideTimer);
      guideTimer = setTimeout(pageGuides, 60);
    }).observe(paper);
  }

  /* ------------------------------------------------------------- symbol panel */
  function buildPalette() {
    var tabs = $('#ptabs'), body = $('#pbody');
    tabs.textContent = ''; body.textContent = '';
    var groups = [{ name: 'Insert', blocks: true }].concat(PT.symbols.groups);

    groups.forEach(function (g, gi) {
      var t = h('button', 'ptab', g.name);
      /* what is in it, for a name that says little ("Sets & logic") */
      if (!g.blocks) t.title = g.items.filter(function (it) { return !it.build && it.d && it.d.length < 3; }).slice(0, 10).map(function (it) { return it.d; }).join(' ');
      /* switching tabs leaves the caret in the formula or text it was in */
      t.onmousedown = function (e) { e.preventDefault(); };
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
    if (ae && ae.classList && (ae.classList.contains('mfield') || ae.classList.contains('mf-proxy')) && ae.__mf) return ae.__mf;
    var f = state.editor.activeField;
    if (f && document.body.contains(f.host) && f.host.closest('.imath.editing')) return f;
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
    /* with no caret anywhere: at the end of the writing, above References */
    var at = state.editor.endOfText();
    /* below the block the caret is in — but above the reference list when
       the caret is in it, so it stays last */
    if (host) state.doc.blocks.forEach(function (b, i) { if (b.id === host.dataset.bid) at = b.t === 'bib' ? i : i + 1; });
    return at;
  }
  function insertBlockHere(kind) {
    /* a footnote goes into the text, at the caret */
    if (kind === 'footnote') { state.editor.footnoteInto(richHost() || state.lastRich); return; }
    if (kind === 'abstract') { state.editor.openAbstract(); return; }
    var blocks = state.doc.blocks;
    /* the reference list goes at the end, where it is printed — and there
       is only one */
    if (kind === 'bib') {
      var have = blocks.filter(function (b) { return b.t === 'bib'; })[0];
      if (have) {
        var el = $('[data-bid="' + have.id + '"]');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      state.editor.insertBlock('bib', blocks.length);
      return;
    }
    var at = currentBlockIndex(), here = blocks[at - 1];
    /* an equation or list made from inside a theorem or proof is a part of it */
    var inEnv = !!here && (here.t === 'theorem' || !!here.inEnv) && /^(eq|itemize|enumerate)$/.test(kind);
    /* made from an empty line: it takes that line's place */
    if (here && here.t === 'para' && D.isBlank(here.html) && kind !== 'para' && richHost()) {
      inEnv = inEnv || !!here.inEnv;
      blocks.splice(at - 1, 1);
      at -= 1;
    }
    state.editor.insertBlock(kind, at, inEnv);
  }

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
    mk('↪', 'Cross-reference or citation', function (e) { refPicker('ref', e.currentTarget); });
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

  /* ------------------------------------------------- references and citations
     Everything a reference can point at — every numbered equation (line),
     table, figure, section and theorem, labelled or not — and the works in
     the reference list. Choosing one that has no label gives it one, made
     from its words; a table or figure brings its word along ("Table 1"). */
  function refTargets() {
    D.numbering(state.doc);
    var out = [];
    var cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
    state.doc.blocks.forEach(function (b) {
      if (b.t === 'eq') {
        if (b.numbered === false) return;
        b.lines.forEach(function (r, li) {
          var num = b.__nums && b.__nums[li];
          if (num) out.push({ b: b, line: li, kind: 'eqref', group: 'Equations', name: '(' + num + ')', text: M.plainOf(r), tree: r, num: num });
        });
      } else if (b.t === 'table' || b.t === 'figure' || b.t === 'chart') {
        var w = b.t === 'table' ? 'Table' : 'Figure';
        out.push({ b: b, kind: 'ref', word: w, group: 'Tables and figures', name: w + ' ' + b.__num, text: L.plainText(b.caption || ''), num: b.__num });
      } else if (b.t === 'section' && b.__num) {
        out.push({ b: b, kind: 'ref', word: 'Section', group: 'Sections', name: 'Section ' + b.__num, text: L.plainText(b.html), num: b.__num });
      } else if (b.t === 'theorem' && b.__num) {
        var tw = cap(b.kind);
        out.push({ b: b, kind: 'ref', word: tw, group: 'Theorems', name: tw + ' ' + b.__num, text: L.plainText(b.title || b.html), num: b.__num });
      }
    });
    /* by kind, and in reading order within each */
    var RANK = { Equations: 0, 'Tables and figures': 1, Sections: 2, Theorems: 3 };
    return out.map(function (t, i) { t.i = i; return t; })
      .sort(function (a, b) { return (RANK[a.group] - RANK[b.group]) || (a.i - b.i); });
  }
  function allLabels() {
    var set = {};
    state.doc.blocks.forEach(function (b) {
      if (b.label) set[b.label] = 1;
      (b.labels || []).forEach(function (l) { if (l) set[l] = 1; });
    });
    state.doc.bib.forEach(function (e) { if (e.key) set[e.key] = 1; });
    return set;
  }
  /* the label a target already has, or a new one, kept */
  function labelFor(t) {
    var b = t.b;
    if (b.t === 'eq' && b.lines.length > 1) {
      if (b.labels && b.labels[t.line]) return b.labels[t.line];
      if (t.line === 0 && b.label) return b.label;
    } else if (b.label) return b.label;
    var prefix = { eq: 'eq:', table: 'tab:', figure: 'fig:', chart: 'fig:', section: 'sec:', theorem: 'thm:' }[b.t] || '';
    var words = String(t.text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(function (w) { return w.length > 2; }).slice(0, 2).join('-');
    var base = prefix + (words || String(t.num).replace(/\D/g, '-')), lab = base, n = 2, have = allLabels();
    while (have[lab]) lab = base + '-' + (n++);
    if (b.t === 'eq' && b.lines.length > 1) {
      if (!b.labels || b.labels.length !== b.lines.length) b.labels = b.lines.map(function (x, i) { return (b.labels && b.labels[i]) || ''; });
      b.labels[t.line] = lab;
    } else b.label = lab;
    state.editor.change(true);
    return lab;
  }

  /* The picker, under the caret (or `anchor`): `want` 'cite' lists the
     reference list first, anything else the document's own items first. */
  function refPicker(want, anchor) {
    D.closeAllPop();
    var s = window.getSelection();
    var range = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
    var host = range ? range.commonAncestorContainer : null;
    if (host && host.nodeType === 3) host = host.parentElement;
    host = host && host.closest ? host.closest('[contenteditable="true"]') : null;
    if (!host || !host.__rich || !$('#paper').contains(host)) {
      host = state.lastRich && document.body.contains(state.lastRich) ? state.lastRich : null;
      range = null;
    }
    if (!host) { toast('Click in the text where the reference should go first.'); return; }

    var targets = refTargets();
    var cites = state.doc.bib.map(function (e, i) {
      return { cite: e, kind: 'cite', group: 'Reference list', name: '[' + (i + 1) + ']',
        text: [L.plainText(e.author), L.plainText(e.title)].filter(Boolean).join(' — ') || e.key };
    });
    /* a work not in the list yet: added to it (and the list to the end of
       the document, if there is none), cited, and its entry opened to fill in */
    var fresh = { fresh: true, kind: 'cite', group: 'Reference list', name: '+ New work…', text: 'add it to the reference list and cite it' };
    var all = want === 'cite' ? cites.concat([fresh], targets) : targets.concat(cites, [fresh]);

    var m = h('div', 'popmenu pt-refpop');
    var search = h('input', 'popsearch');
    search.placeholder = want === 'cite' ? 'Cite… (author, title)' : 'Refer to… (equation, table, section…)';
    m.appendChild(search);
    var listw = h('div', 'popitems');
    m.appendChild(listw);
    /* what matches best first: the name ("Figure 1"), then the words
       ("Main results"), then the kind of thing */
    function score(t, words) {
      var name = (t.name + ' ' + (t.word || '')).toLowerCase(), text = String(t.text || '').toLowerCase(), group = t.group.toLowerCase();
      var s = 0;
      for (var k = 0; k < words.length; k++) {
        var w = words[k];
        if (name.indexOf(w) >= 0) s += 4;
        else if (text.indexOf(w) >= 0) s += 2;
        else if (group.indexOf(w) >= 0) s += 1;
        else return 0;
      }
      return s;
    }
    function fill(q) {
      listw.textContent = '';
      var words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
      var shown = all.map(function (t, i) { return { t: t, i: i, s: words.length ? score(t, words) : 1 }; })
        .filter(function (x) { return x.s > 0 || x.t.fresh; })
        .sort(function (a, b) { return (b.s - a.s) || (a.i - b.i); })
        .map(function (x) { return x.t; });
      /* searching: one list, best first; browsing: grouped */
      var last = null;
      shown.forEach(function (t, i) {
        if (!words.length && t.group !== last) { listw.appendChild(h('div', 'popg', t.group)); last = t.group; }
        var row = h('button', 'popitem' + (i === 0 ? ' sel' : '') + (t.fresh ? ' pt-refnew' : ''));
        var tx = h('span', 'poptx');
        tx.appendChild(h('span', 'popname', t.name));
        /* an equation shown as itself, not as its letters */
        if (t.tree) { var fd = h('span', 'popdesc'); M.renderStatic(fd, t.tree); tx.appendChild(fd); }
        else if (t.text) tx.appendChild(h('span', 'popdesc', t.text.length > 70 ? t.text.slice(0, 68) + '…' : t.text));
        row.appendChild(tx);
        row.onmousedown = function (e) { e.preventDefault(); };
        /* the row under the mouse is the one Enter takes: one lit row */
        row.onmousemove = function () {
          if (row.classList.contains('sel')) return;
          [].forEach.call(listw.querySelectorAll('.popitem.sel'), function (x) { x.classList.remove('sel'); });
          row.classList.add('sel');
        };
        row.onclick = function () { choose(t); };
        listw.appendChild(row);
      });
      if (!cites.length && !targets.length && want !== 'cite') {
        listw.insertBefore(h('div', 'popnone', 'Nothing numbered to refer to yet: equations, tables, figures, sections and theorems appear here.'), listw.firstChild);
      }
    }
    function close(back) {
      D.closeAllPop();
      document.removeEventListener('mousedown', off, true);
      if (back) {
        host.focus();
        if (range) { var ss = window.getSelection(); ss.removeAllRanges(); ss.addRange(range); }
      }
    }
    function choose(t) {
      if (t.fresh) {
        var bib = state.doc.bib, n = bib.length + 1, have = allLabels(), key = 'ref' + n;
        while (have[key]) key = 'ref' + (++n);
        bib.push({ key: key, author: '', title: '', journal: '', year: '' });
        if (!state.doc.blocks.some(function (b) { return b.t === 'bib'; })) state.doc.blocks.push(D.blockFactory('bib'));
        close(true);
        putXref('cite', key, '', host);
        state.editor.change(true);
        state.editor.render();
        /* on to the new entry, to write it */
        var rows = $$('.pt-bibi'), last = rows[rows.length - 1], f = last && last.querySelector('.f-author');
        if (f) { f.scrollIntoView({ block: 'center' }); D.placeCaret(f, true); }
        toast('Cited as [' + bib.length + '] — now write the entry: author, title, journal or publisher, year.');
        return;
      }
      var label = t.cite ? t.cite.key : labelFor(t);
      close(true);
      putXref(t.kind, label, t.word || '', host);
    }
    search.addEventListener('input', function () { fill(search.value); M.layout(listw); });
    search.addEventListener('keydown', function (e) {
      var rows = [].slice.call(listw.querySelectorAll('.popitem')), cur = listw.querySelector('.popitem.sel'), i = rows.indexOf(cur);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!rows.length) return;
        var j = Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
        if (cur) cur.classList.remove('sel');
        rows[j].classList.add('sel'); rows[j].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') { e.preventDefault(); if (cur) cur.click(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    });
    function off(ev) { if (!m.contains(ev.target)) close(false); }
    fill('');
    document.body.appendChild(m);
    M.layout(m);   /* the formulas, measured now that they are on the page */
    /* under the caret, or the button that opened it */
    var at = anchor;
    if (!at && range) {
      var rr = range.getBoundingClientRect();
      if (rr.top || rr.left) at = { getBoundingClientRect: function () { return rr; } };
    }
    D.posPop(m, at || host);
    search.focus();
    setTimeout(function () { document.addEventListener('mousedown', off, true); }, 0);
  }
  /* The chip, where the caret is. A table, figure, section or theorem gets
     its word in front ("Table 1") unless the text says it already; a space
     the replaced selection ended in stays. */
  function putXref(kind, label, word, host) {
    var s = window.getSelection();
    if (!s.rangeCount) return;
    var r = s.getRangeAt(0);
    /* a selected reference written by hand ("Figure 3", "[2]", "(1)") is
       replaced by the live one; any other selected words stay, and the
       reference goes after them */
    var seltext = r.toString();
    if (!r.collapsed && !/^\s*(\[[\d,\s]*\]|\(\d+\)|[A-Za-z.]*\s*\d+(\.\d+)*)\s*$/.test(seltext)) {
      r.collapse(false);
      if (!/\s$/.test(seltext)) {
        var gap = document.createTextNode(' ');
        r.insertNode(gap); r.setStartAfter(gap); r.collapse(true);
      }
    }
    var keepSpace = !r.collapsed && /\s$/.test(r.toString());
    r.deleteContents();
    if (word && host && host.contains(r.startContainer)) {
      var pre = document.createRange();
      pre.selectNodeContents(host);
      pre.setEnd(r.startContainer, r.startOffset);
      var before = pre.toString().replace(/[​ ]/g, ' ');
      /* "Figure 1" already typed by hand before the caret: its number goes,
         the live one takes its place, and the word is not doubled */
      var typed = new RegExp(word + '(\\s*)(\\d+(?:\\.\\d+)*\\s*)$', 'i').exec(before);
      if (typed && r.startContainer.nodeType === 3 && r.startOffset >= typed[2].length) {
        var num = document.createRange();
        num.setStart(r.startContainer, r.startOffset - typed[2].length);
        num.setEnd(r.startContainer, r.startOffset);
        num.deleteContents();
        r = num; r.collapse(true);
        before = before.slice(0, before.length - typed[2].length);
        if (!typed[1]) { var sp1 = document.createTextNode(' '); r.insertNode(sp1); r.setStartAfter(sp1); r.collapse(true); before += ' '; }
        s.removeAllRanges(); s.addRange(r);
      }
      if (!new RegExp(word + '\\s*$', 'i').test(before)) {
        var w = document.createTextNode((/(^|\s)$/.test(before) ? '' : ' ') + word + ' ');
        r.insertNode(w);
        r.setStartAfter(w); r.collapse(true);
        s.removeAllRanges(); s.addRange(r);
      }
    }
    var span = document.createElement('span');
    span.className = 'xref';
    span.contentEditable = 'false';
    span.dataset.kind = kind;
    span.dataset.label = label;
    D.insertNodeAtCaret(span);
    if (keepSpace) {
      var sp = document.createTextNode(' ');
      span.parentNode.insertBefore(sp, span.nextSibling);
      var c = document.createRange();
      c.setStartAfter(sp); c.collapse(true);
      s.removeAllRanges(); s.addRange(c);
    }
    state.editor.labels = D.numbering(state.doc);
    state.editor.refreshXrefs();
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
    field('Language', sel(S.lang, [['english', 'English'], ['ngerman', 'German'], ['french', 'French'], ['spanish', 'Spanish'],
      ['italian', 'Italian'], ['turkish', 'Turkish'], ['portuguese', 'Portuguese']], function (v) { S.lang = v; apply(); }));

    group('Front matter');
    field('Number sections', chk(S.numbered, function (v) { S.numbered = v; apply(); }));
    field('Theorem numbers by section: 2.1, 2.2', chk(S.thmWithin, function (v) { S.thmWithin = v; apply(); }));
    field('Show abstract', chk(S.showAbstract, function (v) { S.showAbstract = v; apply(); }));
    field('Separate title page', chk(S.titlepage, function (v) { S.titlepage = v; apply(); }));

    group('Formulas');
    field('Turn typed names into symbols (alpha → α)', chk(S.autoMath !== false, function (v) {
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

    /* packages and \newcommand of your own (an opened .tex keeps its own
       here); written before hyperref, after what PaperTeX loads itself */
    group('Extra preamble');
    var pre = h('textarea', 'sfpre');
    pre.value = S.preamble || '';
    pre.rows = Math.min(10, Math.max(3, (S.preamble || '').split('\n').length + 1));
    pre.spellcheck = false;
    pre.placeholder = '\\usepackage{siunitx}\n\\newcommand{\\R}{\\mathbb{R}}';
    pre.oninput = function () { S.preamble = pre.value; state.editor.change(); refresh(); };
    box.appendChild(pre);
    box.appendChild(h('div', 'shint', 'LaTeX of your own for the preamble. PaperTeX does not check it: a mistake here stops Make PDF.'));

    group('View');
    var zw = h('div', 'sfz');
    var z = h('input');
    z.type = 'range'; z.min = '40'; z.max = '160'; z.value = String(Math.round(state.zoom * 100));
    var zl = h('span', 'sfv', Math.round(state.zoom * 100) + '%');
    z.oninput = function () {
      state.zoom = parseInt(z.value, 10) / 100;
      state.zoomManual = true;   /* yours now: the window no longer refits it */
      applyPaperVars();
      zl.textContent = z.value + '%';
      state.editor.render();
      pageGuides();
    };
    /* the page fitting itself to the window moves the slider too */
    state.showZoom = function () {
      z.value = String(Math.round(state.zoom * 100));
      zl.textContent = z.value + '%';
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
    paper.style.setProperty('--z', String(state.zoom));   /* for chrome on the sheet that scales with it */
    paper.style.setProperty('--print-pad', S.margin);
    /* the sheet speaks the document's language: the hyphenation on screen
       follows it, and so does the spelling check in the desktop app, which
       would otherwise check in the computer's language */
    paper.lang = LANGS[S.lang] || 'en';
    if (window.papertexNative && window.papertexNative.setSpellLanguage && spellLang !== paper.lang) {
      spellLang = paper.lang;
      window.papertexNative.setSpellLanguage(spellLang);
    }
  }
  var LANGS = { english: 'en', ngerman: 'de', french: 'fr', spanish: 'es', italian: 'it', turkish: 'tr', portuguese: 'pt' };
  var spellLang = null;

  /* The page fits the window it is in. At 100% it is a real A4 (794 px);
     where the desk is narrower than that, the page is set smaller rather
     than cut off. Below 80% the side panels make way first — the LaTeX
     panel, then the palette — so the page is not shrunk to a stamp; their
     toolbar buttons bring them back. That choice is made when the editor
     opens and again whenever the window crosses into another width; in
     between, panels shown or hidden by hand stay so. A zoom set with the
     slider is kept. `why`: 'start', 'resize' or 'toggle'. */
  var FIT_MIN = 0.8, fitCut = null, scrollbarW = null;
  /* the desk around the page, and the stage's scroll bar (none where the
     system draws them over the content) */
  function deskFor(vw) {
    if (scrollbarW === null) {
      var t = h('div');
      t.style.cssText = 'position:absolute;top:-200px;width:100px;height:100px;overflow:scroll';
      document.body.appendChild(t);
      scrollbarW = t.offsetWidth - t.clientWidth;
      t.remove();
    }
    return (vw <= 760 ? 28 : 60) + scrollbarW;
  }
  function layoutWidth() {
    /* the layout width, not innerWidth: a phone browser zooms out to fit a
       page that is still full-size at this point, and innerWidth then
       reports the zoomed-out width */
    return Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth);
  }
  function fitLayout(why) {
    var body = document.body, vw = layoutWidth();
    var palW = $('.pal') ? $('.pal').offsetWidth : 0, sideW = $('.side') ? $('.side').offsetWidth : 0;
    /* at 900 px and below the panels are drawers over the page: they take
       nothing from it */
    var drawers = vw <= 900;
    var zoomFor = function (pal, side) {
      return (vw - (pal && !drawers ? palW : 0) - (side && !drawers ? sideW : 0) - deskFor(vw)) / 794;
    };
    if (why !== 'toggle') {
      /* which panels this width keeps: both, the palette alone, or neither */
      var cut = vw < 900 ? 2 : zoomFor(true, true) >= FIT_MIN ? 0 : zoomFor(true, false) >= FIT_MIN ? 1 : 2;
      if (cut !== fitCut) {
        fitCut = cut;
        body.classList.toggle('nopanel', cut >= 1);
        body.classList.toggle('nopal', cut >= 2);
      }
    }
    if (state.zoomManual || !state.editor) return;
    /* an open chart editor or a formula being written would be torn down
       by redrawing the page under it: refit once it is done */
    if ($('.studio') || $('.imath.editing')) return;
    var fit = zoomFor(!body.classList.contains('nopal'), !body.classList.contains('nopanel'));
    /* On a wide screen (1440p, 4K) a real-size A4 is a strip down the
       middle: past a quarter more room than the page needs, it grows with
       the room — gently, to at most 150% — so a laptop keeps 100%. */
    var z = fit <= 1.25 ? Math.min(1, fit) : Math.min(1.5, 1 + (fit - 1.25) * 0.6);
    z = Math.floor(Math.max(0.38, z) * 100) / 100;
    if (Math.abs(z - state.zoom) < 0.005) return;
    state.zoom = z;
    if (why === 'start') return;   /* the first drawing is still to come */
    applyPaperVars();
    state.editor.render();
    pageGuides();
    if (state.showZoom) state.showZoom();
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
    ['.gutter', '.pt-tailadd', '.pt-addauth', '.pt-xauth', '.pt-figctl', '.pt-tabctl', '.pt-chedit', '.pt-cherr',
      '.pt-codebar', '.pt-rawl', '.pt-bibx', '.pt-bibup', '.pt-bibdn', '.pt-bibadd', '.pt-bibkey', '.mcaret', '.pt-drop',
      '.mf-kb', '.mselbox', '.mf-hintbar']
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
    paper.style.removeProperty('min-height');      /* the editor's whole-page length; print pages itself */
    paper.style.setProperty('--fs', parseFloat(state.doc.settings.fontsize) * (96 / 72) + 'px');

    var title = PT.latex.plainText(state.doc.meta.title) || 'Document';
    /* the margin comes from the document, so from whoever wrote the file:
       only a plain length goes into the stylesheet */
    var margin = /^\d+(\.\d+)?(cm|mm|in|pt)$/.test(state.doc.settings.margin) ? state.doc.settings.margin : '2.5cm';
    return '<!DOCTYPE html>\n<html><head><meta charset="utf-8">\n<title>' +
      title.replace(/[<&]/g, '') + '</title>\n<style>\n' + css + '\n</style>\n' +
      '<style>\n' +
      '  body { background:#fff; margin:0; overflow:visible; }\n' +
      '  .paper { margin:0 auto; box-shadow:none; width:auto; max-width:none;\n' +
      '           padding:' + margin + ' !important;\n' +
      '           -webkit-box-decoration-break:clone; box-decoration-break:clone; }\n' +
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
  /* the file name: the title in plain letters — “Çalışma raporu” becomes
     calisma-raporu, not alma-raporu */
  var LATIN = { 'ı': 'i', 'İ': 'I', 'ß': 'ss', 'æ': 'ae', 'Æ': 'AE', 'ø': 'o', 'Ø': 'O', 'ł': 'l', 'Ł': 'L',
    'đ': 'd', 'Đ': 'D', 'œ': 'oe', 'Œ': 'OE', 'þ': 'th', 'ð': 'd' };
  function docName() {
    var t = (PT.latex.plainText(state.doc.meta.title) || 'document')
      .replace(/[ıİßæÆøØłŁđĐœŒþð]/g, function (c) { return LATIN[c]; });
    if (t.normalize) t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return t.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'document';
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
    /* The engine says which stage it is at, not how far into it: say that
       in words, with the seconds ticking, so a first compile (TeX Live
       coming down, tens of megabytes) does not look stuck. */
    var STAGES = {
      loading: 'Fetching TeX Live — the first time takes a while; later compiles reuse it',
      format: 'Preparing LaTeX (once per visit)',
      compiling: 'Typesetting'
    };
    var said = 'Starting the LaTeX engine';
    var showWait = function () {
      if (!waitEl.isConnected) { clearInterval(tick); return; }
      var s = Math.round((performance.now() - t0) / 1000);
      waitEl.textContent = said + '…' + (s >= 2 ? '  ' + s + ' s' : '');
    };
    var tick = setInterval(showWait, 1000);

    var tex = L.build(state.doc);
    PT.compile.run(tex, state.doc, function (stage, detail) {
      said = STAGES[stage] || String(detail || stage || 'Working').replace(/\.+$/, '');
      showWait();
    }).then(function (r) {
      clearInterval(tick);
      var secs = ((performance.now() - t0) / 1000).toFixed(1);
      body.innerHTML = '';
      if (r.error) {
        body.appendChild(compileErrorView(r, tex));
        stat.textContent = 'failed after ' + secs + ' s';
        return;
      }
      var blob = new Blob([r.pdf], { type: 'application/pdf' });
      lastPdf = { blob: blob, url: URL.createObjectURL(blob) };
      var touchOnly = window.matchMedia && matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
      if (touchOnly) {
        /* Phone and tablet browsers show a PDF in a frame as its first page,
           or not at all: open it in a tab of its own, where their viewer works. */
        var ready = h('div', 'pdf-err');
        ready.appendChild(h('div', 'pdf-errh', 'The PDF is ready'));
        var open = h('a', 'dlg-btn primary', 'Open the PDF');
        open.href = lastPdf.url;
        open.target = '_blank';
        open.rel = 'noopener';
        ready.appendChild(open);
        ready.appendChild(h('div', 'pdf-errn', 'It opens in your browser’s own PDF viewer. Save keeps a copy.'));
        body.appendChild(ready);
      } else {
        var frame = h('iframe', 'pdf-frame');
        frame.src = lastPdf.url;
        frame.title = 'Compiled PDF';
        body.appendChild(frame);
      }
      stat.textContent = (r.pdf.length / 1024).toFixed(0) + ' kB · typeset in ' + secs + ' s';
      $('#pdfsave').disabled = false;
    }, function (e) {
      clearInterval(tick);
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
          'where compiling works. Copy LaTeX and Download .tex work everywhere.'));
      } else {
        err.appendChild(h('div', 'pdf-errh', 'The engine could not start'));
        err.appendChild(h('pre', 'pdf-errm', msg));
      }
      body.appendChild(err);
      stat.textContent = '';
    });
  }

  var lastPdf = null;
  /* What went wrong, in words, and where: the block whose LaTeX holds the
     line TeX stopped at (or the character it could not print), with a
     button that goes to it. Only a missing package or file is the
     engine's doing; anything else would fail in any LaTeX too. */
  function compileErrorView(r, tex) {
    var err = h('div', 'pdf-err');
    var msg = String(r.error || ''), log = String(r.log || '');
    var at = null, head = 'LaTeX could not typeset this document', note = '';
    var uni = /U\+([0-9A-Fa-f]{4,6})/.exec(msg);
    var file = /File [`']([^']+)' not found/.exec(msg);
    if (uni) {
      var c = String.fromCodePoint(parseInt(uni[1], 16));
      head = 'LaTeX has no way to print “' + c + '” in text';
      at = blockWith(c);
      /* symbols PaperTeX knows are written as commands already: this one
         has none to write */
      note = 'PaperTeX knows no LaTeX command for it. Delete it, or say it in words or as a formula.';
    } else if (file) {
      head = 'The engine here does not have ' + file[1];
      note = 'That package is outside the set bundled with PaperTeX. Download .tex and compile it with a full TeX installation, or leave the package out.';
    } else {
      at = blockAtLine(log, tex);
      note = at ? 'Check that part, or remove it, and compile again.' : 'Copy LaTeX shows the whole source, if you want to look for it.';
    }
    err.appendChild(h('div', 'pdf-errh', head));
    if (at) err.appendChild(h('div', 'pdf-errw', 'It is in ' + describeBlock(at) + '.'));
    err.appendChild(h('pre', 'pdf-errm', msg));
    err.appendChild(h('div', 'pdf-errn', note));
    if (at) {
      var go = h('button', 'dlg-btn primary', 'Show it');
      go.onclick = function () {
        closePdf();
        var el = at.id ? $('[data-bid="' + at.id + '"]') : $('.pt-head');
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('pt-flash');
        setTimeout(function () { el.classList.remove('pt-flash'); }, 1600);
        var f = el.querySelector('[data-part], .mfield, [contenteditable="true"]');
        if (f && f.classList.contains('mfield')) f.focus(); else if (f) D.placeCaret(f, true);
      };
      err.appendChild(go);
    }
    return err;
  }
  /* the block (or the title block) whose words hold the character c */
  function blockWith(c) {
    var meta = state.doc.meta;
    if ([meta.title, meta.date, meta.abstract].concat((meta.authors || []).map(function (a) { return a.name + ' ' + a.affil; }))
      .some(function (s) { return String(s || '').indexOf(c) >= 0; })) return { head: true };
    var hit = null;
    state.doc.blocks.some(function (b) { if (JSON.stringify(b).indexOf(c) >= 0) { hit = b; return true; } return false; });
    if (!hit && JSON.stringify(state.doc.bib).indexOf(c) >= 0) hit = state.doc.blocks.filter(function (b) { return b.t === 'bib'; })[0] || null;
    return hit;
  }
  /* the block whose LaTeX holds the line TeX's log names ("l.16 …") */
  function blockAtLine(log, tex) {
    var m = /(?:^|\n)l\.(\d+)/.exec(log);
    if (!m) return null;
    var lines = tex.split('\n'), n = parseInt(m[1], 10), line = '';
    for (var k = n - 1; k >= 0 && !line; k--) line = (lines[k] || '').trim();
    if (!line) return null;
    if (tex.indexOf('\\begin{document}') > tex.indexOf(line) && /\\(title|author|date)\{/.test(line)) return { head: true };
    var best = null, size = Infinity;
    state.doc.blocks.forEach(function (b) {
      var t = L.texOf(b, state.doc);
      if (t && t.split('\n').some(function (x) { return x.trim() === line; }) && t.length < size) { best = b; size = t.length; }
    });
    return best;
  }
  function describeBlock(b) {
    if (b.head) return 'the title, author or date';
    var words = function (html, n) {
      var t = L.plainText(html || '');
      var w = t.split(/\s+/).slice(0, n || 7).join(' ');
      return w ? '“' + w + (t.length > w.length ? '…' : '') + '”' : '';
    };
    var sec = null;
    for (var i = 0; i < state.doc.blocks.length && state.doc.blocks[i] !== b; i++) if (state.doc.blocks[i].t === 'section') sec = state.doc.blocks[i];
    var where = sec ? ' in “' + L.plainText(sec.html) + '”' : '';
    switch (b.t) {
      case 'section': return 'the heading ' + words(b.html);
      case 'para': return 'the paragraph ' + words(b.html) + where;
      case 'eq': return (b.numbered !== false && b.__nums && b.__nums[0] ? 'equation (' + b.__nums[0] + ')' : 'an unnumbered equation') + where;
      case 'list': return 'the list starting ' + words(b.items[0] && b.items[0].html);
      case 'table': return 'Table ' + (b.__num || '') + where;
      case 'figure': case 'chart': return 'Figure ' + (b.__num || '') + where;
      case 'theorem': return 'the ' + b.kind + where;
      case 'bib': return 'the reference list';
      case 'raw': return 'a LaTeX code block' + where;
      case 'code': return 'a code block' + where;
      default: return 'a ' + b.t + ' block' + where;
    }
  }

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
      if (opts.node) { opts.node.classList.add('dlg-b'); box.appendChild(opts.node); }
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
      if (!opts.noCancel) row.appendChild(cancel);   /* a message, not a question */
      /* a second answer besides OK (resolves 'alt') */
      if (opts.altLabel) {
        var alt = h('button', 'dlg-btn', opts.altLabel);
        alt.onclick = function () { close('alt'); };
        row.appendChild(alt);
      }
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

    /* A browser keeps Ctrl+N (new window) and Ctrl+R (reload) for itself,
       so those defaults are only given in the desktop app; Ctrl+O and
       Ctrl+P a page may take over, so they work on the web too. A key that
       is not bound is shown nowhere — not in a tooltip, not in the help. */
    add('Document', 'edit.undo', 'Undo', ['Ctrl+Z'], doUndo, { menu: 'undo', fieldsNative: true, glyph: '↶' });
    add('Document', 'edit.redo', 'Redo', ['Ctrl+Y', 'Ctrl+Shift+Z'], doRedo, { menu: 'redo', fieldsNative: true, glyph: '↷' });
    add('Document', 'doc.export', 'Download .tex', ['Ctrl+S'], exportTex, { menu: 'export', glyph: '⤓' });
    add('Document', 'doc.save', 'Save project', ['Ctrl+Shift+S'], click('#btnSave'), { menu: 'save', glyph: '💾' });
    add('Document', 'doc.open', 'Open a project or .tex file', ['Ctrl+O'], openProject, { menu: 'open', glyph: '📂' });
    add('Document', 'doc.new', 'New document', desk ? ['Ctrl+N'] : [], click('#btnNew'), { menu: 'new', glyph: '＋' });
    add('Document', 'doc.compile', 'Make PDF', desk ? ['Ctrl+R'] : [], compilePDF, { menu: 'compile', glyph: '▶' });
    add('Document', 'doc.print', 'Print the page as it looks', ['Ctrl+P'], printDoc, { menu: 'print', glyph: '⎙' });
    add('Document', 'doc.copy', 'Copy LaTeX', [], copyTex, { glyph: '⧉' });
    add('Document', 'view.palette', 'Show or hide the symbol palette', [], click('#btnPal'), { glyph: '▤' });
    add('Document', 'view.panel', 'Show or hide the LaTeX panel', [], click('#btnPanel'), { glyph: '▥' });
    add('Document', 'view.help', 'Tips and shortcuts', [], function () { openHelp(); }, { menu: 'help', glyph: '?' });
    add('Document', 'view.keys', 'Customize keyboard shortcuts', [], function () { K.open(); }, { menu: 'keys', glyph: '⌨' });
    add('Document', 'view.palette.cmd', 'Command palette', ['Ctrl+K'], function () { PT.palette.open(); },
      { glyph: '⌕', detail: 'also: \\ in text' });

    (PT.templates || []).forEach(function (t) {
      add('New document', 'new.' + t.id, 'New: ' + t.name, [], function () {
        /* from a keyboard command, a document replaced by another is asked
           about first (the New menu says so on its face) */
        dialog({ title: 'Start a new ' + (t.id === 'blank' ? 'blank document' : t.name.toLowerCase()) + '?',
          body: 'The document open now is kept: it stays under Open.', okLabel: 'Start it' })
          .then(function (yes) { if (yes) newFromTemplate(t); });
      },
        { glyph: t.icon, detail: t.desc });
    });

    add('Text', 'text.bold', 'Bold', ['Ctrl+B'], textCmd('bold'), { glyphHTML: '<b>B</b>', tex: '\\textbf' });
    add('Text', 'text.italic', 'Italic', ['Ctrl+I'], textCmd('italic'), { glyphHTML: '<i>I</i>', tex: '\\emph' });
    add('Text', 'text.ref', 'Reference to an equation, table, figure or section', [], function () { refPicker('ref'); return true; },
      { glyph: '↪', tex: '\\ref', detail: 'cross-reference, \\eqref · keeps its number up to date' });
    add('Text', 'text.cite', 'Cite a work from the reference list', [], function () { refPicker('cite'); return true; },
      { glyph: '[1]', tex: '\\cite', detail: 'citation' });
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
          function () { insertBlockHere(it[0]); },
          { glyph: it[2], detail: it[3], words: it[4], tex: it[0] === 'footnote' ? '\\footnote' : undefined });
      });
    });

    /* rows and columns of the matrix or cases display the caret is in */
    [['addrow', 'Matrix or cases: add a row below'], ['addcol', 'Matrix or cases: add a column to the right'],
      ['delrow', 'Matrix or cases: remove this row'], ['delcol', 'Matrix or cases: remove this column']].forEach(function (o) {
      add('Maths — Matrix', 'math.mat.' + o[0], o[1], [], function () {
        var f = activeMathField();
        if (!f || !f.matrixAt()) { toast('Put the caret in a matrix or cases display first.'); return true; }
        if (!f.matrixOp(o[0])) {
          toast(o[0] === 'addcol' ? 'A cases display has two columns, and a matrix at most ten.' : 'The last row or column stays — delete the whole display instead.');
        }
        return true;
      }, { glyph: '⊞', words: 'matrix cases row column pmatrix' });
    });
    add('Maths — Matrix', 'math.mat.open', 'Matrix or cases: edit it large', [], function () {
      var f = activeMathField();
      if (!f || !f.openMatrix()) toast('Put the caret in a formula with a matrix or cases display first.');
      return true;
    }, { glyph: '⤢', words: 'matrix cases zoom bigger large edit' });

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

  /* ------------------------------------------------------------- documents */
  /* Make `d` the document on the page, under store id `id`. Undo history
     belongs to a document, so it starts afresh. */
  function showDoc(id, d) {
    flushSave();
    state.docId = id;
    state.staleTab = false;
    state.backupNudged = false;
    if (state.bar) hideBar();
    state.undo = []; state.redo = [];
    S.setCurrent(id);
    restore(serialize(d));
    setSaveState('saved');
  }
  function switchTo(id) {
    if (id === state.docId) return;
    flushSave();
    S.load(id).then(function (json) {
      var d;
      try { d = normalizeDoc(JSON.parse(json)); } catch (e) { toast('That document could not be read.'); return; }
      showDoc(id, d);
      checkBackup();
    }, function () { toast('That document could not be read.'); });
  }
  /* a brand-new entry in the store, shown at once and written at once */
  function addDocument(d, message) {
    showDoc(S.newId(), d);
    save(true);
    if (message) toast(message);
  }
  function deleteDoc(rec) {
    dialog({
      title: 'Delete “' + rec.title + '”?',
      body: 'It is removed from this ' + (NATIVE ? 'app' : 'browser') + ' for good. A project file you saved to disk is not affected.',
      okLabel: 'Delete'
    }).then(function (yes) {
      if (!yes) return;
      S.remove(rec.id).then(function () {
        toast('Deleted “' + rec.title + '”.');
        if (rec.id !== state.docId) return;
        S.list().then(function (docs) {
          if (docs.length) switchTo(docs[0].id);
          else addDocument(D.newDoc());
        });
      });
    });
  }
  function relTime(t) {
    var s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    if (s < 7 * 86400) return Math.round(s / 86400) + ' d ago';
    return new Date(t).toLocaleDateString();
  }
  function sizeText(n) { return n < 1e6 ? Math.max(1, Math.round(n / 1024)) + ' kB' : (n / 1048576).toFixed(1) + ' MB'; }

  function newFromTemplate(t) {
    addDocument(t.build(), t.id === 'blank' ? 'New document started — the previous one is under Open.'
      : 'New ' + t.name.toLowerCase() + ' — replace the example text with your own.');
  }
  /* New: a blank page or a starting point */
  function newMenu(anchor) {
    D.closeAllPop();
    var m = h('div', 'popmenu docmenu');
    m.appendChild(h('div', 'popg', 'Start a new document'));
    (PT.templates || []).forEach(function (t) {
      var b = h('button', 'popitem tplitem');
      b.appendChild(h('span', 'popico', t.icon));
      var tx = h('span', 'poptx');
      tx.appendChild(h('span', 'popname', t.name));
      tx.appendChild(h('span', 'popdesc', t.desc));
      b.appendChild(tx);
      b.onclick = function () { D.closeAllPop(); newFromTemplate(t); };
      m.appendChild(b);
    });
    m.appendChild(h('div', 'docfoot', 'The document open now stays under Open.'));
    document.body.appendChild(m);
    var r = anchor.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 10, r.left + window.scrollX)) + 'px';
    m.style.top = (r.bottom + window.scrollY + 6) + 'px';
    var first = m.querySelector('.popitem');
    if (first) first.focus();
    setTimeout(function () {
      document.addEventListener('mousedown', function off(ev) {
        if (m.contains(ev.target)) return;
        D.closeAllPop();
        document.removeEventListener('mousedown', off, true);
      }, true);
    }, 0);
  }

  /* ⋯ on a phone: the toolbar buttons there is no room for, as a menu.
     Each entry presses the real button, so it does exactly what that does. */
  var MORE = [
    ['btnPalette', '⌕', 'Commands', 'Search every command, block and symbol'],
    ['btnHelp', '?', 'Shortcuts and tips', ''],
    ['btnPrint', '⎙', 'Quick print', 'The page as it looks here — a quick copy'],
    ['btnCopy', '⧉', 'Copy LaTeX', ''],
    ['btnTex', '⤓', 'Download .tex', ''],
    ['btnPal', '▤', 'Symbol palette', 'Show or hide'],
    ['btnPanel', '▥', 'LaTeX panel', 'Show or hide']
  ];
  function moreMenu(anchor) {
    D.closeAllPop();
    var m = h('div', 'popmenu moremenu');
    m.setAttribute('role', 'menu');
    MORE.forEach(function (it) {
      var src = $('#' + it[0]);
      if (!src) return;
      var b = h('button', 'popitem');
      b.setAttribute('role', 'menuitem');
      b.appendChild(h('span', 'popico', it[1]));
      var tx = h('span', 'poptx');
      tx.appendChild(h('span', 'popname', it[2]));
      if (it[3]) tx.appendChild(h('span', 'popdesc', it[3]));
      b.appendChild(tx);
      b.onclick = function () { D.closeAllPop(); anchor.setAttribute('aria-expanded', 'false'); src.click(); };
      m.appendChild(b);
    });
    document.body.appendChild(m);
    anchor.setAttribute('aria-expanded', 'true');
    var r = anchor.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth) + window.scrollX) + 'px';
    m.style.top = (r.bottom + window.scrollY + 6) + 'px';
    var first = m.querySelector('.popitem');
    if (first) first.focus();
    setTimeout(function () {
      document.addEventListener('mousedown', function off(ev) {
        if (m.contains(ev.target)) return;
        D.closeAllPop();
        anchor.setAttribute('aria-expanded', 'false');
        document.removeEventListener('mousedown', off, true);
      }, true);
    }, 0);
  }

  /* Open: the documents kept here, newest first, and files from disk. */
  function docsMenu(anchor, openFile) {
    D.closeAllPop();
    var m = h('div', 'popmenu docmenu');
    m.appendChild(h('div', 'popg', 'Documents in this ' + (NATIVE ? 'app' : 'browser')));
    var listBox = h('div', 'doclist');
    m.appendChild(listBox);
    S.list().then(function (docs) {
      if (!docs.length) listBox.appendChild(h('div', 'popnone', 'None yet.'));
      docs.forEach(function (d) {
        var row = h('div', 'docrow' + (d.id === state.docId ? ' on' : ''));
        var b = h('button', 'popitem docopen');
        b.appendChild(h('span', 'doct', d.title));
        b.appendChild(h('span', 'docm', (d.id === state.docId ? 'open now · ' : '') + relTime(d.updated) + ' · ' +
          sizeText(d.size) + (d.backedUp ? ' · copy saved ' + relTime(d.backedUp) : ' · no copy on disk')));
        b.onclick = function () { D.closeAllPop(); switchTo(d.id); };
        var x = h('button', 'docdel', '×');
        x.title = 'Delete from this ' + (NATIVE ? 'app' : 'browser');
        x.onclick = function (e) { e.stopPropagation(); D.closeAllPop(); deleteDoc(d); };
        row.appendChild(b);
        row.appendChild(x);
        listBox.appendChild(row);
      });
    });
    var f = h('button', 'popitem docfile', 'Open a file — a project or a .tex…');
    f.onclick = function () { D.closeAllPop(); openFile(); };
    m.appendChild(f);
    var foot = h('div', 'docfoot');
    m.appendChild(foot);
    var where = { idb: '', local: ' Stored in the small fallback storage — keep a copy on disk.',
      memory: ' Nothing can be stored here — use Save project.' }[S.kind()];
    S.estimate().then(function (e) {
      foot.textContent = (e ? sizeText(e.usage) + ' used. ' + (e.persisted
        ? 'Protected from automatic clearing.'
        : 'The ' + (NATIVE ? 'app' : 'browser') + ' may clear this when space runs low — keep copies of what matters.') : '') + where;
    });
    document.body.appendChild(m);
    var r = anchor.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 10, r.left + window.scrollX)) + 'px';
    m.style.top = (r.bottom + window.scrollY + 6) + 'px';
    setTimeout(function () {
      document.addEventListener('mousedown', function off(ev) {
        if (m.contains(ev.target)) return;
        D.closeAllPop();
        document.removeEventListener('mousedown', off, true);
      }, true);
    }, 0);
  }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(t.__t);
    t.__t = setTimeout(function () { t.classList.remove('on'); }, 3600);
  }

  /* -------------------------------------------------------------------- boot */
  /* Open the store, then the document last worked on (or the newest one, or
     the pre-IndexedDB copy if it could not be moved, or a fresh one). */
  /* Links into the editor, as the home page makes them:
       app.html#new=<template>   a new document from that template
       app.html#doc=<id>         that saved document
     The hash is taken off once followed, so a reload does not start a
     second new document. */
  function linkTarget() {
    var m = /^#(new|doc)=([\w-]+)$/.exec(location.hash || '');
    return m ? { kind: m[1], id: m[2] } : null;
  }
  function followLink() {
    var link = linkTarget();
    if (!link) return;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* file: */ }
    if (link.kind === 'doc') { if (link.id !== state.docId) switchTo(link.id); return; }
    var t = (PT.templates || []).filter(function (x) { return x.id === link.id; })[0];
    if (t) newFromTemplate(t);
  }

  /* The tips sheet is a dialog: it takes the focus while it is up (so Esc,
     Enter and screen readers find it) and gives it back when it goes. */
  var helpFrom = null;
  function openHelp() {
    var hp = $('#help');
    if (hp.classList.contains('on')) return;
    helpFrom = document.activeElement;
    hp.classList.add('on');
    setTimeout(function () { $('#helpClose').focus({ preventScroll: true }); }, 30);
  }
  function closeHelp() {
    var hp = $('#help');
    if (!hp.classList.contains('on')) return;
    hp.classList.remove('on');
    if (helpFrom && helpFrom !== document.body && document.body.contains(helpFrom) && helpFrom.focus) helpFrom.focus({ preventScroll: true });
    else if (hp.contains(document.activeElement)) document.activeElement.blur();
    helpFrom = null;
  }

  function boot() {
    var link = linkTarget();
    S.open().then(function () { return Promise.all([S.current(), S.list()]); }).then(function (r) {
      var cur = r[0], docs = r[1];
      var want = link && link.kind === 'doc' ? link.id : cur;
      var pick = docs.filter(function (d) { return d.id === want; })[0] ||
        docs.filter(function (d) { return d.id === cur; })[0] || docs[0];
      if (pick) return S.load(pick.id).then(function (json) { return { id: pick.id, json: json }; });
      var leg = S.legacy();
      return leg ? { id: S.newId(), json: leg, fresh: true } : null;
    }).catch(function () { return null; }).then(function (got) {
      start(got);
      followLink();
      window.addEventListener('hashchange', followLink);
    });
  }

  function start(got) {
    var d = null;
    if (got && got.json) { try { d = normalizeDoc(JSON.parse(got.json)); } catch (e) { d = null; } }
    state.docId = d ? got.id : S.newId();
    state.doc = d || D.newDoc();
    state.lastSnap = serialize(state.doc);
    S.setCurrent(state.docId);

    state.editor = new D.Editor($('#paper'), state.doc, {
      onChange: function (structural) {
        if (structural) snapshot(); else scheduleSnap();
        save();
        refresh();
      },
      onRendered: function () { pageGuides(); },
      onImage: function (b) {
        toast('Image added as ' + b.filename + ' — Download .tex sends the file with it.');
      },
      onFieldFocus: function (f) { state.editor.activeField = f; },
      /* LaTeX pasted onto the page (doc.js pasteTex) */
      onTexDocument: function (text, insertHere) {
        dialog({
          title: 'A whole LaTeX document',
          body: 'Open it as a document of its own, or insert its text here, into this one?',
          okLabel: 'Open as a new document', altLabel: 'Insert here'
        }).then(function (v) {
          if (v === 'alt') insertHere();
          else if (v) openTex(text, '');
        });
      },
      onTexNotes: function (notes) { texNotes(notes, 'The LaTeX is in. A few things in it are not things PaperTeX edits on the page:', 'Pasted LaTeX'); },
      onSettings: function () { buildSettings(); },
      toast: function (t) { toast(t); }
    });

    M.setAutoWords(state.doc.settings.autoMath !== false);
    /* the panels this window has room for, and the page fitted to the rest */
    fitLayout('start');
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

    /* A text selection running across formulas: the browser paints it over
       a formula as a scatter of boxes, one per run of glyphs. Each formula
       wholly inside the selection is marked instead (.imath.sel), and the
       stylesheet draws it as one band. */
    var selFrame = 0;
    document.addEventListener('selectionchange', function () {
      if (selFrame) return;
      selFrame = requestAnimationFrame(function () {
        selFrame = 0;
        var s = window.getSelection(), on = [];
        if (s.rangeCount && !s.isCollapsed) {
          [].forEach.call(document.querySelectorAll('#paper .imath, .studio .imath'), function (sp) {
            if (s.containsNode(sp, false)) on.push(sp);
          });
        }
        [].forEach.call(document.querySelectorAll('.imath.sel'), function (sp) {
          if (on.indexOf(sp) < 0) sp.classList.remove('sel');
        });
        on.forEach(function (sp) { sp.classList.add('sel'); });
      });
    });

    document.addEventListener('focusin', function (e) {
      var t = e.target;
      if (t && t.classList && (t.classList.contains('mfield') || t.classList.contains('mf-proxy'))) {
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
    $('#btnHelp').onclick = openHelp;
    $('#helpClose').onclick = closeHelp;
    $('#help').addEventListener('click', function (e) { if (e.target === $('#help')) closeHelp(); });
    $('#helpKeys').onclick = function () { closeHelp(); K.open(); };

    /* New and Open never replace the document on the page: every document
       stays in the store, reachable from Open. */
    $('#btnNew').onclick = function () { newMenu($('#btnNew')); };
    $('#btnPalette').onclick = function () { PT.palette.open(); };
    $('#btnMore').onclick = function () { moreMenu($('#btnMore')); };
    $('#btnSave').onclick = saveProject;
    /* a project file becomes a document of its own */
    /* …and so does a .tex file, read back into blocks (texread.js) */
    function openText(text, name) {
      var d;
      if (/\.tex$/i.test(name || '') || PT.texread.looksLikeTex(text)) { openTex(text, name); return; }
      try { d = normalizeDoc(JSON.parse(text)); } catch (e) { toast('That file is neither a PaperTeX project nor a .tex file.'); return; }
      addDocument(d, 'Opened “' + (PT.latex.plainText(d.meta.title) || 'Untitled document') + '”.');
    }
    function openTex(text, name) {
      var r, d;
      try { r = PT.texread.read(text); d = normalizeDoc(r.doc); }
      catch (e) { toast('PaperTeX could not read that .tex file.'); return; }
      var base = String(name || '').replace(/^.*[\\/]/, '').replace(/\.tex$/i, '');
      if (!PT.latex.plainText(d.meta.title) && base) d.meta.title = base.replace(/[&<>]/g, '');
      addDocument(d, 'Opened “' + (PT.latex.plainText(d.meta.title) || base || 'Untitled document') + '” from LaTeX.');
      if (r.notes.length) texNotes(r.notes);
    }
    /* what did not come back as it was, said once, plainly */
    function texNotes(notes, intro, title) {
      var box = h('div');
      box.appendChild(h('p', '', intro || 'The document is open. A few things in the LaTeX are not things PaperTeX edits on the page:'));
      var ul = h('ul', 'texnotes');
      notes.forEach(function (n) { ul.appendChild(h('li', '', n)); });
      box.appendChild(ul);
      box.appendChild(h('p', 'shint', 'Parts kept as LaTeX code are still in the .tex and in the PDF. Packages and \\newcommand are under Document → Extra preamble.'));
      dialog({ title: title || 'Opened from LaTeX', node: box, noCancel: true });
    }
    function openFile() {
      if (NATIVE) {
        NATIVE.open().then(function (r) { if (r.status === 'ok') openText(r.text, r.path); });
        return;
      }
      var inp = h('input');
      inp.type = 'file';
      inp.accept = '.json,.tex,application/json,application/x-tex,text/x-tex';
      inp.onchange = function () {
        var f = inp.files[0];
        if (!f) return;
        var fr = new FileReader();
        fr.onload = function () { openText(fr.result, f.name); };
        fr.readAsText(f);
      };
      inp.click();
    }
    function openProject() { docsMenu($('#btnOpen'), openFile); }
    $('#btnOpen').onclick = openProject;

    $$('.rtab').forEach(function (t) {
      /* looking at another tab leaves the caret where it was writing */
      t.onmousedown = function (e) { e.preventDefault(); };
      t.onclick = function () {
        $$('.rtab').forEach(function (x) { x.classList.remove('on'); });
        $$('.rpane').forEach(function (x) { x.classList.remove('on'); });
        t.classList.add('on');
        $('#' + t.dataset.pane).classList.add('on');
        M.layout($('#' + t.dataset.pane));
      };
    });
    /* a drawer opened on a narrow screen closes the other one */
    var oneDrawer = function (keep) {
      if (layoutWidth() <= 900) document.body.classList.add(keep === 'pal' ? 'nopanel' : 'nopal');
    };
    $('#btnPanel').onclick = function () {
      document.body.classList.toggle('nopanel');
      if (!document.body.classList.contains('nopanel')) oneDrawer('panel');
      fitLayout('toggle');
      setTimeout(pageGuides, 260);
    };
    $('#btnPal').onclick = function () {
      document.body.classList.toggle('nopal');
      if (!document.body.classList.contains('nopal')) oneDrawer('pal');
      fitLayout('toggle');
      setTimeout(pageGuides, 260);
    };
    $('#btnCopy2').onclick = copyTex;
    setupTexEditor();
    $('#btnTex2').onclick = exportTex;

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if ($('#help').classList.contains('on')) { e.preventDefault(); closeHelp(); return; }
      D.closeAllPop();
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
        help: openHelp,
        keys: function () { K.open(); }
      });
      document.body.classList.add('desktop');
    }

    window.addEventListener('resize', pageGuides);
    /* a resized or turned window: the page refits once it settles */
    var fitT = null;
    var refit = function () { clearTimeout(fitT); fitT = setTimeout(function () { fitLayout('resize'); }, 120); };
    window.addEventListener('resize', refit);
    window.addEventListener('orientationchange', refit);
    watchGuides();
    /* Leaving: write what is waiting, and if the work cannot be stored at
       all, let the browser ask before the tab goes. */
    window.addEventListener('pagehide', flushSave);
    document.addEventListener('visibilitychange', function () { if (document.hidden) flushSave(); });
    window.addEventListener('beforeunload', function (e) {
      flushSave();
      if (state.saveState === 'failed' || state.saveState === 'volatile') { e.preventDefault(); e.returnValue = ''; }
    });

    if (!d) save(true);              /* a fresh document is in the list from the start */
    else if (got.fresh) save(true);  /* the old single copy, written into the store */
    else { setSaveState(S.kind() === 'memory' ? 'volatile' : 'saved'); setTimeout(checkBackup, 4000); }

    var seen = true;
    try { seen = !!localStorage.getItem('papertex.seen'); localStorage.setItem('papertex.seen', '1'); } catch (e) { seen = true; }
    /* a phone gets one line, not a page of keyboard shortcuts it cannot use */
    var phone = window.innerWidth < 760 || (window.matchMedia && matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches);
    if (!seen && !phone) {
      /* never a dialog over the page at the start: it landed over the first
         words, and keys meant for the page went to it. A line about where
         the tips are; the formulas show their own (the hint under them) */
      toast('New here? Type “/” for blocks and “$” for a formula — tips are under “? Shortcuts”.');
    } else if (phone) {
      toast('PaperTeX is made for a computer with a keyboard — on a phone you can read and make small edits.');
    }
  }

  window.PT.app = { state: state, toast: toast, refresh: refresh, insertSymbol: insertSymbol };
  document.addEventListener('DOMContentLoaded', boot);
})();
