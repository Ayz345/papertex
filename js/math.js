/* PaperTeX — structured math: model, renderer, on-paper editor, LaTeX I/O.
   No external libraries. Math is a tree; the tree is what you edit and what
   gets serialised. Nothing here ever parses a user-typed LaTeX string. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ model */

  function row(k) { return { t: 'row', k: k || [] }; }
  function ch(c, cls) { return { t: 'ch', c: c, cls: cls || clsOf(c) }; }
  function sym(tex, d, cls, f) {
    var n = { t: 'sym', tex: tex, d: d, cls: cls || 'upr' };
    if (f) n.f = f;   /* 'bb' / 'cal': glyph comes from a different face */
    return n;
  }
  function fnode(name) { return { t: 'fn', name: name }; }
  function frac(n, d, style) { return { t: 'frac', n: n || row(), d: d || row(), style: style || 'frac' }; }
  function scr(sub, sup) { return { t: 'scr', sub: sub || null, sup: sup || null }; }
  function sqrtn(k, idx) { return { t: 'sqrt', k: k || row(), idx: idx || null }; }
  function big(op, d, limits) { return { t: 'big', op: op, d: d, lo: row(), hi: row(), limits: limits !== false }; }
  function paren(l, r, k) { return { t: 'paren', l: l, r: r, k: k || row() }; }
  function acc(kind, k) { return { t: 'acc', kind: kind, k: k || row() }; }
  function txt(k) { return { t: 'txt', k: k || row() }; }
  function mat(env, nr, nc) {
    var r = [], i, j;
    for (i = 0; i < nr; i++) { var c = []; for (j = 0; j < nc; j++) c.push(row()); r.push(c); }
    return { t: 'mat', env: env, r: r };
  }
  function raw(tex) { return { t: 'raw', tex: tex }; }
  function ci() { return { t: 'ci', s: '' }; }

  function clsOf(c) {
    if (/[0-9.]/.test(c)) return 'num';
    if (/[a-zA-Z]/.test(c)) return 'var';
    if ('+-*'.indexOf(c) >= 0) return 'bin';
    if ('=<>'.indexOf(c) >= 0) return 'rel';
    if (',;:'.indexOf(c) >= 0) return 'punct';
    return 'upr';
  }

  /* Ordered editable slots of a node (rows the caret can enter). */
  function slots(n) {
    switch (n.t) {
      case 'frac': return [n.n, n.d];
      case 'scr': return n.sub && n.sup ? [n.sub, n.sup] : (n.sub ? [n.sub] : (n.sup ? [n.sup] : []));
      case 'sqrt': return n.idx ? [n.idx, n.k] : [n.k];
      case 'big': return [n.lo, n.hi];
      case 'paren': return [n.k];
      case 'acc': return [n.k];
      case 'txt': return [n.k];
      case 'mat': { var a = []; n.r.forEach(function (rr) { rr.forEach(function (c) { a.push(c); }); }); return a; }
      default: return [];
    }
  }

  /* parent links, rebuilt on demand — kept out of the JSON via WeakMaps */
  var ownerOf = new WeakMap();   // row  -> {node, slot}
  var rowOf = new WeakMap();     // node -> row
  function reparent(r) {
    r.k.forEach(function (n) {
      rowOf.set(n, r);
      slots(n).forEach(function (s, i) { ownerOf.set(s, { node: n, slot: i }); reparent(s); });
    });
  }

  function clone(n) { return JSON.parse(JSON.stringify(n)); }
  function isEmptyRow(r) { return !r || r.k.length === 0; }

  /* -------------------------------------------------------------- rendering */

  var DELIM = {
    '(': '(', ')': ')', '[': '[', ']': ']', '\\{': '{', '\\}': '}',
    '|': '|', '\\|': '‖', '\\langle': '⟨', '\\rangle': '⟩',
    '\\lceil': '⌈', '\\rceil': '⌉', '\\lfloor': '⌊', '\\rfloor': '⌋', '.': ''
  };
  /* accent glyphs — the accent forms in cmr, not the ASCII look-alikes;
     \overline and \underline are rules, drawn by the layout pass */
  var ACC = { hat: '^', widehat: '^', bar: 'ˉ', vec: '→', tilde: '˜', dot: '˙', ddot: '¨', overline: null, underline: null, boldsym: null };
  /* cmmi skew: how far right of centre an accent sits over a slanted letter */
  var SKEW = {
    A: .13889, B: .08334, C: .08334, D: .05556, E: .08334, F: .08334, G: .08334, H: .05556,
    I: .11111, J: .16667, K: .05556, L: .02778, M: .08334, N: .08334, O: .08334, P: .08334,
    Q: .08334, R: .08334, S: .08334, T: .08334, U: .02778, V: .02778, W: .08334, X: .08334,
    Y: .05556, Z: .08334, c: .05556, d: .16667, e: .05556, f: .16667, g: .02778, i: .05556,
    j: .05556, l: .08334, o: .05556, p: .08334, q: .08334, r: .05556, s: .05556, t: .08334,
    u: .02778, v: .02778, w: .08334, x: .02778, y: .05556, z: .05556
  };

  function el(tag, cls, txtc) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txtc != null) e.textContent = txtc;
    return e;
  }

  /* Math styles. TeX sets every part of a formula in one of four styles —
     display, text, script, scriptscript — and the style, not the nesting
     depth, decides the size of a part and where its scripts and limits go.
     A display equation starts in D, an inline formula in T. "Cramped" parts
     (denominators, subscripts, radicands) keep their superscripts lower. */
  var D = 0, T = 1, S = 2, SS = 3;
  var SIZE = [1, 1, 0.7, 0.5];
  function sty(z, c) { return { z: z, c: !!c }; }
  function stSup(s) { return sty(s.z < S ? S : SS, s.c); }
  function stSub(s) { return sty(s.z < S ? S : SS, true); }
  function stNum(s) { return sty(s.z === D ? T : s.z === T ? S : SS, s.c); }
  function stDen(s) { return sty(stNum(s).z, true); }

  /* A child slot set in style `inner` inside a parent set in `outer`. The
     wrapper carries the size change, so em values inside it stay relative. */
  function slotEl(cls, r, ctx, inner, outer) {
    var w = el('span', cls);
    if (SIZE[inner.z] !== SIZE[outer.z]) w.style.fontSize = +(SIZE[inner.z] / SIZE[outer.z]).toFixed(4) + 'em';
    w.appendChild(renderRow(r, ctx, inner));
    return w;
  }

  /* ctx: {cur:{row,i}|null, sel:{row,a,b}|null, focused:bool}; st: math style */
  function renderRow(r, ctx, st) {
    st = st || sty(D);
    var e = el('span', 'mrow');
    e.__row = r;
    var i, n;
    var selA = -1, selB = -1;
    if (ctx.sel && ctx.sel.row === r) { selA = Math.min(ctx.sel.a, ctx.sel.b); selB = Math.max(ctx.sel.a, ctx.sel.b); }

    if (r.k.length === 0) {
      var ph = el('span', 'mph');
      ph.dataset.mi = '0';
      ph.classList.add('matom');
      e.appendChild(ph);
    }
    var atoms = [];
    for (i = 0; i < r.k.length; i++) {
      if (ctx.focused && ctx.cur && ctx.cur.row === r && ctx.cur.i === i && selA < 0) e.appendChild(caretEl());
      n = r.k[i];
      var a = renderNode(n, ctx, st);
      a.classList.add('matom');
      a.dataset.mi = String(i);
      if (i >= selA && i < selB) a.classList.add('msel');
      e.appendChild(a);
      atoms.push(a);
    }
    if (ctx.focused && ctx.cur && ctx.cur.row === r && ctx.cur.i === r.k.length && selA < 0) e.appendChild(caretEl());
    if (!st.txt) spaceAtoms(r.k, atoms, st);
    return e;
  }
  function caretEl() { var c = el('span', 'mcaret'); return c; }

  /* Spacing between atoms, from TeX's table (The TeXbook, ch. 18): what goes
     between two neighbours depends on their kinds — ordinary, operator,
     binary, relation, opening, closing, punctuation, inner — and, for the
     medium and thick spaces, on the style: scripts are set tight. A binary
     sign with nothing to bind on its left (a leading minus, -x after =)
     is an ordinary symbol, and gets no space at all. */
  var K_ORD = 0, K_OP = 1, K_BIN = 2, K_REL = 3, K_OPEN = 4, K_CLOSE = 5, K_PUNCT = 6, K_INNER = 7;
  /* 1 thin, 2 medium, 3 thick; negative = only in display and text style */
  var SPACING = [
    [0, 1, -2, -3, 0, 0, 0, -1],
    [1, 1, 0, -3, 0, 0, 0, -1],
    [-2, -2, 0, 0, -2, 0, 0, -2],
    [-3, -3, 0, 0, -3, 0, 0, -3],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 1, -2, -3, 0, 0, 0, -1],
    [-1, -1, 0, -1, -1, -1, -1, -1],
    [-1, 1, -2, -3, -1, 0, -1, -1]
  ];
  var MU = [0, 3, 4, 5];   /* thin, medium, thick space in mu (1/18 em) */
  function atomKind(n) {
    switch (n.t) {
      case 'ch': case 'sym':
        if (n.cls === 'bin') return K_BIN;
        if (n.cls === 'rel') return K_REL;
        if (n.cls === 'punct') return K_PUNCT;
        if (n.cls === 'spc') return null;           /* glue, not an atom */
        if (n.cls === 'fn' || n.cls === 'op') return K_OP;   /* \sin, \log … */
        var c = n.t === 'ch' ? n.c : n.d;
        if (c === '(' || c === '[' || c === '⟨' || c === '⌈' || c === '⌊') return K_OPEN;
        if (c === ')' || c === ']' || c === '⟩' || c === '⌉' || c === '⌋') return K_CLOSE;
        return K_ORD;
      case 'fn': case 'big': return K_OP;
      case 'frac': case 'paren': return K_INNER;
      case 'mat': return n.env === 'matrix' ? K_ORD : K_INNER;
      case 'scr': return undefined;                 /* belongs to the atom before it */
      default: return K_ORD;
    }
  }
  function spaceAtoms(nodes, els, st) {
    var kinds = nodes.map(atomKind), i, k, prev = -1, script = st.z >= S;
    /* resolve binary signs that have nothing to bind (TeX rules 5 and 6) */
    for (i = 0; i < kinds.length; i++) {
      k = kinds[i];
      if (k === null || k === undefined) continue;
      if (k === K_BIN && (prev < 0 || kinds[prev] === K_BIN || kinds[prev] === K_OP || kinds[prev] === K_REL ||
          kinds[prev] === K_OPEN || kinds[prev] === K_PUNCT)) kinds[i] = k = K_ORD;
      if ((k === K_REL || k === K_CLOSE || k === K_PUNCT) && prev >= 0 && kinds[prev] === K_BIN) kinds[prev] = K_ORD;
      prev = i;
    }
    prev = -1;
    for (i = 0; i < kinds.length; i++) {
      k = kinds[i];
      if (k === null || k === undefined) continue;
      if (prev >= 0) {
        var s = SPACING[kinds[prev]][k];
        if (s < 0) s = script ? 0 : -s;
        if (s) els[i].style.marginLeft = +(MU[s] / 18).toFixed(4) + 'em';
      }
      els[i].__ml = els[i].style.marginLeft;
      prev = i;
    }
  }

  /* Italic correction of the math italic letters (cmmi10): the overhang of a
     slanted letter, which TeX adds after it so the next upright glyph does
     not collide — the gap in f(x), the room after F in F\cdot. */
  var ITALIC = {
    B: .05017, C: .07153, D: .02778, E: .05764, F: .13889, H: .08125, I: .07847, J: .09618,
    K: .07153, M: .10903, N: .10903, O: .02778, P: .13889, R: .00773, S: .05764, T: .13889,
    U: .10903, V: .22222, W: .13889, X: .07847, Y: .22222, Z: .07153,
    f: .10764, g: .03588, j: .05724, l: .01968, q: .03588, r: .02778, v: .03588, w: .02691,
    y: .03588, z: .04398, '∂': .05556
  };
  var SPACES = { '\\,': 3 / 18, '\\:': 4 / 18, '\\;': 5 / 18, '\\!': -3 / 18, '\\quad': 1, '\\qquad': 2 };
  function spaceWidth(e, tex) {
    var w = SPACES[tex] != null ? SPACES[tex] : 3 / 18;
    if (w < 0) { e.style.width = '0'; e.style.marginRight = +w.toFixed(4) + 'em'; }
    else e.style.width = +w.toFixed(4) + 'em';
  }

  function renderNode(n, ctx, st) {
    var e, a, b;
    switch (n.t) {
      case 'ch':
        e = el('span', 'mi m-' + n.cls, n.c === '-' ? '−' : n.c);
        if (n.cls === 'var' && ITALIC[n.c] && !st.txt) {
          e.__it = ITALIC[n.c];
          e.style.marginRight = ITALIC[n.c] + 'em';
        }
        return e;
      case 'sym':
        /* ∂, ℏ, ℓ are not in the math italic face; cm draws them already
           slanted in the roman one, which is where TeX takes them from */
        e = el('span', 'mi m-' + (n.cls === 'var' && /^[∂ℏℓ]$/.test(n.d) ? 'upr' : n.cls) +
          (n.f ? ' m-f-' + n.f : ''), n.d);
        if (ITALIC[n.d] && !st.txt) { e.__it = ITALIC[n.d]; e.style.marginRight = ITALIC[n.d] + 'em'; }
        if (n.cls === 'spc') { e.textContent = ' '; e.classList.add('mspc'); spaceWidth(e, n.tex); }
        return e;
      case 'fn':
        return el('span', 'mi m-fn', n.name);
      case 'frac': {
        e = el('span', n.style === 'binom' ? 'mfrac mbinom' : 'mfrac');
        e.__st = st;
        e.appendChild(slotEl('mnum', n.n, ctx, stNum(st), st));
        if (n.style !== 'binom') e.appendChild(el('span', 'mbar'));
        e.appendChild(slotEl('mden', n.d, ctx, stDen(st), st));
        if (n.style === 'binom') {
          var w = el('span', 'mparen');
          w.appendChild(delimEl('(')); w.appendChild(e); w.appendChild(delimEl(')'));
          return w;
        }
        return e;
      }
      case 'scr': {
        e = el('span', 'mscr' + (n.sub && n.sup ? ' mboth' : (n.sup ? ' msup' : ' msub')));
        e.__st = st;
        if (n.sup) e.appendChild(slotEl('msupr', n.sup, ctx, stSup(st), st));
        if (n.sub) e.appendChild(slotEl('msubr', n.sub, ctx, stSub(st), st));
        return e;
      }
      case 'sqrt': {
        e = el('span', 'msqrt');
        if (n.idx) e.appendChild(slotEl('mrootidx', n.idx, ctx, sty(SS), st));
        e.__st = st;
        var sg = el('span', 'msign', '√');
        var rd = el('span', 'mrad'); rd.appendChild(renderRow(n.k, ctx, sty(st.z, true)));
        rd.appendChild(el('span', 'mvinc'));
        e.appendChild(sg); e.appendChild(rd);
        return e;
      }
      case 'big': {
        /* Empty limits are only there to be typed into: drawn while the
           formula is being edited, absent otherwise — as in the output. */
        var hasHi = ctx.focused || !isEmptyRow(n.hi), hasLo = ctx.focused || !isEmptyRow(n.lo);
        /* word operators (lim, max, det) set at text size; symbols take the
           large cmex glyph in display style and the small one elsewhere */
        var word = /^[A-Za-z]+$/.test(n.d);
        var op = el('span', 'mbigop' + (word ? ' mbigword' : st.z === D ? ' mbigD' : ''), n.d);
        if (n.limits && st.z === D) {
          /* \sum, \lim in display style: limits centred above and below */
          e = el('span', 'mbig');
          e.__st = st;
          if (hasHi) e.appendChild(slotEl('mlim mhi', n.hi, ctx, stSup(st), st));
          e.appendChild(op);
          if (hasLo) e.appendChild(slotEl('mlim mlo', n.lo, ctx, stSub(st), st));
          return e;
        }
        /* Integrals always, and every operator outside display style, carry
           their limits beside the sign — TeX sets them as scripts on the
           operator, not on the text baseline. */
        e = el('span', 'mbigi');
        e.__st = st;
        e.appendChild(op);
        if (hasHi || hasLo) {
          var lim = el('span', 'milim');
          if (hasHi) lim.appendChild(slotEl('msupr', n.hi, ctx, stSup(st), st));
          if (hasLo) lim.appendChild(slotEl('msubr', n.lo, ctx, stSub(st), st));
          e.appendChild(lim);
        }
        return e;
      }
      case 'paren': {
        e = el('span', 'mparen');
        e.appendChild(delimEl(n.l));
        var inner = el('span', 'mpin'); inner.appendChild(renderRow(n.k, ctx, st));
        e.appendChild(inner);
        e.appendChild(delimEl(n.r));
        return e;
      }
      case 'acc': {
        e = el('span', 'macc macc-' + n.kind);
        var body = el('span', 'maccb'); body.appendChild(renderRow(n.k, ctx, sty(st.z, true)));
        e.__st = st;
        if (n.kind === 'boldsym') { body.classList.add('mbold'); e.appendChild(body); return e; }
        e.appendChild(body);
        if (n.kind === 'overline' || n.kind === 'underline') {
          e.appendChild(el('span', 'maccr' + (n.kind === 'underline' ? ' maccu' : '')));
          return e;
        }
        var mk = el('span', 'maccm', ACC[n.kind] || '^');
        /* a lone slanted letter carries its skew */
        if (n.k.k.length === 1 && n.k.k[0].t === 'ch' && n.k.k[0].cls === 'var') e.__skew = SKEW[n.k.k[0].c] || 0;
        e.appendChild(mk);
        return e;
      }
      case 'txt': {
        e = el('span', 'mtext');
        e.appendChild(renderRow(n.k, ctx, { z: st.z, c: st.c, txt: true }));
        return e;
      }
      case 'mat': {
        e = el('span', 'mmat mmat-' + n.env);
        var d = matDelims(n.env);
        if (d[0]) e.appendChild(delimEl(d[0]));
        var grid = el('span', 'mgrid');
        grid.style.gridTemplateColumns = 'repeat(' + n.r[0].length + ', auto)';
        /* array cells are always set in text style, whatever surrounds them */
        n.r.forEach(function (rr) {
          rr.forEach(function (c) { grid.appendChild(slotEl('mcell', c, ctx, sty(T), st)); });
        });
        e.appendChild(grid);
        if (d[1]) e.appendChild(delimEl(d[1]));
        return e;
      }
      case 'raw':
        return el('span', 'mraw', n.tex);
      case 'ci':
        e = el('span', 'mci');
        e.appendChild(el('span', 'mcibs', '\\'));
        e.appendChild(el('span', 'mcis', n.s));
        return e;
      default:
        return el('span', 'mi', '?');
    }
  }

  function delimEl(d) {
    var g = DELIM[d] != null ? DELIM[d] : d;
    var e = el('span', 'mdelim');
    e.appendChild(el('span', 'mdg', g));
    return e;
  }
  function matDelims(env) {
    return { pmatrix: ['(', ')'], bmatrix: ['[', ']'], Bmatrix: ['\\{', '\\}'],
      vmatrix: ['|', '|'], Vmatrix: ['\\|', '\\|'], matrix: ['', ''],
      cases: ['\\{', ''] }[env] || ['', ''];
  }

  /* ---------------------------------------------------------------- layout

     Second pass: put scripts, limits and fraction parts where TeX puts them.
     CSS cannot: TeX positions a script from the ink of the thing it is
     attached to and of the script itself, under rules (The TeXbook,
     Appendix G) driven by the font parameters below. So the pass measures
     real glyph outlines and applies those rules, one construct at a time,
     innermost first so that every parent measures children already in place.
     Results are written in em, so they survive a change of font size —
     the printable copy is set at the document's real size, not the screen's. */

  /* TeX's font parameters (cmsy/cmex) for text, script and scriptscript
     size, each in em of the font at that size. */
  var SIG = {
    xh: [0.431, 0.431, 0.431],
    num1: [0.677, 0.732, 0.925], num2: [0.394, 0.384, 0.387], num3: [0.444, 0.471, 0.504],
    denom1: [0.686, 0.752, 1.025], denom2: [0.345, 0.344, 0.532],
    sup1: [0.413, 0.503, 0.504], sup2: [0.363, 0.431, 0.404], sup3: [0.289, 0.286, 0.294],
    sub1: [0.150, 0.143, 0.200], sub2: [0.247, 0.286, 0.400],
    supDrop: [0.386, 0.353, 0.494], subDrop: [0.050, 0.071, 0.100],
    axis: [0.25, 0.25, 0.25], rule: [0.04, 0.049, 0.049]
  };
  function sig(name, z) { return SIG[name][z <= T ? 0 : z === S ? 1 : 2]; }
  /* big operator spacing, cmex ξ9–ξ13 */
  var OP1 = 0.111, OP2 = 0.166, OP3 = 0.2, OP4 = 0.6;
  var SCRIPTSPACE = 0.05, NULLDELIM = 0.12;

  /* The box metrics TeX uses for the large operators: height, depth and
     italic correction, in em, for the small (text) and large (display) cmex
     glyphs. Integrals lean, which is what the italic correction measures. */
  var INTEGRALS = '∫∬∭∮∯∰';
  function opMetrics(ch, large) {
    var i = INTEGRALS.indexOf(ch) >= 0;
    if (large) return i ? { h: 1.36, d: 0.862, it: 0.444 } : { h: 1.05, d: 0.55, it: 0 };
    return i ? { h: 0.805, d: 0.306, it: 0.194 } : { h: 0.75, d: 0.25, it: 0 };
  }

  function fpx(e) { return parseFloat(getComputedStyle(e).fontSize) || 16; }
  function em(px, f) { return +(px / f).toFixed(4) + 'em'; }
  function fontsSettled() { return !document.fonts || document.fonts.status === 'loaded'; }

  /* Where a font puts the baseline inside a text box. A text range's
     rectangle spans the font's ascent and descent, whatever the glyphs; this
     finds the ascent, and the box height, per face, in em. */
  var faceCache = {};
  function faceBox(cs) {
    var key = cs.fontStyle + '|' + cs.fontWeight + '|' + cs.fontFamily;
    if (faceCache[key]) return faceCache[key];
    var host = el('div');
    host.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;line-height:normal;' +
      'font-size:100px;font-style:' + cs.fontStyle + ';font-weight:' + cs.fontWeight;
    host.style.fontFamily = cs.fontFamily;
    var t = document.createTextNode('x'), mk = el('span');
    mk.style.cssText = 'display:inline-block;width:0;height:0';
    host.appendChild(t); host.appendChild(mk);
    document.body.appendChild(host);
    var rg = document.createRange(); rg.selectNodeContents(host); rg.setEnd(t, 1);
    var r = rg.getBoundingClientRect(), b = mk.getBoundingClientRect().top;
    host.remove();
    var v = { a: (b - r.top) / 100, h: r.height / 100 };
    if (fontsSettled()) faceCache[key] = v;
    return v;
  }

  /* The ink of a string — how far the glyphs really rise and fall. */
  var inkCache = {}, inkCtx = null;
  function glyphInk(s, cs) {
    var font = cs.fontStyle + ' ' + cs.fontWeight + ' 100px ' + cs.fontFamily, key = font + '|' + s;
    if (inkCache[key]) return inkCache[key];
    if (!inkCtx) inkCtx = document.createElement('canvas').getContext('2d');
    inkCtx.font = font;
    var m = inkCtx.measureText(s);
    var v = { a: m.actualBoundingBoxAscent / 100, d: m.actualBoundingBoxDescent / 100 };
    if (fontsSettled()) inkCache[key] = v;
    return v;
  }

  /* Vertical extent of everything drawn inside e, in client px:
     glyph outlines, rules (fraction bars, radical and accent bars) and
     empty-slot boxes. Stretched delimiters are followed through their
     transform. */
  function inkBox(e) {
    var top = Infinity, bot = -Infinity;
    function add(t, b) { if (t < top) top = t; if (b > bot) bot = b; }
    (function walk(p) {
      for (var c = p.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) {
          var s = c.nodeValue.trim();
          if (!s) continue;
          var rg = document.createRange(); rg.selectNodeContents(c);
          var r = rg.getBoundingClientRect();
          if (!r.height) continue;
          var cs = getComputedStyle(c.parentElement), fs = parseFloat(cs.fontSize);
          var fb = faceBox(cs), g = glyphInk(s, cs);
          var k = r.height / (fb.h * fs);
          var base = r.top + fb.a * fs * k;
          add(base - g.a * fs * k, base + g.d * fs * k);
        } else if (c.nodeType === 1) {
          var cl = c.classList;
          if (cl.contains('mcaret')) continue;
          if (cl.contains('mph') || cl.contains('mbar') || cl.contains('mvinc') || cl.contains('maccr')) {
            var q = c.getBoundingClientRect();
            if (q.height) add(q.top, q.bottom);
            continue;
          }
          walk(c);
        }
      }
    })(e);
    return top === Infinity ? null : { top: top, bottom: bot };
  }

  /* y of the baseline of e's line, in client px */
  function baselineY(e) {
    var mk = el('span');
    mk.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    e.appendChild(mk);
    var y = mk.getBoundingClientRect().top;
    e.removeChild(mk);
    return y;
  }

  /* Take a part of a stack out of flow and measure it against its own
     baseline: width, box ascent (for placing it) and ink height/depth (for
     TeX's rules). */
  function part(p) {
    p.style.position = 'absolute';
    p.style.left = '0'; p.style.top = '0';
    var r = p.getBoundingClientRect(), b = baselineY(p), ink = inkBox(p) || { top: b, bottom: b };
    return { w: r.width, a: b - r.top, h: Math.max(0, b - ink.top), d: Math.max(0, ink.bottom - b) };
  }

  /* Position parts in a stack box. Each item: {el, m (from part), x, y},
     y the raise of its baseline above the box's. `ext` lists extra extents
     [top, bottom] (up positive) that the box must enclose. */
  function place(box, items, W, ext) {
    var fs = fpx(box), pad = 0.06 * fs, H = 0, Dp = 0;
    items.forEach(function (it) { H = Math.max(H, it.y + it.m.h); Dp = Math.max(Dp, it.m.d - it.y); });
    (ext || []).forEach(function (x) { H = Math.max(H, x[0]); Dp = Math.max(Dp, -x[1]); });
    H += pad; Dp += pad;
    items.forEach(function (it) {
      var f = fpx(it.el);
      it.el.style.left = em(it.x, f);
      it.el.style.top = em(H - it.y - it.m.a, f);
    });
    box.classList.add('mlaid');
    box.style.width = em(W, fs);
    box.style.height = em(H + Dp, fs);
    box.style.verticalAlign = em(-Dp, fs);   /* no in-flow line: baseline is the bottom edge */
    return H;
  }

  /* TeX rule 15: fractions and binomials. */
  function layFrac(e) {
    var st = e.__st || sty(T), z = st.z, fs = fpx(e);
    var num = e.querySelector(':scope > .mnum'), den = e.querySelector(':scope > .mden');
    var bar = e.querySelector(':scope > .mbar');
    if (!num || !den) return;
    var N = part(num), Q = part(den);
    if (!N.w && !Q.w) return;                /* not on screen: nothing to measure */
    var th = sig('rule', z) * fs, ax = sig('axis', z) * fs, u, v, c;
    if (z === D) { u = sig('num1', z); v = sig('denom1', z); }
    else { u = bar ? sig('num2', z) : sig('num3', z); v = sig('denom2', z); }
    u *= fs; v *= fs;
    if (bar) {
      c = (z === D ? 3 : 1) * th;
      var c1 = (u - N.d) - (ax + th / 2); if (c1 < c) u += c - c1;
      var c2 = (ax - th / 2) - (Q.h - v); if (c2 < c) v += c - c2;
    } else {
      c = (z === D ? 7 : 3) * th;
      var c3 = (u - N.d) - (Q.h - v); if (c3 < c) { u += (c - c3) / 2; v += (c - c3) / 2; }
    }
    var W = Math.max(N.w, Q.w), pad = bar ? NULLDELIM * fs : 0;
    var bh = 0;
    if (bar) {
      bar.style.position = 'absolute';
      bar.style.left = em(pad, fs); bar.style.width = em(W, fs);
      bh = bar.getBoundingClientRect().height;
    }
    var H = place(e, [
      { el: num, m: N, x: pad + (W - N.w) / 2, y: u },
      { el: den, m: Q, x: pad + (W - Q.w) / 2, y: -v }
    ], W + 2 * pad, bar ? [[ax + bh / 2, ax - bh / 2]] : null);
    if (bar) bar.style.top = em(H - ax - bh / 2, fs);
  }

  /* TeX rule 18: sub- and superscripts. `base` describes the nucleus:
     {chr} for a single character, else its ink height and depth. */
  function layScripts(box, st, base, italic) {
    var sup = box.querySelector(':scope > .msupr'), sub = box.querySelector(':scope > .msubr');
    if (!sup && !sub) return;
    var P = sup && part(sup), B = sub && part(sub);
    if (!(P ? P.w : 0) && !(B ? B.w : 0)) return;
    var z = st.z, fs = fpx(box), zs = stSup(st).z, sfs = fpx(sup || sub);
    var xh = sig('xh', z) * fs, th = sig('rule', z) * fs, u = 0, v = 0;
    if (!base.chr) { u = base.h - sig('supDrop', zs) * sfs; v = base.d + sig('subDrop', zs) * sfs; }
    var minU = (st.c ? sig('sup3', z) : z === D ? sig('sup1', z) : sig('sup2', z)) * fs;
    if (P && B) {
      u = Math.max(u, minU, P.d + xh / 4);
      v = Math.max(v, sig('sub2', z) * fs);
      if ((u - P.d) - (B.h - v) < 4 * th) {
        v = 4 * th - (u - P.d) + B.h;
        var psi = 0.8 * xh - (u - P.d);
        if (psi > 0) { u += psi; v -= psi; }
      }
    } else if (B) {
      v = Math.max(v, sig('sub1', z) * fs, B.h - 0.8 * xh);
    } else {
      u = Math.max(u, minU, P.d + xh / 4);
    }
    var items = [], W = 0;
    /* a leaning nucleus (an integral) pushes its superscript right by its
       italic correction; the subscript tucks in under it */
    if (P) { items.push({ el: sup, m: P, x: italic, y: u }); W = italic + P.w; }
    if (B) { items.push({ el: sub, m: B, x: 0, y: -v }); W = Math.max(W, B.w); }
    place(box, items, W + SCRIPTSPACE * fs);
  }

  function prevAtom(e) {
    var b = e.previousElementSibling;
    while (b && b.classList.contains('mcaret')) b = b.previousElementSibling;
    return b;
  }

  /* Operator names that take their limits underneath in display style,
     as \lim does: \max_{x} f, \sup_n a_n. */
  var LIMIT_NAMES = /^(lim|liminf|limsup|max|min|sup|inf|det|gcd|Pr)$/;

  /* scripts on whatever precedes them */
  function layScr(e) {
    var st = e.__st || sty(T), b = prevAtom(e), base = { chr: true }, it = 0;
    e.style.marginRight = '';
    if (b && b.__ml !== undefined) b.style.marginLeft = b.__ml;
    if (b && st.z === D && b.classList.contains('m-fn') && LIMIT_NAMES.test(b.textContent)) {
      layScrAsLimits(e, b, st);
      return;
    }
    /* a lone symbol takes TeX's fixed script shifts; anything bigger —
       including an operator name like \sin — hangs them from its own ink */
    if (b && (!b.classList.contains('mi') || b.classList.contains('m-fn'))) {
      var y = baselineY(e.parentElement), ink = inkBox(b);
      base = ink ? { chr: false, h: Math.max(0, y - ink.top), d: Math.max(0, ink.bottom - y) } : base;
    }
    /* After a slanted letter the italic correction is already in place as
       a margin; a subscript tucks back under it, the superscript stays out. */
    e.style.marginLeft = '';
    if (b && b.__it && e.querySelector(':scope > .msubr')) {
      it = b.__it * fpx(b);
      e.style.marginLeft = em(-it, fpx(e));
    }
    layScripts(e, st, base, it);
  }

  /* The scripts of \max, \sup … in display style: centred under and over
     the name (rule 13a), the box pulled back over it with negative margins
     so the name keeps its place in the line. */
  function layScrAsLimits(e, b, st) {
    var sup = e.querySelector(':scope > .msupr'), sub = e.querySelector(':scope > .msubr');
    var P = sup && part(sup), B = sub && part(sub);
    var fs = fpx(e), bw = b.getBoundingClientRect().width;
    if (!bw) return;
    var y = baselineY(e.parentElement), ink = inkBox(b);
    var h = ink ? Math.max(0, y - ink.top) : 0, d = ink ? Math.max(0, ink.bottom - y) : 0;
    var W = Math.max(bw, P ? P.w : 0, B ? B.w : 0), items = [];
    if (P) items.push({ el: sup, m: P, x: (W - P.w) / 2, y: h + Math.max(OP1 * fs, OP3 * fs - P.d) + P.d });
    if (B) items.push({ el: sub, m: B, x: (W - B.w) / 2, y: -(d + Math.max(OP2 * fs, OP4 * fs - B.h) + B.h) });
    place(e, items, W);
    var over = Math.max(0, (W - bw) / 2);
    e.style.marginLeft = em(-(bw + W) / 2, fs);
    e.style.marginRight = em(over + (bw - W) / 2, fs);
    /* limits wider than the name push it right, as they would in TeX */
    if (over) {
      var ml0 = parseFloat(b.__ml || '0') * fpx(b);
      b.style.marginLeft = em(ml0 + over, fpx(b));
    }
  }

  /* The operator sign of a big operator: its metrics, and how far it sits
     below the baseline so that its centre lands on the maths axis. */
  function opBox(op, st) {
    var fs = fpx(op);
    if (op.classList.contains('mbigword')) {
      var y = baselineY(op), ink = inkBox(op);
      return { h: ink ? y - ink.top : 0, d: ink ? Math.max(0, ink.bottom - y) : 0, it: 0, shift: 0 };
    }
    var m = opMetrics(op.textContent, op.classList.contains('mbigD'));
    var shift = ((m.h - m.d) / 2 - sig('axis', st.z)) * fs;
    return { h: m.h * fs, d: m.d * fs, it: m.it * fs, shift: shift };
  }

  /* TeX rule 13a: limits above and below (\sum, \lim in display style). */
  function layLimits(e) {
    var st = e.__st || sty(D), fs = fpx(e);
    var op = e.querySelector(':scope > .mbigop');
    var hi = e.querySelector(':scope > .mhi'), lo = e.querySelector(':scope > .mlo');
    if (!op) return;
    var O = part(op);
    if (!O.w) return;
    var ob = opBox(op, st);
    var oh = ob.h - ob.shift, od = ob.d + ob.shift;
    var P = hi && part(hi), B = lo && part(lo);
    var W = Math.max(O.w, P ? P.w : 0, B ? B.w : 0);
    var items = [{ el: op, m: { w: O.w, a: O.a, h: ob.h, d: ob.d }, x: (W - O.w) / 2, y: -ob.shift }];
    if (P) items.push({ el: hi, m: P, x: (W - P.w + ob.it) / 2,
      y: oh + Math.max(OP1 * fs, OP3 * fs - P.d) + P.d });
    if (B) items.push({ el: lo, m: B, x: (W - B.w - ob.it) / 2,
      y: -(od + Math.max(OP2 * fs, OP4 * fs - B.h) + B.h) });
    place(e, items, W);
  }

  /* An operator with its limits beside it: integrals, and any operator
     outside display style. The sign stays in the line, centred on the axis;
     the limits are scripts on it. */
  function layOpScripts(e) {
    var st = e.__st || sty(T);
    var op = e.querySelector(':scope > .mbigop'), lim = e.querySelector(':scope > .milim');
    if (!op || !op.getBoundingClientRect().width) return;
    var ob = opBox(op, st);
    op.style.verticalAlign = ob.shift ? em(-ob.shift, fpx(op)) : '';
    /* The italic correction follows the sign unless a subscript tucks in
       under its overhang; then only the superscript is pushed out by it. */
    var hasSub = !!(lim && lim.querySelector(':scope > .msubr'));
    op.style.marginRight = hasSub || !ob.it ? '' : em(ob.it, fpx(op));
    if (lim) layScripts(lim, st, { chr: false, h: ob.h - ob.shift, d: ob.d + ob.shift }, hasSub ? ob.it : 0);
  }

  /* Delimiters and radical signs come in fixed sizes, as in cmex: the text
     glyph (1em tall), \big (1.2em, Size1), \Big (1.8em, Size2), \bigg (2.4)
     and \Bigg (3.0) — the last two drawn as the Size2 glyph stretched, since
     those faces are not embedded — and beyond that a glyph stretched to fit.
     Returns {k, family} for the smallest size of at least `want` em. */
  var DSIZES = [1, 1.2, 1.8, 2.4, 3.0];
  function delimSize(want) {
    var i = 0;
    while (i < DSIZES.length && DSIZES[i] < want - 0.001) i++;
    var size = i < DSIZES.length ? DSIZES[i] : want;
    if (i === 0) return { size: 1, k: 1, family: '' };
    if (i === 1) return { size: size, k: 1, family: '"PaperTeX Size1"' };
    return { size: size, k: size / 1.8, family: '"PaperTeX Size2"' };
  }
  function setGlyph(box, glyph, sz) {
    box.style.transform = '';
    glyph.style.fontFamily = sz.family ? sz.family + ', "PaperTeX", serif' : '';
  }
  /* centre a glyph's ink on y (client px), stretched by k */
  function centreGlyph(box, cy, k) {
    var g = inkBox(box);
    if (!g) return;
    var r = box.getBoundingClientRect(), bc = (r.top + r.bottom) / 2, c0 = (g.top + g.bottom) / 2;
    var dy = cy - bc - (c0 - bc) * k;
    if (Math.abs(dy) < 0.05 && k === 1) return;
    box.style.transformOrigin = 'center center';
    box.style.transform = 'translateY(' + em(dy, fpx(box)) + ')' + (k !== 1 ? ' scaleY(' + k.toFixed(4) + ')' : '');
  }
  /* \left/\right: cover the formula to within 5pt either side of the axis
     (\delimiterfactor 901, \delimitershortfall 5pt), centred on the axis */
  function sizeDelim(dl, cy, want, fs) {
    var sz = delimSize(want / fs);
    setGlyph(dl, dl.firstChild, sz);
    if (sz.size === 1) return;
    centreGlyph(dl, cy, sz.k);
  }
  function delimWant(delta, fs) { return Math.max(2 * delta * 0.901, 2 * delta - 0.5 * fs); }
  function layParen(e) {
    var body = e.querySelector(':scope > .mpin, :scope > .mfrac');
    var dls = e.querySelectorAll(':scope > .mdelim');
    if (!body || !dls.length) return;
    [].forEach.call(dls, function (d) { setGlyph(d, d.firstChild, { family: '' }); });
    var fs = fpx(e), y = baselineY(e), ax = y - 0.25 * fs, want;
    if (body.classList.contains('mbinom')) {
      /* a binomial's parentheses have a fixed size: delim1 in display
         style, delim2 elsewhere */
      want = ((body.__st || sty(T)).z === D ? 2.39 : 1.01) * fs;
    } else {
      var ink = inkBox(body);
      want = delimWant(ink ? Math.max(ax - ink.top, ink.bottom - ax) : 0, fs);
    }
    [].forEach.call(dls, function (d) { sizeDelim(d, ax, want, fs); });
  }
  /* A matrix is centred on the axis as a whole, its delimiters with it. */
  function layMatrix(e) {
    var fs = fpx(e), dls = [].slice.call(e.querySelectorAll(':scope > .mdelim'));
    var grid = e.querySelector(':scope > .mgrid');
    if (!grid) return;
    var gh = grid.getBoundingClientRect().height;
    if (!gh) return;
    var sz = delimSize(delimWant(gh / 2, fs) / fs);
    dls.forEach(function (d) { setGlyph(d, d.firstChild, sz); });
    /* raise the box until the middle of the grid is on the axis */
    e.style.verticalAlign = '';
    var r = grid.getBoundingClientRect(), axis = baselineY(e.parentElement) - 0.25 * fs;
    e.style.verticalAlign = em((r.top + r.bottom) / 2 > axis ? (r.top + r.bottom) / 2 - axis : -(axis - (r.top + r.bottom) / 2), fs);
    r = grid.getBoundingClientRect();
    dls.forEach(function (d) { centreGlyph(d, (r.top + r.bottom) / 2, sz.k); });
  }
  /* TeX rule 11: the radical. The rule clears the radicand by ψ, the sign
     is the smallest size that reaches from the rule down past the radicand,
     and an optional index is raised by 60% of the sign's height. */
  function laySqrt(e) {
    var sg = e.querySelector(':scope > .msign'), rd = e.querySelector(':scope > .mrad');
    var ix = e.querySelector(':scope > .mrootidx');
    var row = rd && rd.querySelector(':scope > .mrow'), vin = rd && rd.querySelector(':scope > .mvinc');
    if (!sg || !row || !vin) return;
    if (!rd.getBoundingClientRect().width) return;
    var st = e.__st || sty(T), z = st.z, fs = fpx(e);
    var y = baselineY(rd), ink = inkBox(row);
    var h = ink ? Math.max(0, y - ink.top) : 0, d = ink ? Math.max(0, ink.bottom - y) : 0;
    if (!h) h = sig('xh', z) * fs;
    var th = sig('rule', z) * fs, phi = z === D ? sig('xh', z) * fs : th, clr = th + phi / 4;
    var sz = delimSize((h + d + clr + th) / fs);
    var depth = sz.size * fs - th;
    if (depth > h + d + clr) clr = (clr + depth - h - d) / 2;
    var ruleTop = y - (h + clr + th);
    /* the rule */
    var rr = rd.getBoundingClientRect();
    vin.style.top = em(ruleTop - rr.top, fpx(rd));
    /* the sign: its top joins the rule */
    setGlyph(sg, sg, sz);
    var g = inkBox(sg);
    if (g) {
      var r = sg.getBoundingClientRect(), bc = (r.top + r.bottom) / 2;
      var dy = ruleTop - bc - (g.top - bc) * sz.k;
      sg.style.transformOrigin = 'center center';
      sg.style.transform = 'translateY(' + em(dy, fpx(sg)) + ')' + (sz.k !== 1 ? ' scaleY(' + sz.k.toFixed(4) + ')' : '');
    }
    /* the index: \mkern5mu, raised, \mkern-10mu */
    if (ix) {
      var fi = fpx(ix), H = h + clr + th, Dp = sz.size * fs - H;
      ix.style.top = em(-0.6 * (H - Dp), fi);
      ix.style.marginLeft = em(5 / 18 * fs, fi);
      ix.style.marginRight = em(-10 / 18 * fs, fi);
    }
  }

  /* Accents (TeX rule 12): the accent sits over the nucleus as if over an
     x-height letter, raised by however much taller the nucleus is, and
     shifted right by the letter's skew. Over- and underlines are rules 3θ
     clear of the ink. */
  var ACCENT_GAP = 0.12;   /* where cmr's accents sit above x-height */
  function layAcc(e) {
    var body = e.querySelector(':scope > .maccb');
    var mk = e.querySelector(':scope > .maccm'), rule = e.querySelector(':scope > .maccr');
    if (!body || (!mk && !rule)) return;
    var er = e.getBoundingClientRect();
    if (!er.width) return;
    var st = e.__st || sty(T), z = st.z, fs = fpx(e);
    var y = baselineY(body), ink = inkBox(body);
    var h = ink ? Math.max(0, y - ink.top) : 0, d = ink ? Math.max(0, ink.bottom - y) : 0;
    var th = sig('rule', z) * fs;
    if (rule) {
      var rh = rule.getBoundingClientRect().height;
      rule.style.top = em(rule.classList.contains('maccu') ? y + d + 3 * th - er.top
                                                         : y - h - 3 * th - rh - er.top, fs);
      return;
    }
    var f = fpx(mk);
    mk.style.top = '0'; mk.style.transform = '';
    mk.style.marginLeft = e.__skew ? em(2 * e.__skew * fs, f) : '';
    var g = inkBox(mk);
    if (!g) return;
    var target = y - (Math.max(h, sig('xh', z) * fs) + ACCENT_GAP * fs);
    mk.style.top = em(target - g.bottom, f);
    if (e.classList.contains('macc-widehat')) {
      var w = body.getBoundingClientRect().width, mw = mk.firstChild ? mk.getBoundingClientRect().width : 0;
      var gw = (function () { var rg = document.createRange(); rg.selectNodeContents(mk); return rg.getBoundingClientRect().width; })();
      if (gw && w > gw) mk.style.transform = 'scaleX(' + Math.min(4, w * 0.9 / gw).toFixed(3) + ')';
    }
  }

  /* A face is only fetched once something on the page uses it, so the first
     integral would otherwise be measured with a fallback font. Ask for every
     maths face up front, and measure again whenever one arrives late. */
  if (document.fonts && document.fonts.load) {
    ['"PaperTeX"', '"PaperTeX Math"', '"PaperTeX AMS"', '"PaperTeX Cal"', '"PaperTeX Size1"', '"PaperTeX Size2"'].forEach(function (f) {
      document.fonts.load('16px ' + f, f === '"PaperTeX"' ? 'x∑∫' : 'x∑∫ℝ').catch(function () {});
    });
  }
  var relayout = [];
  function relayoutWhenFontsLoad(container) {
    if (relayout.indexOf(container) < 0) relayout.push(container);
    if (relayout.length > 1) return;
    document.fonts.ready.then(function () {
      var list = relayout; relayout = [];
      list.forEach(function (c) { if (c.isConnected) layout(c); });
    });
  }

  function layout(container) {
    if (!container || !container.isConnected) return;
    (function walk(e) {
      for (var c = e.firstElementChild; c; c = c.nextElementSibling) walk(c);
      var cl = e.classList;
      if (cl.contains('mfrac')) layFrac(e);
      else if (cl.contains('mscr')) layScr(e);
      else if (cl.contains('mbig')) layLimits(e);
      else if (cl.contains('mbigi')) layOpScripts(e);
      else if (cl.contains('mparen')) layParen(e);
      else if (cl.contains('mmat')) layMatrix(e);
      else if (cl.contains('msqrt')) laySqrt(e);
      else if (cl.contains('macc')) layAcc(e);
    })(container);
    if (!fontsSettled()) relayoutWhenFontsLoad(container);
  }

  /* Render a read-only formula: an inline formula, set in text style
     unless `display` is asked for. */
  function renderStatic(target, r, display) {
    target.textContent = '';
    var e = renderRow(r, { cur: null, sel: null, focused: false }, sty(display ? D : T));
    e.classList.add('mroot');
    target.appendChild(e);
    layout(target);
    return e;
  }

  /* ------------------------------------------------------------- LaTeX out */

  function texRow(r, mode) {
    var out = '', i;
    for (i = 0; i < r.k.length; i++) {
      var piece = texNode(r.k[i], mode);
      if (out && /\\[A-Za-z]+$/.test(out) && /^[A-Za-z]/.test(piece)) out += ' ';
      out += piece;
    }
    return out;
  }

  function texNode(n, mode) {
    switch (n.t) {
      case 'ch': return mode === 'text' ? escText(n.c) : n.c;
      case 'sym': return n.tex;
      case 'fn': return '\\' + n.name;
      case 'frac':
        return (n.style === 'binom' ? '\\binom' : '\\frac') + '{' + texRow(n.n) + '}{' + texRow(n.d) + '}';
      case 'scr': {
        var s = '';
        if (n.sub) s += '_{' + texRow(n.sub) + '}';
        if (n.sup) s += '^{' + texRow(n.sup) + '}';
        return s;
      }
      case 'sqrt':
        return '\\sqrt' + (n.idx && !isEmptyRow(n.idx) ? '[' + texRow(n.idx) + ']' : '') + '{' + texRow(n.k) + '}';
      case 'big': {
        var t = n.op;
        /* integrals default to limits beside, everything else to limits
           above and below; say so only when this one differs */
        var deflim = !/int$/.test(n.op);
        if ((!isEmptyRow(n.lo) || !isEmptyRow(n.hi)) && n.limits !== deflim) t += n.limits ? '\\limits' : '\\nolimits';
        if (!isEmptyRow(n.lo)) t += '_{' + texRow(n.lo) + '}';
        if (!isEmptyRow(n.hi)) t += '^{' + texRow(n.hi) + '}';
        return t;
      }
      case 'paren':
        return '\\left' + n.l + ' ' + texRow(n.k) + ' \\right' + n.r;
      case 'acc': {
        var m = { hat: '\\hat', bar: '\\bar', vec: '\\vec', tilde: '\\tilde', dot: '\\dot',
          ddot: '\\ddot', widehat: '\\widehat', overline: '\\overline',
          underline: '\\underline', boldsym: '\\boldsymbol' }[n.kind] || '\\hat';
        return m + '{' + texRow(n.k) + '}';
      }
      case 'txt': return '\\text{' + texRow(n.k, 'text') + '}';
      case 'mat': {
        var body = n.r.map(function (rr) {
          return rr.map(function (c) { return texRow(c); }).join(' & ');
        }).join(' \\\\\n');
        return '\\begin{' + n.env + '}\n' + body + '\n\\end{' + n.env + '}';
      }
      case 'raw': return n.tex;
      case 'ci': return n.s ? '\\' + n.s : '';
      default: return '';
    }
  }

  function escText(c) {
    var map = { '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#', '_': '\\_',
      '{': '\\{', '}': '\\}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}',
      '\\': '\\textbackslash{}' };
    return map[c] || c;
  }

  /* Packages a formula needs, so the preamble can be generated from the doc. */
  function scanRow(r, acc) {
    r.k.forEach(function (n) {
      if (n.t === 'sym' && /\\mathbb/.test(n.tex)) acc.amssymb = true;
      if (n.t === 'sym' && /\\(nexists|checkmark|square|blacksquare|varnothing|therefore|because)/.test(n.tex)) acc.amssymb = true;
      if (n.t === 'acc' && n.kind === 'boldsym') acc.amsbsy = true;
      if (n.t === 'mat') acc.amsmath = true;
      if (n.t === 'frac' && n.style === 'binom') acc.amsmath = true;
      slots(n).forEach(function (s) { scanRow(s, acc); });
    });
    return acc;
  }

  /* -------------------------------------------------------------- LaTeX in */
  /* Only used by the "paste LaTeX" escape hatch — authoring never needs it. */

  /* other spellings of commands the symbol tables already know */
  var TEX_ALIAS = { le: 'leq', ge: 'geq', ne: 'neq', dots: 'ldots', lnot: 'neg', land: 'wedge',
    lor: 'vee', owns: 'ni', dag: 'dagger', lbrace: '{', rbrace: '}' };
  /* and a few the tables leave out, as [glyph, class] */
  var TEX_EXTRA = {
    implies: ['⟹', 'rel'], impliedby: ['⟸', 'rel'], iff: ['⟺', 'rel'],
    Longrightarrow: ['⟹', 'rel'], Longleftarrow: ['⟸', 'rel'], Longleftrightarrow: ['⟺', 'rel'],
    longleftrightarrow: ['⟷', 'rel'], leftarrow: ['←', 'rel'], rightarrow: ['→', 'rel'],
    prec: ['≺', 'rel'], succ: ['≻', 'rel'], preceq: ['⪯', 'rel'], succeq: ['⪰', 'rel'],
    colon: [':', 'punct'], vert: ['|', 'upr'], lvert: ['|', 'upr'], rvert: ['|', 'upr'],
    Vert: ['‖', 'upr'], lVert: ['‖', 'upr'], rVert: ['‖', 'upr'],
    Re: ['ℜ', 'upr'], Im: ['ℑ', 'upr'], S: ['§', 'upr'], P: ['¶', 'upr'], ddagger: ['‡', 'bin'],
    cdotp: ['·', 'punct'], ldotp: ['.', 'punct'], bmod: ['mod', 'bin'], mod: ['mod', 'bin']
  };

  function parseTex(src) {
    var i = 0, s = String(src);
    function ws() { while (i < s.length && /\s/.test(s[i])) i++; }
    function group() {
      ws();
      if (s[i] === '{') { i++; var r = seq('}'); if (s[i] === '}') i++; return r; }
      if (i >= s.length) return row();
      var one = atom();
      return row(one ? [one] : []);
    }
    function cmdName() {
      var m = /^[A-Za-z]+/.exec(s.slice(i));
      if (m) { i += m[0].length; return m[0]; }
      var c = s[i]; i++; return c;
    }
    function atom() {
      ws();
      if (i >= s.length) return null;
      var c = s[i];
      if (c === '\\') {
        i++;
        var name = cmdName();
        return command(name);
      }
      if (c === '{') { i++; var inner = seq('}'); if (s[i] === '}') i++; return { t: 'paren', l: '.', r: '.', k: inner }; }
      i++;
      return ch(c);
    }
    function command(name) {
      var it;
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac') return frac(group(), group());
      if (name === 'binom') return frac(group(), group(), 'binom');
      if (name === 'sqrt') {
        ws();
        var idx = null;
        if (s[i] === '[') { i++; idx = seq(']'); if (s[i] === ']') i++; }
        return sqrtn(group(), idx);
      }
      if (name === 'text' || name === 'textrm' || name === 'mathrm') return txt(group());
      if (ACC.hasOwnProperty(name) || name === 'boldsymbol') {
        return acc(name === 'boldsymbol' ? 'boldsym' : name, group());
      }
      if (name === 'left') {
        ws();
        var l = readDelim();
        var body = seqUntilRight();
        var r2 = readDelim();
        return paren(l, r2, body);
      }
      if (name === 'begin') {
        ws();
        var env = '';
        if (s[i] === '{') { i++; while (i < s.length && s[i] !== '}') env += s[i++]; i++; }
        return environment(env);
      }
      if (/^(sum|prod|int|iint|iiint|oint|bigcup|bigcap|bigoplus|bigotimes|coprod)$/.test(name)) {
        var glyph = { sum: '∑', prod: '∏', int: '∫', iint: '∬', iiint: '∭', oint: '∮',
          bigcup: '⋃', bigcap: '⋂', bigoplus: '⨁', bigotimes: '⨂', coprod: '∐' }[name];
        return big('\\' + name, glyph, !/int/.test(name));
      }
      if (name === 'lim') return big('\\lim', 'lim', true);
      if (name === 'mathbb' || name === 'mathcal' || name === 'mathfrak') {
        var g = group();
        var letter = g.k.length && g.k[0].t === 'ch' ? g.k[0].c : 'X';
        var full = '\\' + name + '{' + letter + '}';
        it = PT.symbols.byCmd[name];
        var face = name === 'mathbb' ? 'bb' : (name === 'mathcal' ? 'cal' : null);
        return sym(full, letter, 'upr', face);

      }
      if (name === 'limits' || name === 'nolimits') return { t: 'limits', on: name === 'limits' };
      /* style switches have no node of their own; the context decides */
      if (/^(displaystyle|textstyle|scriptstyle|scriptscriptstyle|left|right|middle|big|Big|bigg|Bigg)[lrm]?$/.test(name) &&
          name !== 'left') return { t: 'skip' };
      if (TEX_ALIAS[name]) name = TEX_ALIAS[name];
      it = PT.symbols.byCmd[name];
      if (it) return sym(it.tex, it.d, it.cls, it.f);
      if (TEX_EXTRA[name]) return sym('\\' + name, TEX_EXTRA[name][0], TEX_EXTRA[name][1]);
      if (DELIM['\\' + name]) return sym('\\' + name, DELIM['\\' + name], 'upr');
      if (name === '\\') return { t: 'nl' };
      if (name === ',' || name === ';' || name === ':' || name === '!' || name === 'quad' || name === 'qquad')
        return sym('\\' + name, ' ', 'spc');
      return sym('\\' + name, name, 'fn');
    }
    function readDelim() {
      ws();
      if (s[i] === '\\') {
        i++;
        var n = cmdName();
        return '\\' + n;
      }
      var c = s[i]; i++;
      return c || '.';
    }
    function environment(env) {
      var rows = [[row()]], cur = rows[0][0];
      var endTag = '\\end{' + env + '}';
      while (i < s.length) {
        ws();
        if (s.slice(i, i + endTag.length) === endTag) { i += endTag.length; break; }
        if (s[i] === '&') { i++; var nr = row(); rows[rows.length - 1].push(nr); cur = nr; continue; }
        if (s.slice(i, i + 2) === '\\\\') { i += 2; var line = [row()]; rows.push(line); cur = line[0]; continue; }
        if (s[i] === '^') { i++; pushAtom(cur, { t: 'scrmark', kind: 'sup', k: group() }); continue; }
        if (s[i] === '_') { i++; pushAtom(cur, { t: 'scrmark', kind: 'sub', k: group() }); continue; }
        var a = atom();
        if (!a) break;
        if (a.t === 'nl') { var l2 = [row()]; rows.push(l2); cur = l2[0]; continue; }
        pushAtom(cur, a);
      }
      var w = Math.max.apply(null, rows.map(function (r) { return r.length; }));
      rows.forEach(function (r) { while (r.length < w) r.push(row()); });
      return { t: 'mat', env: /matrix|cases/.test(env) ? env : 'matrix', r: rows };
    }
    function pushAtom(r, a) {
      if (a.t === 'skip') return;
      if (a.t === 'limits') {
        var op = r.k[r.k.length - 1];
        if (op && op.t === 'big') op.limits = a.on;
        return;
      }
      if (a.t === 'scrmark') {
        var last = r.k[r.k.length - 1];
        /* _ and ^ after a big operator are its limits, not a following script */
        if (last && last.t === 'big') {
          if (a.kind === 'sub' && isEmptyRow(last.lo)) { last.lo = a.k; return; }
          if (a.kind === 'sup' && isEmptyRow(last.hi)) { last.hi = a.k; return; }
        }
        if (last && last.t === 'scr' && !last[a.kind]) { last[a.kind] = a.k; return; }
        var sc = scr(a.kind === 'sub' ? a.k : null, a.kind === 'sup' ? a.k : null);
        r.k.push(sc); return;
      }
      r.k.push(a);
    }
    function seq(stop) {
      var r = row();
      while (i < s.length) {
        ws();
        if (stop && s[i] === stop) break;
        if (s.slice(i, i + 6) === '\\right') break;
        if (s[i] === '&' || s.slice(i, i + 2) === '\\\\') break;
        if (s[i] === '^') { i++; pushAtom(r, { t: 'scrmark', kind: 'sup', k: group() }); continue; }
        if (s[i] === '_') { i++; pushAtom(r, { t: 'scrmark', kind: 'sub', k: group() }); continue; }
        var a = atom();
        if (!a) break;
        pushAtom(r, a);
      }
      return r;
    }
    function seqUntilRight() {
      var r = seq(null);
      if (s.slice(i, i + 6) === '\\right') i += 6;
      return r;
    }
    var out = seq(null);
    return out;
  }

  /* ------------------------------------------------------------- the editor */

  var BUILDS = {
    frac: function () { return frac(); },
    deriv: function () { var f = frac(); f.n.k = [ch('d')]; f.d.k = [ch('d'), ch('x')]; return f; },
    pderiv: function () { var f = frac(); f.n.k = [sym('\\partial', '∂', 'var')]; f.d.k = [sym('\\partial', '∂', 'var'), ch('x')]; return f; },
    binom: function () { return frac(null, null, 'binom'); },
    sup: function () { return scr(null, row()); },
    sub: function () { return scr(row(), null); },
    subsup: function () { return scr(row(), row()); },
    sqrt: function () { return sqrtn(); },
    nthroot: function () { return sqrtn(row(), row()); },
    paren: function () { return paren('(', ')'); },
    brack: function () { return paren('[', ']'); },
    brace: function () { return paren('\\{', '\\}'); },
    abs: function () { return paren('|', '|'); },
    norm: function () { return paren('\\|', '\\|'); },
    angle: function () { return paren('\\langle', '\\rangle'); },
    sum: function () { return big('\\sum', '∑', true); },
    prod: function () { return big('\\prod', '∏', true); },
    int: function () { return big('\\int', '∫', false); },
    iint: function () { return big('\\iint', '∬', false); },
    oint: function () { return big('\\oint', '∮', false); },
    lim: function () { var b = big('\\lim', 'lim', true); b.hi = row(); return b; },
    bigcup: function () { return big('\\bigcup', '⋃', true); },
    bigcap: function () { return big('\\bigcap', '⋂', true); },
    matrix2: function () { return mat('pmatrix', 2, 2); },
    matrix3: function () { return mat('pmatrix', 3, 3); },
    cases: function () { return mat('cases', 2, 2); },
    text: function () { return txt(); },
    hat: function () { return acc('hat'); },
    bar: function () { return acc('bar'); },
    vec: function () { return acc('vec'); },
    tilde: function () { return acc('tilde'); },
    dot: function () { return acc('dot'); },
    ddot: function () { return acc('ddot'); },
    widehat: function () { return acc('widehat'); },
    overline: function () { return acc('overline'); },
    underline: function () { return acc('underline'); },
    boldsym: function () { return acc('boldsym'); }
  };

  var OPEN = { '(': ')', '[': ']', '{': '\\}' };

  /* ---- typing a name turns it into the thing it names -------------------
     "int" becomes an integral, "sum" a sigma with limits, "alpha" an α,
     "sin" an upright function name. A word fires the moment it can no
     longer grow into a longer name ("sum" at once, "sin" once you type the
     next character, because "sinh" exists). Backspace right after undoes it. */
  var AUTO = {}, PREFIX = {};
  var autoOff = false;

  function autoAdd(word, spec) { if (!AUTO[word]) AUTO[word] = spec; }
  (function buildAuto() {
    var S = PT.symbols;
    Object.keys(S.buildCmds).forEach(function (w) {
      if (w.length > 1 && w !== 'left') autoAdd(w, { b: S.buildCmds[w] });
    });
    Object.keys(S.byCmd).forEach(function (w) {
      if (w.length < 2) return;
      var it = S.byCmd[w];
      if (/^(sin|cos|tan|csc|sec|cot|arcsin|arccos|arctan|sinh|cosh|tanh|log|ln|exp|min|max|det|dim|ker|gcd|arg|deg|Pr|bmod)$/.test(w))
        autoAdd(w, { fn: w });
      else autoAdd(w, { s: it });
    });
    /* what people actually type */
    var inftyItem = S.byCmd.infty || { tex: '\\infty', d: '∞', cls: 'upr' };
    ['inf', 'infty', 'infinity'].forEach(function (w) { AUTO[w] = { s: inftyItem }; });
    if (S.byCmd.to) AUTO.to = { s: S.byCmd.to };
    ['sqrt', 'int', 'sum', 'lim', 'prod'].forEach(function (w) {
      if (S.buildCmds[w]) AUTO[w] = { b: S.buildCmds[w] };
    });
    Object.keys(AUTO).forEach(function (w) {
      for (var i = 1; i < w.length; i++) PREFIX[w.slice(0, i)] = true;
    });
  })();

  /* two-character operators typed the obvious way */
  var COMBOS = {
    '-:>': ['\\to', '→', 'rel'],
    '=:>': ['\\Rightarrow', '⇒', 'rel'],
    '<:=': ['\\leq', '≤', 'rel'],
    '>:=': ['\\geq', '≥', 'rel'],
    '!:=': ['\\neq', '≠', 'rel'],
    '+:-': ['\\pm', '±', 'bin'],
    '~:=': ['\\approx', '≈', 'rel']
  };

  function MathField(host, opts) {
    this.host = host;
    this.opts = opts || {};
    this.root = this.opts.root || row();
    this.cur = { row: this.root, i: this.root.k.length };
    this.sel = null;
    this.focused = false;
    this.autoUndo = null;
    this.host.classList.add('mfield');
    this.host.tabIndex = 0;
    this.host.__mf = this;
    var self = this;
    this.host.addEventListener('mousedown', function (e) { self.onMouse(e); });
    this.host.addEventListener('keydown', function (e) { self.onKey(e); });
    this.host.addEventListener('focus', function () { self.focused = true; self.render(); if (self.opts.onFocus) self.opts.onFocus(self); });
    this.host.addEventListener('blur', function () {
      self.autoWord(true);
      self.resolveCI(true);
      self.focused = false; self.sel = null; self.render();
      if (self.opts.onBlur) self.opts.onBlur(self);
    });
    this.host.addEventListener('paste', function (e) {
      var t = (e.clipboardData || window.clipboardData).getData('text');
      if (!t) return;
      e.preventDefault();
      var r = parseTex(t.replace(/^\$+|\$+$/g, ''));
      self.insertNodes(r.k);
    });
    this.render();
  }

  MathField.prototype.setRoot = function (r) {
    this.root = r;
    this.cur = { row: r, i: r.k.length };
    this.sel = null;
    this.render();
  };
  MathField.prototype.tex = function () { return texRow(this.root); };
  MathField.prototype.render = function () {
    reparent(this.root);
    this.host.textContent = '';
    var e = renderRow(this.root, { cur: this.cur, sel: this.sel, focused: this.focused },
      sty(this.opts.inline ? T : D));
    e.classList.add('mroot');
    this.host.appendChild(e);
    layout(this.host);
    if (this.opts.onRender) this.opts.onRender(this);
  };
  MathField.prototype.changed = function () {
    this.render();
    if (this.opts.onChange) this.opts.onChange(this);
  };

  MathField.prototype.onMouse = function (e) {
    var self = this;
    this.host.focus();
    var atom = e.target.closest ? e.target.closest('.matom') : null;
    if (atom && this.host.contains(atom)) {
      var rowEl = atom.parentElement;
      while (rowEl && !rowEl.__row) rowEl = rowEl.parentElement;
      if (rowEl) {
        var r = rowEl.__row;
        var idx = parseInt(atom.dataset.mi, 10);
        if (atom.classList.contains('mph')) idx = 0;
        else {
          var rc = atom.getBoundingClientRect();
          if (e.clientX > rc.left + rc.width / 2) idx += 1;
        }
        this.sel = null;
        this.cur = { row: r, i: idx };
        e.preventDefault();
        this.render();
        return;
      }
    }
    /* clicked padding: go to the nearest end of the root row */
    var hr = this.host.getBoundingClientRect();
    this.sel = null;
    this.cur = { row: this.root, i: e.clientX < hr.left + hr.width / 2 ? 0 : this.root.k.length };
    e.preventDefault();
    this.render();
    void self;
  };

  /* ---- caret motion */
  MathField.prototype.parentOf = function (r) { return ownerOf.get(r) || null; };

  MathField.prototype.left = function () {
    var c = this.cur;
    if (c.i > 0) {
      var prev = c.row.k[c.i - 1];
      var sl = slots(prev);
      if (sl.length) { var last = sl[sl.length - 1]; this.cur = { row: last, i: last.k.length }; return; }
      this.cur = { row: c.row, i: c.i - 1 };
      return;
    }
    var p = this.parentOf(c.row);
    if (!p) return;
    var sl2 = slots(p.node);
    if (p.slot > 0) { var pr = sl2[p.slot - 1]; this.cur = { row: pr, i: pr.k.length }; return; }
    var outer = rowOf.get(p.node);
    if (outer) this.cur = { row: outer, i: outer.k.indexOf(p.node) };
  };
  MathField.prototype.right = function () {
    var c = this.cur;
    if (c.i < c.row.k.length) {
      var nx = c.row.k[c.i];
      var sl = slots(nx);
      if (sl.length) { this.cur = { row: sl[0], i: 0 }; return; }
      this.cur = { row: c.row, i: c.i + 1 };
      return;
    }
    var p = this.parentOf(c.row);
    if (!p) return;
    var sl2 = slots(p.node);
    if (p.slot < sl2.length - 1) { this.cur = { row: sl2[p.slot + 1], i: 0 }; return; }
    var outer = rowOf.get(p.node);
    if (outer) this.cur = { row: outer, i: outer.k.indexOf(p.node) + 1 };
  };
  /* ↑ and ↓ move to what is drawn above or below the caret.
     On the line, that is the part of the neighbouring construct: ↑ into an
     exponent, an upper limit, a numerator; ↓ into an index, a lower limit, a
     denominator. Inside a construct, its other part — numerator and
     denominator, the two limits, superscript and subscript — or, from a
     lone exponent or index, back down or up to the line. Failing all that,
     the same question one level further out. The caret keeps its place
     across the page rather than its index in the row. Returns false when
     there is nothing in that direction, so the field can be left. */
  MathField.prototype.vert = function (dir) {
    var x = this.caretX(), t = this.vertTarget(dir);
    if (!t) return false;
    this.cur = { row: t.row, i: t.i != null ? t.i : 0 };
    if (t.i == null && x != null) this.placeByX(x);
    return true;
  };
  MathField.prototype.vertTarget = function (dir) {
    var c = this.cur, t;
    function into(n) {
      if (!n) return null;
      if (n.t === 'scr') return dir < 0 ? n.sup : n.sub;
      if (n.t === 'big') return dir < 0 ? n.hi : n.lo;
      if (n.t === 'frac') return dir < 0 ? n.n : n.d;
      return null;
    }
    /* the construct just before the caret, then the one just after */
    if ((t = into(c.row.k[c.i - 1]))) return { row: t, i: t.k.length };
    if ((t = into(c.row.k[c.i]))) return { row: t, i: 0 };
    var r = c.row;
    while (r) {
      var p = this.parentOf(r);
      if (!p) return null;
      var n = p.node, outer = rowOf.get(n);
      if (n.t === 'frac') {
        if (dir < 0 && r === n.d) return { row: n.n };
        if (dir > 0 && r === n.n) return { row: n.d };
      } else if (n.t === 'big') {
        if (dir < 0 && r === n.lo) return { row: n.hi };
        if (dir > 0 && r === n.hi) return { row: n.lo };
      } else if (n.t === 'scr') {
        if (dir > 0 && r === n.sup) return n.sub ? { row: n.sub } : (outer ? { row: outer, i: outer.k.indexOf(n) + 1 } : null);
        if (dir < 0 && r === n.sub) return n.sup ? { row: n.sup } : (outer ? { row: outer, i: outer.k.indexOf(n) + 1 } : null);
      } else if (n.t === 'mat') {
        var cols = n.r[0].length, ri = Math.floor(p.slot / cols), cidx = p.slot % cols;
        var nri = ri + (dir < 0 ? -1 : 1);
        if (nri >= 0 && nri < n.r.length) return { row: n.r[nri][cidx] };
      }
      r = outer || null;
    }
    return null;
  };
  MathField.prototype.caretX = function () {
    var c = this.host.querySelector('.mcaret');
    return c ? c.getBoundingClientRect().left : null;
  };
  /* put the caret at the gap in its row nearest to x (client px) */
  MathField.prototype.placeByX = function (x) {
    var r = this.cur.row, rowEl = null;
    [].some.call(this.host.querySelectorAll('.mrow'), function (e) { if (e.__row === r) { rowEl = e; return true; } return false; });
    if (!rowEl || !r.k.length) return;
    var atoms = [].filter.call(rowEl.children, function (a) {
      return a.classList.contains('matom') && !a.classList.contains('mph');
    });
    if (atoms.length !== r.k.length) return;
    var best = 0, bd = Infinity;
    for (var j = 0; j <= atoms.length; j++) {
      var px = j < atoms.length ? atoms[j].getBoundingClientRect().left : atoms[j - 1].getBoundingClientRect().right;
      var d = Math.abs(px - x);
      if (d < bd) { bd = d; best = j; }
    }
    this.cur = { row: r, i: best };
  };

  /* Enter and Space: "done with this part". On to the next part of the
     construct — lower limit to upper limit, numerator to denominator, index
     to exponent — and after the last part, out to just behind the whole
     construct. An operator whose lower limit was left empty is taken to
     want no limits: from there it goes straight out. False on the
     outermost line, where there is nothing to finish. */
  MathField.prototype.advance = function () {
    var p = this.parentOf(this.cur.row);
    if (!p) return false;
    var n = p.node, sl = slots(n);
    var noLimits = n.t === 'big' && p.slot === 0 && isEmptyRow(n.lo) && isEmptyRow(n.hi);
    if (!noLimits && p.slot < sl.length - 1) { this.cur = { row: sl[p.slot + 1], i: 0 }; return true; }
    return this.outOf();
  };

  /* Tab through the slots of the construct you are in: lower limit to upper
     limit, numerator to denominator, cell to cell. */
  MathField.prototype.nextSlot = function (back) {
    var p = this.parentOf(this.cur.row);
    if (!p) return false;
    var sl = slots(p.node);
    var t = p.slot + (back ? -1 : 1);
    if (t < 0 || t >= sl.length) return false;
    this.cur = { row: sl[t], i: back ? sl[t].k.length : 0 };
    return true;
  };

  MathField.prototype.outOf = function () {
    /* space: escape the current slot to just after its owner */
    var p = this.parentOf(this.cur.row);
    if (!p) return false;
    var outer = rowOf.get(p.node);
    if (!outer) return false;
    this.cur = { row: outer, i: outer.k.indexOf(p.node) + 1 };
    return true;
  };

  /* ---- editing */
  MathField.prototype.insertNode = function (n, silent) {
    this.deleteSel();
    var c = this.cur;
    c.row.k.splice(c.i, 0, n);
    reparent(this.root);
    var sl = slots(n);
    if (sl.length) this.cur = { row: sl[0], i: 0 };
    else this.cur = { row: c.row, i: c.i + 1 };
    if (!silent) this.changed();
  };

  /* Insert a run of nodes (pasted or from a snippet) as one piece. The caret
     goes to the first empty slot inside them — so \frac{}{} or x^{} act as
     templates — or else just after them. */
  MathField.prototype.insertNodes = function (nodes) {
    if (!nodes || !nodes.length) return;
    this.deleteSel();
    var c = this.cur;
    Array.prototype.splice.apply(c.row.k, [c.i, 0].concat(nodes));
    reparent(this.root);
    var hole = firstEmptySlot(nodes);
    this.cur = hole ? { row: hole, i: 0 } : { row: c.row, i: c.i + nodes.length };
    this.changed();
  };
  function firstEmptySlot(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      var sl = slots(nodes[i]);
      for (var j = 0; j < sl.length; j++) {
        if (isEmptyRow(sl[j])) return sl[j];
        var deeper = firstEmptySlot(sl[j].k);
        if (deeper) return deeper;
      }
    }
    return null;
  }

  MathField.prototype.insertBuild = function (name) {
    var f = BUILDS[name];
    if (!f) return;
    var n = f();
    /* wrap the selection or the trailing operand where it makes sense */
    var grab = null;
    if (n.t === 'frac' && n.style !== 'binom') {
      grab = this.takeOperand();
      if (grab.length) { n.n.k = grab; this.insertAt(n); this.cur = { row: n.d, i: 0 }; this.changed(); return; }
    } else if (n.t === 'sqrt' || n.t === 'acc' || n.t === 'paren') {
      grab = this.takeSelection();
      if (grab.length) {
        var slot = n.t === 'paren' ? n.k : (n.t === 'sqrt' ? n.k : n.k);
        slot.k = grab;
        this.insertAt(n);
        this.cur = { row: slot, i: slot.k.length };
        this.changed(); return;
      }
    }
    this.insertNode(n);
  };
  MathField.prototype.insertAt = function (n) {
    this.cur.row.k.splice(this.cur.i, 0, n);
    reparent(this.root);
  };
  MathField.prototype.takeSelection = function () {
    if (!this.sel || this.sel.row !== this.cur.row) return [];
    var a = Math.min(this.sel.a, this.sel.b), b = Math.max(this.sel.a, this.sel.b);
    var got = this.cur.row.k.splice(a, b - a);
    this.cur = { row: this.cur.row, i: a };
    this.sel = null;
    return got;
  };
  /* what "/" should pull into the numerator: the trailing operand */
  MathField.prototype.takeOperand = function () {
    var selGot = this.takeSelection();
    if (selGot.length) return selGot;
    var r = this.cur.row, i = this.cur.i, j = i;
    while (j > 0) {
      var n = r.k[j - 1];
      if (n.t === 'ch' && (n.cls === 'bin' || n.cls === 'rel' || n.cls === 'punct')) break;
      if (n.t === 'sym' && (n.cls === 'bin' || n.cls === 'rel' || n.cls === 'spc')) break;
      if (n.t === 'big') break;
      j--;
    }
    if (j === i) return [];
    var got = r.k.splice(j, i - j);
    this.cur = { row: r, i: j };
    return got;
  };
  MathField.prototype.deleteSel = function () {
    if (!this.sel) return false;
    this.takeSelection();
    return true;
  };

  MathField.prototype.backspace = function () {
    if (this.deleteSel()) { this.changed(); return; }
    var c = this.cur;
    if (c.i > 0) {
      var prev = c.row.k[c.i - 1];
      if (prev.t === 'ci') {
        if (prev.s.length) { prev.s = prev.s.slice(0, -1); this.changed(); return; }
        c.row.k.splice(c.i - 1, 1); this.cur = { row: c.row, i: c.i - 1 }; this.changed(); return;
      }
      var sl = slots(prev);
      if (sl.length) {
        var allEmpty = sl.every(isEmptyRow);
        if (allEmpty) { c.row.k.splice(c.i - 1, 1); this.cur = { row: c.row, i: c.i - 1 }; }
        else { var last = sl[sl.length - 1]; this.cur = { row: last, i: last.k.length }; }
        this.changed(); return;
      }
      c.row.k.splice(c.i - 1, 1);
      this.cur = { row: c.row, i: c.i - 1 };
      this.changed(); return;
    }
    /* at the start of a slot: dissolve the owner, keeping its contents */
    var p = this.parentOf(c.row);
    if (!p) return;
    var n = p.node, outer = rowOf.get(n);
    if (!outer) return;
    var at = outer.k.indexOf(n);
    var contents = [];
    slots(n).forEach(function (s) { contents = contents.concat(s.k); });
    outer.k.splice(at, 1);
    contents.forEach(function (x, k) { outer.k.splice(at + k, 0, x); });
    this.cur = { row: outer, i: at };
    this.changed();
  };

  MathField.prototype.del = function () {
    if (this.deleteSel()) { this.changed(); return; }
    var c = this.cur;
    if (c.i < c.row.k.length) {
      var n = c.row.k[c.i];
      if (slots(n).length && !slots(n).every(isEmptyRow)) { this.right(); this.render(); return; }
      c.row.k.splice(c.i, 1);
      this.changed();
    }
  };

  /* ---- "\command" entry */
  MathField.prototype.activeCI = function () {
    var c = this.cur;
    var prev = c.row.k[c.i - 1];
    return prev && prev.t === 'ci' ? prev : null;
  };
  MathField.prototype.resolveCI = function (silent) {
    var node = this.activeCI();
    if (!node) return false;
    var name = node.s;
    var c = this.cur;
    var at = c.row.k.indexOf(node);
    c.row.k.splice(at, 1);
    this.cur = { row: c.row, i: at };
    if (!name) { if (!silent) this.changed(); else this.render(); return true; }
    var bld = PT.symbols.buildCmds[name];
    if (bld) { this.insertBuild(bld); return true; }
    var it = PT.symbols.byCmd[name];
    if (it) { this.insertNode(sym(it.tex, it.d, it.cls, it.f)); return true; }
    if (/^(sin|cos|tan|log|ln|exp|min|max|det|dim|ker|arg|sup|inf|gcd)$/.test(name)) {
      this.insertNode(fnode(name)); return true;
    }
    this.insertNode(raw('\\' + name));
    return true;
  };

  MathField.prototype.onKey = function (e) {
    var k = e.key;
    var ciNode = this.activeCI();
    if (k === 'Backspace' && this.undoAuto()) { e.preventDefault(); return; }
    if (k !== 'Backspace') this.autoUndo = null;
    if (k === ' ' || /^(Arrow|Home|End|Enter|Tab)/.test(k)) this.autoWord(true);

    if (k === 'Escape') {
      if (ciNode) { var at = this.cur.row.k.indexOf(ciNode); this.cur.row.k.splice(at, 1); this.cur.i = at; this.changed(); }
      else if (this.opts.onEscape) this.opts.onEscape(this);
      e.preventDefault(); return;
    }
    if (ciNode) {
      if (/^[A-Za-z]$/.test(k)) { ciNode.s += k; e.preventDefault(); this.changed(); return; }
      if (k === 'Enter' || k === ' ' || k === 'Tab') { this.resolveCI(); e.preventDefault(); return; }
      if (k === 'Backspace') { this.backspace(); e.preventDefault(); return; }
      if (k.length === 1) { this.resolveCI(); }
    }

    /* AltGr arrives as Ctrl+Alt on Windows, and it is how \ { } [ ] | are
       typed on Turkish, German and many other layouts: that is typing, not
       a shortcut. */
    var altGr = (e.getModifierState && e.getModifierState('AltGraph')) || (e.ctrlKey && e.altKey && k.length === 1);
    if ((e.ctrlKey || e.metaKey) && !altGr) {
      if (k === 'a') { this.sel = { row: this.root, a: 0, b: this.root.k.length }; this.cur = { row: this.root, i: this.root.k.length }; e.preventDefault(); this.render(); return; }
      return; /* let copy/paste/undo bubble */
    }

    switch (k) {
      case 'ArrowLeft':
        if (e.shiftKey) this.extendSel(-1); else { this.sel = null; this.left(); }
        e.preventDefault(); this.render(); return;
      case 'ArrowRight':
        if (e.shiftKey) this.extendSel(1); else { this.sel = null; this.right(); }
        e.preventDefault(); this.render(); return;
      case 'ArrowUp':
        if (!this.vert(-1) && this.opts.onLeave) { this.opts.onLeave(this, 'up'); }
        e.preventDefault(); this.render(); return;
      case 'ArrowDown':
        if (!this.vert(1) && this.opts.onLeave) { this.opts.onLeave(this, 'down'); }
        e.preventDefault(); this.render(); return;
      case 'Home': this.cur = { row: this.cur.row, i: 0 }; e.preventDefault(); this.render(); return;
      case 'End': this.cur = { row: this.cur.row, i: this.cur.row.k.length }; e.preventDefault(); this.render(); return;
      case 'Backspace': this.backspace(); e.preventDefault(); return;
      case 'Delete': this.del(); e.preventDefault(); return;
      case 'Enter':
        /* inside a construct: on to its next part; on the line itself the
           field decides (a new equation line, closing the inline editor).
           Shift+Enter always goes to the field. */
        if (!e.shiftKey && this.advance()) { e.preventDefault(); this.render(); return; }
        if (this.opts.onEnter) { this.opts.onEnter(this, e); e.preventDefault(); }
        return;
      case 'Tab':
        if (this.opts.onTab) { this.opts.onTab(this, e); e.preventDefault(); return; }
        if (!this.nextSlot(e.shiftKey)) {
          if (e.shiftKey) this.left();
          else if (!this.outOf() && this.opts.onLeave) this.opts.onLeave(this, 'next');
        }
        e.preventDefault(); this.render(); return;
      case ' ':
        /* Space means "done with this bit", never a literal space — otherwise
           ordinary typing litters the output with \; spacers. Shift+Space is
           there when a real thin space is wanted. */
        if (e.shiftKey) this.insertNode(sym('\\,', ' ', 'spc'));
        else { this.advance(); this.render(); }
        e.preventDefault(); return;
    }

    /* A dead key — ^ on Turkish and many European layouts — never reaches
       typeChar as a character. In a formula it can only mean a superscript. */
    if (k === 'Dead') { e.preventDefault(); this.typeChar('^'); return; }

    if (k.length !== 1) return;
    e.preventDefault();
    this.typeChar(k);
  };

  MathField.prototype.extendSel = function (dir) {
    var c = this.cur;
    if (!this.sel || this.sel.row !== c.row) this.sel = { row: c.row, a: c.i, b: c.i };
    var b = this.sel.b + dir;
    if (b < 0 || b > c.row.k.length) return;
    this.sel.b = b;
    this.cur = { row: c.row, i: b };
    if (this.sel.a === this.sel.b) this.sel = null;
  };

  /* Collect the letters immediately before the caret and, if they name
     something, replace them with it. `flush` converts even a word that
     could still have grown. */
  MathField.prototype.autoWord = function (flush) {
    if (autoOff) return false;
    var r = this.cur.row, i = this.cur.i, j = i;
    while (j > 0 && r.k[j - 1].t === 'ch' && /[A-Za-z]/.test(r.k[j - 1].c)) j--;
    if (j === i) return false;
    var w = '', z;
    for (z = j; z < i; z++) w += r.k[z].c;
    var hit = AUTO[w];
    if (!hit) return false;
    if (!flush && PREFIX[w]) return false;

    var before = r.k.slice(), self = this;
    r.k.splice(j, i - j);
    this.cur = { row: r, i: j };
    reparent(this.root);
    if (hit.b) this.insertBuild(hit.b);
    else if (hit.fn) this.insertNode(fnode(hit.fn));
    else this.insertNode(sym(hit.s.tex, hit.s.d, hit.s.cls, hit.s.f));
    this.autoUndo = { fn: function () { r.k = before; self.cur = { row: r, i: i }; } };
    return true;
  };

  /* A digit straight after a variable is almost always an index: x1 means
     x-sub-one. Inside a subscript it is left alone, because there a digit
     after a letter usually continues the index already being written —
     x_n followed by 1 means x_{n1}, not x_{n_1}. */
  MathField.prototype.autoSubscript = function (c) {
    if (autoOff) return false;
    var r = this.cur.row, i = this.cur.i, self = this;
    var p = this.parentOf(r);
    if (p && p.node.t === 'scr' && p.node.sub === r) return false;
    var prev = r.k[i - 1];
    if (!prev) return false;
    if (!((prev.t === 'ch' && prev.cls === 'var') || (prev.t === 'sym' && prev.cls === 'var'))) return false;

    /* The caret goes into the index, so the next digits visibly join it.
       The index is "soft": anything but a digit steps back out to the line
       first (see typeChar), so x1+x2 and x1, x2 need no extra keys. */
    var node = scr(row([ch(c)]), null);
    r.k.splice(i, 0, node);
    reparent(this.root);
    this.cur = { row: node.sub, i: 1 };
    this.soft = node.sub;
    this.autoUndo = { fn: function () {
      var at = r.k.indexOf(node);
      r.k.splice(at, 1, ch(c));
      self.cur = { row: r, i: at + 1 };
      self.soft = null;
    } };
    this.changed();
    return true;
  };

  /* Backspace straight after a conversion puts the plain characters back. */
  MathField.prototype.undoAuto = function () {
    var u = this.autoUndo;
    if (!u) return false;
    this.autoUndo = null;
    u.fn();
    reparent(this.root);
    this.changed();
    return true;
  };

  MathField.prototype.combine = function (c) {
    var r = this.cur.row, prev = r.k[this.cur.i - 1];
    if (!prev || prev.t !== 'ch') return false;
    var spec = COMBOS[prev.c + ':' + c];
    if (!spec) return false;
    r.k.splice(this.cur.i - 1, 1);
    this.cur = { row: r, i: this.cur.i - 1 };
    this.insertNode(sym(spec[0], spec[1], spec[2]));
    return true;
  };

  MathField.prototype.typeChar = function (c) {
    var inText = false, p = this.parentOf(this.cur.row);
    if (p && p.node.t === 'txt') inText = true;

    if (inText) { this.insertNode(ch(c, 'txtc')); return; }

    /* in a soft index (made by typing x1), at its end: digits join it, ^
       puts an exponent on the same letter, _ makes it an ordinary index to
       keep typing in, and anything else first steps back out to the line */
    var soft = this.soft;
    this.soft = null;
    if (soft && this.cur.row === soft && this.cur.i === soft.k.length && !/[0-9]/.test(c)) {
      if (c === '_') return;
      if (c !== '^' && c !== 'ü' && c !== 'Ü') { this.outOf(); reparent(this.root); }
    } else if (soft && this.cur.row === soft && /[0-9]/.test(c)) {
      this.soft = soft;
    }

    if (/[A-Za-z]/.test(c)) {
      this.insertNode(ch(c));
      this.autoWord(false);
      return;
    }
    /* a non-letter ends any pending word */
    this.autoWord(true);
    if (this.combine(c)) return;

    if (c === '\\') { this.insertNode(ci()); return; }
    if (c === '/') { this.insertBuild('frac'); return; }
    /* ü doubles for ^ : on a Turkish keyboard ^ is a dead key that needs
       pressing twice, so there is an ordinary key for it too. */
    if (c === '^' || c === 'ü' || c === 'Ü') { this.applyScript('sup'); return; }
    if (c === '_') { this.applyScript('sub'); return; }
    if (/[0-9]/.test(c) && this.autoSubscript(c)) return;
    if (OPEN[c]) { this.insertBuild(c === '(' ? 'paren' : (c === '[' ? 'brack' : 'brace')); return; }
    if (c === ')' || c === ']' || c === '}') {
      var pp = this.parentOf(this.cur.row);
      if (pp && pp.node.t === 'paren') { this.outOf(); this.render(); return; }
      return;
    }
    if (c === '|') {
      var pq = this.parentOf(this.cur.row);
      if (pq && pq.node.t === 'paren' && pq.node.l === '|') { this.outOf(); this.render(); return; }
      this.insertBuild('abs'); return;
    }
    if (c === '*') { this.insertNode(sym('\\cdot', '⋅', 'bin')); return; }
    if (c === '-') { this.insertNode(ch('-', 'bin')); return; }
    this.insertNode(ch(c));
  };

  MathField.prototype.applyScript = function (kind) {
    var c = this.cur;
    var prev = c.row.k[c.i - 1];
    /* typing ^ or _ just after a big operator edits its limits */
    if (prev && prev.t === 'big') {
      var lim = kind === 'sub' ? 'lo' : 'hi';
      if (isEmptyRow(prev[lim])) {
        reparent(this.root);
        this.cur = { row: prev[lim], i: 0 };
        this.changed();
        return;
      }
    }
    if (prev && prev.t === 'scr' && !prev[kind]) {
      prev[kind] = row();
      reparent(this.root);
      this.cur = { row: prev[kind], i: 0 };
      this.changed(); return;
    }
    /* inside one limit of an operator, ^ and _ jump to the other one */
    var pb = this.parentOf(c.row);
    if (pb && pb.node.t === 'big') {
      var want = kind === 'sup' ? pb.node.hi : pb.node.lo;
      if (want !== c.row) {
        this.cur = { row: want, i: want.k.length };
        this.render();
        return;
      }
    }
    /* typing ^ while sitting in a subscript jumps to that script's superscript */
    var p = this.parentOf(c.row);
    if (p && p.node.t === 'scr' && !p.node[kind]) {
      p.node[kind] = row();
      reparent(this.root);
      this.cur = { row: p.node[kind], i: 0 };
      this.changed(); return;
    }
    this.insertNode(kind === 'sup' ? scr(null, row()) : scr(row(), null));
  };

  MathField.prototype.insertSymbol = function (item) {
    if (item.build) this.insertBuild(item.build);
    else if (/^\\(sin|cos|tan|csc|sec|cot|arcsin|arccos|arctan|sinh|cosh|tanh|log|ln|exp|min|max|inf|sup|arg|deg|det|dim|ker|gcd|Pr|bmod)$/.test(item.tex))
      this.insertNode(fnode(item.tex.slice(1)));
    else this.insertNode(sym(item.tex, item.d, item.cls, item.f));
    this.host.focus();
  };

  /* matrix row/col editing, exposed for the equation toolbar */
  MathField.prototype.matrixOp = function (op) {
    var r = this.cur.row, p = this.parentOf(r);
    while (p && p.node.t !== 'mat') { r = rowOf.get(p.node); p = r ? this.parentOf(r) : null; }
    if (!p) return false;
    var m = p.node, cols = m.r[0].length, ri = Math.floor(p.slot / cols), cidx = p.slot % cols, i;
    if (op === 'addrow') { var nr = []; for (i = 0; i < cols; i++) nr.push(row()); m.r.splice(ri + 1, 0, nr); }
    if (op === 'delrow' && m.r.length > 1) m.r.splice(ri, 1);
    if (op === 'addcol') m.r.forEach(function (rr) { rr.splice(cidx + 1, 0, row()); });
    if (op === 'delcol' && cols > 1) m.r.forEach(function (rr) { rr.splice(cidx, 1); });
    reparent(this.root);
    this.cur = { row: m.r[0][0], i: 0 };
    this.changed();
    return true;
  };

  window.PT = window.PT || {};
  window.PT.math = {
    row: row, ch: ch, sym: sym, frac: frac, scr: scr, sqrt: sqrtn, big: big,
    paren: paren, acc: acc, txt: txt, mat: mat, raw: raw, fn: fnode,
    slots: slots, clone: clone, isEmptyRow: isEmptyRow,
    texRow: texRow, parseTex: parseTex, scanRow: scanRow,
    renderStatic: renderStatic, layout: layout,
    MathField: MathField, BUILDS: BUILDS,
    setAutoWords: function (on) { autoOff = !on; },
    autoWords: function () { return !autoOff; }
  };
})();
