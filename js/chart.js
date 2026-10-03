/* PaperTeX — charts: a function plot or a chart of data, drawn on the page
   and written out as pgfplots.

   The page and the PDF are drawn from the same numbers. Whatever pgfplots
   would choose by itself (axis limits, tick spacing, where a curve stops
   near an asymptote) is decided here instead and written into the axis
   options, so the PDF looks like the page rather than like a guess at it.

   A function is typed the way it is written on paper: 2x^2 - 3x + 1,
   sin x, e^(-x^2/2), |x|. It is parsed here, never evaluated as code, and
   the parse tree is turned into pgfmath for the .tex (where trigonometry
   works in degrees, so sin x becomes sin(deg(x))). */
(function () {
  'use strict';

  /* the colours a chart cycles through, in order; any other colour picked
     by hand gets a \definecolor of its own */
  var COLORS = [
    ['ptblue', '1F77B4'], ['ptred', 'D62728'], ['ptgreen', '2CA02C'], ['ptorange', 'FF7F0E'],
    ['ptpurple', '9467BD'], ['ptbrown', '8C564B'], ['ptpink', 'E377C2'], ['ptcyan', '17BECF'],
    ['ptolive', 'BCBD22'], ['ptgray', '7F7F7F'], ['ptblack', '000000']
  ];
  var SAMPLES = 200;

  /* line and mark styles, by their TikZ names (sizes in pt) */
  var THICK = { thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 };
  var DASHES = ['solid', 'dashed', 'dotted', 'dashdotted'];
  var MARKS = ['*', 'o', 'square*', 'square', 'triangle*', 'diamond*', 'x', '+', 'none'];
  var MSIZE = { small: 1.2, normal: 1.8, large: 2.6 };
  var LEGEND_POS = ['north east', 'north west', 'south east', 'south west', 'outer north east'];

  /* ================================================== expressions ===== */

  function deg(a) { return 'deg(' + a + ')'; }
  function rad(a) { return 'rad(' + a + ')'; }
  /* name: [arity, js, pgf] */
  var FN = {
    sin: [1, Math.sin, function (a) { return 'sin(' + deg(a) + ')'; }],
    cos: [1, Math.cos, function (a) { return 'cos(' + deg(a) + ')'; }],
    tan: [1, Math.tan, function (a) { return 'tan(' + deg(a) + ')'; }],
    cot: [1, function (x) { return 1 / Math.tan(x); }, function (a) { return 'cot(' + deg(a) + ')'; }],
    sec: [1, function (x) { return 1 / Math.cos(x); }, function (a) { return 'sec(' + deg(a) + ')'; }],
    csc: [1, function (x) { return 1 / Math.sin(x); }, function (a) { return 'cosec(' + deg(a) + ')'; }],
    asin: [1, Math.asin, function (a) { return rad('asin(' + a + ')'); }],
    acos: [1, Math.acos, function (a) { return rad('acos(' + a + ')'); }],
    atan: [1, Math.atan, function (a) { return rad('atan(' + a + ')'); }],
    sinh: [1, Math.sinh, null], cosh: [1, Math.cosh, null], tanh: [1, Math.tanh, null],
    exp: [1, Math.exp, null],
    ln: [1, Math.log, null],
    log: [1, Math.log10 || function (x) { return Math.log(x) / Math.LN10; }, function (a) { return 'log10(' + a + ')'; }],
    log2: [1, Math.log2 || function (x) { return Math.log(x) / Math.LN2; }, null],
    sqrt: [1, Math.sqrt, null],
    abs: [1, Math.abs, null],
    floor: [1, Math.floor, null], ceil: [1, Math.ceil, null], round: [1, Math.round, null],
    sign: [1, function (x) { return x > 0 ? 1 : x < 0 ? -1 : 0; }, null],
    min: [2, Math.min, null], max: [2, Math.max, null]
  };
  var ALIAS = { arcsin: 'asin', arccos: 'acos', arctan: 'atan', sgn: 'sign', cosec: 'csc', tg: 'tan', ctg: 'cot', lg: 'log' };
  var CONST = { pi: Math.PI, e: Math.E, '\u03c0': Math.PI };

  function tokenize(s) {
    s = String(s)
      .replace(/[\u2212\u2013]/g, '-').replace(/[\u00b7\u22c5\u00d7]/g, '*').replace(/\u00f7/g, '/')
      .replace(/\u00b2/g, '^2').replace(/\u00b3/g, '^3').replace(/\u221a/g, 'sqrt');
    var out = [], i = 0, m;
    while (i < s.length) {
      var c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if ((m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i)))) {
        out.push({ k: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue;
      }
      if ((m = /^[A-Za-z\u03c0]+\d*/.exec(s.slice(i)))) {
        out.push({ k: 'id', v: m[0] }); i += m[0].length; continue;
      }
      if ('+-*/^(),|'.indexOf(c) >= 0) { out.push({ k: c }); i++; continue; }
      throw new Error('“' + c + '” is not something a formula can contain');
    }
    return out;
  }

  /* A run of letters is read greedily into the names it is made of, the way
     "xsin" or "2pix" are meant: functions, constants and x. */
  function splitWord(w) {
    var parts = [], i = 0;
    var names = Object.keys(FN).concat(Object.keys(ALIAS), Object.keys(CONST), ['x'])
      .sort(function (a, b) { return b.length - a.length; });
    while (i < w.length) {
      var hit = null;
      for (var j = 0; j < names.length; j++) {
        if (w.substr(i, names[j].length).toLowerCase() === names[j]) { hit = names[j]; break; }
      }
      if (!hit) throw new Error('“' + w + '” is not a function this knows — use x as the variable');
      parts.push(hit); i += hit.length;
    }
    return parts;
  }

  function parse(src) {
    var raw = tokenize(src), toks = [];
    raw.forEach(function (t) {
      if (t.k !== 'id') { toks.push(t); return; }
      var m = /^(.*?)(\d+)$/.exec(t.v);           /* log2 is a name; x2 is x·2 */
      var word = t.v, digits = '';
      if (m && !FN[t.v.toLowerCase()]) { word = m[1]; digits = m[2]; }
      splitWord(word).forEach(function (p) { toks.push({ k: 'id', v: ALIAS[p] || p }); });
      if (digits) toks.push({ k: 'num', v: parseFloat(digits) });
    });
    var p = 0, absDepth = 0;
    function peek() { return toks[p]; }
    function eat(k) {
      var t = toks[p];
      if (!t || t.k !== k) throw new Error(k === ')' ? 'a bracket is not closed' : 'expected “' + k + '”');
      p++; return t;
    }
    function startsPrimary(t) {
      return t && (t.k === 'num' || t.k === 'id' || t.k === '(' || (t.k === '|' && absDepth === 0));
    }
    function expr() {
      var a = term();
      while (peek() && (peek().k === '+' || peek().k === '-')) {
        var op = toks[p++].k; a = { k: 'bin', op: op, a: a, b: term() };
      }
      return a;
    }
    function term() {
      var a = unary();
      for (;;) {
        var t = peek();
        if (t && (t.k === '*' || t.k === '/')) { p++; a = { k: 'bin', op: t.k, a: a, b: unary() }; }
        else if (startsPrimary(t)) a = { k: 'bin', op: '*', a: a, b: power() };   /* 2x, x(x+1) */
        else return a;
      }
    }
    function unary() {
      var t = peek();
      if (t && t.k === '-') { p++; return { k: 'neg', a: unary() }; }
      if (t && t.k === '+') { p++; return unary(); }
      return power();
    }
    function power() {
      var a = primary();
      if (peek() && peek().k === '^') { p++; return { k: 'bin', op: '^', a: a, b: unary() }; }
      return a;
    }
    function primary() {
      var t = toks[p++];
      if (!t) throw new Error('the formula ends too soon');
      if (t.k === 'num') return { k: 'num', v: t.v };
      if (t.k === '(') { var e = expr(); eat(')'); return e; }
      if (t.k === '|') { absDepth++; var a = expr(); absDepth--; eat('|'); return { k: 'call', f: 'abs', args: [a] }; }
      if (t.k === 'id') {
        if (t.v === 'x') return { k: 'x' };
        if (t.v in CONST) return { k: 'const', n: t.v === '\u03c0' ? 'pi' : t.v };
        var f = FN[t.v];
        if (!f) throw new Error('“' + t.v + '” is not known');
        var args = [], up = null;
        if (peek() && peek().k === '^' && f[0] === 1) { p++; up = power(); }   /* sin^2 x */
        if (peek() && peek().k === '(') {
          p++;
          args.push(expr());
          while (peek() && peek().k === ',') { p++; args.push(expr()); }
          eat(')');
        } else {
          if (f[0] !== 1) throw new Error(t.v + ' needs brackets: ' + t.v + '(a, b)');
          /* sin x, ln 2x: the argument runs to the next + or − */
          var b = power();
          while (startsPrimary(peek())) b = { k: 'bin', op: '*', a: b, b: power() };
          args.push(b);
        }
        if (args.length !== f[0]) throw new Error(t.v + ' takes ' + f[0] + (f[0] === 1 ? ' value' : ' values'));
        var call = { k: 'call', f: t.v, args: args };
        return up ? { k: 'bin', op: '^', a: call, b: up } : call;
      }
      throw new Error('“' + t.k + '” is out of place');
    }
    if (!toks.length) throw new Error('empty');
    var ast = expr();
    if (p < toks.length) throw new Error(toks[p].k === ')' ? 'there is a “)” too many' : 'something is out of place near the end');
    return ast;
  }

  function evaluator(n) {
    switch (n.k) {
      case 'num': return function () { return n.v; };
      case 'x': return function (x) { return x; };
      case 'const': var c = CONST[n.n]; return function () { return c; };
      case 'neg': var a = evaluator(n.a); return function (x) { return -a(x); };
      case 'call': {
        var f = FN[n.f][1], as = n.args.map(evaluator);
        return as.length === 1 ? function (x) { return f(as[0](x)); }
          : function (x) { return f(as[0](x), as[1](x)); };
      }
      case 'bin': {
        var l = evaluator(n.a), r = evaluator(n.b);
        switch (n.op) {
          case '+': return function (x) { return l(x) + r(x); };
          case '-': return function (x) { return l(x) - r(x); };
          case '*': return function (x) { return l(x) * r(x); };
          case '/': return function (x) { return l(x) / r(x); };
          case '^': return function (x) { return Math.pow(l(x), r(x)); };
        }
      }
    }
    return function () { return NaN; };
  }

  /* and readable: only the brackets pgfmath needs. A minus sign in front of
     anything but a plain number or name keeps its brackets: older pgfmath
     read -x^2 as (-x)^2. */
  var PREC = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 };
  function prec(n) { return n.k === 'bin' ? PREC[n.op] : n.k === 'neg' ? 3 : 9; }
  function pgfPretty(n) {
    switch (n.k) {
      case 'num': return fmt(n.v);
      case 'x': return 'x';
      case 'const': return n.n === 'pi' ? 'pi' : 'e';
      case 'neg': return '-' + wrap(n.a, prec(n.a) < 9);
      case 'call': {
        var args = n.args.map(pgfPretty), f = FN[n.f];
        return f[2] ? f[2](args.join(',')) : n.f + '(' + args.join(',') + ')';
      }
      case 'bin': {
        var my = PREC[n.op], pl = prec(n.a), pr = prec(n.b);
        var l = wrap(n.a, n.op === '^' ? pl <= my : pl < my);
        var r = wrap(n.b, n.b.k === 'neg' || pr < my || (pr === my && (n.op === '-' || n.op === '/')));
        return l + (n.op === '+' || n.op === '-' ? ' ' + n.op + ' ' : n.op) + r;
      }
    }
    return '0';
  }
  function wrap(n, need) { var s = pgfPretty(n); return need ? '(' + s + ')' : s; }

  function compile(src) {
    try {
      var ast = parse(src);
      return { ok: true, ast: ast, f: evaluator(ast), pgf: pgfPretty(ast) };
    } catch (e) {
      return { ok: false, err: e.message };
    }
  }

  /* ======================================================= numbers ===== */

  /* No exponents: TeX and readers both prefer 0.00012 to 1.2e-4. */
  function fmt(v) {
    if (!isFinite(v)) return '0';
    var s = String(+v.toPrecision(10));
    if (/e/i.test(s)) {
      s = Math.abs(v) < 1 ? v.toFixed(Math.min(20, Math.ceil(-Math.log10(Math.abs(v))) + 8)) : v.toFixed(0);
      s = s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    }
    return s;
  }
  /* A cell as a number: "1,5" is one and a half (a decimal comma, as in
     Turkish or German), "1 000" is a thousand; anything else is text. */
  function num(t) {
    t = String(t == null ? '' : t).replace(/[\u00a0\u202f\s]/g, '').replace(/\u2212/g, '-');
    if (!t) return null;
    if (/^[-+]?\d+,\d+$/.test(t)) t = t.replace(',', '.');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?%?$/i.test(t)) return null;
    return parseFloat(t);
  }
  /* a range limit: a number, or something like 2pi or -pi/2 */
  function val(t) {
    var n = num(t);
    if (n !== null || !String(t == null ? '' : t).trim()) return n;
    var c = compile(String(t));
    if (!c.ok || JSON.stringify(c.ast).indexOf('"k":"x"') >= 0) return null;
    var v = c.f(0);
    return isFinite(v) ? v : null;
  }
  function niceStep(span, target) {
    if (!(span > 0)) return 1;
    var raw = span / target, mag = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / mag;
    return (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
  }
  function round(v, step) {          /* away from float noise: 0.30000000000000004 */
    var d = Math.max(0, -Math.floor(Math.log10(step)) + 2);
    return +v.toFixed(Math.min(d, 15));
  }
  function ticks(lo, hi, step) {
    var out = [], v = Math.ceil(lo / step - 1e-9) * step;
    for (; v <= hi + step * 1e-9 && out.length < 60; v += step) out.push(round(v, step));
    return out;
  }
  function tickText(v, step) {
    var d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    var s = v.toFixed(Math.min(d, 10));
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s === '-0' ? '0' : s.replace('-', '\u2212');
  }

  /* ========================================================== data ===== */

  function cellText(html) {
    var box = PT.sanitize.parse(String(html || ''));
    [].forEach.call(box.querySelectorAll('.imath'), function (m) {
      try { m.textContent = PT.math.texRow(JSON.parse(m.dataset.m)); } catch (e) { m.textContent = ''; }
    });
    return box.textContent.replace(/\u200b/g, '').trim();
  }

  /* Pasted or typed rows: tabs (from a spreadsheet), else semicolons, else
     commas. With tabs or semicolons a comma is a decimal comma. */
  function parseCSV(text) {
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').filter(function (l) { return l.trim(); });
    if (!lines.length) return [];
    var sep = /\t/.test(lines[0]) ? '\t' : /;/.test(lines[0]) ? ';' : ',';
    return lines.map(function (l) {
      if (sep !== ',') return l.split(sep).map(function (c) { return c.trim(); });
      var out = [], cur = '', q = false;
      for (var i = 0; i < l.length; i++) {
        var c = l[i];
        if (c === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
        else if (c === ',' && !q) { out.push(cur.trim()); cur = ''; }
        else cur += c;
      }
      out.push(cur.trim());
      return out;
    });
  }

  /* The table a chart draws from: a table block in the document, or the
     chart's own rows. Returns { head: [name…], rows: [[text…]…], html }. */
  function source(b, doc) {
    if (b.from) {
      var t = (doc.blocks || []).filter(function (x) { return x.id === b.from && x.t === 'table'; })[0];
      if (t) {
        var all = t.rows.map(function (r) { return r.map(cellText); });
        if (t.header) return { head: all[0], rows: all.slice(1), html: t.rows.slice(1), table: t };
        return { head: all[0].map(function (_, i) { return 'Column ' + (i + 1); }), rows: all, html: t.rows, table: t };
      }
    }
    var own = parseCSV(b.data);
    if (!own.length) return { head: [], rows: [], html: [] };
    var width = Math.max.apply(null, own.map(function (r) { return r.length; }));
    own = own.map(function (r) { while (r.length < width) r.push(''); return r; });
    var headed = own[0].some(function (c) { return c && num(c) === null; });
    var head = headed ? own[0] : own[0].map(function (_, i) { return i ? 'y' + (width > 2 ? i : '') : 'x'; });
    var rows = headed ? own.slice(1) : own;
    return { head: head, rows: rows, html: null };
  }

  /* ======================================================== styles ===== */

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function hexOf(c) {
    c = String(c || '').replace(/^#/, '').toUpperCase();
    return /^[0-9A-F]{6}$/.test(c) ? c : null;
  }
  function gridOf(b) {
    return b.grid === 'both' ? 'both' : (b.grid === false || b.grid === 'none') ? 'none' : 'major';
  }
  function axesOf(b) { return b.axes === 'middle' || b.axes === 'left' ? b.axes : 'box'; }
  /* the automatic colour of the n-th series: the cycle leaves out black */
  function autoHex(n) { return COLORS[n % (COLORS.length - 1)][1]; }

  /* How one series is drawn: its own settings where it has them, the
     chart's where it does not. A curve's settings live on its formula, a
     data series' on b.style[column]. */
  function look(b, s) {
    var st = s.st || {};
    var mark = s.fn || b.kind === 'bar' ? 'none'
      : MARKS.indexOf(st.mark) >= 0 ? st.mark
      : b.kind === 'scatter' ? '*' : (b.marks === false ? 'none' : '*');
    return {
      hex: hexOf(st.color) || autoHex(s.color),
      line: !!s.fn || b.kind === 'line',
      dash: DASHES.indexOf(st.dash) >= 0 ? st.dash : 'solid',
      thick: THICK[st.thick] ? st.thick : 'thick',
      mark: mark,
      msize: MSIZE[st.msize] ? st.msize : 'normal'
    };
  }

  /* ======================================================== layout ===== */

  /* Everything both drawings need: the series as points, the axis limits
     and the tick spacing. */
  function model(b, doc) {
    var out = { kind: b.kind, series: [], errors: [], cats: null };
    var xr = [val(b.xmin), val(b.xmax)], yr = [val(b.ymin), val(b.ymax)];
    out.samples = clamp(parseInt(b.samples, 10) || SAMPLES, 20, 1000);
    out.stacked = b.kind === 'bar' && !!b.stacked;
    out.values = b.kind === 'bar' && !!b.values && !out.stacked;

    if (b.kind === 'function') {
      var lo = xr[0] != null ? xr[0] : -5, hi = xr[1] != null ? xr[1] : 5;
      if (!(hi > lo)) { out.errors.push('The x range must go from smaller to larger.'); hi = lo + 1; }
      var ys = curves(b.fns, lo, hi, 0, out);
      out.x = [lo, hi];
      if (yr[0] != null && yr[1] != null && yr[1] > yr[0]) out.y = [yr[0], yr[1]];
      else out.y = autoY(ys, yr, true, 0);
      out.band = true;
    } else {
      var src = source(b, doc), xc = b.xcol | 0, ycs = (b.ycols && b.ycols.length ? b.ycols : [1]);
      out.head = src.head;
      ycs = ycs.filter(function (c) { return c !== xc && c < src.head.length; });
      if (!src.rows.length || src.head.length < 2) out.errors.push(b.from ? 'The table needs at least two columns of numbers.' : 'Add some data: one row per point, one column per series.');
      var numericX = src.rows.length && src.rows.every(function (r) { return num(r[xc]) !== null; });
      if (b.kind === 'bar' || !numericX) {
        out.cats = src.rows.map(function (r, i) { return { text: r[xc] || '', html: src.html ? src.html[i][xc] : null }; });
      }
      var allY = [], allX = [];
      ycs.forEach(function (yc, si) {
        var st = (b.style && b.style[yc]) || {};
        var ec = st.err === '' || st.err == null ? -1 : +st.err;
        if (!(ec >= 0 && ec < src.head.length && ec !== yc)) ec = -1;
        var pts = [];
        src.rows.forEach(function (r, i) {
          var x = out.cats ? i : num(r[xc]), y = num(r[yc]);
          if (y === null || x === null) return;
          var p = [x, y];
          if (ec >= 0) { var e = num(r[ec]); p.err = e !== null ? Math.abs(e) : 0; }
          pts.push(p);
          allX.push(x);
        });
        out.series.push({
          name: st.name || src.head[yc] || '', named: !!st.name, col: yc, err: ec >= 0, st: st, color: si,
          html: !st.name && src.table && src.table.header ? src.table.rows[0][yc] : null, pts: pts
        });
      });
      /* stacked bars: each series starts where the ones before it ended */
      if (out.stacked) {
        var acc = {};
        out.series.forEach(function (s) {
          s.pts.forEach(function (p) { p.base = acc[p[0]] || 0; acc[p[0]] = p.base + p[1]; });
        });
      }
      out.series.forEach(function (s) {
        s.pts.forEach(function (p) {
          var top = (p.base || 0) + p[1];
          allY.push(top);
          if (p.base) allY.push(p.base);
          if (p.err) allY.push(top - p.err, top + p.err);
        });
      });
      out.wholeX = allX.length > 0 && allX.every(function (v) { return v === Math.round(v); });
      if (out.cats) out.x = [-0.5, Math.max(0, out.cats.length - 1) + 0.5];
      else {
        var x0 = Math.min.apply(null, allX.length ? allX : [0]), x1 = Math.max.apply(null, allX.length ? allX : [1]);
        if (x1 === x0) { x0 -= 1; x1 += 1; }
        var px = (x1 - x0) * 0.05;
        out.x = [xr[0] != null ? xr[0] : x0 - px, xr[1] != null ? xr[1] : x1 + px];
      }
      if (b.kind === 'bar') allY.push(0);
      /* curves drawn over the data, a fit or a model: they take the data's
         x range and leave the y range to the data */
      if (!out.cats && b.fns && b.fns.length) {
        var fys = curves(b.fns, out.x[0], out.x[1], ycs.length, out);
        if (fys.length) out.band = true;
        if (!allY.length) allY = fys;
      }
      out.y = autoY(allY, yr, false, out.values ? 0.1 : 0);
      if (b.kind === 'bar' && out.y[0] > 0 && yr[0] == null) out.y[0] = 0;
      if (b.kind === 'bar' && out.y[1] < 0 && yr[1] == null) out.y[1] = 0;
    }

    /* tick spacing: what was asked, if it gives a sensible number of ticks */
    var xs = val(b.xstep), yst = val(b.ystep);
    if (out.cats) out.xstep = 1;
    else if (xs > 0 && (out.x[1] - out.x[0]) / xs <= 60) out.xstep = xs;
    else {
      out.xstep = niceStep(out.x[1] - out.x[0], 7);
      /* years, counts, trial numbers: no ticks between whole numbers */
      if (out.wholeX && out.xstep < 1) out.xstep = 1;
    }
    out.ystep = yst > 0 && (out.y[1] - out.y[0]) / yst <= 60 ? yst : niceStep(out.y[1] - out.y[0], 6);
    /* function plots: the drawn y range is what was asked or what the curve
       spans, rounded outward to whole ticks */
    if (b.kind === 'function' && !(yr[0] != null && yr[1] != null)) {
      if (yr[0] == null) out.y[0] = round(Math.floor(out.y[0] / out.ystep + 1e-9) * out.ystep, out.ystep);
      if (yr[1] == null) out.y[1] = round(Math.ceil(out.y[1] / out.ystep - 1e-9) * out.ystep, out.ystep);
    }
    out.x = out.x.map(function (v) { return round(v, out.xstep); });
    out.y = out.y.map(function (v) { return round(v, out.ystep); });
    if (out.band) {
      var span = out.y[1] - out.y[0];
      out.keep = [round(out.y[0] - span, out.ystep), round(out.y[1] + span, out.ystep)];
    }

    /* the legend: where it was put, or the emptiest corner; shown when there
       is more than one thing to tell apart, a name was given, or a place
       for it was chosen */
    var pos = b.legend === false ? 'none' : (b.legendPos || 'auto');
    var want = pos !== 'none' && out.series.length > 0 && (pos !== 'auto' || out.series.length > 1 ||
      out.series.some(function (s) { return s.fn ? !!s.name : s.named; }));
    out.legend = want ? (LEGEND_POS.indexOf(pos) >= 0 ? pos : corner(out, b.kind)) : null;
    return out;
  }

  /* The legend goes in whichever corner the data leaves emptiest. */
  function corner(m, kind) {
    var C = [['north east', 1, 1], ['north west', 0, 1], ['south east', 1, 0], ['south west', 0, 0]], n = [0, 0, 0, 0];
    m.series.forEach(function (s) {
      var w = s.fn ? 0.1 : 1;           /* a curve is many samples, a point is one */
      s.pts.forEach(function (p) {
        if (!isFinite(p[1])) return;
        var nx = (p[0] - m.x[0]) / (m.x[1] - m.x[0]);
        (kind === 'bar' ? [0.2, 0.4, 0.6, 0.8, 1] : [1]).forEach(function (f) {
          var ny = ((p.base || 0) + p[1] * f - m.y[0]) / (m.y[1] - m.y[0]);
          C.forEach(function (c, i) {
            if ((c[1] ? nx > 0.5 : nx < 0.5) && (c[2] ? ny > 0.6 && ny <= 1.05 : ny < 0.4 && ny >= -0.05)) n[i] += w;
          });
        });
      });
    });
    var best = 0;
    for (var i = 1; i < 4; i++) if (n[i] < n[best]) best = i;
    return C[best][0];
  }

  /* y = f(x) for each formula, sampled where pgfplots will sample it */
  function curves(fns, lo, hi, color0, out) {
    var ys = [], N = out.samples;
    (fns || []).forEach(function (fn, i) {
      if (!String(fn.expr || '').trim()) return;
      var c = compile(fn.expr);
      if (!c.ok) { out.errors.push('y = ' + fn.expr + ': ' + c.err); return; }
      var pts = [];
      for (var k = 0; k < N; k++) {
        var x = lo + (hi - lo) * k / (N - 1), y = c.f(x);
        pts.push([x, y]);
        if (isFinite(y)) ys.push(y);
      }
      out.series.push({ name: fn.name || '', expr: fn.expr, pgf: c.pgf, pts: pts, color: color0 + i, fn: true, st: fn });
    });
    return ys;
  }

  /* A curve with an asymptote runs off to ±huge; the view is fitted to the
     bulk of it, not to the spike. */
  function autoY(ys, yr, fn, extraTop) {
    var lo, hi;
    if (!ys.length) { lo = -1; hi = 1; }
    else {
      var s = ys.slice().sort(function (a, b) { return a - b; });
      lo = s[0]; hi = s[s.length - 1];
      if (fn && s.length > 20) {
        var p5 = s[Math.floor(s.length * 0.05)], p95 = s[Math.ceil(s.length * 0.95) - 1];
        if (hi - lo > 8 * (p95 - p5) && p95 > p5) { lo = p5; hi = p95; }
      }
      if (hi === lo) { lo -= 1; hi += 1; }
      var pad = (hi - lo) * (fn ? 0.04 : 0.08);
      if (!(fn && lo === 0)) lo -= pad;
      if (!(fn && hi === 0)) hi += pad + (hi - lo) * (extraTop || 0);
      if (fn && lo > 0 && lo < hi * 0.4) lo = 0;      /* keep the x axis in view when it is near */
      if (fn && hi < 0 && hi > lo * 0.4) hi = 0;
    }
    if (yr[0] != null) lo = yr[0];
    if (yr[1] != null) hi = yr[1];
    if (!(hi > lo)) hi = lo + 1;
    return [lo, hi];
  }

  /* ======================================================= drawing ===== */

  var SVGNS = 'http://www.w3.org/2000/svg', XHTML = 'http://www.w3.org/1999/xhtml';
  function el(tag, attrs, parent) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  /* "Speed $v$ (m/s)": text, with formulas between dollar signs */
  function labelInto(target, str) {
    String(str || '').split('$').forEach(function (part, i) {
      if (!part) return;
      if (i % 2 === 0) { target.appendChild(document.createTextNode(part)); return; }
      var s = document.createElement('span');
      s.className = 'pt-chm';
      try { PT.math.renderStatic(s, PT.math.parseTex(part)); } catch (e) { s.textContent = part; }
      target.appendChild(s);
    });
  }
  function labelTex(str, use) {
    var esc = PT.latex.esc;
    return String(str || '').split('$').map(function (part, i) {
      if (i % 2 === 0) return esc(part);
      var r = PT.math.parseTex(part);
      PT.math.scanRow(r, use);
      return '$' + PT.math.texRow(r) + '$';
    }).join('');
  }
  function richLabelInto(target, html) {
    var box = PT.sanitize.parse(String(html || ''));
    [].forEach.call(box.querySelectorAll('.imath'), function (m) {
      var s = document.createElement('span');
      s.className = 'pt-chm';
      try { PT.math.renderStatic(s, JSON.parse(m.dataset.m)); } catch (e) { /* leave it out */ }
      m.parentNode.replaceChild(s, m);
    });
    while (box.firstChild) target.appendChild(box.firstChild);
  }
  /* HTML (and so formulas) inside the drawing, scaled with it */
  function html(svg, x, y, w, h, align, fill, rotate) {
    var fo = el('foreignObject', { x: x, y: y, width: w, height: h }, svg);
    if (rotate) fo.setAttribute('transform', 'rotate(-90 ' + (x + w / 2) + ' ' + (y + h / 2) + ')');
    var d = document.createElementNS(XHTML, 'div');
    d.className = 'pt-chlab ' + (align || 'c');
    /* one inline box inside the flex box, or the spaces either side of a
       formula would be trimmed away */
    var span = document.createElementNS(XHTML, 'span');
    d.appendChild(span);
    fo.appendChild(d);
    fill(span);       /* in the page already: formulas measure themselves */
    return fo;
  }
  function legendText(s) { return s.name || (s.expr ? 'y = ' + s.expr : ''); }
  function valueText(v) {
    var s = String(+v.toFixed(2));
    return s.replace('-', '\u2212');
  }

  /* A mark the way TikZ draws it: r is pgfplots' mark size */
  function mark(g, shape, x, y, r, col, sw) {
    var hollow = shape === 'o' || shape === 'square';
    var paint = { fill: hollow ? 'none' : col, stroke: col, 'stroke-width': sw };
    switch (shape) {
      case '*': case 'o': el('circle', Object.assign({ cx: x, cy: y, r: r }, paint), g); break;
      case 'square*': case 'square': el('rect', Object.assign({ x: x - r, y: y - r, width: 2 * r, height: 2 * r }, paint), g); break;
      case 'triangle*':
        el('path', Object.assign({ d: 'M' + x + ' ' + (y - r) + 'L' + (x + r * 0.866) + ' ' + (y + r / 2) + 'L' + (x - r * 0.866) + ' ' + (y + r / 2) + 'Z' }, paint), g);
        break;
      case 'diamond*':
        el('path', Object.assign({ d: 'M' + x + ' ' + (y - r) + 'L' + (x + r * 0.75) + ' ' + y + 'L' + x + ' ' + (y + r) + 'L' + (x - r * 0.75) + ' ' + y + 'Z' }, paint), g);
        break;
      case 'x':
        el('path', { d: 'M' + (x - r) + ' ' + (y - r) + 'L' + (x + r) + ' ' + (y + r) + 'M' + (x - r) + ' ' + (y + r) + 'L' + (x + r) + ' ' + (y - r), stroke: col, 'stroke-width': sw }, g);
        break;
      case '+':
        el('path', { d: 'M' + (x - r) + ' ' + y + 'L' + (x + r) + ' ' + y + 'M' + x + ' ' + (y - r) + 'L' + x + ' ' + (y + r), stroke: col, 'stroke-width': sw }, g);
        break;
    }
  }
  /* TikZ's dash patterns, in drawing units */
  function dashArray(dash, lw, P) {
    if (dash === 'dashed') return (3 * P) + ' ' + (3 * P);
    if (dash === 'dotted') return lw + ' ' + (2 * P);
    if (dash === 'dashdotted') return (3 * P) + ' ' + (2 * P) + ' ' + lw + ' ' + (2 * P);
    return null;
  }
  /* through the points, straight or smoothed the way TikZ's "smooth" does */
  function pathOf(pts, smooth) {
    if (pts.length < 2) return pts.length ? 'M' + pts[0][0] + ' ' + pts[0][1] : '';
    var d = 'M' + pts[0][0].toFixed(2) + ' ' + pts[0][1].toFixed(2), k = 0.18;
    for (var i = 1; i < pts.length; i++) {
      var p = pts[i];
      if (!smooth) { d += 'L' + p[0].toFixed(2) + ' ' + p[1].toFixed(2); continue; }
      var a = pts[i - 2] || pts[i - 1], q = pts[i - 1], n = pts[i + 1] || p;
      d += 'C' + (q[0] + (p[0] - a[0]) * k).toFixed(2) + ' ' + (q[1] + (p[1] - a[1]) * k).toFixed(2) + ' ' +
        (p[0] - (n[0] - q[0]) * k).toFixed(2) + ' ' + (p[1] - (n[1] - q[1]) * k).toFixed(2) + ' ' +
        p[0].toFixed(2) + ' ' + p[1].toFixed(2);
    }
    return d;
  }

  var U = 10;   /* drawing units per em */
  /* the pen, in drawing units; never so thin that a screen loses it */
  function lineWidth(L, P) { return Math.max(THICK[L.thick] * P, 0.55); }

  /* Draw chart b into target. opts.fit: fill the target (the studio)
     instead of taking b.width of it; opts.colEm: the text column, in em,
     that the chart's proportions are taken from. */
  function draw(target, b, doc, opts) {
    opts = opts || {};
    var m = model(b, doc);
    target.textContent = '';
    var fpt = parseFloat(doc && doc.settings && doc.settings.fontsize) || 10;
    var P = U / fpt;                   /* drawing units per pt */
    var fs = parseFloat(getComputedStyle(target).fontSize) || 13;
    var colEm = opts.colEm || (target.parentNode && target.parentNode.clientWidth ? target.parentNode.clientWidth / fs : 36);
    var w = clamp(+b.width || 0.75, 0.2, 1), aspect = clamp(+b.aspect || 0.62, 0.3, 1.2);
    var W = Math.max(12, w * colEm) * U, H = W * aspect;
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': 'pt-chsvg' });
    if (opts.fit) { svg.style.width = '100%'; svg.style.height = '100%'; }
    else { svg.style.width = Math.round(w * 1000) / 10 + '%'; svg.style.aspectRatio = W + ' / ' + H; }
    target.appendChild(svg);
    var axes = axesOf(b), middle = axes === 'middle', grid = gridOf(b);

    var xt = ticks(m.x[0], m.x[1], m.xstep), yt = ticks(m.y[0], m.y[1], m.ystep);
    var yw = Math.max.apply(null, yt.map(function (v) { return tickText(v, m.ystep).length; }).concat([1])) * 0.55 * U;
    var titleH = b.title ? 1.9 * U : 0;
    var ml, mr, mt, mb;
    if (middle) {
      ml = 0.6 * U; mr = (b.xlabel ? 2.6 : 0.8) * U; mt = (b.ylabel ? 2 : 0.8) * U; mb = 0.6 * U;
      /* axes through 0 that end up at an edge take their tick labels outside it */
      var fx = (Math.min(Math.max(0, m.x[0]), m.x[1]) - m.x[0]) / (m.x[1] - m.x[0]);
      var fy = (Math.min(Math.max(0, m.y[0]), m.y[1]) - m.y[0]) / (m.y[1] - m.y[0]);
      if (fx < 0.15) ml = Math.max(ml, yw + 0.8 * U - fx * W * 0.8);
      if (fy < 0.12) mb = 1.7 * U;
    } else {
      ml = yw + 0.8 * U + (b.ylabel ? 1.8 * U : 0); mr = (axes === 'left' ? 1.2 : 1) * U;
      mt = (axes === 'left' ? 1.2 : 0.8) * U; mb = 1.7 * U + (b.xlabel ? 1.7 * U : 0);
    }
    mt += titleH;
    var leg = null;
    if (m.legend) {
      var lw = 0;
      m.series.forEach(function (s) { lw = Math.max(lw, legendText(s).replace(/\$/g, '').length); });
      leg = { w: (lw * 0.55 + 2.8) * U, h: m.series.length * 1.35 * U + 0.4 * U };
      if (m.legend === 'outer north east') mr += leg.w + 0.8 * U;
    }
    var pw = W - ml - mr, ph = H - mt - mb;
    if (leg && m.legend !== 'outer north east') leg.w = Math.min(leg.w, pw * 0.7);
    function X(v) { return ml + (v - m.x[0]) / (m.x[1] - m.x[0]) * pw; }
    function Y(v) { return mt + (m.y[1] - v) / (m.y[1] - m.y[0]) * ph; }

    var clipId = 'ptc' + Math.random().toString(36).slice(2, 8);
    el('rect', { x: ml, y: mt, width: pw, height: ph }, el('clipPath', { id: clipId }, el('defs', {}, svg)));

    /* grid: major lines at the ticks, minor ones halfway between */
    if (grid !== 'none') {
      var g = el('g', { 'class': 'pt-chgrid' }, svg);
      if (grid === 'both') {
        var gm = el('g', { 'class': 'minor' }, g);
        if (!m.cats) ticks(m.x[0], m.x[1], m.xstep / 2).forEach(function (v) { el('line', { x1: X(v), x2: X(v), y1: mt, y2: mt + ph }, gm); });
        ticks(m.y[0], m.y[1], m.ystep / 2).forEach(function (v) { el('line', { x1: ml, x2: ml + pw, y1: Y(v), y2: Y(v) }, gm); });
      }
      if (!m.cats) xt.forEach(function (v) { el('line', { x1: X(v), x2: X(v), y1: mt, y2: mt + ph }, g); });
      yt.forEach(function (v) { el('line', { x1: ml, x2: ml + pw, y1: Y(v), y2: Y(v) }, g); });
    }

    /* axes, ticks, tick labels */
    var ax = el('g', { 'class': 'pt-chaxis' }, svg);
    var ox = middle ? Math.min(Math.max(0, m.x[0]), m.x[1]) : m.x[0];
    var oy = middle ? Math.min(Math.max(0, m.y[0]), m.y[1]) : m.y[0];
    var tl = 0.35 * U;
    function arrows(x0, y0) {
      el('line', { x1: ml, x2: ml + pw + 0.5 * U, y1: y0, y2: y0 }, ax);
      el('line', { x1: x0, x2: x0, y1: mt + ph, y2: mt - 0.5 * U }, ax);
      el('path', { d: 'M' + (ml + pw + 0.5 * U) + ' ' + y0 + 'l-' + 0.6 * U + ' -' + 0.25 * U + 'v' + 0.5 * U + 'z', 'class': 'pt-charrow' }, ax);
      el('path', { d: 'M' + x0 + ' ' + (mt - 0.5 * U) + 'l-' + 0.25 * U + ' ' + 0.6 * U + 'h' + 0.5 * U + 'z', 'class': 'pt-charrow' }, ax);
    }
    if (middle) arrows(X(ox), Y(oy));
    else if (axes === 'left') arrows(ml, mt + ph);
    else el('rect', { x: ml, y: mt, width: pw, height: ph, fill: 'none' }, ax);
    var tx = el('g', { 'class': 'pt-chtick' }, svg);
    if (m.cats) {
      m.cats.forEach(function (c, i) {
        var xx = X(i), y0 = middle ? Y(oy) : mt + ph;
        el('line', { x1: xx, x2: xx, y1: y0, y2: y0 - tl }, ax);
        html(svg, xx - (pw / m.cats.length) / 2, y0 + 0.3 * U, pw / m.cats.length, 1.4 * U, 'c', function (d) {
          if (c.html != null) richLabelInto(d, c.html); else d.textContent = c.text;
        });
      });
    } else {
      xt.forEach(function (v) {
        if (middle && v === ox && yt.length) return;   /* the origin, where the axes cross */
        var xx = X(v), y0 = middle ? Y(oy) : mt + ph;
        el('line', { x1: xx, x2: xx, y1: y0 + (middle ? tl / 2 : 0), y2: y0 - tl / (middle ? 2 : 1) }, ax);
        var t = el('text', { x: xx, y: y0 + 1.2 * U, 'text-anchor': 'middle' }, tx);
        t.textContent = tickText(v, m.xstep);
      });
    }
    yt.forEach(function (v) {
      if (middle && v === oy && xt.length) return;
      var yy = Y(v), x0 = middle ? X(ox) : ml;
      el('line', { x1: x0 - (middle ? tl / 2 : 0), x2: x0 + tl / (middle ? 2 : 1), y1: yy, y2: yy }, ax);
      var t = el('text', { x: x0 - 0.4 * U, y: yy + 0.35 * U, 'text-anchor': 'end' }, tx);
      t.textContent = tickText(v, m.ystep);
    });

    /* title and axis labels */
    if (b.title) html(svg, ml, 0.1 * U, pw, 1.6 * U, 'c', function (d) { labelInto(d, b.title); });
    if (b.xlabel) {
      if (middle) html(svg, ml + pw + 0.6 * U, Y(oy) - 0.75 * U, mr, 1.5 * U, 'l', function (d) { labelInto(d, b.xlabel); });
      else html(svg, ml, H - 1.6 * U, pw, 1.5 * U, 'c', function (d) { labelInto(d, b.xlabel); });
    }
    if (b.ylabel) {
      if (middle) html(svg, X(ox) - 6 * U, titleH, 12 * U, 1.5 * U, 'c', function (d) { labelInto(d, b.ylabel); });
      else html(svg, 0.1 * U - (ph - 1.5 * U) / 2, mt + ph / 2 - 0.75 * U, ph, 1.5 * U, 'c', function (d) { labelInto(d, b.ylabel); }, true);
    }

    /* the data */
    var plot = el('g', { 'clip-path': 'url(#' + clipId + ')' }, svg);
    var over = el('g', {}, svg);            /* value labels may stand above the frame */
    var nbar = m.series.filter(function (s) { return !s.fn; }).length || 1;
    var barw = clamp(+b.barw || 0.8, 0.2, 1);
    function errBar(x, y, dy, col, sw) {
      if (!(dy > 0)) return;
      var c = 1.5 * P;
      el('path', { d: 'M' + x + ' ' + Y(y - dy) + 'V' + Y(y + dy) + 'M' + (x - c) + ' ' + Y(y - dy) + 'h' + 2 * c +
        'M' + (x - c) + ' ' + Y(y + dy) + 'h' + 2 * c, stroke: col, 'stroke-width': sw, fill: 'none' }, plot);
    }
    m.series.forEach(function (s, si) {
      var L = look(b, s), col = '#' + L.hex, sw = lineWidth(L, P);
      if (b.kind === 'bar' && !s.fn) {
        var bw = m.stacked ? barw : barw / nbar;
        s.pts.forEach(function (p) {
          var left = p[0] - barw / 2 + (m.stacked ? 0 : si * bw), base = p.base || 0;
          var ya = Y(base), yb = Y(base + p[1]);
          el('rect', { x: X(left), width: Math.max(0.5, X(left + bw) - X(left)), y: Math.min(ya, yb), height: Math.abs(yb - ya),
            fill: col, 'fill-opacity': 0.75, stroke: col, 'stroke-width': 0.4 * P }, plot);
          if (p.err) errBar(X(left + bw / 2), base + p[1], p.err, col, 0.4 * P);
          if (m.values) {
            var t = el('text', { x: X(left + bw / 2), y: p[1] >= 0 ? yb - 0.35 * U : yb + 1.05 * U, 'text-anchor': 'middle', 'class': 'pt-chval' }, over);
            t.textContent = valueText(p[1]);
          }
        });
        return;
      }
      if (L.line) {
        var runs = [], run = [];
        s.pts.forEach(function (p) {
          var ok = isFinite(p[1]) && (!m.keep || (p[1] >= m.keep[0] && p[1] <= m.keep[1]));
          if (!ok) { if (run.length) runs.push(run); run = []; return; }
          run.push([X(p[0]), Y(p[1])]);
        });
        if (run.length) runs.push(run);
        el('path', { d: runs.map(function (r) { return pathOf(r, !s.fn && !!b.smooth); }).join(''), fill: 'none', stroke: col,
          'stroke-width': sw, 'stroke-dasharray': dashArray(L.dash, sw, P), 'class': 'pt-chline' }, plot);
      }
      s.pts.forEach(function (p) {
        if (!isFinite(p[1])) return;
        if (p.err) errBar(X(p[0]), p[1], p.err, col, 0.4 * P);
        if (L.mark !== 'none') mark(plot, L.mark, X(p[0]), Y(p[1]), MSIZE[L.msize] * P, col, 0.4 * P);
      });
    });

    /* legend */
    if (leg) {
      var outer = m.legend === 'outer north east';
      var east = /east/.test(m.legend), north = /north/.test(m.legend);
      var lx = outer ? ml + pw + 0.8 * U : east ? ml + pw - leg.w - 0.4 * U : ml + 0.4 * U;
      var ly = outer || north ? mt + (outer ? 0 : 0.4 * U) : mt + ph - leg.h - 0.4 * U;
      el('rect', { x: lx, y: ly, width: leg.w, height: leg.h, 'class': 'pt-chlegend' }, svg);
      m.series.forEach(function (s, i) {
        var L = look(b, s), col = '#' + L.hex, sw = lineWidth(L, P);
        var yy = ly + 0.2 * U + i * 1.35 * U + 0.675 * U;
        if (b.kind === 'bar' && !s.fn) {
          el('rect', { x: lx + 0.4 * U, y: yy - 0.35 * U, width: 1 * U, height: 0.7 * U, fill: col, 'fill-opacity': 0.75, stroke: col, 'stroke-width': 0.4 * P }, svg);
        } else {
          if (L.line) el('line', { x1: lx + 0.3 * U, x2: lx + 1.5 * U, y1: yy, y2: yy, stroke: col, 'stroke-width': sw,
            'stroke-dasharray': dashArray(L.dash, sw, P), 'class': 'pt-chline' }, svg);
          if (L.mark !== 'none') mark(svg, L.mark, lx + 0.9 * U, yy, MSIZE[L.msize] * P, col, 0.4 * P);
        }
        html(svg, lx + 1.8 * U, yy - 0.7 * U, leg.w - 2 * U, 1.4 * U, 'l', function (d) {
          if (s.html) richLabelInto(d, s.html);
          else if (s.name) labelInto(d, s.name);
          else labelInto(d, '$y = ' + exprTex(s.expr) + '$');
        });
      });
    }

    if (m.errors.length) {
      var er = document.createElement('div');
      er.className = 'pt-cherr';
      er.textContent = m.errors.join(' ');
      target.appendChild(er);
    }
    return m;
  }

  /* y = 2x^2 for a legend: through the formula parser, so 2x^2 is set as math */
  function exprTex(src) {
    return String(src || '').replace(/\*/g, '\\cdot ').replace(/\bpi\b/g, '\\pi ')
      .replace(/\b(sin|cos|tan|cot|sec|csc|ln|log|exp|sinh|cosh|tanh|arcsin|arccos|arctan|min|max)\b/g, '\\$1 ')
      .replace(/sqrt\(([^()]*)\)/g, '\\sqrt{$1}').replace(/\^\(([^()]*)\)/g, '^{$1}');
  }

  /* ========================================================= LaTeX ===== */

  /* a colour by name: ours, or one defined for this document (xcolor names
     are kept to letters) */
  function colorName(hex, use) {
    for (var i = 0; i < COLORS.length; i++) if (COLORS[i][1] === hex) return COLORS[i][0];
    (use.ptColors = use.ptColors || {})[hex] = true;
    return customName(hex);
  }
  function customName(hex) { return 'ptc' + hex.toLowerCase().replace(/[0-9]/g, function (d) { return 'ghijklmnop'[d]; }); }

  function tex(b, doc, use, inline) {
    var m = model(b, doc);
    use.pgfplots = true;
    var axes = axesOf(b), middle = axes === 'middle', grid = gridOf(b);
    var w = clamp(+b.width || 0.75, 0.2, 1), aspect = clamp(+b.aspect || 0.62, 0.3, 1.2);
    var o = [];
    o.push('width=' + fmt(w) + '\\linewidth', 'height=' + fmt(+(w * aspect).toFixed(3)) + '\\linewidth');
    o.push(middle ? 'axis lines=middle' : axes === 'left' ? 'axis lines=left' : 'tick pos=left');
    if (b.title) o.push('title={' + labelTex(b.title, use) + '}');
    o.push('xmin=' + fmt(m.x[0]) + ', xmax=' + fmt(m.x[1]), 'ymin=' + fmt(m.y[0]) + ', ymax=' + fmt(m.y[1]));
    if (m.cats) {
      o.push('xtick={' + m.cats.map(function (_, i) { return i; }).join(',') + '}');
      o.push('xticklabels={' + m.cats.map(function (c) {
        return '{' + (c.html != null ? inline(c.html, use).trim() : PT.latex.esc(c.text)) + '}';
      }).join(',') + '}');
    } else o.push('xtick distance=' + fmt(m.xstep));
    o.push('ytick distance=' + fmt(m.ystep));
    if (grid === 'major') o.push(m.cats ? 'ymajorgrids' : 'grid=major');
    if (grid === 'both') o.push(m.cats ? 'ymajorgrids, yminorgrids, minor y tick num=1' : 'grid=both, minor tick num=1', 'minor tick length=0pt');
    if (b.xlabel) o.push('xlabel={' + labelTex(b.xlabel, use) + '}');
    if (b.ylabel) o.push('ylabel={' + labelTex(b.ylabel, use) + '}');
    if (middle) {
      if (b.xlabel) o.push('xlabel style={at={(ticklabel* cs:1)}, anchor=west}');
      if (b.ylabel) o.push('ylabel style={at={(ticklabel* cs:1)}, anchor=south}');
    }
    if (m.keep) o.push('unbounded coords=jump', 'restrict y to domain=' + fmt(m.keep[0]) + ':' + fmt(m.keep[1]));
    var nbar = m.series.filter(function (s) { return !s.fn; }).length || 1;
    var barw = clamp(+b.barw || 0.8, 0.2, 1);
    if (b.kind === 'bar') {
      o.push(m.stacked ? 'ybar stacked' : 'ybar=0pt', 'bar width=' + fmt(+(m.stacked ? barw : barw / nbar).toFixed(4)), 'area legend');
      if (m.values) o.push('nodes near coords',
        'every node near coord/.append style={font=\\small, /pgf/number format/fixed, /pgf/number format/precision=2, /pgf/number format/1000 sep={}}');
    }
    if (m.legend) o.push('legend pos=' + m.legend, 'legend cell align=left');

    var t = '\\begin{figure}[' + (b.placement || 'htbp') + ']\n  \\centering\n  \\begin{tikzpicture}\n' +
      '    \\begin{axis}[\n      ' + o.join(',\n      ') + '\n    ]\n';
    m.series.forEach(function (s, si) {
      var L = look(b, s), cn = colorName(L.hex, use), opts;
      var errs = s.err ? ['error bars/.cd', 'y dir=both', 'y explicit'] : [];
      if (s.fn) {
        opts = [cn, L.thick].concat(L.dash !== 'solid' ? [L.dash] : [],
          ['domain=' + fmt(m.x[0]) + ':' + fmt(m.x[1]), 'samples=' + m.samples]);
        t += '      \\addplot[' + opts.join(', ') + '] {' + s.pgf + '};\n';
      } else {
        if (b.kind === 'bar') {
          opts = ['fill=' + cn + '!75', 'draw=' + cn];
          if (!m.stacked) opts.push('bar shift=' + fmt(+((-barw / 2 + (si + 0.5) * barw / nbar)).toFixed(4)));
        } else {
          opts = [cn];
          if (L.line) { opts.push(L.thick); if (L.dash !== 'solid') opts.push(L.dash); if (b.smooth) opts.push('smooth'); }
          else opts.push('only marks');
          if (L.mark === 'none') opts.push('no marks');
          else opts.push('mark=' + L.mark, 'mark size=' + MSIZE[L.msize] + 'pt', 'mark options={solid}');
        }
        t += '      \\addplot[' + opts.concat(errs).join(', ') + '] coordinates {' +
          s.pts.map(function (p) {
            return '(' + fmt(p[0]) + ',' + fmt(p[1]) + ')' + (s.err ? ' +- (0,' + fmt(p.err || 0) + ')' : '');
          }).join(' ') + '};\n';
      }
      if (m.legend) {
        var name = s.html ? inline(s.html, use).trim() : s.name ? labelTex(s.name, use)
          : s.expr ? '$y = ' + PT.math.texRow(PT.math.parseTex(exprTex(s.expr))) + '$' : '';
        t += '      \\addlegendentry{' + name + '}\n';
      }
    });
    t += '    \\end{axis}\n  \\end{tikzpicture}\n';
    if (b.caption) t += '  \\caption{' + inline(b.caption, use).trim() + '}\n';
    if (b.label) t += '  \\label{' + PT.sanitize.label(b.label) + '}\n';
    return t + '\\end{figure}\n';
  }

  function preamble(use) {
    var custom = Object.keys((use && use.ptColors) || {});
    return ['\\usepackage{pgfplots}',
      '\\pgfplotsset{compat=1.18, scaled ticks=false,',
      '  tick label style={/pgf/number format/fixed, /pgf/number format/precision=4, /pgf/number format/1000 sep={}}}']
      .concat(COLORS.map(function (c) { return '\\definecolor{' + c[0] + '}{HTML}{' + c[1] + '}'; }))
      .concat(custom.map(function (hex) { return '\\definecolor{' + customName(hex) + '}{HTML}{' + hex + '}'; }));
  }

  window.PT = window.PT || {};
  window.PT.chart = {
    compile: compile, parse: parse, parseCSV: parseCSV, num: num, model: model, look: look,
    draw: draw, tex: tex, preamble: preamble, source: source, cellText: cellText,
    COLORS: COLORS, THICK: THICK, DASHES: DASHES, MARKS: MARKS, MSIZE: MSIZE, LEGEND_POS: LEGEND_POS,
    autoHex: autoHex
  };
})();
