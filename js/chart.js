/* PaperTeX — charts: a function plot or a chart of data, drawn on the page
   and written out as pgfplots (or, for a pie, as plain TikZ).

   The page and the PDF are drawn from the same numbers. Whatever pgfplots
   would choose by itself (axis limits, tick spacing, where a curve stops
   near an asymptote) is decided here instead and written into the axis
   options, so the PDF looks like the page rather than like a guess at it.

   A function is typed the way it is written on paper: 2x^2 - 3x + 1,
   sin x, e^(-x^2/2), |x|. It is parsed here, never evaluated as code, and
   the parse tree is turned into pgfmath for the .tex (where trigonometry
   works in degrees, so sin x becomes sin(deg(x))).

   Kinds: function, line, scatter, bar (also horizontal), hist, pie,
   polar (r = f(θ)) and surface (z = f(x, y)). */
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
  var FILL_OPACITY = 0.2;

  /* colour maps for surfaces, as evenly spaced stops (written out in full
     in the .tex, so the PDF does not depend on pgfplots' own defaults) */
  var CMAPS = {
    viridis: ['Viridis', [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]]],
    ocean: ['Ocean', [[8, 29, 88], [34, 94, 168], [29, 145, 192], [127, 205, 187], [237, 248, 177]]],
    magma: ['Magma', [[0, 0, 4], [81, 18, 124], [183, 55, 121], [252, 137, 97], [252, 253, 191]]],
    hot: ['Blue to red', [[0, 0, 255], [255, 255, 0], [255, 128, 0], [255, 0, 0]]],
    gray: ['Gray', [[40, 40, 40], [235, 235, 235]]]
  };

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

  /* the variables a formula may use, by what is being drawn: the name as
     typed → the variable it stands for */
  var VARS = {
    plain: { x: 'x' },
    polar: { x: 'x', t: 'x', theta: 'x', '\u03b8': 'x' },
    surface: { x: 'x', y: 'y' }
  };
  var VARHINT = {
    plain: 'use x as the variable',
    polar: 'use θ (or t) for the angle',
    surface: 'use x and y as the variables'
  };

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
      if ((m = /^[A-Za-z\u03c0\u03b8]+\d*/.exec(s.slice(i)))) {
        out.push({ k: 'id', v: m[0] }); i += m[0].length; continue;
      }
      if ('+-*/^(),|'.indexOf(c) >= 0) { out.push({ k: c }); i++; continue; }
      throw new Error('“' + c + '” is not something a formula can contain');
    }
    return out;
  }

  /* A run of letters is read greedily into the names it is made of, the way
     "xsin" or "2pix" are meant: functions, constants and the variables. */
  function splitWord(w, vars, mode) {
    var parts = [], i = 0;
    var names = Object.keys(FN).concat(Object.keys(ALIAS), Object.keys(CONST), Object.keys(vars))
      .sort(function (a, b) { return b.length - a.length; });
    while (i < w.length) {
      var hit = null;
      for (var j = 0; j < names.length; j++) {
        if (w.substr(i, names[j].length).toLowerCase() === names[j]) { hit = names[j]; break; }
      }
      if (!hit) throw new Error('“' + w + '” is not a function this knows — ' + VARHINT[mode]);
      parts.push(hit); i += hit.length;
    }
    return parts;
  }

  function parse(src, mode) {
    mode = VARS[mode] ? mode : 'plain';
    var vars = VARS[mode];
    var raw = tokenize(src), toks = [];
    raw.forEach(function (t) {
      if (t.k !== 'id') { toks.push(t); return; }
      var m = /^(.*?)(\d+)$/.exec(t.v);           /* log2 is a name; x2 is x·2 */
      var word = t.v, digits = '';
      if (m && !FN[t.v.toLowerCase()]) { word = m[1]; digits = m[2]; }
      splitWord(word, vars, mode).forEach(function (p) { toks.push({ k: 'id', v: ALIAS[p] || p }); });
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
        if (vars[t.v]) return { k: 'v', n: vars[t.v] };
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

  /* f(x, y) */
  function evaluator(n) {
    switch (n.k) {
      case 'num': return function () { return n.v; };
      case 'v': return n.n === 'y' ? function (x, y) { return y; } : function (x) { return x; };
      case 'const': var c = CONST[n.n]; return function () { return c; };
      case 'neg': var a = evaluator(n.a); return function (x, y) { return -a(x, y); };
      case 'call': {
        var f = FN[n.f][1], as = n.args.map(evaluator);
        return as.length === 1 ? function (x, y) { return f(as[0](x, y)); }
          : function (x, y) { return f(as[0](x, y), as[1](x, y)); };
      }
      case 'bin': {
        var l = evaluator(n.a), r = evaluator(n.b);
        switch (n.op) {
          case '+': return function (x, y) { return l(x, y) + r(x, y); };
          case '-': return function (x, y) { return l(x, y) - r(x, y); };
          case '*': return function (x, y) { return l(x, y) * r(x, y); };
          case '/': return function (x, y) { return l(x, y) / r(x, y); };
          case '^': return function (x, y) { return Math.pow(l(x, y), r(x, y)); };
        }
      }
    }
    return function () { return NaN; };
  }

  /* and readable: only the brackets pgfmath needs. A minus sign in front of
     anything but a plain number or name keeps its brackets: older pgfmath
     read -x^2 as (-x)^2. vm says what each variable is written as (a log
     axis samples x as 10^x). */
  var PREC = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 };
  function prec(n) { return n.k === 'bin' ? PREC[n.op] : n.k === 'neg' ? 3 : 9; }
  function pgfPretty(n, vm) {
    switch (n.k) {
      case 'num': return fmt(n.v);
      case 'v': {
        var s = vm && vm[n.n] || n.n;
        return /^\w+$/.test(s) ? s : '(' + s + ')';
      }
      case 'const': return n.n === 'pi' ? 'pi' : 'e';
      case 'neg': return '-' + wrap(n.a, prec(n.a) < 9, vm);
      case 'call': {
        var args = n.args.map(function (a) { return pgfPretty(a, vm); }), f = FN[n.f];
        return f[2] ? f[2](args.join(',')) : n.f + '(' + args.join(',') + ')';
      }
      case 'bin': {
        var my = PREC[n.op], pl = prec(n.a), pr = prec(n.b);
        var l = wrap(n.a, n.op === '^' ? pl <= my : pl < my, vm);
        var r = wrap(n.b, n.b.k === 'neg' || pr < my || (pr === my && (n.op === '-' || n.op === '/')), vm);
        return l + (n.op === '+' || n.op === '-' ? ' ' + n.op + ' ' : n.op) + r;
      }
    }
    return '0';
  }
  function wrap(n, need, vm) { var s = pgfPretty(n, vm); return need ? '(' + s + ')' : s; }

  /* mode: 'plain' (y = f(x)), 'polar' (r = f(θ)) or 'surface' (z = f(x, y)) */
  function compile(src, mode) {
    try {
      var ast = parse(src, mode);
      return { ok: true, ast: ast, f: evaluator(ast), pgf: pgfPretty(ast), pgfWith: function (vm) { return pgfPretty(ast, vm); } };
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
    if (!c.ok || JSON.stringify(c.ast).indexOf('"k":"v"') >= 0) return null;
    var v = c.f(0, 0);
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
  function lg(v) { return Math.log(v) / Math.LN10; }
  function pow10(m, k) { return +(m + 'e' + k); }
  /* 1, 2 or 5 times a power of ten, at or below (or above) v */
  function snap125(v, up) {
    var k = Math.floor(lg(v)), m = v / Math.pow(10, k);
    if (up) m = m <= 1 + 1e-9 ? 1 : m <= 2 + 1e-9 ? 2 : m <= 5 + 1e-9 ? 5 : 10;
    else m = m >= 5 - 1e-9 ? 5 : m >= 2 - 1e-9 ? 2 : 1;
    return pow10(m, k);
  }
  function near(a, list) {
    for (var i = 0; i < list.length; i++) if (Math.abs(a - list[i]) <= Math.abs(a) * 1e-9 + 1e-12) return true;
    return false;
  }

  /* ========================================================== axes ===== */

  /* An axis as both drawings need it: where a value sits along it (norm,
     0 to 1), its ticks, and how a tick is written. */
  function linAxis(lo, hi, step) {
    var major = ticks(lo, hi, step);
    return {
      lo: lo, hi: hi, step: step, major: major,
      minor: ticks(lo, hi, step / 2).filter(function (v) { return !near(v, major); }),
      text: function (v) { return tickText(v, step); },
      norm: function (v) { return (v - lo) / (hi - lo); }
    };
  }
  /* Decades where there are three or more, else 1-2-5; written as 10^k when
     the numbers would be long, as plain numbers otherwise. */
  function logAxis(lo, hi) {
    var a = Math.ceil(lg(lo) - 1e-9), z = Math.floor(lg(hi) + 1e-9), major = [], minor = [], k, m;
    var decades = z - a >= 2;
    if (decades) {
      var every = Math.max(1, Math.ceil((z - a + 1) / 8));
      for (k = a; k <= z; k++) if ((k - a) % every === 0) major.push(pow10(1, k));
    } else {
      for (k = Math.floor(lg(lo)); k <= Math.ceil(lg(hi)); k++) {
        [1, 2, 5].forEach(function (mm) { var v = pow10(mm, k); if (v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9)) major.push(v); });
      }
    }
    var many = z - a > 6;
    for (k = Math.floor(lg(lo)); k <= Math.ceil(lg(hi)); k++) {
      for (m = 1; m <= 9; m++) {
        if (many && m > 1) break;
        var v = pow10(m, k);
        if (v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9) && !near(v, major)) minor.push(v);
      }
    }
    var pw = decades && (hi / lo >= 1e4 || lo < 0.01 || hi >= 1e5);
    var L0 = lg(lo), L1 = lg(hi);
    return {
      lo: lo, hi: hi, log: true, pow: pw, major: major, minor: minor,
      text: function (v) { return pw ? '10^' + Math.round(lg(v)) : fmt(v).replace('-', '\u2212'); },
      norm: function (v) { return v > 0 ? (lg(v) - L0) / (L1 - L0) : -Infinity; }
    };
  }
  function catAxis(cats) {
    var lo = -0.5, hi = Math.max(0, cats.length - 1) + 0.5;
    return { cats: cats, lo: lo, hi: hi, major: cats.map(function (_, i) { return i; }), minor: [],
      norm: function (v) { return (v - lo) / (hi - lo); } };
  }
  /* a log axis' range when none is given: the data's, out to 1, 2 or 5 */
  function autoLog(vals, given, fn) {
    var p = vals.filter(function (v) { return v > 0 && isFinite(v); }).sort(function (a, b) { return a - b; });
    var lo = p.length ? p[0] : 1, hi = p.length ? p[p.length - 1] : 10;
    if (fn && p.length > 20) {
      var a = p[Math.floor(p.length * 0.02)], z = p[Math.ceil(p.length * 0.98) - 1];
      if (lg(hi) - lg(lo) > 3 * (lg(z) - lg(a)) && z > a) { lo = a; hi = z; }
    }
    lo = snap125(lo, false); hi = snap125(hi, true);
    if (given[0] != null && given[0] > 0) lo = given[0];
    if (given[1] != null && given[1] > 0) hi = given[1];
    if (!(hi > lo)) hi = lo * 10;
    return [lo, hi];
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
  /* the first column holding numbers, other than the ones given */
  function numericCol(src, not) {
    for (var i = 0; i < src.head.length; i++) {
      if (not.indexOf(i) >= 0) continue;
      if (src.rows.some(function (r) { return num(r[i]) !== null; })) return i;
    }
    return -1;
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
  /* a colour mixed with another, the way xcolor's a!p!b does */
  function mix(hex, other, p) {
    var out = '';
    for (var i = 0; i < 3; i++) {
      var a = parseInt(hex.substr(i * 2, 2), 16), b = parseInt(other.substr(i * 2, 2), 16);
      out += ('0' + Math.round(a * p + b * (1 - p)).toString(16)).slice(-2);
    }
    return out.toUpperCase();
  }
  function light(hex) {
    var r = parseInt(hex.substr(0, 2), 16), g = parseInt(hex.substr(2, 2), 16), b = parseInt(hex.substr(4, 2), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
  }

  /* How one series is drawn: its own settings where it has them, the
     chart's where it does not. A curve's settings live on its formula, a
     data series' on b.style[column]. */
  function look(b, s) {
    var st = s.st || {};
    var bars = !s.fn && (b.kind === 'bar' || b.kind === 'hist');
    var mark = s.fn || bars || b.kind === 'polar' ? 'none'
      : MARKS.indexOf(st.mark) >= 0 ? st.mark
      : b.kind === 'scatter' ? '*' : (b.marks === false ? 'none' : '*');
    return {
      hex: hexOf(st.color) || autoHex(s.color),
      line: !!s.fn || b.kind === 'line',
      bars: bars,
      dash: DASHES.indexOf(st.dash) >= 0 ? st.dash : 'solid',
      thick: THICK[st.thick] ? st.thick : 'thick',
      mark: mark,
      msize: MSIZE[st.msize] ? st.msize : 'normal'
    };
  }

  /* ======================================================== layout ===== */

  function model(b, doc) {
    if (b.kind === 'pie') return pieModel(b, doc);
    if (b.kind === 'polar') return polarModel(b);
    if (b.kind === 'surface') return surfaceModel(b);
    return cartesian(b, doc);
  }

  /* Everything both drawings need: the series as points, the axes and
     their ticks. */
  function cartesian(b, doc) {
    var kind = b.kind;
    var out = { kind: kind, series: [], errors: [], cats: null, fills: [] };
    var xr = [val(b.xmin), val(b.xmax)], yr = [val(b.ymin), val(b.ymax)];
    out.samples = clamp(parseInt(b.samples, 10) || SAMPLES, 20, 1000);
    out.bar = kind === 'bar';
    out.hist = kind === 'hist';
    out.horiz = out.bar && !!b.horizontal;
    out.stacked = out.bar && !!b.stacked;
    out.values = (out.bar || out.hist) && !!b.values && !out.stacked;
    var canLog = kind === 'function' || kind === 'line' || kind === 'scatter';
    out.xlog = canLog && !!b.xlog;
    out.ylog = canLog && !!b.ylog;
    var dropped = 0;

    if (kind === 'function') {
      var lo = xr[0] != null ? xr[0] : out.xlog ? 0.1 : -5, hi = xr[1] != null ? xr[1] : out.xlog ? 100 : 5;
      if (out.xlog && !(lo > 0)) {
        out.errors.push('A logarithmic x axis starts above 0.');
        lo = hi > 0 ? hi / 1000 : 0.1;
        if (!(hi > lo)) hi = lo * 1000;
      }
      if (!(hi > lo)) { out.errors.push('The x range must go from smaller to larger.'); hi = lo + 1; }
      out.x = [lo, hi];
      var ys = curves(b.fns, lo, hi, 0, out);
      if (yr[0] != null && yr[1] != null && yr[1] > yr[0]) out.y = [yr[0], yr[1]];
      else out.y = out.ylog ? autoLog(ys, yr, true) : autoY(ys, yr, true, 0);
      out.band = true;
    } else if (kind === 'hist') {
      histogram(b, doc, out, xr, yr);
    } else {
      var src = source(b, doc), xc = b.xcol | 0, ycs = (b.ycols && b.ycols.length ? b.ycols : [1]);
      out.head = src.head;
      ycs = ycs.filter(function (c) { return c !== xc && c < src.head.length; });
      if (!src.rows.length || src.head.length < 2) out.errors.push(b.from ? 'The table needs at least two columns of numbers.' : 'Add some data: one row per point, one column per series.');
      var numericX = src.rows.length && src.rows.every(function (r) { return num(r[xc]) !== null; });
      if (out.bar || !numericX) {
        out.cats = src.rows.map(function (r, i) { return { text: r[xc] || '', html: src.html ? src.html[i][xc] : null }; });
        out.xlog = false;
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
          if ((out.xlog && x <= 0) || (out.ylog && y <= 0)) { dropped++; return; }
          var p = [x, y];
          if (ec >= 0) { var e = num(r[ec]); p.err = e !== null ? Math.abs(e) : 0; }
          pts.push(p);
          allX.push(x);
        });
        out.series.push({
          name: st.name || src.head[yc] || '', named: !!st.name, col: yc, key: 'c' + yc, err: ec >= 0, st: st, color: si,
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
      else if (out.xlog) out.x = autoLog(allX, xr, false);
      else {
        var x0 = Math.min.apply(null, allX.length ? allX : [0]), x1 = Math.max.apply(null, allX.length ? allX : [1]);
        if (x1 === x0) { x0 -= 1; x1 += 1; }
        var px = (x1 - x0) * 0.05;
        out.x = [xr[0] != null ? xr[0] : x0 - px, xr[1] != null ? xr[1] : x1 + px];
      }
      if (out.bar) allY.push(0);
      /* curves drawn over the data, a fit or a model: they take the data's
         x range and leave the y range to the data */
      if (!out.cats && b.fns && b.fns.length) {
        var fys = curves(b.fns, out.x[0], out.x[1], ycs.length, out);
        if (fys.length) out.band = true;
        if (!allY.length) allY = fys;
      }
      out.y = out.ylog ? autoLog(allY, yr, false) : autoY(allY, yr, false, out.values ? 0.1 : 0);
      /* bars stand on 0: no margin below it when they all go up */
      var ylo = Math.min.apply(null, allY), yhi = Math.max.apply(null, allY);
      if (out.bar && ylo >= 0 && yr[0] == null) out.y[0] = 0;
      if (out.bar && yhi <= 0 && yr[1] == null) out.y[1] = 0;
      if (!(out.y[1] > out.y[0])) out.y[1] = out.y[0] + 1;      /* no values yet */
    }
    if (dropped) out.errors.push(dropped + (dropped === 1 ? ' point is' : ' points are') + ' at or below 0, which a log scale cannot show.');

    /* tick spacing: what was asked, if it gives a sensible number of ticks */
    var xs = val(b.xstep), yst = val(b.ystep);
    if (out.cats) out.xstep = 1;
    /* a histogram's ticks fall on its bin edges, when the edges are whole steps from 0 */
    else if (out.hist && !(xs > 0) && Math.abs(out.bins.start / out.binw - Math.round(out.bins.start / out.binw)) < 1e-9)
      out.xstep = out.binw * Math.max(1, Math.ceil((out.x[1] - out.x[0]) / out.binw / 10));
    else if (xs > 0 && (out.x[1] - out.x[0]) / xs <= 60) out.xstep = xs;
    else {
      out.xstep = niceStep(out.x[1] - out.x[0], 7);
      /* years, counts, trial numbers: no ticks between whole numbers */
      if (out.wholeX && out.xstep < 1) out.xstep = 1;
    }
    out.ystep = yst > 0 && (out.y[1] - out.y[0]) / yst <= 60 ? yst : niceStep(out.y[1] - out.y[0], 6);
    /* function plots: the drawn y range is what was asked or what the curve
       spans, rounded outward to whole ticks */
    if (kind === 'function' && !out.ylog && !(yr[0] != null && yr[1] != null)) {
      if (yr[0] == null) out.y[0] = round(Math.floor(out.y[0] / out.ystep + 1e-9) * out.ystep, out.ystep);
      if (yr[1] == null) out.y[1] = round(Math.ceil(out.y[1] / out.ystep - 1e-9) * out.ystep, out.ystep);
    }
    if (!out.xlog) out.x = out.x.map(function (v) { return round(v, out.xstep); });
    if (!out.ylog) out.y = out.y.map(function (v) { return round(v, out.ystep); });
    /* where a curve with an asymptote is cut off: a band around the view */
    if (out.band && !out.ylog) {
      var span = out.y[1] - out.y[0];
      out.keep = [round(out.y[0] - span, out.ystep), round(out.y[1] + span, out.ystep)];
    }
    out.ax = out.cats ? catAxis(out.cats) : out.xlog ? logAxis(out.x[0], out.x[1]) : linAxis(out.x[0], out.x[1], out.xstep);
    out.ay = out.ylog ? logAxis(out.y[0], out.y[1]) : linAxis(out.y[0], out.y[1], out.ystep);

    /* areas: under a curve, or between two */
    out.series.forEach(function (s) {
      var f = s.st && s.st.fill;
      if (!f || !(s.fn || kind === 'line')) return;
      if (f === 'axis') { out.fills.push({ s: s, to: 'axis' }); return; }
      var t = out.series.filter(function (o) { return o.key === f && o !== s && (o.fn || kind === 'line'); })[0];
      if (t) out.fills.push({ s: s, to: t });
    });

    /* the legend: where it was put, or the emptiest corner; shown when there
       is more than one thing to tell apart, a name was given, or a place
       for it was chosen */
    out.legend = legendPlace(b, out, function (s) { return s.fn ? !!s.name : s.named; });
    return out;
  }

  function legendPlace(b, m, named) {
    var pos = b.legend === false ? 'none' : (b.legendPos || 'auto');
    var want = pos !== 'none' && m.series.length > 0 && (pos !== 'auto' || m.series.length > 1 || m.series.some(named));
    return want ? (LEGEND_POS.indexOf(pos) >= 0 ? pos : corner(m)) : null;
  }

  /* where a point of the data sits in the drawing, 0 to 1 across and up */
  function spot(m, x, y) {
    if (m.kind === 'polar') return [(y * Math.cos(x) / m.r + 1) / 2, (y * Math.sin(x) / m.r + 1) / 2];
    if (m.horiz) return [m.ay.norm(y), 1 - m.ax.norm(x)];
    return [m.ax.norm(x), m.ay.norm(y)];
  }

  /* The legend goes in whichever corner the data leaves emptiest. */
  function corner(m) {
    var C = [['north east', 1, 1], ['north west', 0, 1], ['south east', 1, 0], ['south west', 0, 0]], n = [0, 0, 0, 0];
    m.series.forEach(function (s) {
      var w = s.fn ? 0.1 : 1;           /* a curve is many samples, a point is one */
      var bars = !s.fn && (m.bar || m.hist);
      s.pts.forEach(function (p) {
        if (!isFinite(p[1])) return;
        (bars ? [0.2, 0.4, 0.6, 0.8, 1] : [1]).forEach(function (f) {
          var q = spot(m, p[0], (p.base || 0) + p[1] * f), nx = q[0], ny = q[1];
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

  /* y = f(x) for each formula, sampled where pgfplots will sample it (on a
     log x axis, evenly in log x) */
  function curves(fns, lo, hi, color0, out) {
    var ys = [], N = out.samples;
    (fns || []).forEach(function (fn, i) {
      if (!String(fn.expr || '').trim()) return;
      var c = compile(fn.expr);
      if (!c.ok) { out.errors.push('y = ' + fn.expr + ': ' + c.err); return; }
      var pts = [];
      for (var k = 0; k < N; k++) {
        var x = out.xlog ? lo * Math.pow(hi / lo, k / (N - 1)) : lo + (hi - lo) * k / (N - 1), y = c.f(x);
        pts.push([x, y]);
        if (isFinite(y)) ys.push(y);
      }
      out.series.push({ name: fn.name || '', expr: fn.expr, pgf: c.pgf, c: c, pts: pts, color: color0 + i, fn: true, st: fn, key: 'f' + i });
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

  /* A histogram: one column of numbers counted into bins of equal width.
     The bins are worked out here and written out as bars, so the PDF has
     exactly the bins the page shows. */
  function histogram(b, doc, out, xr, yr) {
    var src = source(b, doc);
    var col = b.ycols && b.ycols.length ? b.ycols[0] : -1;
    if (!(col >= 0 && col < src.head.length)) col = numericCol(src, []);
    var vals = [];
    if (col >= 0) src.rows.forEach(function (r) { var v = num(r[col]); if (v !== null) vals.push(v); });
    out.head = src.head;
    if (vals.length < 2) out.errors.push('A histogram needs a column with at least two numbers.');
    var N = vals.length, lo = N ? Math.min.apply(null, vals) : 0, hi = N ? Math.max.apply(null, vals) : 1;
    if (hi === lo) { lo -= 0.5; hi += 0.5; }
    var nb0 = parseInt(b.bins, 10) > 0 ? clamp(parseInt(b.bins, 10), 1, 100) : Math.ceil(Math.log(Math.max(N, 1)) / Math.LN2) + 1;
    var w = val(b.binw) > 0 ? val(b.binw) : niceBin((hi - lo) / nb0);
    var start = val(b.binstart) != null ? val(b.binstart) : Math.floor(lo / w + 1e-9) * w;
    start = round(start, w);
    var nb = clamp(Math.ceil((hi - start) / w - 1e-9), 1, 200);
    if (start + nb * w < hi - w * 1e-9) nb = clamp(nb + 1, 1, 200);
    var counts = [], outside = 0, i;
    for (i = 0; i < nb; i++) counts.push(0);
    vals.forEach(function (v) {
      var k = Math.floor((v - start) / w + 1e-9);
      if (k === nb && v <= start + nb * w + w * 1e-9) k = nb - 1;      /* the last bin takes its right edge */
      if (k < 0 || k >= nb) { outside++; return; }
      counts[k]++;
    });
    if (outside) out.errors.push(outside + (outside === 1 ? ' value falls' : ' values fall') + ' outside the bins.');
    var mode = b.histY === 'percent' || b.histY === 'density' ? b.histY : 'count';
    var f = mode === 'percent' ? 100 / Math.max(N, 1) : mode === 'density' ? 1 / (Math.max(N, 1) * w) : 1;
    var st = (b.style && b.style[col]) || {};
    var pts = counts.map(function (c, k) { return [round(start + (k + 0.5) * w, w), +(c * f).toPrecision(12)]; });
    out.series.push({ name: st.name || src.head[col] || '', named: !!st.name, col: col, key: 'c' + col, st: st, color: 0, pts: pts, bins: true,
      html: !st.name && src.table && src.table.header ? src.table.rows[0][col] : null });
    out.binw = w;
    out.bins = { start: start, w: w, n: nb, counts: counts, N: N };
    var end = start + nb * w, pad = (end - start) * 0.02;
    out.x = [xr[0] != null ? xr[0] : start - pad, xr[1] != null ? xr[1] : end + pad];
    var allY = pts.map(function (p) { return p[1]; }).concat([0]);
    /* the normal distribution with the data's mean and spread, to scale */
    if (b.normal && N > 1) {
      var mu = vals.reduce(function (a, v) { return a + v; }, 0) / N;
      var sd = Math.sqrt(vals.reduce(function (a, v) { return a + (v - mu) * (v - mu); }, 0) / (N - 1));
      if (sd > 0) {
        var A = (mode === 'count' ? N * w : mode === 'percent' ? 100 * w : 1) / (sd * Math.sqrt(2 * Math.PI));
        var g = function (x) { return A * Math.exp(-(x - mu) * (x - mu) / (2 * sd * sd)); };
        var cpts = [], M = out.samples;
        for (i = 0; i < M; i++) { var x = out.x[0] + (out.x[1] - out.x[0]) * i / (M - 1); cpts.push([x, g(x)]); allY.push(g(x)); }
        var ns = b.normalStyle || {};
        out.series.push({ name: ns.name || 'Normal curve', named: true, fn: true, normal: true, key: 'n', st: ns, color: 1, pts: cpts,
          pgf: fmt(+A.toPrecision(6)) + '*exp(-((x' + (mu < 0 ? ' + ' + fmt(+(-mu).toPrecision(8)) : ' - ' + fmt(+mu.toPrecision(8))) + ')^2)/' + fmt(+(2 * sd * sd).toPrecision(8)) + ')',
          mu: mu, sd: sd });
      }
    }
    out.y = autoY(allY, yr, false, out.values ? 0.1 : 0);
    if (yr[0] == null) out.y[0] = 0;
  }
  function niceBin(raw) {
    if (!(raw > 0)) return 1;
    var mag = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / mag;
    return (r < 1.5 ? 1 : r < 2.25 ? 2 : r < 3.5 ? 2.5 : r < 7.5 ? 5 : 10) * mag;
  }

  /* A pie: one column of labels, one of values. Slices go clockwise from
     the top, as in a spreadsheet. Sizes are in units of the radius. */
  function pieModel(b, doc) {
    var out = { kind: 'pie', errors: [], slices: [] };
    var src = source(b, doc), lc = b.xcol | 0;
    var vc = b.ycols && b.ycols.length ? b.ycols[0] : 1;
    if (!(vc >= 0 && vc < src.head.length) || vc === lc) vc = numericCol(src, [lc]);
    out.head = src.head;
    var skipped = 0, total = 0;
    if (vc >= 0) src.rows.forEach(function (r, i) {
      var v = num(r[vc]);
      if (v === null) return;
      if (!(v > 0)) { skipped++; return; }
      out.slices.push({ text: r[lc] || '', html: src.html && lc !== vc ? src.html[i][lc] : null, v: v });
      total += v;
    });
    if (!out.slices.length) out.errors.push('A pie chart needs a column of labels and a column of positive numbers.');
    if (skipped) out.errors.push(skipped + (skipped === 1 ? ' value is' : ' values are') + ' zero or negative and left out.');
    out.donut = !!b.donut;
    out.labels = b.pieLabels === 'legend' || b.pieLabels === 'none' ? b.pieLabels : 'outside';
    out.numbers = ['value', 'both', 'none'].indexOf(b.pieNumbers) >= 0 ? b.pieNumbers : 'percent';
    var dec = clamp(parseInt(b.pieDec, 10) || 0, 0, 2);
    var a = 90, sc = b.sliceColors || {};
    out.slices.forEach(function (s, k) {
      var sweep = 360 * s.v / total;
      s.a0 = a; s.a1 = a - sweep; s.mid = a - sweep / 2; s.sweep = sweep;
      a -= sweep;
      s.hex = hexOf(sc[k]) || autoHex(k);
      var pct = (100 * s.v / total).toFixed(dec);
      s.pct = pct; s.val = valueText(s.v);
      s.num = out.numbers === 'percent' ? pct + '%' : out.numbers === 'value' ? s.val : out.numbers === 'both' ? s.val + ' (' + pct + '%)' : '';
      /* a narrow slice has no room for its number inside */
      s.inside = !!s.num && sweep >= (out.numbers === 'both' ? 34 : 20);
    });
    out.rIn = out.donut ? 0.5 : 0;
    out.rNum = out.donut ? 0.75 : 0.64;
    /* the radius as a share of the text width */
    out.kR = out.labels === 'outside' ? 0.24 : 0.3;
    return out;
  }

  /* r = f(θ), on a round grid */
  function polarModel(b) {
    var out = { kind: 'polar', series: [], errors: [] };
    var lo = val(b.xmin), hi = val(b.xmax);
    if (lo == null) lo = 0;
    if (hi == null) hi = 2 * Math.PI;
    if (!(hi > lo)) { out.errors.push('The angle must go from smaller to larger.'); hi = lo + 2 * Math.PI; }
    out.t = [lo, hi];
    out.samples = clamp(parseInt(b.samples, 10) || 360, 20, 1000);
    var rs = [];
    (b.fns || []).forEach(function (fn, i) {
      if (!String(fn.expr || '').trim()) return;
      var c = compile(fn.expr, 'polar');
      if (!c.ok) { out.errors.push('r = ' + fn.expr + ': ' + c.err); return; }
      var pts = [];
      for (var k = 0; k < out.samples; k++) {
        var t = lo + (hi - lo) * k / (out.samples - 1), r = c.f(t);
        pts.push([t, r]);
        if (isFinite(r)) rs.push(Math.abs(r));
      }
      out.series.push({ name: fn.name || '', expr: fn.expr, pgf: c.pgf, pts: pts, color: i, fn: true, st: fn, key: 'f' + i });
    });
    var top = val(b.ymax);
    if (!(top > 0)) {
      var s = rs.slice().sort(function (a, z) { return a - z; });
      top = s.length ? s[s.length - 1] : 1;
      if (s.length > 20) { var p95 = s[Math.ceil(s.length * 0.95) - 1]; if (top > 8 * p95 && p95 > 0) top = p95; }
      if (!(top > 0)) top = 1;
    }
    var ys = val(b.ystep);
    out.rstep = ys > 0 && top / ys <= 20 ? ys : niceStep(top, 4);
    out.r = val(b.ymax) > 0 ? top : round(Math.ceil(top / out.rstep - 1e-9) * out.rstep, out.rstep);
    out.rticks = ticks(0, out.r, out.rstep).filter(function (v) { return v > 0 && v < out.r - out.rstep * 1e-6; });
    out.rminor = ticks(0, out.r, out.rstep / 2).filter(function (v) { return v > 0 && !near(v, out.rticks); });
    out.astep = [15, 30, 45, 60, 90].indexOf(+b.astep) >= 0 ? +b.astep : 30;
    out.rad = b.angles === 'rad';
    out.angles = [];
    for (var d = 0; d < 360; d += out.astep) out.angles.push(d);
    out.legend = legendPlace(b, out, function (s) { return !!s.name; });
    /* inside the circle a key always covers something */
    if (out.legend && (b.legendPos || 'auto') === 'auto') out.legend = 'outer north east';
    return out;
  }
  /* 30° as π/6 */
  function piText(d, tex) {
    if (d === 0) return '0';
    var g = function (a, z) { return z ? g(z, a % z) : a; }, k = g(d, 180), n = d / k, q = 180 / k;
    var pi = tex ? '\\pi' : 'π';
    var top = (n === 1 ? '' : n) + pi;
    if (q === 1) return top;
    return tex ? '\\frac{' + top + '}{' + q + '}' : top + '/' + q;
  }

  /* z = f(x, y) over a rectangle, seen from an angle */
  function surfaceModel(b) {
    var out = { kind: 'surface', errors: [], series: [] };
    var xr = [val(b.xmin), val(b.xmax)], yr = [val(b.ymin), val(b.ymax)], zr = [val(b.zmin), val(b.zmax)];
    out.x = [xr[0] != null ? xr[0] : -3, xr[1] != null ? xr[1] : 3];
    out.y = [yr[0] != null ? yr[0] : -3, yr[1] != null ? yr[1] : 3];
    if (!(out.x[1] > out.x[0])) { out.errors.push('The x range must go from smaller to larger.'); out.x[1] = out.x[0] + 1; }
    if (!(out.y[1] > out.y[0])) { out.errors.push('The y range must go from smaller to larger.'); out.y[1] = out.y[0] + 1; }
    out.n = clamp(parseInt(b.samples3, 10) || 25, 6, 60);
    var fn = (b.fns || [])[0] || { expr: '' };
    var c = compile(fn.expr || '', 'surface');
    out.z = [];
    var zs = [];
    if (!String(fn.expr || '').trim()) out.errors.push('Type a formula in x and y, e.g. sin(x) cos(y).');
    else if (!c.ok) out.errors.push('z = ' + fn.expr + ': ' + c.err);
    else {
      out.pgf = c.pgf;
      out.expr = fn.expr;
      for (var j = 0; j < out.n; j++) {
        var row = [];
        for (var i = 0; i < out.n; i++) {
          var x = out.x[0] + (out.x[1] - out.x[0]) * i / (out.n - 1), y = out.y[0] + (out.y[1] - out.y[0]) * j / (out.n - 1);
          var z = c.f(x, y);
          row.push(z);
          if (isFinite(z)) zs.push(z);
        }
        out.z.push(row);
      }
    }
    var zz = spanOf(zs);
    out.meta = zs.length ? [Math.min.apply(null, zs), Math.max.apply(null, zs)] : [0, 1];
    out.trimmed = zs.length > 20 && (out.meta[0] < zz[0] || out.meta[1] > zz[1]);
    if (out.trimmed) out.meta = [Math.max(out.meta[0], zz[0]), Math.min(out.meta[1], zz[1])];
    out.xstep = val(b.xstep) > 0 ? val(b.xstep) : niceStep(out.x[1] - out.x[0], 4);
    out.ystep = val(b.ystep) > 0 ? val(b.ystep) : niceStep(out.y[1] - out.y[0], 4);
    out.zstep = val(b.zstep) > 0 ? val(b.zstep) : niceStep(zz[1] - zz[0], 4);
    out.zr = [zr[0] != null ? zr[0] : round(Math.floor(zz[0] / out.zstep + 1e-9) * out.zstep, out.zstep),
      zr[1] != null ? zr[1] : round(Math.ceil(zz[1] / out.zstep - 1e-9) * out.zstep, out.zstep)];
    if (!(out.zr[1] > out.zr[0])) out.zr[1] = out.zr[0] + 1;
    /* the formula leaves the box: cut it where the box ends */
    out.cut = zr[0] != null || zr[1] != null || out.trimmed;
    if (out.meta[1] <= out.meta[0]) out.meta = [out.meta[0] - 0.5, out.meta[0] + 0.5];
    out.az = isFinite(parseFloat(b.az)) ? clamp(parseFloat(b.az), -180, 180) : 25;
    out.el = isFinite(parseFloat(b.el)) ? clamp(parseFloat(b.el), 0, 90) : 30;
    out.style = b.surf === 'mesh' ? 'mesh' : 'surf';
    out.smooth = b.shader === 'smooth';
    out.cmap = CMAPS[b.cmap] ? b.cmap : 'viridis';
    out.colorbar = !!b.colorbar;
    out.box = [1, 1, 1];
    out.xt = ticks(out.x[0], out.x[1], out.xstep);
    out.yt = ticks(out.y[0], out.y[1], out.ystep);
    out.zt = ticks(out.zr[0], out.zr[1], out.zstep);
    return out;
  }
  /* the values' range, leaving out a spike towards infinity */
  function spanOf(vs) {
    if (!vs.length) return [-1, 1];
    var s = vs.slice().sort(function (a, b) { return a - b; }), lo = s[0], hi = s[s.length - 1];
    if (s.length > 20) {
      var p5 = s[Math.floor(s.length * 0.05)], p95 = s[Math.ceil(s.length * 0.95) - 1];
      if (hi - lo > 8 * (p95 - p5) && p95 > p5) { lo = p5; hi = p95; }
    }
    if (hi === lo) { lo -= 1; hi += 1; }
    return [lo, hi];
  }
  /* the colour of t (0 to 1) in a colour map */
  function cmapAt(name, t) {
    var st = CMAPS[name][1], n = st.length - 1;
    t = clamp(isFinite(t) ? t : 0, 0, 1) * n;
    var i = Math.min(n - 1, Math.floor(t)), f = t - i, a = st[i], z = st[i + 1];
    return 'rgb(' + [0, 1, 2].map(function (k) { return Math.round(a[k] + (z[k] - a[k]) * f); }).join(',') + ')';
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
  /* a tick label, 10^k with its exponent raised */
  function tickLabel(parent, x, y, anchor, ax, v, U) {
    var t = el('text', { x: x, y: y, 'text-anchor': anchor }, parent);
    if (ax.pow) {
      t.appendChild(document.createTextNode('10'));
      var s = el('tspan', { dy: -0.42 * U, 'font-size': '72%' }, t);
      s.textContent = String(Math.round(lg(v))).replace('-', '\u2212');
    } else t.textContent = ax.text(v);
    return t;
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
  function pathOf(pts, smooth, cont) {
    if (pts.length < 2) return pts.length && !cont ? 'M' + pts[0][0] + ' ' + pts[0][1] : '';
    var d = (cont ? 'L' : 'M') + pts[0][0].toFixed(2) + ' ' + pts[0][1].toFixed(2), k = 0.18;
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

  /* the drawing's frame: an <svg> sized like the chart on the page */
  function canvas(target, b, doc, opts, aspect) {
    var fpt = parseFloat(doc && doc.settings && doc.settings.fontsize) || 10;
    var fs = parseFloat(getComputedStyle(target).fontSize) || 13;
    var colEm = opts.colEm || (target.parentNode && target.parentNode.clientWidth ? target.parentNode.clientWidth / fs : 36);
    var w = clamp(+b.width || 0.75, 0.2, 1);
    var W = Math.max(12, w * colEm) * U, H = W * aspect;
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': 'pt-chsvg' });
    if (opts.fit) { svg.style.width = '100%'; svg.style.height = '100%'; }
    else { svg.style.width = Math.round(w * 1000) / 10 + '%'; svg.style.aspectRatio = W + ' / ' + H; }
    target.appendChild(svg);
    return { svg: svg, W: W, H: H, P: U / fpt, colEm: colEm, w: w };
  }

  /* Draw chart b into target. opts.fit: fill the target (the studio)
     instead of taking b.width of it; opts.colEm: the text column, in em,
     that the chart's proportions are taken from. */
  function draw(target, b, doc, opts) {
    opts = opts || {};
    var m = model(b, doc);
    target.textContent = '';
    if (m.kind === 'pie') drawPie(target, b, doc, opts, m);
    else if (m.kind === 'polar') drawPolar(target, b, doc, opts, m);
    else if (m.kind === 'surface') drawSurface(target, b, doc, opts, m);
    else drawCartesian(target, b, doc, opts, m);
    if (m.errors.length) {
      var er = document.createElement('div');
      er.className = 'pt-cherr';
      er.textContent = m.errors.join(' ');
      target.appendChild(er);
    }
    return m;
  }

  function drawLegend(svg, b, m, area, P) {
    var leg = area.leg;
    if (!leg) return;
    var outer = m.legend === 'outer north east';
    var east = /east/.test(m.legend), north = /north/.test(m.legend);
    var lx = outer ? area.ml + area.pw + 0.8 * U : east ? area.ml + area.pw - leg.w - 0.4 * U : area.ml + 0.4 * U;
    var ly = outer || north ? area.mt + (outer ? 0 : 0.4 * U) : area.mt + area.ph - leg.h - 0.4 * U;
    el('rect', { x: lx, y: ly, width: leg.w, height: leg.h, 'class': 'pt-chlegend' }, svg);
    m.series.forEach(function (s, i) {
      var L = look(b, s), col = '#' + L.hex, sw = lineWidth(L, P);
      var yy = ly + 0.2 * U + i * 1.35 * U + 0.675 * U;
      if (L.bars) {
        var edge = s.bins ? '#' + mix(L.hex, '000000', 0.5) : col;
        el('rect', { x: lx + 0.4 * U, y: yy - 0.35 * U, width: 1 * U, height: 0.7 * U, fill: col, 'fill-opacity': 0.75, stroke: edge, 'stroke-width': 0.4 * P }, svg);
      } else {
        if (L.line) el('line', { x1: lx + 0.3 * U, x2: lx + 1.5 * U, y1: yy, y2: yy, stroke: col, 'stroke-width': sw,
          'stroke-dasharray': dashArray(L.dash, sw, P), 'class': 'pt-chline' }, svg);
        if (L.mark !== 'none') mark(svg, L.mark, lx + 0.9 * U, yy, MSIZE[L.msize] * P, col, 0.4 * P);
      }
      html(svg, lx + 1.8 * U, yy - 0.7 * U, leg.w - 2 * U, 1.4 * U, 'l', function (d) {
        if (s.html) richLabelInto(d, s.html);
        else if (s.name) labelInto(d, s.name);
        else labelInto(d, '$' + (m.kind === 'polar' ? 'r' : 'y') + ' = ' + exprTex(s.expr) + '$');
      });
    });
  }
  function legendSize(m) {
    if (!m.legend) return null;
    var lw = 0;
    m.series.forEach(function (s) { lw = Math.max(lw, legendText(s).replace(/\$/g, '').length); });
    return { w: (lw * 0.55 + 2.8) * U, h: m.series.length * 1.35 * U + 0.4 * U };
  }

  function drawCartesian(target, b, doc, opts, m) {
    var aspect = clamp(+b.aspect || 0.62, 0.3, 1.2);
    var cv = canvas(target, b, doc, opts, aspect), svg = cv.svg, W = cv.W, H = cv.H, P = cv.P;
    var axes = axesOf(b), middle = axes === 'middle', grid = gridOf(b);
    /* the axes as they lie on the screen: horizontal bars turn the chart */
    var hx, vy;
    if (m.horiz) {
      hx = m.ay;
      vy = Object.assign({}, m.ax, { norm: function (v) { return 1 - m.ax.norm(v); } });
    } else { hx = m.ax; vy = m.ay; }
    var hlabel = m.horiz ? b.ylabel : b.xlabel, vlabel = m.horiz ? b.xlabel : b.ylabel;

    var vtext = vy.cats ? vy.cats.map(function (c) { return c.text; }) : vy.major.map(function (v) { return vy.pow ? '10^' + Math.round(lg(v)) : vy.text(v); });
    var yw = Math.max.apply(null, vtext.map(function (t) { return String(t).length; }).concat([1])) * 0.55 * U;
    if (vy.cats) yw = Math.min(yw + 0.6 * U, W * 0.4);
    var titleH = b.title ? 1.9 * U : 0;
    var ml, mr, mt, mb;
    if (middle) {
      ml = 0.6 * U; mr = (hlabel ? 2.6 : 0.8) * U; mt = (vlabel ? 2 : 0.8) * U; mb = 0.6 * U;
      /* axes through 0 that end up at an edge take their tick labels outside it */
      var fx = clamp(hx.cats || hx.log ? 0 : hx.norm(0), 0, 1), fy = clamp(vy.cats || vy.log ? 0 : vy.norm(0), 0, 1);
      if (fx < 0.15) ml = Math.max(ml, yw + 0.8 * U - fx * W * 0.8);
      if (fy < 0.12) mb = 1.7 * U;
    } else {
      ml = yw + 0.8 * U + (vlabel ? 1.8 * U : 0); mr = (axes === 'left' ? 1.2 : 1) * U;
      mt = (axes === 'left' ? 1.2 : 0.8) * U; mb = 1.7 * U + (hlabel ? 1.7 * U : 0);
    }
    if (m.values && m.horiz) mr += 2 * U;
    mt += titleH;
    var leg = legendSize(m);
    if (leg && m.legend === 'outer north east') mr += leg.w + 0.8 * U;
    var pw = W - ml - mr, ph = H - mt - mb;
    if (leg && m.legend !== 'outer north east') leg.w = Math.min(leg.w, pw * 0.7);
    function X(v) { return ml + hx.norm(v) * pw; }
    function Y(v) { return mt + (1 - vy.norm(v)) * ph; }
    /* a point of the data (along x, along y) on the screen */
    function S(a, v) { return m.horiz ? [X(v), Y(a)] : [X(a), Y(v)]; }

    var clipId = 'ptc' + Math.random().toString(36).slice(2, 8);
    el('rect', { x: ml, y: mt, width: pw, height: ph }, el('clipPath', { id: clipId }, el('defs', {}, svg)));

    /* grid: major lines at the ticks, minor ones between */
    if (grid !== 'none') {
      var g = el('g', { 'class': 'pt-chgrid' }, svg);
      if (grid === 'both') {
        var gm = el('g', { 'class': 'minor' }, g);
        if (!hx.cats) hx.minor.forEach(function (v) { el('line', { x1: X(v), x2: X(v), y1: mt, y2: mt + ph }, gm); });
        if (!vy.cats) vy.minor.forEach(function (v) { el('line', { x1: ml, x2: ml + pw, y1: Y(v), y2: Y(v) }, gm); });
      }
      if (!hx.cats) hx.major.forEach(function (v) { el('line', { x1: X(v), x2: X(v), y1: mt, y2: mt + ph }, g); });
      if (!vy.cats) vy.major.forEach(function (v) { el('line', { x1: ml, x2: ml + pw, y1: Y(v), y2: Y(v) }, g); });
    }

    /* axes, ticks, tick labels */
    var ax = el('g', { 'class': 'pt-chaxis' }, svg);
    var ox = middle && !hx.cats && !hx.log ? clamp(0, hx.lo, hx.hi) : hx.lo;
    var oy = middle && !vy.cats && !vy.log ? clamp(0, vy.lo, vy.hi) : (vy.cats && m.horiz ? vy.hi : vy.lo);
    var tl = 0.35 * U;
    function arrows(x0, y0) {
      el('line', { x1: ml, x2: ml + pw + 0.5 * U, y1: y0, y2: y0 }, ax);
      el('line', { x1: x0, x2: x0, y1: mt + ph, y2: mt - 0.5 * U }, ax);
      el('path', { d: 'M' + (ml + pw + 0.5 * U) + ' ' + y0 + 'l-' + 0.6 * U + ' -' + 0.25 * U + 'v' + 0.5 * U + 'z', 'class': 'pt-charrow' }, ax);
      el('path', { d: 'M' + x0 + ' ' + (mt - 0.5 * U) + 'l-' + 0.25 * U + ' ' + 0.6 * U + 'h' + 0.5 * U + 'z', 'class': 'pt-charrow' }, ax);
    }
    var axY = middle ? Y(oy) : mt + ph, axX = middle ? X(ox) : ml;
    if (middle) arrows(X(ox), Y(oy));
    else if (axes === 'left') arrows(ml, mt + ph);
    else el('rect', { x: ml, y: mt, width: pw, height: ph, fill: 'none' }, ax);
    var tx = el('g', { 'class': 'pt-chtick' }, svg);
    if (hx.cats) {
      hx.cats.forEach(function (c, i) {
        var xx = X(i);
        el('line', { x1: xx, x2: xx, y1: axY, y2: axY - tl }, ax);
        html(svg, xx - (pw / hx.cats.length) / 2, axY + 0.3 * U, pw / hx.cats.length, 1.4 * U, 'c', function (d) {
          if (c.html != null) richLabelInto(d, c.html); else d.textContent = c.text;
        });
      });
    } else {
      hx.major.forEach(function (v) {
        if (middle && near(v, [ox]) && vy.major.length && !vy.cats) return;   /* the origin, where the axes cross */
        var xx = X(v);
        el('line', { x1: xx, x2: xx, y1: axY + (middle ? tl / 2 : 0), y2: axY - tl / (middle ? 2 : 1) }, ax);
        tickLabel(tx, xx, axY + 1.2 * U, 'middle', hx, v, U);
      });
    }
    if (vy.cats) {
      vy.cats.forEach(function (c, i) {
        var yy = Y(i), h = Math.min(ph / vy.cats.length, 2.8 * U);
        el('line', { x1: axX, x2: axX + tl, y1: yy, y2: yy }, ax);
        html(svg, axX - yw - 0.5 * U, yy - h / 2, yw, h, 'r', function (d) {
          if (c.html != null) richLabelInto(d, c.html); else d.textContent = c.text;
        });
      });
    } else {
      vy.major.forEach(function (v) {
        if (middle && near(v, [oy]) && hx.major.length && !hx.cats) return;
        var yy = Y(v);
        el('line', { x1: axX - (middle ? tl / 2 : 0), x2: axX + tl / (middle ? 2 : 1), y1: yy, y2: yy }, ax);
        tickLabel(tx, axX - 0.4 * U, yy + 0.35 * U, 'end', vy, v, U);
      });
    }

    /* title and axis labels */
    if (b.title) html(svg, ml, 0.1 * U, pw, 1.6 * U, 'c', function (d) { labelInto(d, b.title); });
    if (hlabel) {
      if (middle) html(svg, ml + pw + 0.6 * U, Y(oy) - 0.75 * U, mr, 1.5 * U, 'l', function (d) { labelInto(d, hlabel); });
      else html(svg, ml, H - 1.6 * U, pw, 1.5 * U, 'c', function (d) { labelInto(d, hlabel); });
    }
    if (vlabel) {
      if (middle) html(svg, X(ox) - 6 * U, titleH, 12 * U, 1.5 * U, 'c', function (d) { labelInto(d, vlabel); });
      else html(svg, 0.1 * U - (ph - 1.5 * U) / 2, mt + ph / 2 - 0.75 * U, ph, 1.5 * U, 'c', function (d) { labelInto(d, vlabel); }, true);
    }

    /* the data */
    var plot = el('g', { 'clip-path': 'url(#' + clipId + ')' }, svg);
    var over = el('g', {}, svg);            /* value labels may stand above the frame */
    var nbar = m.series.filter(function (s) { return !s.fn; }).length || 1;
    var barw = clamp(+b.barw || 0.8, 0.2, 1);
    function errBar(a, v, dv, col, sw) {
      if (!(dv > 0)) return;
      var c = 1.5 * P, p = S(a, v - dv), q = S(a, v + dv);
      var cap = m.horiz ? function (z) { return 'M' + z[0] + ' ' + (z[1] - c) + 'v' + 2 * c; } : function (z) { return 'M' + (z[0] - c) + ' ' + z[1] + 'h' + 2 * c; };
      el('path', { d: 'M' + p[0] + ' ' + p[1] + 'L' + q[0] + ' ' + q[1] + cap(p) + cap(q), stroke: col, 'stroke-width': sw, fill: 'none' }, plot);
    }
    function ok(s, p) {
      return isFinite(p[1]) && (!m.keep || (p[1] >= m.keep[0] && p[1] <= m.keep[1])) && (!m.ylog || p[1] > 0) && (!m.xlog || p[0] > 0);
    }
    function runsOf(s) {
      var runs = [], run = [];
      s.pts.forEach(function (p) {
        if (!ok(s, p)) { if (run.length) runs.push(run); run = []; return; }
        run.push(S(p[0], p[1]));
      });
      if (run.length) runs.push(run);
      return runs;
    }
    var smoothOf = function (s) { return !s.fn && !!b.smooth; };

    /* areas first, under the lines */
    m.fills.forEach(function (f) {
      var L = look(b, f.s), col = '#' + L.hex, d;
      if (f.to === 'axis') {
        var base = m.ylog ? m.y[0] : 0;
        d = runsOf(f.s).map(function (r) {
          var b0 = S(0, base)[1];
          return pathOf(r, smoothOf(f.s)) + 'L' + r[r.length - 1][0].toFixed(2) + ' ' + b0.toFixed(2) + 'L' + r[0][0].toFixed(2) + ' ' + b0.toFixed(2) + 'Z';
        }).join('');
      } else {
        var a = [].concat.apply([], runsOf(f.s)), z = [].concat.apply([], runsOf(f.to)).reverse();
        if (a.length < 2 || z.length < 2) return;
        d = pathOf(a, smoothOf(f.s)) + pathOf(z, smoothOf(f.to), true) + 'Z';
      }
      el('path', { d: d, fill: col, 'fill-opacity': FILL_OPACITY, stroke: 'none' }, plot);
    });

    m.series.forEach(function (s, si) {
      var L = look(b, s), col = '#' + L.hex, sw = lineWidth(L, P);
      if (L.bars) {
        var bw = m.hist ? m.binw : m.stacked ? barw : barw / nbar;
        var edge = s.bins ? '#' + mix(L.hex, '000000', 0.5) : col;
        s.pts.forEach(function (p) {
          var left = m.hist ? p[0] - bw / 2 : p[0] - barw / 2 + (m.stacked ? 0 : si * bw), base = p.base || 0;
          var c1 = S(left, base), c2 = S(left + bw, base + p[1]);
          var x0 = Math.min(c1[0], c2[0]), y0 = Math.min(c1[1], c2[1]);
          el('rect', { x: x0, y: y0, width: Math.max(0.5, Math.abs(c2[0] - c1[0])), height: Math.abs(c2[1] - c1[1]),
            fill: col, 'fill-opacity': 0.75, stroke: edge, 'stroke-width': 0.4 * P }, plot);
          if (p.err) errBar(left + bw / 2, base + p[1], p.err, col, 0.4 * P);
          if (m.values) {
            var tip = S(left + bw / 2, base + p[1]), t;
            if (m.horiz) t = el('text', { x: tip[0] + (p[1] >= 0 ? 0.35 * U : -0.35 * U), y: tip[1] + 0.35 * U, 'text-anchor': p[1] >= 0 ? 'start' : 'end', 'class': 'pt-chval' }, over);
            else t = el('text', { x: tip[0], y: p[1] >= 0 ? tip[1] - 0.35 * U : tip[1] + 1.05 * U, 'text-anchor': 'middle', 'class': 'pt-chval' }, over);
            t.textContent = valueText(p[1]);
          }
        });
        return;
      }
      if (L.line) {
        el('path', { d: runsOf(s).map(function (r) { return pathOf(r, smoothOf(s)); }).join(''), fill: 'none', stroke: col,
          'stroke-width': sw, 'stroke-dasharray': dashArray(L.dash, sw, P), 'class': 'pt-chline' }, plot);
      }
      s.pts.forEach(function (p) {
        if (!ok(s, p)) return;
        if (p.err) errBar(p[0], p[1], p.err, col, 0.4 * P);
        var q = S(p[0], p[1]);
        if (L.mark !== 'none') mark(plot, L.mark, q[0], q[1], MSIZE[L.msize] * P, col, 0.4 * P);
      });
    });

    drawLegend(svg, b, m, { ml: ml, mt: mt, pw: pw, ph: ph, leg: leg }, P);
  }

  /* ---- pie ---- */
  function drawPie(target, b, doc, opts, m) {
    var fpt = parseFloat(doc && doc.settings && doc.settings.fontsize) || 10;
    var P = U / fpt;
    var fs = parseFloat(getComputedStyle(target).fontSize) || 13;
    var colEm = opts.colEm || (target.parentNode && target.parentNode.clientWidth ? target.parentNode.clientWidth / fs : 36);
    var w = clamp(+b.width || 0.75, 0.2, 1);
    var R = w * colEm * m.kR * U;
    var svg = el('svg', { 'class': 'pt-chsvg pt-chpie' });
    target.appendChild(svg);
    var g = el('g', {}, svg);
    function at(a, r) { var t = a * Math.PI / 180; return [r * R * Math.cos(t), -r * R * Math.sin(t)]; }
    function f2(p) { return p[0].toFixed(2) + ' ' + p[1].toFixed(2); }
    m.slices.forEach(function (s) {
      var big = s.sweep > 180 ? 1 : 0, d;
      if (s.sweep >= 359.999) {
        d = 'M' + f2(at(90, 1)) + 'A' + R + ' ' + R + ' 0 1 1 ' + f2(at(-90, 1)) + 'A' + R + ' ' + R + ' 0 1 1 ' + f2(at(90, 1)) + 'Z';
        if (m.rIn) d += 'M' + f2(at(90, m.rIn)) + 'A' + R * m.rIn + ' ' + R * m.rIn + ' 0 1 0 ' + f2(at(-90, m.rIn)) + 'A' + R * m.rIn + ' ' + R * m.rIn + ' 0 1 0 ' + f2(at(90, m.rIn)) + 'Z';
      } else if (m.rIn) {
        d = 'M' + f2(at(s.a0, 1)) + 'A' + R + ' ' + R + ' 0 ' + big + ' 1 ' + f2(at(s.a1, 1)) + 'L' + f2(at(s.a1, m.rIn)) +
          'A' + R * m.rIn + ' ' + R * m.rIn + ' 0 ' + big + ' 0 ' + f2(at(s.a0, m.rIn)) + 'Z';
      } else {
        d = 'M0 0L' + f2(at(s.a0, 1)) + 'A' + R + ' ' + R + ' 0 ' + big + ' 1 ' + f2(at(s.a1, 1)) + 'Z';
      }
      el('path', { d: d, fill: '#' + s.hex, stroke: '#fff', 'stroke-width': 0.8 * P, 'stroke-linejoin': 'round', 'fill-rule': 'evenodd' }, g);
    });
    m.slices.forEach(function (s) {
      if (s.inside) {
        var q = at(s.mid, m.rNum);
        var t = el('text', { x: q[0], y: q[1] + 0.32 * U, 'text-anchor': 'middle', 'class': 'pt-chpnum', style: 'fill:' + (light(s.hex) ? '#111' : '#fff') }, g);
        t.textContent = s.num.replace('-', '\u2212');
      }
      var outside = m.labels === 'outside' || (!s.inside && s.num);
      if (!outside) return;
      var o = at(s.mid, 1.1), c = Math.cos(s.mid * Math.PI / 180), sn = Math.sin(s.mid * Math.PI / 180);
      var text = m.labels === 'outside' ? s.text : '';
      var extra = !s.inside && s.num ? (text ? ' (' + s.num + ')' : s.num) : '';
      var len = (text + extra).length * 0.55 * U + 1.5 * U;
      var align = c > 0.25 ? 'l' : c < -0.25 ? 'r' : 'c';
      var x = align === 'l' ? o[0] : align === 'r' ? o[0] - len : o[0] - len / 2;
      var y = o[1] - 0.7 * U + (Math.abs(c) <= 0.25 ? -sn * 0.6 * U : -sn * 0.35 * U);
      html(svg, x, y, len, 1.4 * U, align, function (d) {
        if (text) { if (s.html != null) richLabelInto(d, s.html); else d.appendChild(document.createTextNode(text)); }
        if (extra) d.appendChild(document.createTextNode(extra.replace('-', '\u2212')));
      });
    });
    if (m.labels === 'legend') {
      var n = m.slices.length, lx = 1.3 * R, row = 1.4 * U;
      m.slices.forEach(function (s, i) {
        var yy = (i - (n - 1) / 2) * row;
        el('rect', { x: lx, y: yy - 0.4 * U, width: 0.8 * U, height: 0.8 * U, fill: '#' + s.hex }, svg);
        var len = (s.text.length + 2) * 0.55 * U + 2 * U;
        html(svg, lx + 1.2 * U, yy - 0.7 * U, len, 1.4 * U, 'l', function (d) {
          if (s.html != null) richLabelInto(d, s.html); else d.textContent = s.text;
        });
      });
    }
    /* sized to what was drawn, at the text's size on the page */
    var bb;
    try { bb = svg.getBBox(); } catch (e) { bb = null; }
    if (!bb || !bb.width) bb = { x: -1.5 * R, y: -1.3 * R, width: 3 * R, height: 2.6 * R };
    var x0 = Math.min(bb.x, -1.05 * R) - 0.3 * U, x1 = Math.max(bb.x + bb.width, 1.05 * R) + 0.3 * U;
    var y0 = Math.min(bb.y, -1.05 * R) - 0.3 * U, y1 = Math.max(bb.y + bb.height, 1.05 * R) + 0.3 * U;
    if (b.title) {
      html(svg, x0, y0 - 1.9 * U, x1 - x0, 1.6 * U, 'c', function (d) { labelInto(d, b.title); });
      y0 -= 2 * U;
    }
    svg.setAttribute('viewBox', x0 + ' ' + y0 + ' ' + (x1 - x0) + ' ' + (y1 - y0));
    if (opts.fit) { svg.style.width = '100%'; svg.style.height = '100%'; }
    else {
      svg.style.width = ((x1 - x0) / U) + 'em';
      svg.style.maxWidth = '100%';
      svg.style.aspectRatio = (x1 - x0) + ' / ' + (y1 - y0);
    }
  }

  /* ---- polar ---- */
  function drawPolar(target, b, doc, opts, m) {
    var cv = canvas(target, b, doc, opts, 1), svg = cv.svg, W = cv.W, H = cv.H, P = cv.P;
    var titleH = b.title ? 1.9 * U : 0;
    var leg = legendSize(m), lspace = leg && m.legend === 'outer north east' ? leg.w + 1 * U : 0;
    /* the circle takes the width; a key outside it is added on (as
       pgfplots does) */
    var room = 2.6 * U;
    var R = Math.max(2 * U, Math.min(W - 2 * room, H - titleH - 2 * room) / 2);
    var cx = W / 2, cy = titleH + room + R;
    if (lspace) {
      svg.setAttribute('viewBox', '0 0 ' + (W + lspace) + ' ' + H);
      if (!opts.fit) { svg.style.width = Math.min(100, Math.round(cv.w * (W + lspace) / W * 1000) / 10) + '%'; svg.style.aspectRatio = (W + lspace) + ' / ' + H; }
    }
    var grid = gridOf(b);
    function at(t, r) { return [cx + r / m.r * R * Math.cos(t), cy - r / m.r * R * Math.sin(t)]; }
    var gg = el('g', { 'class': 'pt-chgrid' }, svg);
    if (grid !== 'none') {
      if (grid === 'both') {
        var gm = el('g', { 'class': 'minor' }, gg);
        m.rminor.forEach(function (r) { el('circle', { cx: cx, cy: cy, r: r / m.r * R, fill: 'none' }, gm); });
      }
      m.rticks.forEach(function (r) { if (r < m.r - 1e-9) el('circle', { cx: cx, cy: cy, r: r / m.r * R, fill: 'none' }, gg); });
      m.angles.forEach(function (d) {
        var p = at(d * Math.PI / 180, m.r);
        el('line', { x1: cx, y1: cy, x2: p[0], y2: p[1] }, gg);
      });
    }
    var ax = el('g', { 'class': 'pt-chaxis' }, svg);
    el('circle', { cx: cx, cy: cy, r: R, fill: 'none' }, ax);
    var tx = el('g', { 'class': 'pt-chtick' }, svg);
    m.angles.forEach(function (d) {
      var t = d * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
      var p = [cx + (R + 0.35 * U) * c, cy - (R + 0.35 * U) * s];
      var q = [cx + R * c, cy - R * s];
      el('line', { x1: q[0], y1: q[1], x2: cx + (R - 0.35 * U) * c, y2: cy - (R - 0.35 * U) * s }, ax);
      var lab = m.rad ? piText(d, false) : d + '°';
      var len = lab.length * 0.55 * U + 0.4 * U;
      var align = c > 0.3 ? 'l' : c < -0.3 ? 'r' : 'c';
      var x = align === 'l' ? p[0] : align === 'r' ? p[0] - len : p[0] - len / 2;
      var y = p[1] - 0.7 * U - (Math.abs(c) <= 0.3 ? s * 0.6 * U : 0);
      if (m.rad && d) html(svg, x, y, len, 1.4 * U, align, function (dd) { labelInto(dd, '$' + piText(d, true) + '$'); });
      else {
        var te = el('text', { x: align === 'l' ? x : align === 'r' ? x + len : x + len / 2, y: y + 1.05 * U,
          'text-anchor': align === 'l' ? 'start' : align === 'r' ? 'end' : 'middle' }, tx);
        te.textContent = lab;
      }
    });
    /* the radius' ticks, along the ray at 0°, which is drawn as an axis */
    el('line', { x1: cx, y1: cy, x2: cx + R, y2: cy }, ax);
    m.rticks.forEach(function (r) {
      var p = at(0, r);
      el('line', { x1: p[0], y1: p[1] - 0.25 * U, x2: p[0], y2: p[1] + 0.25 * U }, ax);
      var te = el('text', { x: p[0], y: p[1] - 0.4 * U, 'text-anchor': 'middle' }, tx);
      te.textContent = tickText(r, m.rstep);
    });
    if (b.title) html(svg, 0, 0.1 * U, W, 1.6 * U, 'c', function (d) { labelInto(d, b.title); });
    var clipId = 'ptc' + Math.random().toString(36).slice(2, 8);
    el('circle', { cx: cx, cy: cy, r: R }, el('clipPath', { id: clipId }, el('defs', {}, svg)));
    var plot = el('g', { 'clip-path': 'url(#' + clipId + ')' }, svg);
    m.series.forEach(function (s) {
      var L = look(b, s), col = '#' + L.hex, sw = lineWidth(L, P);
      var runs = [], run = [];
      s.pts.forEach(function (p) {
        if (!isFinite(p[1]) || Math.abs(p[1]) > 2 * m.r) { if (run.length) runs.push(run); run = []; return; }
        run.push(at(p[0], p[1]));
      });
      if (run.length) runs.push(run);
      if (s.st && s.st.fill) {
        el('path', { d: runs.map(function (r) { return pathOf(r, false) + 'Z'; }).join(''), fill: col, 'fill-opacity': FILL_OPACITY, stroke: 'none' }, plot);
      }
      el('path', { d: runs.map(function (r) { return pathOf(r, false); }).join(''), fill: 'none', stroke: col,
        'stroke-width': sw, 'stroke-dasharray': dashArray(L.dash, sw, P), 'class': 'pt-chline' }, plot);
    });
    drawLegend(svg, b, m, { ml: cx - R, mt: cy - R, pw: 2 * R, ph: 2 * R, leg: leg }, P);
  }

  /* ---- surface ---- */
  /* the view, as pgfplots takes it: azimuth about z, then elevation */
  function projector(m) {
    var h = m.az * Math.PI / 180, v = m.el * Math.PI / 180;
    var ch = Math.cos(h), sh = Math.sin(h), cvv = Math.cos(v), sv = Math.sin(v);
    var bx = m.box[0], by = m.box[1], bz = m.box[2];
    var p = function (x, y, z) {
      var u = ((x - m.x[0]) / (m.x[1] - m.x[0]) - 0.5) * bx, w = ((y - m.y[0]) / (m.y[1] - m.y[0]) - 0.5) * by;
      var t = ((z - m.zr[0]) / (m.zr[1] - m.zr[0]) - 0.5) * bz;
      return [u * ch + w * sh, -u * sh * sv + w * ch * sv + t * cvv, u * sh * cvv - w * ch * cvv + t * sv];
    };
    p.n = [sh * cvv, -ch * cvv, sv];
    return p;
  }
  function drawSurface(target, b, doc, opts, m) {
    var aspect = clamp(+b.aspect || 0.75, 0.3, 1.2);
    var cv = canvas(target, b, doc, opts, aspect), svg = cv.svg, W = cv.W, H = cv.H, P = cv.P;
    var pj = projector(m);
    var titleH = b.title ? 1.9 * U : 0;
    var ml = 3.4 * U, mr = (m.colorbar ? 5.5 : 2.2) * U, mt = 1 * U + titleH, mb = 2.8 * U;
    var pw = W - ml - mr, ph = H - mt - mb;
    /* the box's corners, to fit the picture to the space */
    var X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity;
    [m.x[0], m.x[1]].forEach(function (x) { [m.y[0], m.y[1]].forEach(function (y) { [m.zr[0], m.zr[1]].forEach(function (z) {
      var q = pj(x, y, z); X0 = Math.min(X0, q[0]); X1 = Math.max(X1, q[0]); Y0 = Math.min(Y0, q[1]); Y1 = Math.max(Y1, q[1]);
    }); }); });
    /* pgfplots stretches the box to fill the width and the height */
    var kx = pw / (X1 - X0), ky = ph / (Y1 - Y0);
    var ox = ml - kx * X0, oy = mt + ky * Y1;
    function S(x, y, z) { var q = pj(x, y, z); return [ox + kx * q[0], oy - ky * q[1], q[2]]; }
    function f2(q) { return q[0].toFixed(2) + ' ' + q[1].toFixed(2); }

    /* the walls at the back: the box's far sides, with the grid on them */
    var n = pj.n;
    var xb = n[0] > 0 ? m.x[0] : m.x[1], xf = n[0] > 0 ? m.x[1] : m.x[0];
    var yb = n[1] > 0 ? m.y[0] : m.y[1], yf = n[1] > 0 ? m.y[1] : m.y[0];
    var zb = n[2] > 0 ? m.zr[0] : m.zr[1];
    var grid = gridOf(b);
    var gg = el('g', { 'class': 'pt-chgrid' }, svg);
    var line = function (a, c, g) { el('line', { x1: a[0], y1: a[1], x2: c[0], y2: c[1] }, g); };
    if (grid !== 'none') {
      m.xt.forEach(function (x) { line(S(x, m.y[0], zb), S(x, m.y[1], zb), gg); line(S(x, yb, m.zr[0]), S(x, yb, m.zr[1]), gg); });
      m.yt.forEach(function (y) { line(S(m.x[0], y, zb), S(m.x[1], y, zb), gg); line(S(xb, y, m.zr[0]), S(xb, y, m.zr[1]), gg); });
      m.zt.forEach(function (z) { line(S(xb, m.y[0], z), S(xb, m.y[1], z), gg); line(S(m.x[0], yb, z), S(m.x[1], yb, z), gg); });
    }
    var ax = el('g', { 'class': 'pt-chaxis' }, svg);
    var rect = function (a, c, d, e) { el('path', { d: 'M' + f2(a) + 'L' + f2(c) + 'L' + f2(d) + 'L' + f2(e) + 'Z', fill: 'none' }, ax); };
    rect(S(m.x[0], m.y[0], zb), S(m.x[1], m.y[0], zb), S(m.x[1], m.y[1], zb), S(m.x[0], m.y[1], zb));
    rect(S(xb, m.y[0], m.zr[0]), S(xb, m.y[1], m.zr[0]), S(xb, m.y[1], m.zr[1]), S(xb, m.y[0], m.zr[1]));
    rect(S(m.x[0], yb, m.zr[0]), S(m.x[1], yb, m.zr[0]), S(m.x[1], yb, m.zr[1]), S(m.x[0], yb, m.zr[1]));

    /* tick labels along the front edges, pushed away from the box */
    var tx = el('g', { 'class': 'pt-chtick' }, svg);
    var mid = S((m.x[0] + m.x[1]) / 2, (m.y[0] + m.y[1]) / 2, (m.zr[0] + m.zr[1]) / 2);
    function labelAt(q, ref, dist, text, isHtml) {
      var dx = q[0] - ref[0], dy = q[1] - ref[1], l = Math.sqrt(dx * dx + dy * dy) || 1;
      var x = q[0] + dx / l * dist, y = q[1] + dy / l * dist;
      var anchor = dx / l > 0.35 ? 'start' : dx / l < -0.35 ? 'end' : 'middle';
      if (isHtml) {
        var len = String(text).replace(/\$/g, '').length * 0.55 * U + 2 * U;
        html(svg, anchor === 'start' ? x : anchor === 'end' ? x - len : x - len / 2, y - 0.75 * U, len, 1.5 * U,
          anchor === 'start' ? 'l' : anchor === 'end' ? 'r' : 'c', function (d) { labelInto(d, text); });
      } else {
        var t = el('text', { x: x, y: y + 0.35 * U, 'text-anchor': anchor }, tx);
        t.textContent = text;
      }
    }
    var zlow = n[2] > 0 ? m.zr[0] : m.zr[1];
    m.xt.forEach(function (x) { var q = S(x, yf, zlow); labelAt(q, S(x, (m.y[0] + m.y[1]) / 2, zlow), 0.9 * U, tickText(x, m.xstep)); });
    m.yt.forEach(function (y) { var q = S(xf, y, zlow); labelAt(q, S((m.x[0] + m.x[1]) / 2, y, zlow), 0.9 * U, tickText(y, m.ystep)); });
    /* z along the vertical edge furthest left */
    var zc = [[m.x[0], m.y[0]], [m.x[1], m.y[0]], [m.x[0], m.y[1]], [m.x[1], m.y[1]]].sort(function (a, c) {
      return S(a[0], a[1], m.zr[0])[0] - S(c[0], c[1], m.zr[0])[0];
    })[0];
    m.zt.forEach(function (z) {
      var q = S(zc[0], zc[1], z);
      var t = el('text', { x: q[0] - 0.5 * U, y: q[1] + 0.35 * U, 'text-anchor': 'end' }, tx);
      t.textContent = tickText(z, m.zstep);
    });
    if (b.xlabel) { var cx0 = (m.x[0] + m.x[1]) / 2; labelAt(S(cx0, yf, zlow), S(cx0, (m.y[0] + m.y[1]) / 2, zlow), 2.4 * U, b.xlabel, true); }
    if (b.ylabel) { var cy0 = (m.y[0] + m.y[1]) / 2; labelAt(S(xf, cy0, zlow), S((m.x[0] + m.x[1]) / 2, cy0, zlow), 2.4 * U, b.ylabel, true); }
    if (b.zlabel) {
      var zq = S(zc[0], zc[1], (m.zr[0] + m.zr[1]) / 2);
      html(svg, zq[0] - 4.4 * U - 6 * U, zq[1] - 0.75 * U, 6 * U + 1.4 * U, 1.5 * U, 'r', function (d) { labelInto(d, b.zlabel); });
    }
    if (b.title) html(svg, ml, 0.1 * U, pw, 1.6 * U, 'c', function (d) { labelInto(d, b.title); });
    void mid;

    /* the surface: far patches first */
    var g = el('g', { 'class': 'pt-chsurf' }, svg);
    var N = m.n, quads = [];
    var xs = function (i) { return m.x[0] + (m.x[1] - m.x[0]) * i / (N - 1); };
    var ys = function (j) { return m.y[0] + (m.y[1] - m.y[0]) * j / (N - 1); };
    var inBox = function (z) { return isFinite(z) && (!m.cut || (z >= m.zr[0] - 1e-9 && z <= m.zr[1] + 1e-9)); };
    for (var j = 0; j + 1 < N && m.z.length; j++) {
      for (var i = 0; i + 1 < N; i++) {
        var zz = [m.z[j][i], m.z[j][i + 1], m.z[j + 1][i + 1], m.z[j + 1][i]];
        if (!zz.every(inBox)) continue;
        var pts = [S(xs(i), ys(j), zz[0]), S(xs(i + 1), ys(j), zz[1]), S(xs(i + 1), ys(j + 1), zz[2]), S(xs(i), ys(j + 1), zz[3])];
        var mean = (zz[0] + zz[1] + zz[2] + zz[3]) / 4;
        quads.push({ p: pts, d: (pts[0][2] + pts[1][2] + pts[2][2] + pts[3][2]) / 4, c: cmapAt(m.cmap, (mean - m.meta[0]) / (m.meta[1] - m.meta[0])) });
      }
    }
    quads.sort(function (a, c) { return a.d - c.d; });
    var edgeW = 0.3 * P;
    quads.forEach(function (q) {
      var d = 'M' + f2(q.p[0]) + 'L' + f2(q.p[1]) + 'L' + f2(q.p[2]) + 'L' + f2(q.p[3]) + 'Z';
      if (m.style === 'mesh') el('path', { d: d, fill: 'none', stroke: q.c, 'stroke-width': 0.6 * P }, g);
      else if (m.smooth) el('path', { d: d, fill: q.c, stroke: q.c, 'stroke-width': 0.25 * P }, g);
      else el('path', { d: d, fill: q.c, stroke: 'rgba(0,0,0,.45)', 'stroke-width': edgeW, 'stroke-linejoin': 'round' }, g);
    });

    /* the colour bar: the map, and the values it stands for */
    if (m.colorbar) {
      var bx = W - mr + 1.6 * U, bh = ph * 0.9, by = mt + (ph - bh) / 2, bwid = 0.9 * U;
      var gid = 'ptg' + Math.random().toString(36).slice(2, 8);
      var lg2 = el('linearGradient', { id: gid, x1: 0, y1: 1, x2: 0, y2: 0 }, el('defs', {}, svg));
      var stops = CMAPS[m.cmap][1];
      stops.forEach(function (s, i) { el('stop', { offset: i / (stops.length - 1), 'stop-color': 'rgb(' + s.join(',') + ')' }, lg2); });
      el('rect', { x: bx, y: by, width: bwid, height: bh, fill: 'url(#' + gid + ')' }, svg);
      el('rect', { x: bx, y: by, width: bwid, height: bh, fill: 'none', 'class': 'pt-chcbar' }, ax);
      var cstep = niceStep(m.meta[1] - m.meta[0], 5);
      ticks(m.meta[0], m.meta[1], cstep).forEach(function (v) {
        var yy = by + bh - (v - m.meta[0]) / (m.meta[1] - m.meta[0]) * bh;
        el('line', { x1: bx + bwid - 0.3 * U, x2: bx + bwid, y1: yy, y2: yy }, ax);
        var t = el('text', { x: bx + bwid + 0.35 * U, y: yy + 0.35 * U, 'text-anchor': 'start' }, tx);
        t.textContent = tickText(v, cstep);
      });
    }
  }

  /* y = 2x^2 for a legend: through the formula parser, so 2x^2 is set as math */
  function exprTex(src) {
    return String(src || '').replace(/\*/g, '\\cdot ').replace(/\bpi\b/g, '\\pi ').replace(/\btheta\b|θ/g, '\\theta ')
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
    var body = m.kind === 'pie' ? texPie(b, m, use, inline)
      : m.kind === 'polar' ? texPolar(b, m, use, inline)
      : m.kind === 'surface' ? texSurface(b, m, use, inline)
      : texCartesian(b, m, use, inline);
    var t = '\\begin{figure}[' + (b.placement || 'htbp') + ']\n  \\centering\n' + body;
    if (b.caption) t += '  \\caption{' + inline(b.caption, use).trim() + '}\n';
    if (b.label) t += '  \\label{' + PT.sanitize.label(b.label) + '}\n';
    return t + '\\end{figure}\n';
  }

  function sizeTex(b, aspect) {
    var w = clamp(+b.width || 0.75, 0.2, 1);
    return ['width=' + fmt(w) + '\\linewidth', 'height=' + fmt(+(w * aspect).toFixed(3)) + '\\linewidth'];
  }
  function legendTex(s, m, use, inline) {
    return s.html ? inline(s.html, use).trim() : s.name ? labelTex(s.name, use)
      : s.expr ? '$' + (m.kind === 'polar' ? 'r' : 'y') + ' = ' + PT.math.texRow(PT.math.parseTex(exprTex(s.expr))) + '$' : '';
  }
  function axisWrap(env, o, plots) {
    return '  \\begin{tikzpicture}\n    \\begin{' + env + '}[\n      ' + o.join(',\n      ') + '\n    ]\n' + plots +
      '    \\end{' + env + '}\n  \\end{tikzpicture}\n';
  }
  /* an axis' ticks: every so often on a straight axis, listed on a log one */
  function ticksTex(k, a, grid) {
    /* far from 0 (years), pgfplots' own stepping drifts: 1970.0006 */
    if (!a.log) return Math.max(Math.abs(a.lo), Math.abs(a.hi)) / a.step >= 200 || Math.max(Math.abs(a.lo), Math.abs(a.hi)) >= 1000
      ? [k + 'tick={' + a.major.map(fmt).join(',') + '}'] : [k + 'tick distance=' + fmt(a.step)];
    var o = [k + 'tick={' + a.major.map(fmt).join(',') + '}',
      k + 'ticklabels={' + a.major.map(function (v) { return a.pow ? '$10^{' + Math.round(lg(v)) + '}$' : fmt(v); }).join(',') + '}'];
    if (grid === 'both' && a.minor.length) o.push('minor ' + k + 'tick={' + a.minor.map(fmt).join(',') + '}');
    return o;
  }

  function texCartesian(b, m, use, inline) {
    var axes = axesOf(b), middle = axes === 'middle', grid = gridOf(b), H = m.horiz;
    var o = sizeTex(b, clamp(+b.aspect || 0.62, 0.3, 1.2));
    o.push(middle ? 'axis lines=middle' : axes === 'left' ? 'axis lines=left' : 'tick pos=left');
    if (b.title) o.push('title={' + labelTex(b.title, use) + '}');
    if (m.xlog) o.push('xmode=log');
    if (m.ylog) o.push('ymode=log');
    var ck = H ? 'y' : 'x', vk = H ? 'x' : 'y';
    o.push(ck + 'min=' + fmt(m.x[0]) + ', ' + ck + 'max=' + fmt(m.x[1]), vk + 'min=' + fmt(m.y[0]) + ', ' + vk + 'max=' + fmt(m.y[1]));
    if (H) o.push('y dir=reverse');
    if (m.cats) {
      o.push(ck + 'tick={' + m.cats.map(function (_, i) { return i; }).join(',') + '}');
      o.push(ck + 'ticklabels={' + m.cats.map(function (c) {
        return '{' + (c.html != null ? inline(c.html, use).trim() : PT.latex.esc(c.text)) + '}';
      }).join(',') + '}');
    } else o.push.apply(o, ticksTex('x', m.ax, grid));
    o.push.apply(o, ticksTex(vk, m.ay, grid));
    var anyLog = m.xlog || m.ylog;
    if (grid === 'major') o.push(m.cats ? vk + 'majorgrids' : 'grid=major');
    if (grid === 'both') {
      if (m.cats) o.push(vk + 'majorgrids, ' + vk + 'minorgrids, minor ' + vk + ' tick num=1', 'minor tick length=0pt');
      else if (!anyLog) o.push('grid=both, minor tick num=1', 'minor tick length=0pt');
      else {
        o.push('grid=both', 'minor tick length=0pt');
        if (!m.xlog) o.push('minor x tick num=1');
        if (!m.ylog) o.push('minor y tick num=1');
      }
    }
    var cl = H ? b.ylabel : b.xlabel, vl = H ? b.xlabel : b.ylabel;
    if (cl) o.push('xlabel={' + labelTex(cl, use) + '}');
    if (vl) o.push('ylabel={' + labelTex(vl, use) + '}');
    if (middle) {
      if (cl) o.push('xlabel style={at={(ticklabel* cs:1)}, anchor=west}');
      if (vl) o.push('ylabel style={at={(ticklabel* cs:1)}, anchor=south}');
    }
    if (m.keep) o.push('unbounded coords=jump', 'restrict y to domain=' + fmt(m.keep[0]) + ':' + fmt(m.keep[1]));
    else if (m.ylog && m.band) o.push('unbounded coords=jump');
    var nbar = m.series.filter(function (s) { return !s.fn; }).length || 1;
    var barw = clamp(+b.barw || 0.8, 0.2, 1);
    var bar = H ? 'xbar' : 'ybar';
    if (m.bar) {
      o.push(m.stacked ? bar + ' stacked' : bar + '=0pt', 'bar width=' + fmt(+(m.stacked ? barw : barw / nbar).toFixed(4)), 'area legend');
      if (m.values) o.push('nodes near coords',
        'every node near coord/.append style={font=\\small, /pgf/number format/fixed, /pgf/number format/precision=2, /pgf/number format/1000 sep={}}');
    }
    if (m.hist) o.push('ybar=0pt', 'bar width=' + fmt(m.binw), 'area legend');
    var between = m.fills.some(function (f) { return f.to !== 'axis'; });
    if (between) { o.push('set layers'); use.fillbetween = true; }
    if (m.legend) o.push('legend pos=' + m.legend, 'legend cell align=left');

    /* the series, each area just before the line it belongs to */
    var named = {};
    m.fills.forEach(function (f) { if (f.to !== 'axis') { named[f.s.key] = true; named[f.to.key] = true; } });
    var pathName = function (s) { return 'ptp' + s.key; };
    var t = '';
    function fnPlot(s, opts) {
      if (m.xlog) return '\\addplot[' + opts.concat(['domain=' + fmt(lg(m.x[0])) + ':' + fmt(lg(m.x[1])), 'samples=' + m.samples]).join(', ') +
        '] ({10^x}, {' + s.c.pgfWith({ x: '10^x' }) + '})';
      return '\\addplot[' + opts.concat(['domain=' + fmt(m.x[0]) + ':' + fmt(m.x[1]), 'samples=' + m.samples]).join(', ') + '] {' + s.pgf + '}';
    }
    /* an area down to the axis; on a log y axis \closedcycle would close at
       1, so it is closed by hand at the bottom */
    function closeDown(s) {
      if (!m.ylog) return ' \\closedcycle';
      var xs = s.pts.filter(function (p) { return isFinite(p[1]) && p[1] > 0; });
      var a = s.fn || !xs.length ? m.x[0] : xs[0][0], z = s.fn || !xs.length ? m.x[1] : xs[xs.length - 1][0];
      return ' -- (axis cs:' + fmt(z) + ',' + fmt(m.y[0]) + ') -- (axis cs:' + fmt(a) + ',' + fmt(m.y[0]) + ') -- cycle';
    }
    function coordsOf(s) {
      return 'coordinates {' + s.pts.filter(function (p) { return isFinite(p[1]); }).map(function (p) {
        var a = fmt(p[0]), v = fmt(p[1]);
        return '(' + (H ? v + ',' + a : a + ',' + v) + ')' + (s.err ? (H ? ' +- (' + fmt(p.err || 0) + ',0)' : ' +- (0,' + fmt(p.err || 0) + ')') : '');
      }).join(' ') + '}';
    }
    m.series.forEach(function (s, si) {
      var L = look(b, s), cn = colorName(L.hex, use), opts;
      var errs = s.err ? ['error bars/.cd', H ? 'x dir=both' : 'y dir=both', H ? 'x explicit' : 'y explicit'] : [];
      var under = m.fills.filter(function (f) { return f.s === s && f.to === 'axis'; })[0];
      if (s.fn) {
        opts = [cn, L.thick].concat(L.dash !== 'solid' ? [L.dash] : []);
        if (m.hist || m.bar) opts.unshift('sharp plot');
        if (under) t += '      ' + fnPlot(s, ['draw=none', 'fill=' + cn, 'fill opacity=' + FILL_OPACITY, 'forget plot']) + closeDown(s) + ';\n';
        if (named[s.key]) opts.push('name path=' + pathName(s));
        t += '      ' + fnPlot(s, opts) + ';\n';
      } else if (s.bins) {
        opts = ['fill=' + cn + '!75', 'draw=' + cn + '!50!black'];
        if (m.values) opts.push('nodes near coords',
          'every node near coord/.append style={font=\\small, /pgf/number format/fixed, /pgf/number format/precision=2, /pgf/number format/1000 sep={}}');
        t += '      \\addplot[' + opts.join(', ') + '] ' + coordsOf(s) + ';\n';
      } else {
        if (m.bar) {
          opts = ['fill=' + cn + '!75', 'draw=' + cn];
          if (!m.stacked) opts.push('bar shift=' + fmt(+((-barw / 2 + (si + 0.5) * barw / nbar)).toFixed(4)));
        } else {
          opts = [cn];
          if (L.line) { opts.push(L.thick); if (L.dash !== 'solid') opts.push(L.dash); if (b.smooth) opts.push('smooth'); }
          else opts.push('only marks');
          if (L.mark === 'none') opts.push('no marks');
          else opts.push('mark=' + L.mark, 'mark size=' + MSIZE[L.msize] + 'pt', 'mark options={solid}');
        }
        if (under) t += '      \\addplot[draw=none, fill=' + cn + ', fill opacity=' + FILL_OPACITY + (b.smooth ? ', smooth' : '') + ', forget plot] ' + coordsOf(s) + closeDown(s) + ';\n';
        if (named[s.key]) opts.push('name path=' + pathName(s));
        t += '      \\addplot[' + opts.concat(errs).join(', ') + '] ' + coordsOf(s) + ';\n';
      }
      if (m.legend) t += '      \\addlegendentry{' + legendTex(s, m, use, inline) + '}\n';
    });
    m.fills.forEach(function (f) {
      if (f.to === 'axis') return;
      var cn = colorName(look(b, f.s).hex, use);
      t += '      \\addplot[fill=' + cn + ', fill opacity=' + FILL_OPACITY + ', draw=none, forget plot] fill between[of=' + pathName(f.s) + ' and ' + pathName(f.to) + '];\n';
    });
    return axisWrap('axis', o, t);
  }

  /* A pie in plain TikZ: pgfplots has none, and no pie package is needed.
     One unit is the radius. */
  function texPie(b, m, use, inline) {
    var w = clamp(+b.width || 0.75, 0.2, 1), R = fmt(+(w * m.kR).toFixed(4));
    var t = '  \\begin{tikzpicture}[x=' + R + '\\linewidth, y=' + R + '\\linewidth]\n';
    var a = function (v) { return fmt(+v.toFixed(3)); };
    var esc = PT.latex.esc;
    m.slices.forEach(function (s) {
      var cn = colorName(s.hex, use), p;
      if (m.rIn) p = '(' + a(s.a0) + ':1) arc[start angle=' + a(s.a0) + ', end angle=' + a(s.a1) + ', radius=1] -- (' + a(s.a1) + ':' + m.rIn + ') arc[start angle=' + a(s.a1) + ', end angle=' + a(s.a0) + ', radius=' + m.rIn + '] -- cycle';
      else if (s.sweep >= 359.999) p = '(0,0) circle[radius=1]';
      else p = '(0,0) -- (' + a(s.a0) + ':1) arc[start angle=' + a(s.a0) + ', end angle=' + a(s.a1) + ', radius=1] -- cycle';
      t += '    \\fill[' + cn + ', draw=white, line width=0.8pt] ' + p + ';\n';
    });
    m.slices.forEach(function (s) {
      var label = s.html != null ? inline(s.html, use).trim() : PT.latex.esc(s.text);
      if (s.inside) t += '    \\node[font=\\small' + (light(s.hex) ? '' : ', text=white') + '] at (' + a(s.mid) + ':' + m.rNum + ') {' + esc(s.num) + '};\n';
      var outside = m.labels === 'outside' || (!s.inside && s.num);
      if (!outside) return;
      var text = m.labels === 'outside' ? label : '';
      var extra = !s.inside && s.num ? (text ? ' (' + esc(s.num) + ')' : esc(s.num)) : '';
      t += '    \\node[anchor=' + a(s.mid + 180) + '] at (' + a(s.mid) + ':1.1) {' + text + extra + '};\n';
    });
    if (m.labels === 'legend') {
      var n = m.slices.length;
      m.slices.forEach(function (s, i) {
        var dy = fmt(+(((n - 1) / 2 - i) * 14).toFixed(2));
        var label = s.html != null ? inline(s.html, use).trim() : PT.latex.esc(s.text);
        t += '    \\fill[' + colorName(s.hex, use) + '] (1.3,0) ++(0pt,' + dy + 'pt) ++(0pt,-4pt) rectangle ++(8pt,8pt);\n';
        t += '    \\node[anchor=west] at (1.3,0) [xshift=12pt, yshift=' + dy + 'pt] {' + label + '};\n';
      });
    }
    if (b.title) t += '    \\node[anchor=south, yshift=6pt] at (current bounding box.north) {' + labelTex(b.title, use) + '};\n';
    return t + '  \\end{tikzpicture}\n';
  }

  function texPolar(b, m, use, inline) {
    use.pgfpolar = true;
    var grid = gridOf(b), w = clamp(+b.width || 0.75, 0.2, 1);
    var o = ['width=' + fmt(w) + '\\linewidth'];
    if (b.title) o.push('title={' + labelTex(b.title, use) + '}');
    o.push('ymin=0, ymax=' + fmt(m.r), 'ytick={' + m.rticks.map(fmt).join(',') + '}');
    o.push('xtick={' + m.angles.join(',') + '}');
    o.push('xticklabels={' + m.angles.map(function (d) { return m.rad ? '$' + piText(d, true) + '$' : '$' + d + '^\\circ$'; }).join(',') + '}');
    if (grid === 'none') o.push('grid=none');
    else if (grid === 'major') o.push('grid=major');
    else o.push('grid=both', 'minor ytick={' + m.rminor.map(fmt).join(',') + '}', 'minor tick length=0pt');
    o.push('unbounded coords=jump', 'restrict y to domain=' + fmt(-2 * m.r) + ':' + fmt(2 * m.r));
    if (m.legend) o.push('legend pos=' + m.legend, 'legend cell align=left');
    var t = '';
    m.series.forEach(function (s) {
      var L = look(b, s), cn = colorName(L.hex, use);
      var opts = [cn, L.thick].concat(L.dash !== 'solid' ? [L.dash] : [], ['domain=' + fmt(m.t[0]) + ':' + fmt(m.t[1]), 'samples=' + m.samples]);
      if (s.st && s.st.fill) {
        t += '      \\addplot[draw=none, fill=' + cn + ', fill opacity=' + FILL_OPACITY + ', domain=' + fmt(m.t[0]) + ':' + fmt(m.t[1]) +
          ', samples=' + m.samples + ', forget plot] ({deg(x)}, {' + s.pgf + '}) -- cycle;\n';
      }
      t += '      \\addplot[' + opts.join(', ') + '] ({deg(x)}, {' + s.pgf + '});\n';
      if (m.legend) t += '      \\addlegendentry{' + legendTex(s, m, use, inline) + '}\n';
    });
    return axisWrap('polaraxis', o, t);
  }

  function texSurface(b, m, use) {
    var w = clamp(+b.width || 0.75, 0.2, 1), aspect = clamp(+b.aspect || 0.75, 0.3, 1.2), grid = gridOf(b);
    /* the box alone is sized, to the space the page gives it */
    var o = ['scale only axis', 'width={' + fmt(w) + '\\linewidth-' + (m.colorbar ? 8.9 : 5.6) + 'em}',
      'height={' + fmt(+(w * aspect).toFixed(3)) + '\\linewidth-' + (3.8 + (b.title ? 1.9 : 0)) + 'em}',
      'view={' + fmt(m.az) + '}{' + fmt(m.el) + '}'];
    if (b.title) o.push('title={' + labelTex(b.title, use) + '}');
    o.push('xmin=' + fmt(m.x[0]) + ', xmax=' + fmt(m.x[1]), 'ymin=' + fmt(m.y[0]) + ', ymax=' + fmt(m.y[1]),
      'zmin=' + fmt(m.zr[0]) + ', zmax=' + fmt(m.zr[1]));
    o.push('xtick distance=' + fmt(m.xstep), 'ytick distance=' + fmt(m.ystep), 'ztick distance=' + fmt(m.zstep));
    if (grid !== 'none') o.push('grid=major');
    if (b.xlabel) o.push('xlabel={' + labelTex(b.xlabel, use) + '}');
    if (b.ylabel) o.push('ylabel={' + labelTex(b.ylabel, use) + '}');
    if (b.zlabel) o.push('zlabel={' + labelTex(b.zlabel, use) + '}');
    o.push('colormap={pt' + m.cmap + '}{' + CMAPS[m.cmap][1].map(function (c) { return 'rgb255=(' + c.join(',') + ')'; }).join(' ') + '}');
    o.push('point meta min=' + fmt(+m.meta[0].toPrecision(8)) + ', point meta max=' + fmt(+m.meta[1].toPrecision(8)));
    if (m.colorbar) o.push('colorbar', 'colorbar style={ytick distance=' + fmt(niceStep(m.meta[1] - m.meta[0], 5)) + '}');
    if (m.cut) o.push('restrict z to domain=' + fmt(m.zr[0]) + ':' + fmt(m.zr[1]));
    var opts = [m.style === 'mesh' ? 'mesh' : 'surf'];
    if (m.style === 'surf') opts.push(m.smooth ? 'shader=interp' : 'shader=faceted', 'faceted color=black!45');
    opts.push('samples=' + m.n, 'domain=' + fmt(m.x[0]) + ':' + fmt(m.x[1]), 'y domain=' + fmt(m.y[0]) + ':' + fmt(m.y[1]));
    var t = m.pgf ? '      \\addplot3[' + opts.join(', ') + '] {' + m.pgf + '};\n' : '';
    return axisWrap('axis', o, t);
  }

  function preamble(use) {
    var custom = Object.keys((use && use.ptColors) || {});
    var p = ['\\usepackage{pgfplots}',
      '\\pgfplotsset{compat=1.18, scaled ticks=false,',
      '  tick label style={/pgf/number format/fixed, /pgf/number format/precision=4, /pgf/number format/1000 sep={}}}'];
    if (use && use.pgfpolar) p.push('\\usepgfplotslibrary{polar}');
    if (use && use.fillbetween) p.push('\\usepgfplotslibrary{fillbetween}');
    return p
      .concat(COLORS.map(function (c) { return '\\definecolor{' + c[0] + '}{HTML}{' + c[1] + '}'; }))
      .concat(custom.map(function (hex) { return '\\definecolor{' + customName(hex) + '}{HTML}{' + hex + '}'; }));
  }

  window.PT = window.PT || {};
  window.PT.chart = {
    compile: compile, parse: parse, parseCSV: parseCSV, num: num, val: val, model: model, look: look,
    draw: draw, tex: tex, preamble: preamble, source: source, cellText: cellText,
    COLORS: COLORS, THICK: THICK, DASHES: DASHES, MARKS: MARKS, MSIZE: MSIZE, LEGEND_POS: LEGEND_POS, CMAPS: CMAPS,
    autoHex: autoHex, cmapAt: cmapAt
  };
})();
