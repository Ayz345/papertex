/* PaperTeX — the studio: a chart or a table opened up to fill the window,
   with every setting beside it.

   It opens by itself when a chart or a table is added, and again whenever
   the chart is clicked (or a table's ⤢ button). The block is edited in
   place: every change shows on the page behind and in the LaTeX at once,
   and "Undo changes" puts the block back as it was when the studio opened.

     PT.studio.open(editor, block, fromElement)
     PT.studio.isOpen()                                                   */
(function () {
  'use strict';
  var C = PT.chart;
  var current = null;

  function h(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function reduced() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function same(a, b) { return String(a) === String(b); }
  /* put the saved state back into the same object, so every reference to the block stays good */
  function restore(obj, json) {
    var o = JSON.parse(json);
    Object.keys(obj).forEach(function (k) { if (k.indexOf('__') !== 0) delete obj[k]; });
    Object.keys(o).forEach(function (k) { obj[k] = o[k]; });
  }
  function blockById(doc, id) { return (doc.blocks || []).filter(function (x) { return x.id === id; })[0] || null; }
  function renderMath(root) {
    [].forEach.call(root.querySelectorAll('.imath'), function (span) {
      if (span.__field) return;   /* being written: it is a field just now */
      try { span.contentEditable = 'false'; PT.math.renderStatic(span, JSON.parse(span.dataset.m)); } catch (e) { /* leave it */ }
    });
  }
  function textOf(html) { return C.cellText(html); }

  /* ================================================== the frame ===== */

  /* The window-sized card, zoomed out of the block it was opened from. */
  function frame(editor, b, from, title) {
    if (current) current.done();
    var st = { editor: editor, b: b, doc: editor.doc, saved: JSON.stringify(b) };
    var root = h('div', 'studio');
    var back = h('div', 'st-back');
    var win = h('div', 'st-win');
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-modal', 'true');
    win.setAttribute('aria-label', title);
    var head = h('div', 'st-head');
    st.title = h('div', 'st-title', title);
    head.appendChild(st.title);
    head.appendChild(h('div', 'st-sub', 'Every change shows on the page and in the LaTeX as you make it'));
    head.appendChild(h('div', 'st-sp'));
    var undo = h('button', 'st-btn', 'Undo changes');
    undo.title = 'Put this back the way it was when the editor opened';
    head.appendChild(undo);
    var done = h('button', 'st-btn primary', 'Done');
    done.title = 'Back to the page (Esc)';
    head.appendChild(done);
    var body = h('div', 'st-body');
    st.stage = h('div', 'st-stage');
    st.panel = h('div', 'st-panel');
    body.appendChild(st.stage);
    body.appendChild(st.panel);
    win.appendChild(head);
    win.appendChild(body);
    root.appendChild(back);
    root.appendChild(win);
    document.body.appendChild(root);
    document.body.classList.add('st-open');
    st.root = root;
    st.win = win;

    st.done = function () {
      if (st.closed) return;
      st.closed = true;
      current = null;
      window.removeEventListener('resize', st.onResize);
      PT.doc.closeAllPop();
      document.body.classList.remove('st-open');
      editor.change(true);          /* one undo step for everything done here */
      editor.render();
      var host = editor.paper.querySelector('[data-bid="' + b.id + '"]');
      var to = host && (host.querySelector('.pt-chart, .pt-tabw') || host);
      back.classList.add('out');
      /* gone for good even if the animation never finishes (a background
         tab does not run it): a lingering studio would hold the keyboard */
      root.classList.add('closing');
      var gone = function () { if (root.parentNode) root.remove(); };
      setTimeout(gone, 400);
      zoom(win, to, true, gone);
      if (host) {
        var r = host.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) host.scrollIntoView({ block: 'center' });
      }
    };
    st.undo = function () {
      restore(b, st.saved);
      if (st.savedTable) { var t = blockById(st.doc, st.savedTableId); if (t) restore(t, st.savedTable); }
      editor.change();
      st.rebuild();
    };
    st.onResize = function () { if (st.draw) st.draw(); };
    window.addEventListener('resize', st.onResize);
    undo.onclick = function () { st.undo(); };
    done.onclick = function () { st.done(); };
    back.addEventListener('mousedown', function () { st.done(); });
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('.popmenu')) return;   /* a formula's own Esc only leaves it */
      e.preventDefault();
      e.stopPropagation();
      st.done();
    });
    current = st;
    /* Maths is laid out by measuring it, and while the card grows out of
       the page it is drawn scaled down: every formula comes out squashed.
       Once it stands at its real size, lay them all out again. */
    zoom(win, from, false, function () {
      if (st.closed) return;
      [].forEach.call(win.querySelectorAll('.mfield'), function (m) { if (m.__mf) m.__mf.render(); });
      renderMath(win);
      if (st.draw) st.draw();
    });
    return st;
  }

  /* The card grows out of the block on the page, and shrinks back into it. */
  function zoom(win, from, out, after) {
    var finish = function () { if (after) after(); };
    if (!from || reduced() || !win.animate) { finish(); return; }
    var a = from.getBoundingClientRect(), z = win.getBoundingClientRect();
    if (!a.width || !a.height || !z.width) { finish(); return; }
    var start = 'translate(' + (a.left - z.left) + 'px,' + (a.top - z.top) + 'px) scale(' +
      (a.width / z.width) + ',' + (a.height / z.height) + ')';
    var frames = [{ transform: start, opacity: 0.35 }, { transform: 'none', opacity: 1 }];
    if (out) frames.reverse();
    win.style.transformOrigin = '0 0';
    var an = win.animate(frames, { duration: out ? 220 : 320, easing: 'cubic-bezier(.2,.7,.2,1)', fill: out ? 'forwards' : 'none' });
    an.onfinish = finish;
  }

  /* ============================================== little controls ===== */

  function section(panel, title, hint) {
    var s = h('section', 'st-sec');
    s.appendChild(h('h3', 'st-h', title));
    if (hint) s.appendChild(h('p', 'st-hint', hint));
    panel.appendChild(s);
    return s;
  }
  function row(parent, label, cls) {
    var r = h('div', 'st-row' + (cls ? ' ' + cls : ''));
    if (label != null) r.appendChild(h('label', 'st-l', label));
    var c = h('div', 'st-c');
    r.appendChild(c);
    parent.appendChild(r);
    return c;
  }
  /* buttons side by side, one of them chosen */
  function seg(parent, opts, value, on) {
    var s = h('div', 'st-seg');
    opts.forEach(function (o) {
      var bt = h('button', same(o[0], value) ? 'on' : '', o[1]);
      if (o[2]) bt.title = o[2];
      bt.type = 'button';
      bt.onclick = function () { on(o[0]); };
      s.appendChild(bt);
    });
    parent.appendChild(s);
    return s;
  }
  function toggle(parent, label, value, on, title) {
    var l = h('label', 'st-tog');
    var i = h('input');
    i.type = 'checkbox';
    i.checked = !!value;
    i.onchange = function () { on(i.checked); };
    l.appendChild(i);
    l.appendChild(h('span', 'st-tog-k'));
    l.appendChild(h('span', 'st-tog-t', label));
    if (title) l.title = title;
    parent.appendChild(l);
    return i;
  }
  function input(parent, value, ph, on, cls) {
    var i = h('input', 'st-in' + (cls ? ' ' + cls : ''));
    i.value = value == null ? '' : value;
    i.placeholder = ph || '';
    i.spellcheck = false;
    i.oninput = function () { on(i.value, i); };
    parent.appendChild(i);
    return i;
  }
  function select(parent, opts, value, on, title) {
    var s = h('select', 'st-sel');
    opts.forEach(function (o) {
      var op = h('option', '', o[1]);
      op.value = o[0];
      if (same(o[0], value)) op.selected = true;
      s.appendChild(op);
    });
    if (title) s.title = title;
    s.onchange = function () { on(s.value); };
    parent.appendChild(s);
    return s;
  }
  function slider(parent, min, max, step, value, show, on) {
    var w = h('div', 'st-slide');
    var i = h('input');
    i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = value;
    var v = h('span', 'st-slide-v', show(+value));
    i.oninput = function () { v.textContent = show(+i.value); on(+i.value); };
    w.appendChild(i);
    w.appendChild(v);
    parent.appendChild(w);
    return i;
  }
  function button(parent, label, on, cls, title) {
    var bt = h('button', 'st-b' + (cls ? ' ' + cls : ''), label);
    bt.type = 'button';
    if (title) bt.title = title;
    bt.onclick = on;
    parent.appendChild(bt);
    return bt;
  }
  /* a colour: the chip, and under it the palette it opens */
  function colorPick(parent, hex, autoHex, on) {
    var chip = h('button', 'st-chip');
    chip.type = 'button';
    chip.title = 'Colour';
    chip.style.background = '#' + (hex || autoHex);
    var pal = null;
    chip.onclick = function () {
      if (pal) { pal.remove(); pal = null; return; }
      pal = h('div', 'st-pal');
      var auto = h('button', 'st-swatch auto' + (hex ? '' : ' on'), 'auto');
      auto.title = 'The chart’s own colour for this series';
      auto.onclick = function () { on(null); };
      pal.appendChild(auto);
      C.COLORS.forEach(function (c) {
        var sw = h('button', 'st-swatch' + (hex === c[1] ? ' on' : ''));
        sw.style.background = '#' + c[1];
        sw.title = c[0].replace(/^pt/, '');
        sw.onclick = function () { on(c[1]); };
        pal.appendChild(sw);
      });
      var any = h('input', 'st-anycol');
      any.type = 'color';
      any.value = '#' + (hex || autoHex).toLowerCase();
      any.title = 'Any colour';
      any.onchange = function () { on(any.value.slice(1).toUpperCase()); };
      pal.appendChild(any);
      var host = chip.closest('.st-card-s') || parent;
      host.appendChild(pal);
    };
    parent.appendChild(chip);
    return chip;
  }

  var PLACEMENT = [['htbp', 'Wherever it fits best'], ['!ht', 'Here, if at all possible'], ['t', 'Top of a page'],
    ['b', 'Bottom of a page'], ['p', 'On a page of its own']];

  /* the caption, edited as on the page (formulas with $ work here too) */
  function captionEditor(st, parent, onChange) {
    /* one line, as a caption is: Enter does not break it */
    var e = st.editor.lineEditable('div', 'st-in st-rich', st.b.caption || '', function (v) {
      st.b.caption = v;
      st.editor.change();
      if (onChange) onChange();
    });
    e.dataset.ph = 'Caption…';
    parent.appendChild(e);
    renderMath(e);
    return e;
  }

  /* ===================================================== the grid ===== */

  /* A spreadsheet over an array of rows (edited in place).
       opts.rich       cells take the editor's rich text, formulas included
       opts.header()   whether the first row is a header
       opts.align      column alignments, edited alongside, or null
       opts.change(structural)   after every edit */
  function Grid(st, host, rows, opts) {
    var g = { sel: { r: 0, c: 0 } };
    var tools = h('div', 'st-gtools');
    var wrap = h('div', 'st-gwrap');
    host.appendChild(tools);
    host.appendChild(wrap);
    var width = function () { return rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0) || 1; };
    var blank = function () { var r = []; for (var i = 0; i < width(); i++) r.push(''); return r; };
    function even() { var w = width(); rows.forEach(function (r) { while (r.length < w) r.push(''); }); if (opts.align) while (opts.align.length < w) opts.align.push('l'); }

    function structural() { opts.change(true); g.render(); }

    g.insertRow = function (at) { rows.splice(at, 0, blank()); g.sel = { r: at, c: g.sel.c }; structural(); };
    g.deleteRow = function (r) { if (rows.length < 2) return; rows.splice(r, 1); g.sel.r = Math.min(r, rows.length - 1); structural(); };
    g.moveRow = function (r, d) {
      var to = r + d;
      if (to < 0 || to >= rows.length) return;
      rows.splice(to, 0, rows.splice(r, 1)[0]);
      g.sel.r = to; structural();
    };
    g.insertCol = function (at) {
      rows.forEach(function (r) { r.splice(at, 0, ''); });
      if (opts.align) opts.align.splice(at, 0, 'c');
      g.sel = { r: g.sel.r, c: at }; structural();
    };
    g.deleteCol = function (c) {
      if (width() < 2) return;
      rows.forEach(function (r) { r.splice(c, 1); });
      if (opts.align) opts.align.splice(c, 1);
      g.sel.c = Math.min(c, width() - 1); structural();
    };
    g.moveCol = function (c, d) {
      var to = c + d;
      if (to < 0 || to >= width()) return;
      rows.forEach(function (r) { r.splice(to, 0, r.splice(c, 1)[0]); });
      if (opts.align) opts.align.splice(to, 0, opts.align.splice(c, 1)[0]);
      g.sel.c = to; structural();
    };
    /* numbers as numbers, words in the reader's alphabetical order */
    g.sort = function (c, dir) {
      var head = opts.header() ? rows.slice(0, 1) : [];
      var bodyRows = rows.slice(head.length);
      var vals = bodyRows.map(function (r) { return textOf(r[c]); });
      var numeric = vals.every(function (v) { return !v || C.num(v) !== null; });
      bodyRows.sort(function (a, b2) {
        var x = textOf(a[c]), y = textOf(b2[c]);
        if (!x && y) return 1;
        if (x && !y) return -1;
        var k = numeric ? C.num(x) - C.num(y) : x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' });
        return k * dir;
      });
      rows.splice.apply(rows, [0, rows.length].concat(head, bodyRows));
      structural();
    };

    function toolbar() {
      tools.textContent = '';
      var a = h('div', 'st-gt');
      a.appendChild(h('span', 'st-gtl', 'Row'));
      button(a, '+ above', function () { g.insertRow(g.sel.r); }, '', 'Insert a row above the selected cell');
      button(a, '+ below', function () { g.insertRow(g.sel.r + 1); }, '', 'Insert a row below the selected cell');
      button(a, '↑', function () { g.moveRow(g.sel.r, -1); }, 'ico', 'Move the row up');
      button(a, '↓', function () { g.moveRow(g.sel.r, 1); }, 'ico', 'Move the row down');
      button(a, 'Delete', function () { g.deleteRow(g.sel.r); }, 'danger', 'Delete the selected row');
      tools.appendChild(a);
      var b2 = h('div', 'st-gt');
      b2.appendChild(h('span', 'st-gtl', 'Column'));
      button(b2, '+ left', function () { g.insertCol(g.sel.c); }, '', 'Insert a column left of the selected cell');
      button(b2, '+ right', function () { g.insertCol(g.sel.c + 1); }, '', 'Insert a column right of the selected cell');
      button(b2, '←', function () { g.moveCol(g.sel.c, -1); }, 'ico', 'Move the column left');
      button(b2, '→', function () { g.moveCol(g.sel.c, 1); }, 'ico', 'Move the column right');
      button(b2, 'Sort A→Z', function () { g.sort(g.sel.c, 1); }, '', 'Sort the rows by this column, smallest first');
      button(b2, 'Z→A', function () { g.sort(g.sel.c, -1); }, '', 'Sort the rows by this column, largest first');
      button(b2, 'Delete', function () { g.deleteCol(g.sel.c); }, 'danger', 'Delete the selected column');
      tools.appendChild(b2);
    }

    function cellAt(r, c) { return wrap.querySelector('[data-rc="' + r + '_' + c + '"]'); }
    g.focus = function (r, c, atEnd) {
      var e = cellAt(r, c);
      if (e) PT.doc.placeCaret(e, atEnd !== false);
    };
    function mark() {
      [].forEach.call(wrap.querySelectorAll('.sel, .selh'), function (x) { x.classList.remove('sel', 'selh'); });
      var e = cellAt(g.sel.r, g.sel.c);
      if (e) e.parentNode.classList.add('sel');
      var ch = wrap.querySelector('[data-col="' + g.sel.c + '"]'), rh = wrap.querySelector('[data-row="' + g.sel.r + '"]');
      if (ch) ch.classList.add('selh');
      if (rh) rh.classList.add('selh');
    }
    function move(r, c) {
      if (r >= rows.length) { rows.push(blank()); g.sel = { r: r, c: c }; structural(); g.focus(r, c); return; }
      if (r < 0 || c < 0 || c >= width()) return;
      g.sel = { r: r, c: c };
      mark();
      g.focus(r, c);
    }
    function keys(ev, r, c) {
      if (ev.key === 'Tab') {
        ev.preventDefault();
        var w = width(), flat = r * w + c + (ev.shiftKey ? -1 : 1);
        if (flat < 0) return;
        move(Math.floor(flat / w), flat % w);
      } else if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        move(r + 1, c);
      } else if (ev.key === 'ArrowUp' && !ev.shiftKey) {
        ev.preventDefault(); move(r - 1, c);
      } else if (ev.key === 'ArrowDown' && !ev.shiftKey) {
        ev.preventDefault(); move(r + 1 < rows.length ? r + 1 : r, c);
      }
    }

    g.render = function () {
      even();
      toolbar();
      wrap.textContent = '';
      var tbl = h('table', 'st-grid' + (opts.header() ? ' hashead' : ''));
      var hr = h('tr', 'st-gh');
      hr.appendChild(h('th', 'st-corner'));
      for (var c = 0; c < width(); c++) (function (c) {
        var th = h('th', 'st-colh');
        th.dataset.col = c;
        th.appendChild(h('span', 'st-colk', String.fromCharCode(65 + (c % 26)) + (c >= 26 ? Math.floor(c / 26) : '')));
        if (opts.align) {
          var al = h('span', 'st-al');
          [['l', '⇤', 'Align left'], ['c', '↔', 'Centre'], ['r', '⇥', 'Align right']].forEach(function (o) {
            var bt = h('button', opts.align[c] === o[0] ? 'on' : '', o[1]);
            bt.type = 'button';
            bt.title = o[2];
            bt.onmousedown = function (e) { e.preventDefault(); };
            bt.onclick = function () { opts.align[c] = o[0]; opts.change(false); g.render(); };
            al.appendChild(bt);
          });
          th.appendChild(al);
        }
        th.onclick = function (e) { if (e.target.closest('button')) return; g.sel.c = c; mark(); g.focus(g.sel.r, c); };
        hr.appendChild(th);
      })(c);
      tbl.appendChild(hr);
      rows.forEach(function (r, ri) {
        var tr = h('tr', ri === 0 && opts.header() ? 'st-hrow' : '');
        var rh = h('th', 'st-rowh', ri === 0 && opts.header() ? 'H' : String(opts.header() ? ri : ri + 1));
        rh.title = ri === 0 && opts.header() ? 'Header row' : 'Row ' + (opts.header() ? ri : ri + 1);
        rh.dataset.row = ri;
        rh.onclick = function () { g.sel.r = ri; mark(); g.focus(ri, g.sel.c); };
        tr.appendChild(rh);
        r.forEach(function (v, ci) {
          var td = h('td', 'al-' + ((opts.align && opts.align[ci]) || 'l'));
          var e;
          if (opts.rich) {
            e = st.editor.richEditable('div', 'st-cell', v, function (nv) { r[ci] = nv; opts.change(false); }, {
              onKey: function (ev) { keys(ev, ri, ci); }
            });
          } else {
            e = h('div', 'st-cell');
            e.contentEditable = 'true';
            e.spellcheck = false;
            e.textContent = v;
            e.addEventListener('input', function () { r[ci] = e.textContent.replace(/[\t\n]/g, ' '); opts.change(false); });
            e.addEventListener('keydown', function (ev) { keys(ev, ri, ci); });
          }
          e.dataset.rc = ri + '_' + ci;
          e.addEventListener('focus', function () { g.sel = { r: ri, c: ci }; mark(); });
          td.appendChild(e);
          tr.appendChild(td);
        });
        tbl.appendChild(tr);
      });
      wrap.appendChild(tbl);
      if (opts.rich) renderMath(wrap);
      mark();
    };

    /* a block of cells from a spreadsheet lands cell by cell, from the selected one */
    wrap.addEventListener('paste', function (ev) {
      var text = ev.clipboardData && ev.clipboardData.getData('text/plain');
      if (!text || !/[\t\n]/.test(text.replace(/\s+$/, ''))) return;
      ev.preventDefault();
      ev.stopPropagation();
      var got = C.parseCSV(text);
      got.forEach(function (r, i) {
        r.forEach(function (t, j) {
          while (rows.length <= g.sel.r + i) rows.push(blank());
          while (width() <= g.sel.c + j) { rows.forEach(function (x) { x.push(''); }); if (opts.align) opts.align.push('r'); }
          rows[g.sel.r + i][g.sel.c + j] = opts.rich ? escHTML(t) : t;
        });
      });
      structural();
    }, true);
    /* bold, italic, underline in a cell: the page's shortcuts are asleep while the studio is open */
    wrap.addEventListener('keydown', function (ev) {
      if (!opts.rich || !(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
      var cmd = { b: 'bold', i: 'italic', u: 'underline' }[ev.key.toLowerCase()];
      if (!cmd) return;
      ev.preventDefault();
      document.execCommand(cmd);
      var cell = ev.target.closest && ev.target.closest('.st-cell');
      if (cell) cell.dispatchEvent(new Event('input'));
    });

    g.render();
    return g;
  }
  function escHTML(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* ===================================================== charts ===== */

  /* the kinds of chart, as the Type picker shows them */
  var KINDS = [
    ['function', 'ƒ(x)', 'Function', 'y = f(x), typed as a formula'],
    ['line', '⟋', 'Line', 'Points joined by lines'],
    ['scatter', '⁘', 'Scatter', 'Points on their own'],
    ['bar', '▮▮', 'Bar', 'Bars, side by side or stacked, upright or lying down'],
    ['hist', '▁▃▇▅', 'Histogram', 'How often each range of values comes up'],
    ['pie', '◔', 'Pie', 'Shares of a whole'],
    ['polar', '✿', 'Polar', 'r = f(θ), on a round grid'],
    ['surface', '⛰', '3D surface', 'z = f(x, y), seen from an angle']
  ];
  /* kinds that keep their ranges and axes when switched between */
  function family(k) { return k === 'line' || k === 'scatter' || k === 'bar' ? 'data' : k; }
  var FORMULA = { 'function': ['plain', 'y =', 'x^2'], polar: ['polar', 'r =', 'cos(3θ)'], surface: ['surface', 'z =', 'sin(x) cos(y)'] };
  var SAMPLE = {
    data: 'x\ty\n0\t1\n1\t3\n2\t2\n3\t5',
    hist: 'Score\n62\n71\n55\n80\n67\n74\n90\n58\n69\n77\n84\n65\n72\n60\n79\n68\n73\n88\n64\n70',
    pie: 'Item\tShare\nRent\t40\nFood\t25\nTransport\t15\nSavings\t12\nOther\t8'
  };
  function aspectOf(b) {
    if (b.kind === 'polar') return 1;
    if (b.kind === 'pie') return 0.72;
    return Math.max(0.3, Math.min(1.2, +b.aspect || (b.kind === 'surface' ? 0.75 : 0.62)));
  }

  function openChart(editor, b, from) {
    var st = frame(editor, b, from, 'Chart');
    var doc = editor.doc;
    var linked = b.from ? blockById(doc, b.from) : null;
    if (linked) { st.savedTable = JSON.stringify(linked); st.savedTableId = linked.id; }

    /* the text column the chart is set in, so the zoomed drawing keeps the
       page's proportions of text to plot */
    var body = editor.paper.querySelector('.pt-body');
    var colEm = body ? body.clientWidth / (parseFloat(getComputedStyle(body).fontSize) || 15) : 36;

    var view = h('div', 'st-view');
    var card = h('div', 'st-card st-paper');
    var plot = h('div', 'st-plot');
    var cap = h('div', 'st-figcap');
    var errs = h('div', 'st-errs');
    card.appendChild(plot);
    card.appendChild(cap);
    view.appendChild(card);
    view.appendChild(errs);
    st.stage.appendChild(view);
    var sheet = h('div', 'st-sheet');
    st.stage.appendChild(sheet);

    st.draw = function () {
      var aspect = aspectOf(b);
      /* the view's padding (24 a side) and the card's (26 across, 22 + 16 down) */
      var vw = view.clientWidth - 48 - 52 - 8;
      var vh = view.clientHeight - 48 - 38 - (cap.offsetHeight + 12) - errs.offsetHeight - 8;
      var wpx = Math.max(200, Math.min(vw, vh / aspect));
      card.style.width = wpx + 'px';
      plot.style.height = wpx * aspect + 'px';
      C.draw(plot, b, doc, { fit: true, colEm: colEm });
      errs.textContent = '';
      var er = plot.querySelector('.pt-cherr');
      if (er) errs.appendChild(er);
      cap.innerHTML = '';
      var lab = h('b', '', 'Figure ' + (b.__num || '') + ': ');
      cap.appendChild(lab);
      var ct = h('span');
      ct.innerHTML = PT.sanitize.clean(b.caption || '');
      if (!textOf(b.caption)) ct.appendChild(h('i', 'st-ph', 'no caption yet'));
      cap.appendChild(ct);
      renderMath(cap);
    };
    st.touch = function (panelToo) {
      editor.change();
      if (panelToo) st.buildPanel();
      st.draw();
    };

    /* ---- the data, under the chart ---- */
    function buildSheet() {
      sheet.textContent = '';
      var none = !!FORMULA[b.kind];
      sheet.classList.toggle('none', none);
      if (none) return;
      var t = b.from ? blockById(doc, b.from) : null;
      var head = h('div', 'st-sheeth');
      head.appendChild(h('b', '', t ? 'Data — Table ' + (t.__num || '') : 'Data'));
      head.appendChild(h('span', 'st-hint', t ? 'Edits here go into the table on the page.'
        : b.kind === 'hist' ? 'One value per row: the histogram counts them. Paste a column straight from a spreadsheet.'
        : b.kind === 'pie' ? 'One row per slice: its name, then its size.'
        : 'One row per point. Paste cells straight from Excel or Google Sheets.'));
      sheet.appendChild(head);
      var gh = h('div', 'st-gridhost');
      sheet.appendChild(gh);
      if (t) {
        Grid(st, gh, t.rows, {
          rich: true, align: t.align, header: function () { return !!t.header; },
          change: function (structural) { st.touch(structural); }
        });
      } else {
        var rows = C.parseCSV(b.data);
        if (!rows.length) rows = [['x', 'y'], ['', '']];
        var save = function () {
          b.data = rows.map(function (r) { return r.join('\t'); }).join('\n');
        };
        Grid(st, gh, rows, {
          rich: false, align: null,
          header: function () { return rows[0].some(function (c) { return c && C.num(c) === null; }); },
          change: function (structural) { save(); st.touch(structural); }
        });
      }
    }

    /* ---- switching kinds ---- */
    function setKind(v) {
      var was = b.kind;
      if (v === was) return;
      b.kind = v;
      var f0 = family(was), f1 = family(v);
      if (f0 !== f1) {
        /* ranges, steps and axes through 0 mean something else in each family */
        b.xmin = b.xmax = b.ymin = b.ymax = b.zmin = b.zmax = b.xstep = b.ystep = b.zstep = '';
        b.xlog = b.ylog = false;
        if (b.axes === 'middle' && v !== 'function') b.axes = 'box';
        if (v === 'function' && was === 'polar') b.axes = 'middle';
        /* labels belong to the axes they named: a surface gets x, y, z,
           a pie and a polar plot have none */
        var dataLike = function (f) { return f === 'data' || f === 'hist'; };
        if (v === 'surface') { b.xlabel = '$x$'; b.ylabel = '$y$'; b.zlabel = '$z$'; }
        else if (v === 'function') { b.xlabel = '$x$'; b.ylabel = '$y$'; }
        else if (v === 'pie' || v === 'polar') b.xlabel = b.ylabel = '';
        else if (!(dataLike(f0) && dataLike(f1))) b.xlabel = b.ylabel = '';
      }
      var F = FORMULA[v];
      if (F) {
        /* a formula that still makes sense is kept; otherwise an example */
        var keep = (b.fns || []).filter(function (fn) {
          var src = C.formulaOf(fn);
          return (typeof src === 'object' || String(src).trim()) && C.compile(src, F[0]).ok;
        });
        if (FORMULA[was] && keep.length) b.fns = v === 'surface' ? keep.slice(0, 1) : keep;
        else b.fns = [{ expr: F[2], name: '' }];
      } else {
        if (FORMULA[was]) b.fns = [];
        if (!b.from) {
          /* the rows stay unless the new kind cannot use them */
          var s0 = C.source(b, doc);
          var nums = s0.head.filter(function (_, i) { return s0.rows.some(function (r) { return C.num(r[i]) !== null; }); }).length;
          var fits = v === 'hist' ? nums >= 1 : s0.head.length >= 2 && nums >= 1;
          if (!b.data || !fits) b.data = SAMPLE[v] || SAMPLE.data;
        }
        autoCols(was);
      }
      if (v === 'surface' && !b.aspect) b.aspect = 0.75;
      st.rebuild();
    }
    /* the columns a kind draws from, chosen when the kind or the data changes */
    function autoCols(was) {
      var v = b.kind, src = C.source(b, doc);
      var numeric = function (i) { return src.rows.some(function (r) { return C.num(r[i]) !== null; }); };
      if (v === 'hist' || v === 'pie') {
        /* one column of numbers; for a pie, names from another */
        if (v === 'pie' && src.head.length > 1 && numeric(b.xcol | 0) && !numeric(0)) b.xcol = 0;
        var numCol = -1;
        for (var i = 0; i < src.head.length; i++) {
          if ((v === 'hist' || i !== (b.xcol | 0)) && numeric(i)) { numCol = i; break; }
        }
        b.ycols = [numCol >= 0 ? numCol : (src.head.length > 1 ? 1 : 0)];
      } else if (!(b.ycols && b.ycols.length) || was === 'hist' || was === 'pie' || b.ycols[0] === (b.xcol | 0)) {
        if (was === 'hist') b.xcol = 0;
        b.ycols = [];
        for (var j = 0; j < src.head.length; j++) if (j !== (b.xcol | 0) && numeric(j)) b.ycols.push(j);
        if (!b.ycols.length) b.ycols = [src.head.length > 1 ? 1 : 0];
      }
    }

    /* ---- the settings ---- */
    st.buildPanel = function () {
      var P = st.panel, keep = P.scrollTop;
      P.textContent = '';
      var rebuild = function () { st.touch(true); };
      var k = b.kind;

      var s1 = section(P, 'Type');
      var pick = h('div', 'st-seg many');
      KINDS.forEach(function (o) {
        var bt = h('button', o[0] === k ? 'on' : '');
        bt.type = 'button';
        bt.title = o[3];
        bt.appendChild(h('span', 'st-seg-i', o[1]));
        bt.appendChild(h('span', 'st-seg-t', o[2]));
        bt.onclick = function () { setKind(o[0]); };
        pick.appendChild(bt);
      });
      row(s1, null).appendChild(pick);

      if (k === 'function') functionPanel(P, rebuild);
      else if (k === 'polar') polarPanel(P, rebuild);
      else if (k === 'surface') surfacePanel(P, rebuild);
      else if (k === 'pie') piePanel(P, rebuild);
      else if (k === 'hist') histPanel(P, rebuild);
      else dataPanel(P, rebuild);

      if (k !== 'pie' && k !== 'surface') {
        var s7 = section(P, 'Legend');
        select(row(s7, 'Place'), [['auto', 'Automatic (the emptiest corner)'], ['north east', 'Top right'], ['north west', 'Top left'],
          ['south east', 'Bottom right'], ['south west', 'Bottom left'], ['outer north east', 'Outside, on the right'], ['none', 'Hidden']],
          b.legend === false ? 'none' : (b.legendPos || 'auto'), function (v) { b.legend = v !== 'none'; b.legendPos = v; st.touch(); });
      }

      var s8 = section(P, 'Size on the page');
      slider(row(s8, 'Width'), 30, 100, 5, Math.round((b.width || 0.75) * 100), function (v) { return v + '% of the text'; },
        function (v) { b.width = v / 100; st.touch(); });
      if (k !== 'pie' && k !== 'polar') {
        var asp = aspectOf(b);
        seg(row(s8, 'Shape'), [[0.5, 'Wide'], [0.62, 'Standard'], [0.8, 'Tall'], [1, 'Square']],
          [0.5, 0.62, 0.8, 1].reduce(function (best, v) { return Math.abs(v - asp) < Math.abs(best - asp) ? v : best; }, 0.62),
          function (v) { b.aspect = +v; rebuild(); });
      }

      var s9 = section(P, 'Caption and label');
      captionEditor(st, row(s9, null, 'full'), function () { st.draw(); });
      input(row(s9, 'Label'), b.label, 'fig:name — to refer to it with \\ref', function (v) {
        b.label = v.replace(/[^A-Za-z0-9:_-]/g, ''); editor.change();
      }, 'wide');
      select(row(s9, 'In the PDF'), PLACEMENT, b.placement || 'htbp', function (v) { b.placement = v; editor.change(); });

      P.scrollTop = keep;
      if (st.focusFn != null) {
        var ins = P.querySelectorAll('.st-fn-expr');
        var target = ins[st.focusFn];
        st.focusFn = null;
        if (target) target.focus();
      }
    };

    /* ---- inputs written the way the page is written ---- */

    /* the page's equation editor, as an input */
    function mathField(parent, root, o) {
      var host = h('div', 'st-in st-mf' + (o.cls ? ' ' + o.cls : ''));
      host.dataset.ph = o.ph || '';
      parent.appendChild(host);
      var mark = function () { host.classList.toggle('empty', PT.math.isEmptyRow(f.root)); };
      var f = new PT.math.MathField(host, {
        root: root, inline: !!o.inline,
        onChange: function (fl) { mark(); o.change(fl.root); },
        onEnter: function () { host.blur(); },
        onEscape: function () { host.blur(); },
        onBlur: function () { if (o.blur) o.blur(f); }
      });
      /* Esc leaves the field, not the studio */
      host.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { ev.stopPropagation(); host.blur(); } });
      mark();
      return f;
    }
    /* buttons for what is awkward to type; each says how to type it */
    var MKEYS = [
      ['frac', 'a/b', 'Fraction — or type /'], ['sup', 'x²', 'Power — or type ^'], ['sqrt', '√', 'Root — or type sqrt'],
      ['paren', '( )', 'Brackets — or type ('], ['abs', '|x|', 'Absolute value — or type |'],
      ['sum', 'Σ', 'Sum Σ — or type sum; ∞ above it adds terms until they stop mattering'],
      ['prod', 'Π', 'Product Π — or type prod'], ['int', '∫', 'Integral — or type int; end the formula inside with dt'],
      ['lim', 'lim', 'Limit as n → ∞ — or type lim, then n -> inf'],
      ['@infty', '∞', 'Infinity — or type inf'], ['@pi', 'π', 'π — or type pi'], ['!', 'n!', 'Factorial — or type !']
    ];
    function keysRow(parent, f, mode) {
      var row2 = h('div', 'st-mfkeys');
      MKEYS.concat(mode === 'polar' ? [['@theta', 'θ', 'The angle θ — or type theta']] : []).forEach(function (k) {
        var bt = h('button', 'st-mfk', k[1]);
        bt.type = 'button';
        bt.title = k[2];
        bt.onmousedown = function (ev) { ev.preventDefault(); };
        bt.onclick = function () {
          f.host.focus();
          if (k[0] === '!') f.insertNode(PT.math.ch('!'));
          else if (k[0].charAt(0) === '@') f.insertSymbol(PT.symbols.byCmd[k[0].slice(1)]);
          else f.insertBuild(k[0]);
        };
        row2.appendChild(bt);
      });
      parent.appendChild(row2);
    }
    /* a curve's formula: the field, its keys, and what is wrong with it */
    function formulaBox(top, below, fn, mode) {
      var err = h('div', 'st-fn-err');
      var ph = mode === 'polar' ? 'e.g. 1 + cos θ' : mode === 'surface' ? 'e.g. sin x · cos y' : 'e.g. 2x² − 3x + 1';
      /* a box still waiting to be filled — a Σ just put in, a fraction
         with no denominator yet */
      var gap = function (n, top) {
        if (!n || typeof n !== 'object') return false;
        if (n.t === 'row') return (!top && !n.k.length) || n.k.some(function (x) { return gap(x); });
        return Object.keys(n).some(function (k) { return k !== 't' && gap(n[k]); });
      };
      /* While a formula is being written its unfilled boxes are not
         mistakes yet: those are pointed out once you leave it. */
      var check = function (r, done) {
        var c = PT.math.isEmptyRow(r) ? { ok: true } : C.compile(r, mode);
        var quiet = !c.ok && !done && f && f.hasFocus() && gap(r, true);
        f.host.classList.toggle('bad', !c.ok && !quiet);
        err.textContent = c.ok || quiet ? '' : c.err.charAt(0).toUpperCase() + c.err.slice(1) + '.';
      };
      var f = mathField(top, C.mathOf(C.formulaOf(fn), mode), {
        cls: 'wide st-fn-expr', ph: ph,
        change: function (r) { fn.m = r; delete fn.expr; check(r); st.touch(); },
        blur: function (fl) { check(fl.root, true); }
      });
      check(f.root, true);
      keysRow(below, f, mode);
      below.appendChild(err);
      return f;
    }
    /* a number, or a value such as 2π or −π/2, written as math */
    function numField(parent, key, ph) {
      var f = mathField(parent, C.mathOf(b[key] == null ? '' : String(b[key]), 'plain'), {
        cls: 'num', ph: ph, inline: true,
        change: function (r) {
          if (PT.math.isEmptyRow(r)) { b[key] = ''; f.host.classList.remove('bad'); st.touch(); return; }
          var p = C.plainOf(r, 'plain'), v = p != null ? C.val(p) : null;
          f.host.classList.toggle('bad', v == null);
          f.host.title = v == null ? 'A number, or a value such as 2π or −π/2' : '';
          if (v != null) { b[key] = p; st.touch(); }
        }
      });
      return f;
    }
    function range(parent, label, lo, hi, ph0, ph1) {
      var r = row(parent, label);
      numField(r, lo, ph0);
      r.appendChild(h('span', 'st-to', 'to'));
      numField(r, hi, ph1);
      return r;
    }
    /* text with inline formulas ("$" starts one), on one line, as on the page */
    function legacyHTML(v) {
      return String(v || '').split('$').map(function (part, i) {
        if (i % 2 === 0) return escHTML(part);
        if (!part) return '';
        var m;
        try { m = PT.math.parseTex(part); } catch (e) { return escHTML(part); }
        return '<span class="imath" contenteditable="false" data-m="' + escHTML(JSON.stringify(m)).replace(/"/g, '&quot;') + '"></span>';
      }).join('');
    }
    function richLine(parent, obj, key, ph, after) {
      var v = obj[key] || '';
      var e = editor.richEditable('div', 'st-in st-rich st-line', C.isRich(v) ? v : legacyHTML(v), function (nv) {
        var keep = textOf(nv) || /class="imath/.test(nv);
        if (keep) obj[key] = nv; else delete obj[key];
        if (after) after();
        st.touch();
      }, { onKey: function (ev) { if (ev.key === 'Enter') ev.preventDefault(); } });
      e.dataset.ph = ph;
      parent.appendChild(e);
      renderMath(e);
      return e;
    }
    function titleRow(s) { richLine(row(s, 'Title'), b, 'title', 'above the chart (optional)'); }
    function gridRow(s, rebuild, fineToo) {
      var gv = b.grid === 'both' ? 'both' : (b.grid === false || b.grid === 'none') ? 'none' : 'major';
      seg(row(s, 'Grid'), [['none', 'None'], ['major', 'Lines']].concat(fineToo ? [['both', 'Fine']] : []), gv === 'both' && !fineToo ? 'major' : gv,
        function (v) { b.grid = v; rebuild(); });
    }
    /* a straight or a logarithmic scale, for one axis */
    function scaleSeg(parent, key, label, rebuild) {
      seg(row(parent, label), [[false, 'Linear'], [true, 'Logarithmic']], !!b[key], function (v) {
        b[key] = v === true || v === 'true';
        /* a log axis cannot start at 0 or below */
        var lo = key === 'xlog' ? 'xmin' : 'ymin', hi = key === 'xlog' ? 'xmax' : 'ymax';
        if (b[key]) {
          var a = C.val(b[lo]), z = C.val(b[hi]);
          if (a != null && !(a > 0)) b[lo] = '';
          if (z != null && !(z > 0)) b[hi] = '';
          if (key === 'xlog' && b.kind === 'function') { if (!b[lo]) b[lo] = '0.1'; if (!b[hi]) b[hi] = '100'; }
          if (b.axes === 'middle') b.axes = 'box';
        }
        rebuild();
      }, null);
    }
    function axesBox(s, rebuild, noMiddle) {
      seg(row(s, 'Axes'), [['box', 'Framed'], ['left', 'Arrows']].concat(noMiddle ? [] : [['middle', 'Crossing at 0']]),
        noMiddle && b.axes === 'middle' ? 'box' : (b.axes || 'box'), function (v) { b.axes = v; rebuild(); });
    }

    /* ---- y = f(x) ---- */
    function functionPanel(P, rebuild) {
      var s2 = section(P, 'Curves', 'Written as on the page: / makes a fraction, ^ a power; Σ, ∫ and lim work too — e.g. a Fourier sum Σ sin(nx)/n.');
      curveCards(s2, 0, true, 'plain');
      button(s2, '+ Add a curve', function () { b.fns.push({ m: PT.math.row(), name: '' }); st.focusFn = b.fns.length - 1; rebuild(); }, 'wide');
      range(s2, 'x from', 'xmin', 'xmax', b.xlog ? '0.1' : '-5', b.xlog ? '100' : '5');
      slider(row(s2, 'Curve detail'), 50, 500, 25, b.samples || 200, function (v) { return v + ' points'; }, function (v) { b.samples = v; st.touch(); });
      axesSection(P, rebuild, true);
    }

    /* ---- r = f(θ) ---- */
    function polarPanel(P, rebuild) {
      var s2 = section(P, 'Curves', 'r as a formula of the angle θ (type theta, or t): 1 + cos θ, cos 3θ, θ/2π.');
      curveCards(s2, 0, true, 'polar');
      button(s2, '+ Add a curve', function () { b.fns.push({ m: PT.math.row(), name: '' }); st.focusFn = b.fns.length - 1; rebuild(); }, 'wide');
      range(s2, 'θ from', 'xmin', 'xmax', '0', '2pi');
      slider(row(s2, 'Curve detail'), 90, 1000, 30, b.samples || 360, function (v) { return v + ' points'; }, function (v) { b.samples = v; st.touch(); });
      var s6 = section(P, 'Grid');
      titleRow(s6);
      seg(row(s6, 'Angles in'), [['deg', 'Degrees'], ['rad', 'Radians (π)']], b.angles === 'rad' ? 'rad' : 'deg', function (v) { b.angles = v; rebuild(); });
      seg(row(s6, 'A spoke every'), [[15, '15°'], [30, '30°'], [45, '45°'], [90, '90°']], b.astep || 30, function (v) { b.astep = +v; rebuild(); });
      var rr = row(s6, 'Radius up to');
      numField(rr, 'ymax', 'auto');
      rr.appendChild(h('span', 'st-to', 'rings every'));
      numField(rr, 'ystep', 'auto');
      gridRow(s6, rebuild, true);
    }

    /* ---- z = f(x, y) ---- */
    function surfacePanel(P, rebuild) {
      b.fns = b.fns && b.fns.length ? b.fns.slice(0, 1) : [{ expr: 'sin(x) cos(y)', name: '' }];
      var fn = b.fns[0];
      var s2 = section(P, 'Surface', 'A height for every point, written as on the page: sin x cos y, x² − y², a sum Σ over n, an integral ∫ … dt.');
      var top = h('div', 'st-cs-top st-formula');
      top.appendChild(h('span', 'st-y', 'z ='));
      s2.appendChild(top);
      var below = h('div', 'st-cs-below');
      s2.appendChild(below);
      formulaBox(top, below, fn, 'surface');
      range(s2, 'x from', 'xmin', 'xmax', '-3', '3');
      range(s2, 'y from', 'ymin', 'ymax', '-3', '3');
      slider(row(s2, 'Detail'), 8, 60, 1, b.samples3 || 25, function (v) { return v + ' × ' + v; }, function (v) { b.samples3 = v; st.touch(); });

      var s3 = section(P, 'Look');
      seg(row(s3, 'Drawn as'), [['surf', 'Surface'], ['mesh', 'Wire mesh']], b.surf === 'mesh' ? 'mesh' : 'surf', function (v) { b.surf = v; rebuild(); });
      if (b.surf !== 'mesh') seg(row(s3, 'Shading'), [['faceted', 'Faceted'], ['smooth', 'Smooth']], b.shader === 'smooth' ? 'smooth' : 'faceted',
        function (v) { b.shader = v; rebuild(); });
      var cm = h('div', 'st-cmap');
      Object.keys(C.CMAPS).forEach(function (name) {
        var o = h('button', 'st-cmap-o' + ((b.cmap || 'viridis') === name ? ' on' : ''));
        o.type = 'button';
        o.title = C.CMAPS[name][0];
        var stops = C.CMAPS[name][1];
        o.style.background = 'linear-gradient(90deg,' + stops.map(function (s) { return 'rgb(' + s.join(',') + ')'; }).join(',') + ')';
        o.appendChild(h('span', 'st-cmap-t', C.CMAPS[name][0]));
        o.onclick = function () { b.cmap = name; rebuild(); };
        cm.appendChild(o);
      });
      row(s3, 'Colours').appendChild(cm);
      toggle(row(s3, null), 'Colour bar beside it, with the heights', b.colorbar, function (v) { b.colorbar = v; st.touch(); });

      var s4 = section(P, 'View', 'Turn it round and tilt it. Every angle comes out the same in the PDF.');
      var ang = h('div', 'st-angle');
      var turn = h('div', 'st-angle-r');
      turn.appendChild(h('span', 'st-l', 'Turn'));
      slider(turn, -180, 180, 5, isFinite(parseFloat(b.az)) ? b.az : 25, function (v) { return v + '°'; }, function (v) { b.az = v; st.touch(); });
      var tilt = h('div', 'st-angle-r');
      tilt.appendChild(h('span', 'st-l', 'Tilt'));
      slider(tilt, 0, 90, 5, isFinite(parseFloat(b.el)) ? b.el : 30, function (v) { return v + '°'; }, function (v) { b.el = v; st.touch(); });
      ang.appendChild(turn);
      ang.appendChild(tilt);
      row(s4, null, 'full').appendChild(ang);
      var pre = row(s4, 'Presets');
      [['Standard', 25, 30], ['From the side', 0, 0], ['From above', 0, 90], ['Low', -35, 15]].forEach(function (p) {
        button(pre, p[0], function () { b.az = p[1]; b.el = p[2]; rebuild(); });
      });

      var s6 = section(P, 'Axes');
      titleRow(s6);
      richLine(row(s6, 'x label'), b, 'xlabel', 'type $ for a formula');
      richLine(row(s6, 'y label'), b, 'ylabel', 'type $ for a formula');
      richLine(row(s6, 'z label'), b, 'zlabel', 'type $ for a formula');
      range(s6, 'z range', 'zmin', 'zmax', 'auto', 'auto');
      gridRow(s6, rebuild, false);
    }

    /* ---- slices ---- */
    function dataSource(s3, labelCol, valueCol, valueLabel) {
      var tables = doc.blocks.filter(function (x) { return x.t === 'table'; });
      select(row(s3, 'From'), [['', 'Its own rows (under the chart)']].concat(tables.map(function (t) {
        return [t.id, 'Table ' + (t.__num || '') + (t.caption ? ' — ' + textOf(t.caption).slice(0, 28) : '')];
      })), b.from || '', function (v) {
        b.from = v;
        if (!v && !b.data) b.data = SAMPLE[b.kind] || SAMPLE.data;
        b.xcol = 0; b.ycols = [1];
        var t = v ? blockById(doc, v) : null;
        if (t && !st.savedTable) { st.savedTable = JSON.stringify(t); st.savedTableId = t.id; }
        autoCols(b.kind);
        st.rebuild();
      });
      var src = C.source(b, doc);
      var opts = src.head.map(function (n, i) { return [i, n || 'Column ' + (i + 1)]; });
      if (src.head.length && labelCol) select(row(s3, labelCol), opts, b.xcol | 0, function (v) { b.xcol = parseInt(v, 10); rebuild(); });
      if (src.head.length && valueCol) select(row(s3, valueLabel || 'Values'), opts, (b.ycols || [1])[0], function (v) {
        b.ycols = [parseInt(v, 10)]; rebuild();
      });
      return src;
      function rebuild() { st.touch(true); }
    }
    function piePanel(P, rebuild) {
      var s3 = section(P, 'Data');
      dataSource(s3, 'Names', true, 'Sizes');
      var m = C.model(b, doc);
      var s4 = section(P, 'Slices', 'Clockwise from the top, in the order of the rows.');
      var list = h('div', 'st-slices');
      b.sliceColors = b.sliceColors || {};
      m.slices.forEach(function (sl, i) {
        var it = h('div', 'st-slice');
        colorPick(it, b.sliceColors[i] || null, C.autoHex(i), function (hex) {
          if (hex) b.sliceColors[i] = hex; else delete b.sliceColors[i];
          st.touch(true);
        });
        it.appendChild(h('span', 'st-slice-n', sl.text || '—'));
        it.appendChild(h('span', 'st-slice-v', sl.pct + '%'));
        list.appendChild(it);
      });
      s4.appendChild(list);
      var s5 = section(P, 'Look');
      titleRow(s5);
      seg(row(s5, 'Names'), [['outside', 'Beside slices'], ['legend', 'In a key'], ['none', 'Hidden']], b.pieLabels || 'outside',
        function (v) { b.pieLabels = v; rebuild(); });
      seg(row(s5, 'Numbers'), [['percent', '%'], ['value', 'Values'], ['both', 'Both'], ['none', 'None']], b.pieNumbers || 'percent',
        function (v) { b.pieNumbers = v; rebuild(); });
      if ((b.pieNumbers || 'percent') !== 'value' && b.pieNumbers !== 'none') {
        seg(row(s5, 'Decimals'), [[0, '35%'], [1, '35.2%'], [2, '35.24%']], b.pieDec || 0, function (v) { b.pieDec = +v; rebuild(); });
      }
      toggle(row(s5, null), 'Ring (a hole in the middle)', b.donut, function (v) { b.donut = v; st.touch(); });
    }

    /* ---- counts ---- */
    function histPanel(P, rebuild) {
      var s3 = section(P, 'Data');
      var src = dataSource(s3, null, true, 'Values');
      var col = (b.ycols || [0])[0];
      b.style = b.style || {};
      var sty = b.style[col] || {};
      var save = function () { if (Object.keys(sty).length) b.style[col] = sty; else delete b.style[col]; };
      var nm = row(s3, 'Colour');
      colorPick(nm, sty.color || null, C.autoHex(0), function (hex) {
        if (hex) sty.color = hex; else delete sty.color;
        save(); st.touch(true);
      });
      richLine(nm, sty, 'name', 'name in the legend: ' + (src.head[col] || ''), save).classList.add('grow');

      var m = C.model(b, doc);
      var s4 = section(P, 'Bins', m.bins ? m.bins.n + ' bins, each ' + String(+m.bins.w.toPrecision(6)) + ' wide, from ' +
        String(+m.bins.start.toPrecision(6)) + '. ' + m.bins.N + ' values counted.' : null);
      slider(row(s4, 'How many'), 0, 40, 1, parseInt(b.bins, 10) || 0, function (v) { return v ? v + ' bins' : 'automatic'; },
        function (v) { b.bins = v || ''; if (v) b.binw = ''; st.touch(); });
      var rw = row(s4, 'Or each');
      numField(rw, 'binw', 'auto');
      rw.appendChild(h('span', 'st-to', 'wide, from'));
      numField(rw, 'binstart', 'auto');
      seg(row(s4, 'Heights'), [['count', 'Count'], ['percent', 'Percent'], ['density', 'Density']], b.histY || 'count',
        function (v) { b.histY = v; rebuild(); });
      toggle(row(s4, null), 'Write each count above its bar', b.values, function (v) { b.values = v; st.touch(); });
      toggle(row(s4, null), 'Normal curve with the same mean and spread', b.normal, function (v) { b.normal = v; rebuild(); });
      if (b.normal) {
        b.normalStyle = b.normalStyle || {};
        var ns = b.normalStyle;
        var card2 = h('div', 'st-card-s');
        var top = h('div', 'st-cs-top');
        colorPick(top, ns.color || null, C.autoHex(1), function (hex) { if (hex) ns.color = hex; else delete ns.color; st.touch(true); });
        richLine(top, ns, 'name', 'Normal curve').classList.add('grow');
        card2.appendChild(top);
        var sub = h('div', 'st-cs-sub');
        lineControls(sub, ns, C.look(b, { fn: true, st: ns, color: 1 }));
        card2.appendChild(sub);
        s4.appendChild(card2);
      }
      axesSection(P, rebuild, false);
    }

    /* ---- line, scatter, bar ---- */
    function dataPanel(P, rebuild) {
      var k = b.kind;
      var s3 = section(P, 'Data');
      var tables = doc.blocks.filter(function (x) { return x.t === 'table'; });
      select(row(s3, 'From'), [['', 'Its own rows (under the chart)']].concat(tables.map(function (t) {
        return [t.id, 'Table ' + (t.__num || '') + (t.caption ? ' — ' + textOf(t.caption).slice(0, 28) : '')];
      })), b.from || '', function (v) {
        b.from = v;
        if (!v && !b.data) b.data = SAMPLE.data;
        b.xcol = 0; b.ycols = [1];
        var t = v ? blockById(doc, v) : null;
        if (t && !st.savedTable) { st.savedTable = JSON.stringify(t); st.savedTableId = t.id; }
        st.rebuild();
      });
      var src = C.source(b, doc);
      if (src.head.length) {
        select(row(s3, k === 'bar' ? 'Labels' : 'x axis'), src.head.map(function (n, i) { return [i, n || 'Column ' + (i + 1)]; }),
          b.xcol | 0, function (v) {
            b.xcol = parseInt(v, 10);
            b.ycols = (b.ycols || []).filter(function (c) { return c !== b.xcol; });
            if (!b.ycols.length) b.ycols = [b.xcol === 0 ? 1 : 0];
            rebuild();
          }, k === 'bar' ? 'The column that names each bar' : 'The column along the horizontal axis');
        var s4 = section(P, 'Series', 'Each column of numbers can be a series: tick it, then style it.');
        src.head.forEach(function (n, i) {
          if (i === (b.xcol | 0)) return;
          seriesCard(s4, src, i, n);
        });
      }
      if (k === 'line') toggle(row(s3, null), 'Smooth lines', b.smooth, function (v) { b.smooth = v; st.touch(); });
      if (k === 'bar') {
        var sb = section(P, 'Bars');
        seg(row(sb, 'Direction'), [[false, '▮ Upright'], [true, '▬ Lying down']], !!b.horizontal, function (v) {
          b.horizontal = v === true || v === 'true'; rebuild();
        });
        seg(row(sb, 'Series'), [[false, 'Side by side'], [true, 'Stacked']], !!b.stacked, function (v) { b.stacked = v === true || v === 'true'; rebuild(); });
        if (!b.stacked) toggle(row(sb, null), 'Write each value at the end of its bar', b.values, function (v) { b.values = v; st.touch(); });
        slider(row(sb, 'Bar width'), 20, 100, 5, Math.round((b.barw || 0.8) * 100), function (v) { return v + '%'; },
          function (v) { b.barw = v / 100; st.touch(); });
      }
      if (k !== 'bar') {
        var s5 = section(P, 'Curves over the data', 'A model to compare with the data, e.g. 21 + 69e^{−0.075x}. For a fitted curve, give a series a trendline above.');
        curveCards(s5, (b.ycols || [1]).length, false, 'plain');
        button(s5, '+ Add a curve', function () { b.fns = b.fns || []; b.fns.push({ m: PT.math.row(), name: '' }); st.focusFn = b.fns.length - 1; rebuild(); }, 'wide');
      }
      axesSection(P, rebuild, false);
    }

    /* titles, ranges, ticks, scales: for every chart with x and y axes */
    function axesSection(P, rebuild, isFn) {
      var k = b.kind, bar = k === 'bar', hz = bar && b.horizontal;
      var s6 = section(P, 'Axes');
      titleRow(s6);
      var xl = bar ? 'Names axis' : 'x label', yl = bar ? 'Values axis' : 'y label';
      richLine(row(s6, xl), b, 'xlabel', bar ? 'what the bars are, e.g. Country' : 'e.g. Time t (s) — type $ for a formula');
      richLine(row(s6, yl), b, 'ylabel', 'type $ for a formula');
      if (!isFn && !bar) range(s6, 'x range', 'xmin', 'xmax', 'auto', 'auto');
      range(s6, bar ? 'Values from' : 'y range', 'ymin', 'ymax', 'auto', 'auto');
      var rt = row(s6, 'Tick every');
      if (!bar && !b.xlog) {
        rt.appendChild(h('span', 'st-to', 'x'));
        numField(rt, 'xstep', 'auto');
      }
      if (!b.ylog) {
        rt.appendChild(h('span', 'st-to', bar ? 'value' : 'y'));
        numField(rt, 'ystep', 'auto');
      }
      if (b.xlog && b.ylog) rt.appendChild(h('span', 'st-hint', 'at powers of ten, on log scales'));
      if (k === 'function' || k === 'line' || k === 'scatter') {
        var catX = k !== 'function' && C.model(b, doc).cats;
        if (!catX) scaleSeg(s6, 'xlog', 'x scale', rebuild);
        scaleSeg(s6, 'ylog', 'y scale', rebuild);
      }
      axesBox(s6, rebuild, b.xlog || b.ylog || k === 'hist' || hz);
      gridRow(s6, rebuild, true);
    }

    /* a formula with its look */
    function curveCards(parent, color0, keepOne, mode) {
      b.fns = b.fns || [];
      var lead = mode === 'polar' ? 'r =' : 'y =';
      b.fns.forEach(function (fn, i) {
        var card2 = h('div', 'st-card-s');
        var top = h('div', 'st-cs-top');
        var L = C.look(b, { fn: true, st: fn, color: color0 + i });
        colorPick(top, fn.color || null, C.autoHex(color0 + i), function (hex) {
          if (hex) fn.color = hex; else delete fn.color;
          st.touch(true);
        });
        top.appendChild(h('span', 'st-y', lead));
        var below = h('div', 'st-cs-below');
        formulaBox(top, below, fn, mode);
        if (b.fns.length > 1 || !keepOne) button(top, '×', function () { b.fns.splice(i, 1); st.touch(true); }, 'ico', 'Remove this curve');
        card2.appendChild(top);
        card2.appendChild(below);
        var sub = h('div', 'st-cs-sub');
        richLine(sub, fn, 'name', 'name in the legend — $ for maths').classList.add('grow');
        /* a guide line or an envelope needs no entry of its own */
        toggle(sub, 'In the legend', !fn.nolegend, function (v) { if (v) delete fn.nolegend; else fn.nolegend = true; st.touch(); },
          'Show this curve in the legend');
        lineControls(sub, fn, L);
        if (mode === 'polar') {
          toggle(sub, 'Shade inside', fn.fill, function (v) { if (v) fn.fill = 'axis'; else delete fn.fill; st.touch(); });
        } else fillControl(sub, fn, 'f' + i, function () {});
        card2.appendChild(sub);
        parent.appendChild(card2);
      });
    }
    function lineControls(parent, sty, L) {
      select(parent, [['solid', '—— solid'], ['dashed', '– – dashed'], ['dotted', '····· dotted'], ['dashdotted', '–·–· dash-dot']],
        L.dash, function (v) { if (v === 'solid') delete sty.dash; else sty.dash = v; st.touch(); }, 'Line style');
      select(parent, [['thin', 'thin'], ['semithick', 'medium'], ['thick', 'thick'], ['very thick', 'heavy'], ['ultra thick', 'heaviest']],
        L.thick, function (v) { sty.thick = v; st.touch(); }, 'Line width');
    }
    /* shading under a curve or a line, or between it and another */
    function fillControl(parent, sty, key, save) {
      var others = C.model(b, doc).series.filter(function (s) { return s.key !== key && (s.fn || b.kind === 'line') && !s.normal; });
      var opts = [['', 'no shading'], ['axis', 'shade down to the x axis']].concat(others.map(function (s) {
        return [s.key, 'shade up to ' + (s.name ? (C.isRich(s.name) ? textOf(s.name) : s.name.replace(/\$/g, '')) : s.fit ? 'its trendline' : 'curve ' + (parseInt(s.key.slice(1), 10) + 1))];
      }));
      select(parent, opts, sty.fill || '', function (v) {
        if (v) sty.fill = v; else delete sty.fill;
        save(); st.touch();
      }, 'Shade the area under this, or between it and another curve');
    }
    /* a trendline: the kind, and once fitted, its equation and R² */
    function trendControl(sub, card2, sty, col, save) {
      var kinds = Object.keys(C.FITS);
      select(sub, [['', 'no trendline']].concat(kinds.map(function (k) { return [k, 'trendline: ' + C.FITS[k].toLowerCase()]; })),
        sty.fit || '', function (v) {
          if (v) sty.fit = v; else ['fit', 'fitR2', 'fitExtend', 'fitDash', 'fitName'].forEach(function (k) { delete sty[k]; });
          save(); st.touch(true);
        }, 'Fit a curve to this series by least squares');
      if (!sty.fit) return;
      var s = C.model(b, doc).series.filter(function (x) { return !x.fn && x.col === col; })[0];
      var r = s && s.fit;
      var box = h('div', 'st-fit');
      if (!r || !r.ok) {
        box.appendChild(h('span', 'st-fn-err', 'This trendline ' + (r ? r.err : 'has no points to fit') + '.'));
        card2.appendChild(box);
        return;
      }
      var eq = h('span', 'st-fit-eq');
      PT.math.renderStatic(eq, PT.math.parseTex(r.tex));
      box.appendChild(eq);
      var r2 = h('span', 'st-fit-r2', 'R² = ' + C.r2Text(r.r2));
      r2.title = 'How much of the spread in y the trendline explains: 1 is all of it';
      box.appendChild(r2);
      var ins = button(box, 'Put in the text', function () {
        var e = PT.doc.blockFactory('eq');
        e.lines = [PT.math.parseTex(r.tex + ' \\qquad R^{2} = ' + C.r2Text(r.r2).replace('\u2212', '-'))];
        doc.blocks.splice(doc.blocks.indexOf(b) + 1, 0, e);
        editor.change(true);
        editor.render();
        ins.textContent = 'Added under the chart ✓';
        ins.disabled = true;
      }, 'st-fit-ins', 'Add the equation, with R², as a numbered equation under the chart');
      var opts = h('div', 'st-cs-sub');
      toggle(opts, 'R² in the legend', sty.fitR2, function (v) { if (v) sty.fitR2 = true; else delete sty.fitR2; save(); st.touch(); });
      toggle(opts, 'Across the whole axis', sty.fitExtend, function (v) { if (v) sty.fitExtend = true; else delete sty.fitExtend; save(); st.touch(); },
        'Draw it beyond the data, from one end of the x axis to the other');
      select(opts, [['dashed', '– – dashed'], ['solid', '—— solid'], ['dotted', '····· dotted']], sty.fitDash || 'dashed', function (v) {
        if (v === 'dashed') delete sty.fitDash; else sty.fitDash = v;
        save(); st.touch();
      }, 'Trendline style');
      card2.appendChild(box);
      card2.appendChild(opts);
    }
    /* one column of the data as a series: on or off, and how it looks */
    function seriesCard(parent, src, col, name) {
      var on = (b.ycols || [1]).indexOf(col) >= 0;
      b.style = b.style || {};
      var sty = b.style[col] || {};
      var card2 = h('div', 'st-card-s' + (on ? '' : ' off'));
      var top = h('div', 'st-cs-top');
      toggle(top, name || 'Column ' + (col + 1), on, function (v) {
        var ys = (b.ycols || [1]).filter(function (c) { return c !== col; });
        if (v) ys.push(col);
        ys.sort(function (x, y) { return x - y; });
        b.ycols = ys;
        st.touch(true);
      });
      card2.appendChild(top);
      if (on) {
        var si = (b.ycols || [1]).indexOf(col);
        var L = C.look(b, { st: sty, color: si });
        var save = function () { if (Object.keys(sty).length) b.style[col] = sty; else delete b.style[col]; };
        colorPick(top, sty.color || null, C.autoHex(si), function (hex) {
          if (hex) sty.color = hex; else delete sty.color;
          save(); st.touch(true);
        });
        var sub = h('div', 'st-cs-sub');
        richLine(sub, sty, 'name', 'name in the legend: ' + (name || ''), save).classList.add('grow');
        if (b.kind === 'line') lineControls(sub, sty, L);
        if (b.kind === 'line' || b.kind === 'scatter') {
          select(sub, [['*', '● dot'], ['o', '○ ring'], ['square*', '■ square'], ['square', '□ box'], ['triangle*', '▲ triangle'],
            ['diamond*', '◆ diamond'], ['x', '× cross'], ['+', '+ plus'], ['none', 'no points']], L.mark, function (v) {
            sty.mark = v; save(); st.touch();
          }, 'Points');
          if (L.mark !== 'none') select(sub, [['small', 'small'], ['normal', 'medium'], ['large', 'large']], L.msize, function (v) {
            sty.msize = v; save(); st.touch();
          }, 'Point size');
        }
        if (b.kind === 'line') fillControl(sub, sty, 'c' + col, save);
        var errOpts = [['', 'no error bars']].concat(src.head.map(function (n, i) { return [i, '± ' + (n || 'Column ' + (i + 1))]; })
          .filter(function (o) { return o[0] !== col && o[0] !== (b.xcol | 0); }));
        if (errOpts.length > 1) select(sub, errOpts, sty.err == null ? '' : sty.err, function (v) {
          if (v === '') delete sty.err; else sty.err = +v;
          save(); st.touch();
        }, 'Error bars: a column of ± uncertainties');
        card2.appendChild(sub);
        if (b.kind === 'line' || b.kind === 'scatter') trendControl(sub, card2, sty, col, save);
      }
      parent.appendChild(card2);
    }

    st.rebuild = function () {
      editor.change();
      buildSheet();
      st.buildPanel();
      st.draw();
    };
    st.rebuild();
    return st;
  }

  /* ====================================================== tables ===== */

  function openTable(editor, b, from) {
    var st = frame(editor, b, from, 'Table');
    var doc = editor.doc;
    var gh = h('div', 'st-gridhost big');
    st.stage.appendChild(gh);
    var pv = h('div', 'st-preview');
    pv.appendChild(h('div', 'st-pvh', 'On the page'));
    var pvBody = h('div', 'st-paper st-pvb');
    pv.appendChild(pvBody);
    st.stage.appendChild(pv);
    var grid = null, timer = 0;

    /* the table as it will be printed */
    st.draw = function () {
      pvBody.textContent = '';
      /* the caption spaced as the page spaces a table's, above or below it */
      var cap = h('div', 'pt-cap pt-tcap' + (b.capBelow ? ' below' : ''));
      cap.appendChild(h('span', 'pt-capl', 'Table ' + (b.__num || '') + ': '));
      var ct = h('span');
      ct.innerHTML = PT.sanitize.clean(b.caption || '');
      cap.appendChild(ct);
      var tbl = h('table', PT.doc.tableClass(b));
      b.rows.forEach(function (r, ri) {
        var head = ri === 0 && b.header;
        var tr = h('tr', head ? 'hdr' : '');
        r.forEach(function (c, ci) {
          var td = h(head ? 'th' : 'td', 'al-' + (b.align[ci] || 'l'));
          td.innerHTML = PT.sanitize.clean(c);
          tr.appendChild(td);
        });
        tbl.appendChild(tr);
      });
      if (b.capBelow) { pvBody.appendChild(tbl); pvBody.appendChild(cap); } else { pvBody.appendChild(cap); pvBody.appendChild(tbl); }
      renderMath(pvBody);
    };
    st.touch = function (structural) {
      editor.change();
      if (structural) st.buildPanel();
      clearTimeout(timer);
      timer = setTimeout(st.draw, structural ? 0 : 120);
    };

    st.buildPanel = function () {
      var P = st.panel, keep = P.scrollTop;
      P.textContent = '';
      var redo = function () { st.touch(true); grid.render(); };

      var s1 = section(P, 'Look');
      var style = b.booktabs ? 'booktabs' : b.rules ? 'grid' : 'plain';
      seg(row(s1, null), [['booktabs', 'Clean', 'Rules above, below and under the header (booktabs)'],
        ['grid', 'Grid', 'A line between every cell'], ['plain', 'Plain', 'No lines']], style, function (v) {
        b.booktabs = v === 'booktabs'; b.rules = v === 'grid'; redo();
      });
      var tg = row(s1, null, 'stack');
      toggle(tg, 'First row is a header', b.header, function (v) { b.header = v; redo(); });
      toggle(tg, 'Header in bold', b.boldHeader !== false, function (v) { b.boldHeader = v; st.touch(); });
      toggle(tg, 'First column in bold', b.boldFirst, function (v) { b.boldFirst = v; st.touch(); });
      toggle(tg, 'Shade every other row', b.zebra, function (v) { b.zebra = v; st.touch(); });
      seg(row(s1, 'Text'), [['normal', 'Normal'], ['small', 'Small'], ['footnotesize', 'Smaller']], b.size || 'normal', function (v) {
        if (v === 'normal') delete b.size; else b.size = v;
        redo();
      });

      var s2 = section(P, 'Size');
      var rs = row(s2, null);
      var nr = input(rs, b.rows.length, '', function () {}, 'num');
      nr.type = 'number'; nr.min = 1; nr.max = 500;
      rs.appendChild(h('span', 'st-to', 'rows ×'));
      var nc = input(rs, b.align.length, '', function () {}, 'num');
      nc.type = 'number'; nc.min = 1; nc.max = 40;
      rs.appendChild(h('span', 'st-to', 'columns'));
      var apply = function () {
        var R = Math.max(1, Math.min(500, parseInt(nr.value, 10) || 1)), K = Math.max(1, Math.min(40, parseInt(nc.value, 10) || 1));
        while (b.rows.length < R) b.rows.push(b.align.map(function () { return ''; }));
        b.rows.length = R;
        b.rows.forEach(function (r) { while (r.length < K) r.push(''); r.length = K; });
        while (b.align.length < K) b.align.push('c');
        b.align.length = K;
        redo();
      };
      nr.onchange = apply;
      nc.onchange = apply;

      var s3 = section(P, 'Rearrange');
      var ra = row(s3, null, 'wrap');
      button(ra, 'Swap rows and columns', function () {
        var w = b.align.length, out = [];
        for (var c = 0; c < w; c++) out.push(b.rows.map(function (r) { return r[c] || ''; }));
        b.rows = out;
        b.align = out[0].map(function (_, j) { return j === 0 ? 'l' : 'c'; });
        grid = null; st.rebuild();
      });
      button(ra, 'Sort by the selected column ↑', function () { grid.sort(grid.sel.c, 1); });
      button(ra, '↓', function () { grid.sort(grid.sel.c, -1); });

      var s4 = section(P, 'Calculate', 'Adds a row underneath with the result for every column of numbers.');
      var ca = row(s4, null, 'wrap');
      button(ca, 'Σ  Totals row', function () { summary('Total', function (v) { return v.reduce(function (a, x) { return a + x; }, 0); }); });
      button(ca, 'x̄  Average row', function () { summary('Mean', function (v) { return v.reduce(function (a, x) { return a + x; }, 0) / v.length; }); });
      button(ca, 'Min / max rows', function () {
        summary('Min', function (v) { return Math.min.apply(null, v); });
        summary('Max', function (v) { return Math.max.apply(null, v); });
      });

      var s5 = section(P, 'Caption and label');
      captionEditor(st, row(s5, null, 'full'), function () { st.touch(); });
      seg(row(s5, 'Caption'), [[false, 'Above the table'], [true, 'Below it']], !!b.capBelow, function (v) {
        b.capBelow = v === true || v === 'true'; st.touch(true);
      });
      input(row(s5, 'Label'), b.label, 'tab:name — to refer to it with \\ref', function (v) {
        b.label = v.replace(/[^A-Za-z0-9:_-]/g, ''); editor.change();
      }, 'wide');
      select(row(s5, 'In the PDF'), PLACEMENT, b.placement || 'htbp', function (v) { b.placement = v; editor.change(); });

      var s6 = section(P, 'Data');
      var da = row(s6, null, 'wrap');
      button(da, 'Import a CSV file…', function () { importCSV(); });
      button(da, 'Copy as CSV', function () {
        var csv = b.rows.map(function (r) {
          return r.map(function (c) { var t = textOf(c); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }).join(',');
        }).join('\n');
        if (navigator.clipboard) navigator.clipboard.writeText(csv);
      }, '', 'For a spreadsheet');
      button(da, '📊  Make a chart from it', function () {
        var i = doc.blocks.indexOf(b);
        st.done();
        if (i >= 0) editor.chartFromTable(b, i);
      }, 'accent');
      P.scrollTop = keep;
    };

    /* a row of totals (or means …) under the numbers, with as many
       decimals as the column already uses */
    function summary(name, fn) {
      var w = b.align.length, out = [];
      var body = b.rows.slice(b.header ? 1 : 0);
      for (var c = 0; c < w; c++) {
        var cells = body.map(function (r) { return textOf(r[c]); }).filter(Boolean);
        var nums = cells.map(C.num);
        if (c > 0 && cells.length && nums.every(function (v) { return v !== null; })) {
          var dec = cells.reduce(function (m, t) { var k = /[.,](\d+)/.exec(t); return Math.max(m, k ? k[1].length : 0); }, 0);
          if (name === 'Mean') dec = Math.max(dec, 1);
          var v = fn(nums);
          var s = v.toFixed(dec);
          if (cells.some(function (t) { return /\d,\d/.test(t); })) s = s.replace('.', ',');
          out.push(s);
        } else out.push(c === 0 ? '<b>' + name + '</b>' : '');
      }
      b.rows.push(out);
      st.touch(true);
      grid.render();
    }
    function importCSV() {
      var inp = h('input');
      inp.type = 'file';
      inp.accept = '.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain';
      inp.onchange = function () {
        var f = inp.files[0];
        if (!f) return;
        var fr = new FileReader();
        fr.onload = function () {
          var rows = C.parseCSV(String(fr.result).replace(/^﻿/, '')).slice(0, 500);
          if (!rows.length) return;
          var w = Math.max.apply(null, rows.map(function (r) { return r.length; }));
          b.rows = rows.map(function (r) { var o = r.map(escHTML); while (o.length < w) o.push(''); return o; });
          b.align = b.rows[0].map(function (_, j) {
            var body = rows.slice(1).map(function (r) { return r[j]; }).filter(Boolean);
            return body.length && body.every(function (t) { return C.num(t) !== null; }) ? 'r' : 'l';
          });
          b.header = rows.length > 1 && rows[0].some(function (t) { return t && C.num(t) === null; });
          grid = null;
          st.rebuild();
        };
        fr.readAsText(f);
      };
      inp.click();
    }

    st.rebuild = function () {
      editor.change();
      gh.textContent = '';
      grid = Grid(st, gh, b.rows, {
        rich: true, align: b.align, header: function () { return !!b.header; },
        change: function (structural) { st.touch(structural); }
      });
      st.buildPanel();
      st.draw();
    };
    st.rebuild();
    setTimeout(function () { grid.focus(grid.sel.r, grid.sel.c); }, reduced() ? 0 : 330);
    return st;
  }

  function open(editor, b, from) {
    if (!b) return null;
    if (!from) {
      var host = editor.paper.querySelector('[data-bid="' + b.id + '"]');
      from = host && (host.querySelector('.pt-chart, .pt-tabw') || host);
    }
    if (b.t === 'chart') return openChart(editor, b, from);
    if (b.t === 'table') return openTable(editor, b, from);
    return null;
  }

  window.PT = window.PT || {};
  window.PT.studio = { open: open, isOpen: function () { return !!current; } };
})();
