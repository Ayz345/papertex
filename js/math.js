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
      /* \lim and its kind have no upper limit to step into */
      case 'big': return /^[A-Za-z]+$/.test(n.d || '') && isEmptyRow(n.hi) ? [n.lo] : [n.lo, n.hi];
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
  var ACC = { hat: '^', widehat: '^', bar: 'ˉ', vec: '→', tilde: '˜', dot: '˙', ddot: '¨', overline: null, underline: null, boldsym: null, mathbf: null,
    overrightarrow: '→', overleftarrow: '←', overleftrightarrow: '↔', widetilde: '˜', check: 'ˇ', breve: '˘',
    acute: 'ˊ', grave: 'ˋ', mathring: '˚' };
  /* commands that set their argument in another style: drawn as the
     argument, written back as the command (WRAP_TXT: upright words, like
     \text) */
  var WRAP = { operatorname: 1, mathsf: 1, mathtt: 1, mathit: 1, mathnormal: 1, textbf: 1, textit: 1,
    texttt: 1, textsf: 1, emph: 1, boxed: 1 };
  var WRAP_TXT = { operatorname: 1, mathsf: 1, mathtt: 1, textbf: 1, textit: 1, texttt: 1, textsf: 1, emph: 1 };
  /* spacing commands, by name */
  var SPACE_CMD = { quad: 1, qquad: 1, enspace: 1, thinspace: 1, medspace: 1, thickspace: 1, negthinspace: 1 };
  /* \mathbb R, \mathcal{C}: the letter in another face */
  var FACE = { mathbb: 'bb', mathcal: 'cal', mathfrak: '', mathscr: 'cal' };
  /* what \left and \right take, as typed after them */
  var DELIM_KEY = { '(': '(', ')': ')', '[': '[', ']': ']', '|': '|', '.': '.', '<': '\\langle', '>': '\\rangle', '/': '/' };
  var DELIM_NAME = { langle: '\\langle', rangle: '\\rangle', lvert: '|', rvert: '|', vert: '|', lVert: '\\|', rVert: '\\|',
    Vert: '\\|', lfloor: '\\lfloor', rfloor: '\\rfloor', lceil: '\\lceil', rceil: '\\rceil', lbrace: '\\{', rbrace: '\\}',
    lbrack: '[', rbrack: ']' };
  var DELIM_CLOSE = { '(': ')', '[': ']', '\\{': '\\}', '|': '|', '\\|': '\\|', '\\langle': '\\rangle',
    '\\lfloor': '\\rfloor', '\\lceil': '\\rceil', '.': '.', '/': '/', ')': '(', ']': '[' };
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
  /* Brackets around something tall — a fraction, a matrix, a big
     operator — grow with it (\left … \right); around anything else they
     stay plain, as one writes them in LaTeX: f(x), [0, 10]. */
  function tallRow(r) {
    return !!r && r.k.some(function (x) {
      return x.t === 'frac' || x.t === 'mat' || x.t === 'big' ||
        (x.t === 'paren' && !plainParen(x)) || (x.t === 'sqrt' && tallRow(x.k)) ||
        (x.t === 'scr' && (tallRow(x.sup) || tallRow(x.sub))) || (x.t === 'acc' && tallRow(x.k));
    });
  }
  function plainParen(n) { return n.l !== '.' && n.r !== '.' && !tallRow(n.k); }

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
      case 'acc': return n.kind === 'operatorname' ? K_OP : K_ORD;   /* \operatorname{rank} A, spaced as \sin x */
      case 'frac': case 'paren': return K_INNER;
      case 'mat': return n.env === 'matrix' ? K_ORD : K_INNER;
      case 'scr': return undefined;                 /* belongs to the atom before it */
      default: return K_ORD;
    }
  }
  function spaceAtoms(nodes, els, st) {
    /* kl: what an atom is to the one before it; kr: to the one after. A
       bracket set with plain delimiters is an opening sign, its contents and
       a closing sign, so x(0) has no space before the bracket — only a
       \left…\right pair is one inner atom, spaced as such. */
    var kl = nodes.map(atomKind), kr = kl.slice(), i, k, prev = -1, script = st.z >= S;
    nodes.forEach(function (n, j) { if (n.t === 'paren' && plainParen(n)) { kl[j] = K_OPEN; kr[j] = K_CLOSE; } });
    /* resolve binary signs that have nothing to bind (TeX rules 5 and 6) */
    for (i = 0; i < kl.length; i++) {
      k = kl[i];
      if (k === null || k === undefined) continue;
      if (k === K_BIN && (prev < 0 || kr[prev] === K_BIN || kr[prev] === K_OP || kr[prev] === K_REL ||
          kr[prev] === K_OPEN || kr[prev] === K_PUNCT)) kl[i] = kr[i] = k = K_ORD;
      if ((k === K_REL || k === K_CLOSE || k === K_PUNCT) && prev >= 0 && kr[prev] === K_BIN) kl[prev] = kr[prev] = K_ORD;
      prev = i;
    }
    prev = -1;
    for (i = 0; i < kl.length; i++) {
      k = kl[i];
      if (k === null || k === undefined) continue;
      if (prev >= 0) {
        var s = SPACING[kr[prev]][k];
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
  var SPACES = { '\\,': 3 / 18, '\\:': 4 / 18, '\\;': 5 / 18, '\\!': -3 / 18, '\\quad': 1, '\\qquad': 2,
    '\\ ': 6 / 18, '\\enspace': 0.5, '\\thinspace': 3 / 18, '\\medspace': 4 / 18, '\\thickspace': 5 / 18, '\\negthinspace': -3 / 18 };
  function spaceWidth(e, tex) {
    var w = SPACES[tex] != null ? SPACES[tex] : 3 / 18;
    if (w < 0) { e.style.width = '0'; e.style.marginRight = +w.toFixed(4) + 'em'; }
    else e.style.width = +w.toFixed(4) + 'em';
  }

  function frak(L) {
    var odd = { C: 0x212D, H: 0x210C, I: 0x2111, R: 0x211C, Z: 0x2128 };
    var cp = odd[L] || (/[A-Z]/.test(L) ? 0x1D504 + L.charCodeAt(0) - 65 : 0x1D51E + L.charCodeAt(0) - 97);
    return String.fromCodePoint(cp);
  }

  function renderNode(n, ctx, st) {
    var e, a, b;
    switch (n.t) {
      case 'ch':
        /* a minus is a minus sign; an apostrophe in maths is a prime, f′ */
        e = el('span', 'mi m-' + n.cls, n.c === '-' ? '−' : n.c === "'" && !st.txt ? '′' : n.c);
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
        /* \mathfrak{g}: the maths fonts have no fraktur, Unicode does (the
           PDF sets it with LaTeX's own) */
        var fk = /^\\mathfrak\{([A-Za-z])\}$/.exec(n.tex || '');
        if (fk) { e.textContent = frak(fk[1]); e.classList.add('m-frak'); }
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
        /* Empty limits are only there to be typed into: drawn for the
           operator the caret is at (in a limit, or just after the sign),
           absent otherwise — as in the output — so the rest of the formula
           does not jump when it gets the caret. A word operator (\lim) has
           no upper limit. */
        var word = /^[A-Za-z]+$/.test(n.d);
        var cr = ctx.focused && ctx.cur ? ctx.cur.row : null;
        var near = !!cr && (cr === n.lo || cr === n.hi || cr.k[ctx.cur.i - 1] === n);
        var hasHi = !isEmptyRow(n.hi) || (near && !word), hasLo = !isEmptyRow(n.lo) || near;
        /* word operators (lim, max, det) set at text size; symbols take the
           large cmex glyph in display style and the small one elsewhere */
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
        if (!ACC.hasOwnProperty(n.kind)) {
          /* \operatorname, \mathsf, \boxed … — and a command PaperTeX does
             not know, typed with a "{": the argument as it is, the command
             kept for the LaTeX */
          var wb = el('span', 'maccb');
          wb.appendChild(renderRow(n.k, ctx, WRAP_TXT[n.kind] ? { z: st.z, c: st.c, txt: true } : st));
          e.appendChild(wb);
          if (!WRAP[n.kind]) {
            e.classList.add('macc-unknown');
            e.title = '\\' + n.kind + ' is not a command PaperTeX knows: it goes into the LaTeX as typed, and may not compile';
          }
          return e;
        }
        var body = el('span', 'maccb'); body.appendChild(renderRow(n.k, ctx, sty(st.z, true)));
        e.__st = st;
        /* \boldsymbol: bold as they are; \mathbf: bold and upright (mbf) */
        if (n.kind === 'boldsym' || n.kind === 'mathbf') {
          body.classList.add('mbold');
          if (n.kind === 'mathbf') body.classList.add('mbf');
          e.appendChild(body); return e;
        }
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
        e.__mat = n;
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
      case 'raw': {
        e = el('span', 'mraw', n.tex);
        var um = /^\\([A-Za-z]+)$/.exec(n.tex || '');
        if (um && !knownName(um[1])) {
          e.classList.add('mraw-unknown');
          e.title = '\\' + um[1] + ' is not a command PaperTeX knows: it goes into the LaTeX as typed, and may not compile';
        }
        return e;
      }
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
      /* \left/\right: cover the formula to within 5pt either side of the
         axis (\delimiterfactor 901, \delimitershortfall 5pt) */
      var ink = inkBox(body);
      want = delimWant(ink ? Math.max(ax - ink.top, ink.bottom - ax) : 0, fs);
    }
    /* Every delimiter gets its size first and is centred on the axis after:
       a bigger glyph is wider, and the wider formula may have moved to the
       next line — the axis measured before would leave the closing one
       drawn a line too high. */
    var sz = delimSize(want / fs);
    [].forEach.call(dls, function (d) { setGlyph(d, d.firstChild, sz); });
    if (sz.size === 1) return;
    ax = baselineY(e) - 0.25 * fs;
    [].forEach.call(dls, function (d) { centreGlyph(d, ax, sz.k); });
  }
  /* A matrix is centred on the axis as a whole, its delimiters with it. */
  function layMatrix(e) {
    var fs = fpx(e), dls = [].slice.call(e.querySelectorAll(':scope > .mdelim'));
    var grid = e.querySelector(':scope > .mgrid');
    if (!grid) return;
    if (!grid.getBoundingClientRect().height) return;
    /* The cells of a row share a baseline, measured here rather than left
       to the grid's own baseline alignment: browsers disagree about where
       a cell holding a laid-out fraction or script has its baseline. Each
       cell starts at the row's top and is let down to the row's baseline. */
    var cols = parseInt((/repeat\((\d+)/.exec(grid.style.gridTemplateColumns) || [])[1], 10) || 1;
    var cells = [].slice.call(grid.children);
    grid.style.alignItems = 'start';
    cells.forEach(function (c) { c.style.marginTop = ''; });
    for (var ci = 0; ci < cells.length; ci += cols) {
      var rowCells = cells.slice(ci, ci + cols);
      var asc = rowCells.map(function (c) { return baselineY(c) - c.getBoundingClientRect().top; });
      var A = Math.max.apply(null, asc);
      rowCells.forEach(function (c, j) { if (A - asc[j] > 0.01) c.style.marginTop = em(A - asc[j], fpx(c)); });
    }
    var gh = grid.getBoundingClientRect().height;
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
    /* \widehat and \widetilde over more than a letter: drawn to the width of
       what they cover (a stretched glyph's ink sits off-centre in its box) */
    var wide = /\bmacc-(widehat|widetilde)\b/.exec(e.className);
    if (wide && body.getBoundingClientRect().width > 0.9 * fs) {
      var bw = body.getBoundingClientRect().width, H = 0.26 * fs, NS = 'http://www.w3.org/2000/svg';
      mk.textContent = '';
      var svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 100 20');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.style.cssText = 'display:block;margin:0 auto;overflow:visible;width:' + em(bw * 0.94, f) + ';height:' + em(H, f);
      var pth = document.createElementNS(NS, 'path');
      pth.setAttribute('d', wide[1] === 'widehat' ? 'M0 20 L50 1 L100 20' : 'M0 16 C18 1 34 1 50 10 S82 19 100 4');
      pth.setAttribute('fill', 'none');
      pth.setAttribute('stroke', 'currentColor');
      pth.setAttribute('stroke-width', String(Math.max(1, 0.045 * fs)));
      pth.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.appendChild(pth);
      mk.appendChild(svg);
      var top2 = y - (Math.max(h, sig('xh', z) * fs) + ACCENT_GAP * fs) - H;
      mk.style.top = em(top2 - er.top, f);
      return;
    }
    var g = inkBox(mk);
    if (!g) return;
    var target = y - (Math.max(h, sig('xh', z) * fs) + ACCENT_GAP * fs);
    mk.style.top = em(target - g.bottom, f);
    if (/\bmacc-(widehat|widetilde|overrightarrow|overleftarrow|overleftrightarrow)\b/.test(e.className)) {
      var w = body.getBoundingClientRect().width, mw = mk.firstChild ? mk.getBoundingClientRect().width : 0;
      var gw = (function () { var rg = document.createRange(); rg.selectNodeContents(mk); return rg.getBoundingClientRect().width; })();
      if (gw && w > gw) mk.style.transform = 'scaleX(' + Math.min(12, w * 0.9 / gw).toFixed(3) + ')';
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

  /* A formula in running text, which may break across lines where TeX
     would break it: after a relation or a binary operator on its own top
     level (not inside a fraction, a script or brackets), never at its end.
     It is drawn whole first — so the spacing between atoms is exactly that
     of the unbroken formula — and then cut into pieces that the line can
     wrap between. */
  function renderInline(target, r) {
    var e = renderStatic(target, r);
    target.classList.remove('mbreak');
    var k = r.k || [], cuts = {};
    for (var i = 0; i < k.length - 1; i++) {
      var n = k[i], nx = k[i + 1];
      if ((n.t === 'ch' || n.t === 'sym') && (n.cls === 'rel' || n.cls === 'bin') && nx.t !== 'scr') cuts[i] = true;
    }
    if (!Object.keys(cuts).length) return e;
    var pieces = [], cur = null;
    [].slice.call(e.childNodes).forEach(function (c) {
      if (!cur) { cur = el('span', 'mrow mroot mpiece'); pieces.push(cur); }
      cur.appendChild(c);
      if (c.nodeType === 1 && cuts[c.dataset.mi]) cur = null;
    });
    target.textContent = '';
    pieces.forEach(function (p, j) {
      if (j) target.appendChild(document.createElement('wbr'));
      target.appendChild(p);
    });
    target.classList.add('mbreak');
    return e;
  }

  /* --------------------------------------------------------- plain text out */

  /* A formula as plain characters, for where only text can go — a file
     name, a window title, the PDF's title, the list of documents:
     x^2/2, √(a+b), α → β. */
  var PLAIN_DELIM = { '.': '', '\\{': '{', '\\}': '}', '\\langle': '⟨', '\\rangle': '⟩', '\\lvert': '|', '\\rvert': '|',
    '\\lVert': '‖', '\\rVert': '‖', '\\|': '‖', '\\lfloor': '⌊', '\\rfloor': '⌋', '\\lceil': '⌈', '\\rceil': '⌉' };
  function plainOf(r) {
    var out = '';
    ((r && r.k) || []).forEach(function (n) {
      switch (n.t) {
        case 'ch': out += n.c; break;
        case 'sym': out += n.d || ''; break;
        case 'fn': out += n.name + ' '; break;
        case 'frac': out += plainOf(n.n) + '/' + plainOf(n.d); break;
        case 'scr':
          if (n.sub) out += '_' + plainOf(n.sub);
          if (n.sup) out += '^' + plainOf(n.sup);
          break;
        case 'sqrt': out += '√(' + plainOf(n.k) + ')'; break;
        case 'paren': {
          var l = PLAIN_DELIM[n.l] != null ? PLAIN_DELIM[n.l] : String(n.l || '');
          var rr = PLAIN_DELIM[n.r] != null ? PLAIN_DELIM[n.r] : String(n.r || '');
          out += l + plainOf(n.k) + rr;
          break;
        }
        case 'big': out += (n.d || '') + ' '; break;
        case 'raw': out += String(n.tex || '').replace(/^\\/, ''); break;
        default: slots(n).forEach(function (s) { out += plainOf(s); });
      }
    });
    return out.replace(/\s+/g, ' ').trim();
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
      case 'ch': {
        if (mode === 'text') return escText(n.c);
        /* a symbol that came in as a character (older documents, pastes) is
           written as its command: TeX's maths fonts know no α */
        var g = n.c.charCodeAt(0) > 127 ? byGlyph()[n.c] : null;
        return g ? g.tex : n.c;
      }
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
      case 'paren': {
        if (!plainParen(n)) return '\\left' + n.l + ' ' + texRow(n.k) + ' \\right' + n.r;
        /* a command name needs a space after it, a sign does not */
        var lt = n.l + (/[A-Za-z]$/.test(n.l) ? ' ' : ''), inner = texRow(n.k);
        return lt + inner + (/[A-Za-z]$/.test(inner) && /^\\[A-Za-z]/.test(n.r) ? ' ' : '') + n.r;
      }
      case 'acc': {
        var m = { hat: '\\hat', bar: '\\bar', vec: '\\vec', tilde: '\\tilde', dot: '\\dot',
          ddot: '\\ddot', widehat: '\\widehat', overline: '\\overline',
          underline: '\\underline', boldsym: '\\boldsymbol', mathbf: '\\mathbf' }[n.kind] ||
          (/^[A-Za-z]+$/.test(n.kind || '') ? '\\' + n.kind : '\\hat');
        return m + '{' + texRow(n.k) + '}';
      }
      case 'txt': return '\\text{' + texRow(n.k, 'text') + '}';
      case 'mat': {
        var body = n.r.map(function (rr) {
          return rr.map(function (c) { return texRow(c); }).join(' & ');
        }).join(' \\\\\n');
        return '\\begin{' + n.env + '}\n' + body + '\n\\end{' + n.env + '}';
      }
      /* a \left, \right, \begin or \end on its own can only break the
         compile: the structures they make are written by their nodes */
      case 'raw': return /^\\(left|right|middle|begin|end)(?![A-Za-z])/.test(n.tex || '') ? '' : n.tex;
      case 'ci': return n.s && !/^(left|right|middle|begin|end)$/.test(n.s) ? '\\' + n.s : '';
      default: return '';
    }
  }

  function escText(c) {
    var map = { '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#', '_': '\\_',
      '{': '\\{', '}': '\\}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}',
      '\\': '\\textbackslash{}' };
    if (map[c]) return map[c];
    /* a symbol in words (\text{c ≥ 0}): the text font has none */
    var g = c.charCodeAt(0) >= 0x370 ? byGlyph()[c] : null;
    return g ? '\\ensuremath{' + g.tex + '}' : c;
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
    /* The inside of \text{…}: words, not maths — letters stay upright and
       spaces are kept ("T_{\text{room temp}}"), an escaped character is
       itself, and a command inside is dropped. */
    function textGroup() {
      ws();
      if (s[i] !== '{') { var one = s[i++]; return row(one ? [ch(one, 'txtc')] : []); }
      i++;
      var k = [], depth = 0;
      while (i < s.length) {
        var c = s[i];
        if (c === '}' && !depth) { i++; break; }
        if (c === '\\') {
          i++;
          if (/[A-Za-z]/.test(s[i] || '')) { cmdName(); continue; }
          if (i < s.length) k.push(ch(s[i] === '~' ? ' ' : s[i], 'txtc'));
          i++;
          continue;
        }
        if (c === '{') depth++;
        else if (c === '}') depth--;
        else {
          var t = c === '~' || /\s/.test(c) ? ' ' : c;
          if (t !== ' ' || !k.length || k[k.length - 1].c !== ' ') k.push(ch(t, 'txtc'));   /* runs of space are one, as in TeX */
        }
        i++;
      }
      return row(k);
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
      if (name === 'text' || name === 'textrm' || name === 'mathrm') return txt(textGroup());
      if (ACC.hasOwnProperty(name) || WRAP[name] || name === 'boldsymbol') {
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
      if (name === ',' || name === ';' || name === ':' || name === '!' || SPACE_CMD[name])
        return sym('\\' + name, ' ', 'spc');
      /* a command PaperTeX does not know: kept as written, and marked —
         with its argument, if it has one (\overbrace{x+y}) */
      ws();
      if (s[i] === '{') return acc(name, group());
      return raw('\\' + name);
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
        if (leftDepth && s.slice(i, i + 6) === '\\right') break;
        if (s[i] === '&' || s.slice(i, i + 2) === '\\\\') break;
        if (s[i] === '^') { i++; pushAtom(r, { t: 'scrmark', kind: 'sup', k: group() }); continue; }
        if (s[i] === '_') { i++; pushAtom(r, { t: 'scrmark', kind: 'sub', k: group() }); continue; }
        var a = atom();
        if (!a) break;
        pushAtom(r, a);
      }
      return r;
    }
    /* a \right ends only a \left's contents; a stray one is just its bracket */
    var leftDepth = 0;
    function seqUntilRight() {
      leftDepth++;
      var r = seq(null);
      leftDepth--;
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
    boldsym: function () { return acc('boldsym'); },
    mathbf: function () { return acc('mathbf'); }
  };

  var OPEN = { '(': ')', '[': ']', '{': '\\}' };

  /* ---- typing a name turns it into the thing it names -------------------
     "int" becomes an integral, "sum" a sigma with limits, "alpha" an α,
     "sin" an upright function name. A word fires the moment it can no
     longer grow into a longer name ("sum" at once, "sin" once you type the
     next character, because "sinh" exists). Backspace right after undoes it. */
  var AUTO = {}, PREFIX = {};
  /* the names that also count at the end of a run of letters ("xpi" is x π,
     "asinx" a sin x): Greek letters and function names only. The rest —
     ell, in, to … — only as a whole word, or "hello" would come out hℓo. */
  var TAIL = {}, TAILPRE = {};
  var autoOff = false;

  function autoAdd(word, spec) { if (!AUTO[word]) AUTO[word] = spec; }
  (function buildAuto() {
    var S = PT.symbols;
    Object.keys(S.buildCmds).forEach(function (w) {
      if (w.length > 1 && w !== 'left' && w !== 'bm') autoAdd(w, { b: S.buildCmds[w] });
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
    /* bold letters, the word processor's way: "bold", then the letters */
    AUTO.bold = { b: 'mathbf' };
    Object.keys(AUTO).forEach(function (w) {
      for (var i = 1; i < w.length; i++) PREFIX[w.slice(0, i)] = true;
      var a = AUTO[w];
      var g = a.s && a.s.d && a.s.d.length === 1 ? a.s.d.charCodeAt(0) : 0;
      if (a.fn || (g >= 0x370 && g <= 0x3ff)) {   /* the Greek block */
        TAIL[w] = true;
        for (var k = 1; k < w.length; k++) TAILPRE[w.slice(0, k)] = true;
      }
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
    this.host.addEventListener('focus', function () { self.gotFocus(); });
    this.host.addEventListener('blur', function (e) {
      /* handing the typing to the touch keyboard's box, or to the field's
         own text box, is not leaving */
      if (proxy && e.relatedTarget === proxy && proxy.__mf === self) return;
      if (self.kb && e.relatedTarget === self.kb) return;
      self.lostFocus();
    });
    this.host.addEventListener('paste', function (e) {
      var t = (e.clipboardData || window.clipboardData).getData('text');
      if (!t) return;
      e.preventDefault();
      var r = parseTex(t.replace(/^\$+|\$+$/g, ''));
      self.insertNodes(r.k);
    });
    if (touchTyping) wireTouch(this);
    this.render();
  }

  MathField.prototype.gotFocus = function () {
    var was = this.focused;
    this.focused = true;
    if (!touchTyping) deskFocus(this);
    this.render();
    if (this.opts.onFocus && !was) this.opts.onFocus(this);
  };
  MathField.prototype.lostFocus = function () {
    /* a matrix being sized when the focus goes: it goes in as it stands */
    if (this.picker) this.placeMatrix();
    this.autoWord(true);
    this.resolveCI(true);
    this.focused = false; this.sel = null; this.render();
    if (this.opts.onBlur) this.opts.onBlur(this);
  };
  /* has the caret: the browser's focus, or the touch keyboard's box typing for it */
  MathField.prototype.hasFocus = function () {
    var ae = document.activeElement;
    return ae === this.host || (!!this.kb && ae === this.kb) || (!!proxy && ae === proxy && proxy.__mf === this);
  };

  /* ---- with a keyboard --------------------------------------------------
     Keys are read as they are pressed (onKey). But some typing comes as
     text, with no key behind it: the emoji and symbol panel (Win+.),
     Chinese, Japanese and Korean input, dictation, handwriting — and a
     formula, which is not a text box, never gets it. So while a formula has
     the caret, a small invisible text box inside it holds the focus: its
     keys still reach the formula as before (they bubble), and whatever
     text arrives in it is typed into the formula. While an input method is
     composing, the box shows the word being composed at the caret. */
  var COMBINING = /[̀-ͯ]/g;
  function deskFocus(f) {
    var kb = f.kb;
    if (!kb) {
      kb = f.kb = document.createElement('input');
      kb.type = 'text';
      kb.className = 'mf-proxy mf-kb';
      kb.__mf = f;
      ['autocomplete', 'autocorrect', 'autocapitalize'].forEach(function (a) { kb.setAttribute(a, 'off'); });
      kb.spellcheck = false;
      kb.tabIndex = -1;
      kb.setAttribute('aria-label', 'Formula');
      kb.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1.2em;padding:0;border:0;margin:0;' +
        'opacity:0;font:inherit;font-size:16px;background:#fffbe8;color:#333;pointer-events:none;z-index:3;outline:none;';
      var typeIn = function (s) {
        if (!s) return;
        /* a dead key already made its superscript: what the system composes
           from it is the accent and the letter, of which only the letter is
           still wanted (^2 → 2, â → a) */
        if (f.deadAt && Date.now() - f.deadAt < 4000) {
          s = s.replace(/^[\^ˆ¨´`~˜]/, '').normalize('NFD').replace(COMBINING, '');
        }
        f.deadAt = 0;
        for (var i = 0; i < s.length; i++) {
          /* a "$" in the middle closed the formula: the rest is text again */
          if (!f.hasFocus()) {
            var ae = document.activeElement;
            if (ae && ae.isContentEditable) document.execCommand('insertText', false, s.slice(i));
            break;
          }
          f.onKey(fakeKey(s[i]));
        }
      };
      var clear = function () { kb.value = ''; kb.style.opacity = '0'; kb.style.width = '1px'; };
      kb.addEventListener('beforeinput', function (e) {
        e.stopPropagation();
        if (e.isComposing || /Composition/.test(e.inputType)) return;   /* taken at compositionend */
        e.preventDefault();
        if (e.inputType === 'insertText' || e.inputType === 'insertReplacementText') typeIn(e.data || (e.dataTransfer && e.dataTransfer.getData('text/plain')));
      });
      kb.addEventListener('input', function (e) { e.stopPropagation(); });
      kb.addEventListener('compositionstart', function (e) {
        e.stopPropagation();
        kb.style.opacity = '1'; kb.style.width = 'auto';
      });
      kb.addEventListener('compositionend', function (e) {
        e.stopPropagation();
        var d = e.data;
        clear();
        typeIn(d);
      });
      kb.addEventListener('blur', function (e) {
        clear();
        if (e.relatedTarget === f.host) return;
        f.lostFocus();
      });
    }
    if (kb.parentNode !== f.host) f.host.insertBefore(kb, f.host.firstChild);
    if (getComputedStyle(f.host).position === 'static') f.host.style.position = 'relative';
    if (document.activeElement !== kb) kb.focus({ preventScroll: true });
  }

  /* ---- phones and tablets ----------------------------------------------
     Their on-screen keyboard comes up only for a text box, and a formula is
     not one. There, one hidden text box takes the typing for whichever
     formula has the caret and passes every key on to it; that formula
     counts as focused all the while. Android keyboards compose a word
     before they commit it: the composing text is followed as it changes,
     so the formula keeps up letter by letter. The box always holds one
     space, so a Backspace has something to delete and is reported. */
  var touchTyping = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  var proxy = null, SENT = ' ', composed = '';
  function fakeKey(k) {
    return { key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false,
      getModifierState: function () { return false; }, preventDefault: function () {}, stopPropagation: function () {} };
  }
  function proxyReset() { proxy.value = SENT; try { proxy.setSelectionRange(1, 1); } catch (e) { /* not shown */ } }
  function proxyType(s) {
    var f = proxy.__mf;
    if (!f) return;
    for (var i = 0; i < s.length; i++) f.onKey(fakeKey(s[i]));
  }
  function touchProxy() {
    if (proxy) return proxy;
    proxy = document.createElement('input');
    proxy.type = 'text';
    proxy.className = 'mf-proxy';
    ['autocomplete', 'autocorrect', 'autocapitalize'].forEach(function (a) { proxy.setAttribute(a, 'off'); });
    proxy.spellcheck = false;
    proxy.setAttribute('aria-label', 'Formula');
    /* 16px, or iOS zooms the page in on it; see-through and untouchable */
    proxy.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:20px;padding:0;border:0;margin:0;' +
      'opacity:0;font-size:16px;pointer-events:none;z-index:-1;';
    document.body.appendChild(proxy);
    proxyReset();
    proxy.addEventListener('beforeinput', function (e) {
      if (!proxy.__mf || e.isComposing || /Composition/.test(e.inputType)) return;   /* followed on input */
      if (e.inputType === 'insertText' && e.data) { e.preventDefault(); proxyType(e.data); }
      else if (e.inputType === 'deleteContentBackward') { e.preventDefault(); proxy.__mf.onKey(fakeKey('Backspace')); }
      else if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') { e.preventDefault(); proxy.__mf.onKey(fakeKey('Enter')); }
    });
    proxy.addEventListener('input', function () {
      var f = proxy.__mf;
      if (!f) return;
      var v = proxy.value;
      if (v.indexOf(SENT) !== 0) { if (!composed) f.onKey(fakeKey('Backspace')); proxyReset(); composed = ''; return; }
      var now = v.slice(SENT.length), k = 0;
      while (k < now.length && k < composed.length && now[k] === composed[k]) k++;
      for (var b = composed.length; b > k; b--) f.onKey(fakeKey('Backspace'));
      proxyType(now.slice(k));
      composed = now;
    });
    proxy.addEventListener('compositionend', function () { setTimeout(function () { composed = ''; proxyReset(); }, 0); });
    proxy.addEventListener('keydown', function (e) {
      var f = proxy.__mf;
      if (!f || e.isComposing || e.key === 'Unidentified' || e.key === 'Process') return;
      /* keys that are not characters, and shortcuts on a tablet's keyboard */
      if (e.key.length > 1 || e.ctrlKey || e.metaKey) f.onKey(e);
    });
    proxy.addEventListener('blur', function (e) {
      var f = proxy.__mf;
      if (!f || e.relatedTarget === f.host) return;
      proxy.__mf = null;
      composed = '';
      f.lostFocus();
    });
    return proxy;
  }
  /* keep the box under the formula, so the page scrolls to the right place
     when the keyboard comes up */
  function handTo(f) {
    var p = touchProxy(), r = f.host.getBoundingClientRect();
    p.__mf = f;
    p.style.left = Math.max(0, r.left) + 'px';
    p.style.top = Math.max(0, r.top) + 'px';
    composed = '';
    proxyReset();
    if (document.activeElement !== p) p.focus({ preventScroll: true });
  }
  function wireTouch(f) {
    var host = f.host;
    host.addEventListener('focus', function () { handTo(f); });
    /* Moving the caret to another formula while the keyboard is up goes
       straight from one to the other: through the formula itself, iOS
       would put the keyboard away and not bring it back. */
    host.focus = function (o) {
      if (proxy && document.activeElement === proxy) {
        var was = proxy.__mf;
        if (was === f) return;
        handTo(f);
        if (was) was.lostFocus();
        f.gotFocus();
        return;
      }
      HTMLElement.prototype.focus.call(host, o);
    };
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
    /* everything but the text box that has the focus (see deskFocus) */
    var kb = this.kb && this.kb.parentNode === this.host ? this.kb : null;
    for (var n = this.host.lastChild; n; ) { var p = n.previousSibling; if (n !== kb) this.host.removeChild(n); n = p; }
    /* :focus for styling, also while the touch keyboard's box has the focus */
    this.host.classList.toggle('mf-on', this.focused);
    var e = renderRow(this.root, { cur: this.cur, sel: this.sel, focused: this.focused },
      sty(this.opts.inline ? T : D));
    e.classList.add('mroot');
    this.host.appendChild(e);
    layout(this.host);
    /* the part the caret is in — an index, a numerator, a cell — shows as one */
    var inMat = false;
    if (this.focused && this.cur.row !== this.root) {
      var rows = this.host.querySelectorAll('.mrow');
      for (var i = 0; i < rows.length; i++) if (rows[i].__row === this.cur.row) { rows[i].classList.add('mslot-on'); break; }
      inMat = !!this.matrixAt();
    }
    this.host.classList.toggle('mf-inmat', inMat);
    this.hintBar();
    if (this.sel && this.focused) this.drawSel();
    if (kb && this.focused) {
      /* at the caret, so an input method's word list opens beside it */
      var c = this.host.querySelector('.mcaret'), hr = this.host.getBoundingClientRect();
      if (c) {
        var cr = c.getBoundingClientRect();
        kb.style.left = (cr.left - hr.left - this.host.clientLeft) + 'px';
        kb.style.top = (cr.top - hr.top - this.host.clientTop) + 'px';
      }
    }
    if (this.opts.onRender) this.opts.onRender(this);
  };
  /* One line under the formula saying what the keys do where the caret is
     — "Space leaves the power", "Tab: next cell" — so the rules of the box
     can be seen instead of guessed. Shown while the formula has the caret
     (styled in paper.css: .mf-hintbar, items as <kbd>key</kbd> text). */
  MathField.prototype.hintBar = function () {
    var box = this.host.closest && this.host.closest('.imath, .pt-eqw');
    if (!box) return;
    var bar = box.querySelector(':scope > .mf-hintbar');
    var items = this.focused && !this.picker ? this.hints() : [];
    if (!items.length) { if (bar) bar.remove(); return; }
    if (!bar) { bar = document.createElement('div'); bar.className = 'mf-hintbar'; box.appendChild(bar); }
    var html = items.map(function (it) {
      return '<span>' + it[0].map(function (k) { return '<kbd>' + k + '</kbd>'; }).join('') + ' ' + it[1] + '</span>';
    }).join('');
    if (bar.innerHTML !== html) bar.innerHTML = html;
  };
  MathField.prototype.hints = function () {
    var H = [], r = this.cur.row, p = this.parentOf(r), inline = !!this.opts.onExit;
    if (this.pending && this.pending.kind === 'delim') return [[['(', '[', '|', '\\{'], 'the bracket']];
    if (this.activeCI()) return [[['Space'], 'finish the name'], [['alpha'], 'names work without \\ too']];
    var mt = this.matrixAt();
    if (p) {
      var n = p.node, t = n.t, brace = braced.has(r);
      if (brace) H.push([['}'], 'close the brace']);
      else if (t === 'scr') H.push([['Space'], n.sup === r ? 'leave the power' : 'leave the index']);
      else if (t === 'frac') H.push([['Space'], p.slot === 0 ? 'on to the denominator' : 'leave the fraction']);
      else if (t === 'sqrt') H.push([['Space'], n.k === r ? 'leave the root' : 'on to the root']);
      else if (t === 'acc') H.push([['Space'], 'leave it']);
      else if (t === 'big') H.push([['Space'], p.slot === 0 && n.hi ? 'on to the upper limit' : 'leave the limits']);
      else if (t === 'paren') H.push([[(DELIM[n.r] || n.r || ')')], 'close the bracket']);
      else if (t === 'txt') H.push([['→'], 'leave the words']);
    }
    if (mt) {
      H.push([['Tab'], 'next cell']);
      if (!this.opts.noMatrixSheet) H.push([['Double-click'], 'edit it large']);
      if (!inline && !this.opts.noMatrixSheet) H.push([['⋮'], 'rows and columns']);
    } else if (!p) {
      if (isEmptyRow(this.root)) {
        H.push([['alpha', 'sqrt', 'sum'], 'type a name'], [['/'], 'fraction'], [['^'], 'power']);
      } else if (inline) H.push([['Esc'], 'back to the text']);
      else H.push([['Enter'], 'new line'], [['Esc'], 'done']);
    }
    return H;
  };

  /* A selection is one band over the run, from the first atom to the last
     and as tall as the tallest — not a patch per atom with the spacing
     showing through between them. */
  MathField.prototype.drawSel = function () {
    var atoms = [].filter.call(this.host.querySelectorAll('.msel'), function (a) { return !a.parentElement.closest('.msel'); });
    if (!atoms.length) return;
    var host = this.host, hr = host.getBoundingClientRect();
    var first = atoms[0].getBoundingClientRect(), last = atoms[atoms.length - 1].getBoundingClientRect();
    var top = Infinity, bottom = -Infinity;
    atoms.forEach(function (a) { var r = a.getBoundingClientRect(); top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom); });
    if (!(last.right > first.left)) return;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    var band = el('span', 'mselbox');
    band.style.left = (first.left - hr.left - host.clientLeft + host.scrollLeft) + 'px';
    band.style.top = (top - hr.top - host.clientTop + host.scrollTop) + 'px';
    band.style.width = (last.right - first.left) + 'px';
    band.style.height = (bottom - top) + 'px';
    host.appendChild(band);
  };
  MathField.prototype.changed = function () {
    this.render();
    if (this.opts.onChange) this.opts.onChange(this);
  };

  MathField.prototype.onMouse = function (e) {
    this.wordBreak = null;
    /* Where the press landed, read before the field takes the focus:
       taking it redraws the formula, and the element pressed is gone. */
    var hit = null, atom = e.target.closest ? e.target.closest('.matom') : null;
    if (atom && this.host.contains(atom)) {
      var rowEl = atom.parentElement;
      while (rowEl && !rowEl.__row) rowEl = rowEl.parentElement;
      if (rowEl) {
        var idx = parseInt(atom.dataset.mi, 10);
        if (atom.classList.contains('mph')) idx = 0;
        else {
          var rc = atom.getBoundingClientRect();
          if (e.clientX > rc.left + rc.width / 2) idx += 1;
        }
        hit = { row: rowEl.__row, i: idx };
      }
    }
    /* a double click on a matrix opens it large, on a sheet of its own —
       counted here, as the formula is redrawn between the two clicks and
       the browser's own dblclick never comes */
    var dm = e.detail === 2 && e.target.closest ? e.target.closest('.mmat') : null;
    var hr = this.host.getBoundingClientRect();
    this.host.focus();
    e.preventDefault();
    this.sel = null;
    /* a triple click takes the whole formula, as it would a line of text —
       so a box holding "−2π" can be typed over */
    if (e.detail >= 3) {
      this.sel = { row: this.root, a: 0, b: this.root.k.length };
      this.cur = { row: this.root, i: this.root.k.length };
    } else if (hit) {
      this.cur = hit;
    } else {
      /* clicked padding: go to the nearest end of the root row */
      this.cur = { row: this.root, i: e.clientX < hr.left + hr.width / 2 ? 0 : this.root.k.length };
    }
    this.render();
    if (dm && dm.__mat && !this.opts.noMatrixSheet) this.openMatrix(dm.__mat);
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

  var ASK = { matrix2: [2, 2], matrix3: [3, 3], cases: [2, 2] };
  /* `env`: for a matrix, which brackets (\bmatrix …) */
  MathField.prototype.insertBuild = function (name, env) {
    var f = BUILDS[name];
    if (!f) return;
    /* a matrix or cases display: how big, first (askMatrix) */
    if (ASK[name]) { this.askMatrix(name === 'cases' ? 'cases' : env || 'pmatrix', ASK[name][0], ASK[name][1]); return; }
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
        /* a whole fraction, root, accent, matrix or operator is marked
           first, and the next Backspace takes it away in one go (← goes
           inside it instead); an index or a bracket is stepped into, to go
           on typing in it */
        else if (WHOLE[prev.t]) { this.sel = { row: c.row, a: c.i - 1, b: c.i }; this.render(); return; }
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
    /* a fraction taken apart from its denominator is set on the line:
       a/b */
    var at = outer.k.indexOf(n);
    /* a matrix or cases display is never taken apart: Backspace at the
       start of a cell goes to the end of the cell before, and from the
       first cell out in front of the display; one with nothing in it goes */
    if (n.t === 'mat') {
      var cells = slots(n);
      if (cells.every(isEmptyRow)) { outer.k.splice(at, 1); this.cur = { row: outer, i: at }; this.changed(); return; }
      if (p.slot > 0) { var pc = cells[p.slot - 1]; this.cur = { row: pc, i: pc.k.length }; }
      else this.cur = { row: outer, i: at };
      this.render(); return;
    }
    if (n.t === 'frac' && n.style === 'frac' && p.slot === 1) { this.unFrac(n); this.cur = { row: outer, i: at + n.n.k.length + 1 }; this.changed(); return; }
    var contents = [];
    slots(n).forEach(function (s) { contents = contents.concat(s.k); });
    outer.k.splice(at, 1);
    contents.forEach(function (x, k) { outer.k.splice(at + k, 0, x); });
    this.cur = { row: outer, i: at };
    this.changed();
  };
  var WHOLE = { frac: 1, sqrt: 1, acc: 1, mat: 1, big: 1 };
  /* Rows the user opened with a typed "{" (closed by "}"), and the
     denominators of fractions made with "/" (closed by nothing): typing
     treats them differently (keepsSpaces, typeChar, autoWord). Kept
     beside the tree, not in it, so the document never stores them. */
  var braced = new WeakSet(), softDen = new WeakSet();
  /* Space stays put inside typed braces, inside brackets and in the cells of
     a matrix (x & \text{if } x > 0 is typed with spaces; Tab, Enter and &
     go on to the next cell) */
  MathField.prototype.keepsSpaces = function () {
    var p = this.parentOf(this.cur.row);
    return braced.has(this.cur.row) || !!(p && (p.node.t === 'paren' || p.node.t === 'mat'));
  };

  MathField.prototype.del = function () {
    if (this.deleteSel()) { this.changed(); return; }
    var c = this.cur;
    if (c.i < c.row.k.length) {
      var n = c.row.k[c.i];
      if (slots(n).length && !slots(n).every(isEmptyRow)) {
        if (WHOLE[n.t]) this.sel = { row: c.row, a: c.i, b: c.i + 1 };
        else this.right();
        this.render(); return;
      }
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
    if (name === 'slash') { this.insertNode(ch('/', 'upr')); return true; }
    /* sizes and a \right with nothing to close: the brackets size themselves */
    if (name === 'right' || name === 'middle' || /^(big|Big|bigg|Bigg)[lrm]?$/.test(name)) { this.changed(); return true; }
    if (!knownName(name)) {
      /* two commands run together, "\pmsqrt": \pm then \sqrt */
      var parts = splitNames(name);
      if (parts) {
        for (var q = 0; q < parts.length; q++) {
          this.cur.row.k.splice(this.cur.i, 0, ci());
          this.cur.row.k[this.cur.i].s = parts[q];
          this.cur = { row: this.cur.row, i: this.cur.i + 1 };
          reparent(this.root);
          this.resolveCI(silent && q < parts.length - 1);
        }
        return true;
      }
    }
    if (SPACE_CMD[name]) { this.insertNode(sym('\\' + name, ' ', 'spc')); return true; }
    if ((ACC.hasOwnProperty(name) && !PT.symbols.buildCmds[name]) || WRAP[name]) {
      this.insertNode(acc(name)); this.markOneTok(); return true;
    }
    var bld = PT.symbols.buildCmds[name];
    if (bld) { this.insertBuild(bld, /.matrix$/i.test(name) ? name : null); this.markOneTok(); return true; }
    var it = PT.symbols.byCmd[name];
    if (it) { this.insertNode(sym(it.tex, it.d, it.cls, it.f)); return true; }
    if (/^(sin|cos|tan|log|ln|exp|min|max|det|dim|ker|arg|sup|inf|gcd)$/.test(name)) {
      this.insertNode(fnode(name)); return true;
    }
    this.insertNode(raw('\\' + name));
    return true;
  };

  var FNS = /^(sin|cos|tan|log|ln|exp|min|max|det|dim|ker|arg|sup|inf|gcd)$/;
  function knownName(n) {
    return !!(n === 'slash' || PT.symbols.buildCmds[n] || PT.symbols.byCmd[n] || FNS.test(n) ||
      ACC.hasOwnProperty(n) || WRAP[n] || SPACE_CMD[n] || FACE.hasOwnProperty(n) || n === 'right' ||
      /^(big|Big|bigg|Bigg)[lrm]?$/.test(n));
  }
  /* A structure made by a typed command with no "{" after it takes one
     thing, as in LaTeX: \frac12 is ½, \sqrt2x is √2·x, \dot\mathbf{y} = …
     dots only the y. Its parts are marked here (typeChar steps on once one
     holds something); a "{" typed instead opens the part as usual. */
  var oneTok = new WeakSet();
  MathField.prototype.markOneTok = function () {
    var p = this.parentOf(this.cur.row);
    if (!p || !/^(frac|sqrt|acc)$/.test(p.node.t) || !isEmptyRow(this.cur.row)) return;
    slots(p.node).forEach(function (s) { oneTok.add(s); });
  };
  var SPACE_KEY = { ',': '\\,', ';': '\\;', ':': '\\:', '!': '\\!', ' ': '\\ ' };
  /* The key after \left or \right (a bracket), or after \mathbb (a letter,
     or a "{" and letters up to "}"). True when it was used up. `given`: the
     bracket, already read from a command (\langle, \{). */
  MathField.prototype.pendingKey = function (k, given) {
    var p = this.pending;
    if (!p) return false;
    if (p.kind === 'delim') {
      if (!given && k === '\\') return false;       /* \left\{ — the name comes next */
      if (!given && k === ' ') return true;
      var d = given ? k : DELIM_KEY[k];
      this.pending = null;
      if (!d) return false;
      if (p.side === 'l') {
        this.insertNode(paren(d, DELIM_CLOSE[d] || d));
        return true;
      }
      /* \right: closes the bracket the caret is in, with this one */
      var r = this.cur.row, o = this.parentOf(r);
      while (o && o.node.t !== 'paren') { r = rowOf.get(o.node); o = r ? this.parentOf(r) : null; }
      if (o) {
        o.node.r = d;
        var outer = rowOf.get(o.node);
        this.cur = { row: outer, i: outer.k.indexOf(o.node) + 1 };
      }
      this.changed();
      return true;
    }
    if (p.kind === 'face') {
      if (/^[A-Za-z]$/.test(k)) {
        this.insertNode(sym('\\' + p.name + '{' + k + '}', k, 'upr', p.f || undefined));
        if (!p.open) this.pending = null;
        return true;
      }
      if (k === '{' && !p.open) { p.open = true; return true; }
      if (k === ' ' && !p.open) return true;
      this.pending = null;
      return k === '}' && p.open;
    }
    this.pending = null;
    return false;
  };

  /* \begin{…} and \end{…} typed out: a matrix or cases display is made at
     once (no size asked: & and \\ grow it, as they fill it in LaTeX), and
     \end leaves it. Others — aligned, split — the equation already is. */
  MathField.prototype.environment = function (cmd, env) {
    var base = String(env || '').replace(/\*$/, '');
    var MATS = /^(matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|smallmatrix|cases)$/;
    if (cmd === 'begin') {
      if (MATS.test(base)) {
        var m = mat(base === 'smallmatrix' ? 'matrix' : base, 1, base === 'cases' ? 2 : 1);
        this.insertNode(m);
        this.texMat = m;
        return;
      }
      this.changed();
      return;
    }
    var at = this.matrixAt();
    if (at) {
      var m2 = at.m, last = m2.r[m2.r.length - 1];
      /* "… \\ \end{cases}": the empty row the last \\ opened goes */
      if (m2.r.length > 1 && last.every(isEmptyRow)) m2.r.pop();
      var mo = rowOf.get(m2);
      this.cur = { row: mo, i: mo.k.indexOf(m2) + 1 };
      if (this.texMat === m2) this.texMat = null;
    }
    this.sel = null;
    this.changed();
  };
  /* \\ in a matrix or cases display: on to the next row, made if need be */
  MathField.prototype.lineBreak = function () {
    var at = this.matrixAt();
    if (!at) { this.changed(); return; }
    if (at.ri < at.m.r.length - 1) {
      var cell = at.m.r[at.ri + 1][0];
      this.sel = null;
      this.cur = { row: cell, i: 0 };
      this.changed();
      return;
    }
    this.matrixOp('addrow');
    var a2 = this.matrixAt();
    if (a2) { var c0 = a2.m.r[a2.ri][0]; this.cur = { row: c0, i: 0 }; this.render(); }
  };
  /* & in a matrix or cases display: on to the next cell of the row — made,
     in a matrix being typed out with \begin, while its first row grows */
  MathField.prototype.ampersand = function () {
    var at = this.matrixAt();
    if (!at) return false;
    var cols = at.m.r[0].length, cell;
    if (at.ci < cols - 1) cell = at.m.r[at.ri][at.ci + 1];
    else if (this.texMat === at.m && at.ri === 0 && this.matrixOp('addcol')) return true;
    else if (at.ri < at.m.r.length - 1) cell = at.m.r[at.ri + 1][0];
    if (cell) { this.sel = null; this.cur = { row: cell, i: 0 }; }
    this.render();
    return true;
  };
  MathField.prototype.dropCI = function (node) {
    var at = this.cur.row.k.indexOf(node);
    if (at < 0) return;
    this.cur.row.k.splice(at, 1);
    this.cur = { row: this.cur.row, i: at };
  };
  /* a run of command names written together, split into names that all
     exist (the longest first): "pmsqrt" → pm, sqrt. Null if it cannot be. */
  function splitNames(n) {
    if (!n) return [];
    for (var k = n.length; k > 0; k--) {
      if (!knownName(n.slice(0, k))) continue;
      var rest = splitNames(n.slice(k));
      if (rest) return [n.slice(0, k)].concat(rest);
    }
    return null;
  }

  MathField.prototype.onKey = function (e) {
    var k = e.key;
    /* an input method is composing a word: it arrives when done (deskFocus) */
    if (e.isComposing || k === 'Process') return;
    /* the size picker for a new matrix has the keys while it is up */
    if (this.picker && this.pickerKey(e) !== 'pass') return;
    var ciNode = this.activeCI();
    if (k === 'Backspace' && this.undoAuto()) { e.preventDefault(); return; }
    if (k !== 'Backspace') this.autoUndo = null;
    if (k === ' ' || /^(Arrow|Home|End|Enter|Tab)/.test(k)) this.autoWord(true);
    /* the caret moved: a space typed earlier no longer marks where a word starts */
    if (/^(Arrow|Home|End|Tab)/.test(k)) this.wordBreak = null;

    if (k === 'Escape') {
      this.pending = null;
      /* Esc is "done": a command being typed is finished first (\top
         stays ⊤) — one that names nothing is dropped — and then the
         formula is left, as without one */
      if (ciNode) {
        if (ciNode.s && (knownName(ciNode.s) || splitNames(ciNode.s))) this.resolveCI();
        else { var at = this.cur.row.k.indexOf(ciNode); this.cur.row.k.splice(at, 1); this.cur.i = at; this.changed(); }
      }
      if (this.opts.onEscape) this.opts.onEscape(this);
      e.preventDefault(); return;
    }
    var MOD = /^(Shift|Control|Alt|AltGraph|Meta|CapsLock|OS)$/.test(k);
    /* \left, \right, \mathbb …: waiting for the bracket or letter they apply to */
    if (this.pending && !MOD && !(ciNode && this.pending.kind === 'delim')) {
      if (this.pendingKey(k)) { e.preventDefault(); return; }
    }
    if (ciNode && !MOD) {
      var s0 = ciNode.s;
      /* \begin{cases}, \end{cases}: the environment's name belongs to the command */
      if (ciNode.arg != null) {
        if (/^[A-Za-z*]$/.test(k)) { ciNode.arg += k; e.preventDefault(); this.changed(); return; }
        if (k === 'Backspace') {
          if (ciNode.arg) ciNode.arg = ciNode.arg.slice(0, -1); else delete ciNode.arg;
          e.preventDefault(); this.changed(); return;
        }
        var envName = ciNode.arg;
        this.dropCI(ciNode);
        this.environment(s0, envName);
        if (k === '}' || k === ' ' || k === 'Enter' || k === 'Tab') { e.preventDefault(); return; }
        ciNode = null;
      }
    }
    if (ciNode && !MOD) {
      if (/^[A-Za-z]$/.test(k)) { ciNode.s += k; e.preventDefault(); this.changed(); return; }
      if (k === 'Backspace') { this.backspace(); e.preventDefault(); return; }
      if ((s0 === 'begin' || s0 === 'end') && k === '{') { ciNode.arg = ''; e.preventDefault(); this.changed(); return; }
      var waiting = this.pending && this.pending.kind === 'delim';
      /* the bracket after \left or \right, given by name: \left\langle, \right\} */
      if (waiting && ((!s0 && '{}|'.indexOf(k) >= 0) || DELIM_NAME[s0])) {
        this.dropCI(ciNode);
        this.pendingKey(!s0 ? (k === '|' ? '\\|' : '\\' + k) : DELIM_NAME[s0], true);
        if (!s0 || k === ' ') { e.preventDefault(); return; }
        ciNode = null;
      } else if (waiting) this.pending = null;
    }
    if (ciNode && !MOD) {
      if (s0 === 'left' || s0 === 'right') {
        /* the bracket comes next — now, or after a space or a "\" */
        this.dropCI(ciNode);
        this.pending = { kind: 'delim', side: s0 === 'left' ? 'l' : 'r' };
        this.render();
        if (k === ' ' || k === 'Enter' || k === 'Tab') { e.preventDefault(); return; }
        if (k !== '\\' && this.pendingKey(k)) { e.preventDefault(); return; }
        ciNode = null;
      } else if (/^(big|Big|bigg|Bigg)[lrm]?$/.test(s0) || s0 === 'middle') {
        /* sizes: the brackets size themselves; the bracket typed next is just that */
        this.dropCI(ciNode); this.render();
        if (k === ' ' || k === 'Enter' || k === 'Tab') { e.preventDefault(); return; }
        ciNode = null;
      } else if (FACE.hasOwnProperty(s0)) {
        /* \mathbb R, \mathbb{R}: the letter that follows, in that face */
        this.dropCI(ciNode);
        this.pending = { kind: 'face', name: s0 === 'mathscr' ? 'mathcal' : s0, f: FACE[s0], open: k === '{' };
        this.render();
        if (k === '{' || k === ' ' || k === 'Enter' || k === 'Tab') { e.preventDefault(); return; }
        this.pending = null; ciNode = null;
      } else if (s0 === 'sqrt' && k === '[') {
        /* \sqrt[3]{x}: the index first, "]" on to the root */
        this.dropCI(ciNode);
        this.insertNode(sqrtn(row(), row()));
        e.preventDefault(); return;
      } else if (!s0 && SPACE_KEY[k]) {
        /* \, \; \: \! and "\ ": the spaces LaTeX has, as spaces */
        this.dropCI(ciNode);
        this.insertNode(sym(SPACE_KEY[k], ' ', 'spc'));
        e.preventDefault(); return;
      } else if (!s0 && k === '\\') {
        /* \\ : the next row of a matrix or cases display */
        this.dropCI(ciNode);
        this.lineBreak();
        e.preventDefault(); return;
      }
    }
    if (ciNode && !MOD) {
      if (k === 'Enter' || k === ' ' || k === 'Tab') { this.resolveCI(); e.preventDefault(); return; }
      /* "\/" is a slash as written, not a fraction */
      if (k === '/' && !s0) { this.resolveCI(true); this.insertNode(ch('/', 'upr')); e.preventDefault(); return; }
      /* "\frac{", "\sqrt{", "\ddot{": the brace opens what the command made;
         after a command PaperTeX does not know, it opens that command's
         argument, written back as typed (\overbrace{…}, \cancel{…}) */
      if (k === '{' && s0) {
        if (!knownName(s0) && !splitNames(s0)) { this.dropCI(ciNode); this.insertNode(acc(s0), true); }
        else this.resolveCI(true);
        if (this.cur.row !== this.root) braced.add(this.cur.row);
        e.preventDefault(); this.changed(); return;
      }
      if (k.length === 1) { this.resolveCI(); }
    }

    /* AltGr arrives as Ctrl+Alt on Windows, and it is how \ { } [ ] | are
       typed on Turkish, German and many other layouts: that is typing, not
       a shortcut. */
    var altGr = (e.getModifierState && e.getModifierState('AltGraph')) || (e.ctrlKey && e.altKey && k.length === 1);
    if ((e.ctrlKey || e.metaKey) && !altGr) {
      if (k === 'a') {
        /* in a formula set in a line of text, a second Ctrl+A (all of the
           formula already selected) takes the whole line, as it would
           anywhere else in the text */
        var all = this.sel && this.sel.row === this.root && Math.min(this.sel.a, this.sel.b) === 0 &&
          Math.max(this.sel.a, this.sel.b) === this.root.k.length;
        var line = this.host.parentElement && this.host.parentElement.closest('[contenteditable="true"]');
        if (all && this.opts.onExit && line) {
          e.preventDefault();
          this.opts.onExit(this, 'right');
          var rr = document.createRange();
          rr.selectNodeContents(line);
          var ss = window.getSelection();
          ss.removeAllRanges(); ss.addRange(rr);
          return;
        }
        this.sel = { row: this.root, a: 0, b: this.root.k.length }; this.cur = { row: this.root, i: this.root.k.length }; e.preventDefault(); this.render(); return;
      }
      /* bold, as in text: what is selected, or what is typed next */
      if ((k === 'b' || k === 'B') && !e.shiftKey && !e.altKey) { this.bold(); e.preventDefault(); return; }
      return; /* let copy/paste/undo bubble */
    }

    /* Backspace in a formula with nothing in it: the field decides (an
       equation goes away, as an empty paragraph does). Only then — after
       Ctrl+A, the first Backspace empties it and the block stays. */
    if (k === 'Backspace' && !this.sel && isEmptyRow(this.root) && this.opts.onDeleteEmpty) {
      /* (not by a held key's repeats: those stop at the empty formula) */
      e.preventDefault(); if (!e.repeat) this.opts.onDeleteEmpty(this); return;
    }

    /* A formula set in a line of text (opts.onExit) is left the way it was
       entered: ← at its start and → at its end go back into the text, and
       a "$" closes it as it would in LaTeX. Backspace at its start leaves
       it too, or takes it away if nothing is in it. */
    var X = this.opts.onExit, atStart = !this.sel && this.cur.row === this.root && this.cur.i === 0,
      atEnd = !this.sel && this.cur.row === this.root && this.cur.i === this.root.k.length;
    if (X) {
      var out = k === '$' ? 'right' : e.shiftKey ? null :
        k === 'ArrowLeft' && atStart ? 'left' : k === 'ArrowRight' && atEnd ? 'right' :
        k === 'Backspace' && atStart ? (isEmptyRow(this.root) ? 'remove' : 'left') : null;
      if (out) { e.preventDefault(); X(this, out); return; }
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
      /* Home and End: the start and end of the whole line, as in text — so
         "f(x) =" can go in front of a matrix or cases brace (the start of
         a cell is ← away) */
      case 'Home': this.sel = null; this.cur = { row: this.root, i: 0 }; e.preventDefault(); this.render(); return;
      case 'End': this.sel = null; this.cur = { row: this.root, i: this.root.k.length }; e.preventDefault(); this.render(); return;
      case 'Backspace': this.backspace(); e.preventDefault(); return;
      case 'Delete': this.del(); e.preventDefault(); return;
      case 'Enter':
        /* inside a construct: on to its next part; on the line itself the
           field decides (a new equation line, closing the inline editor).
           Shift+Enter always goes to the field. */
        /* (a matrix's size is asked for when it is made, and changed in its
           large editor: Enter in a cell just goes on to the next one) */
        if (!e.shiftKey && this.advance()) { e.preventDefault(); this.render(); return; }
        if (this.opts.onEnter) { this.opts.onEnter(this, e); e.preventDefault(); }
        return;
      case 'Tab':
        if (this.opts.onTab && this.opts.onTab(this, e) !== false) { e.preventDefault(); return; }
        /* in a cell of a matrix or cases display, inside something there
           (words, an index): Tab is still "next cell", as from the cell */
        var mt = this.matrixAt(), stepped = this.nextSlot(e.shiftKey);
        if (!stepped && mt && !mt.direct) {
          var cols = mt.m.r[0].length, flat = mt.ri * cols + mt.ci + (e.shiftKey ? -1 : 1);
          if (flat >= 0 && flat < mt.m.r.length * cols) {
            var cell = mt.m.r[Math.floor(flat / cols)][flat % cols];
            this.cur = { row: cell, i: e.shiftKey ? cell.k.length : 0 };
          } else {
            var mo = rowOf.get(mt.m);
            if (mo) this.cur = { row: mo, i: mo.k.indexOf(mt.m) + (e.shiftKey ? 0 : 1) };
          }
          this.sel = null;
          e.preventDefault(); this.render(); return;
        }
        if (!stepped) {
          /* Shift+Tab before the first thing: back to whatever comes before */
          if (e.shiftKey) {
            if (this.cur.row === this.root && this.cur.i === 0 && this.opts.onLeave) this.opts.onLeave(this, 'prev');
            else this.left();
          } else if (!this.outOf() && this.opts.onLeave) this.opts.onLeave(this, 'next');
        }
        e.preventDefault(); this.render(); return;
      case ' ':
        /* in words (\text{…}) a space is a space */
        if (!e.shiftKey && this.inTextSlot()) { e.preventDefault(); this.typeChar(' '); return; }
        /* Space means "done with this bit", never a literal space — otherwise
           ordinary typing litters the output with \; spacers. Shift+Space is
           there when a real thin space is wanted. */
        if (e.shiftKey) this.insertNode(sym('\\,', ' ', 'spc'));
        else {
          /* except inside braces the user typed, or inside brackets: there
             a space is what it is in LaTeX, nothing — \sqrt{a - b} and
             (x + 1) stay whole; "}" and ")" close them */
          if (!this.keepsSpaces()) this.advance();
          /* and it ends a word: "x in A" is x ∈ A, not ξ … */
          this.wordBreak = { row: this.cur.row, i: this.cur.i };
          this.render();
        }
        e.preventDefault(); return;
    }

    /* A dead key — ^ on Turkish and many European layouts — never reaches
       typeChar as a character. In a formula it can only mean a superscript. */
    if (k === 'Dead') { e.preventDefault(); this.deadAt = Date.now(); this.typeChar('^'); return; }

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

  /* The name the letters just before the caret end in, or may yet become.
     A name can follow other letters — "xpi" is x times π, "2asin" is 2a
     times sin — so every ending is tried, the longest first: "asinh" ends
     in "sinh", not in "in". Returns where it starts, the word, and whether
     it is a whole name (auto) and/or the start of a longer one (prefix). */
  MathField.prototype.wordAt = function (wholeOnly) {
    var r = this.cur.row, i = this.cur.i, j = i;
    var wb = this.wordBreak;
    while (j > 0 && r.k[j - 1].t === 'ch' && /[A-Za-z]/.test(r.k[j - 1].c) && !(wb && wb.row === r && wb.i === j)) j--;
    var w = '', z;
    for (z = j; z < i; z++) w += r.k[z].c;
    for (var s = 0; s < w.length; s++) {
      /* "in" after one letter, once the word is done, is that letter and ∈:
         "tin [0,10]" is t ∈ [0, 10] (min, sin … are names of their own) */
      var part = w.slice(s), A = s ? TAIL[part] || (wholeOnly && part === 'in' && s === 1 && w.length === 3) : AUTO[part],
        P = s ? TAILPRE[part] : PREFIX[part];
      if (A || (!wholeOnly && P)) return { j: j + s, w: part, auto: !!A, prefix: !!P };
    }
    return null;
  };

  /* Replace the name the letters before the caret end in with what it
     names. `flush` converts even a name that could still have grown. */
  MathField.prototype.autoWord = function (flush) {
    if (autoOff || this.inTextSlot()) return false;   /* words in \text stay words */
    var at = this.wordAt(flush);
    if (!at || !at.auto) return false;
    if (!flush && at.prefix) return false;
    var hit = AUTO[at.w];
    var r = this.cur.row, i = this.cur.i, j = at.j;

    var before = r.k.slice(), self = this;
    r.k.splice(j, i - j);
    this.cur = { row: r, i: j };
    reparent(this.root);
    /* A function name is never an index or part of a denominator made
       with "/": typed at the end of one that already holds something, it
       goes on the line after it — γ/ω_d sin … is (γ/ω_d) sin …, not
       γ/(ω_d sin) */
    if (hit.fn) {
      while (this.cur.i === this.cur.row.k.length && this.cur.row.k.length && !braced.has(this.cur.row)) {
        var own = this.parentOf(this.cur.row);
        if (!own || !(own.node.t === 'scr' || softDen.has(this.cur.row))) break;
        this.outOf(); reparent(this.root);
      }
    }
    var made = null;
    if (hit.b) this.insertBuild(hit.b, /.matrix$/i.test(at.w) ? at.w : null);
    else if (hit.fn) this.insertNode(made = fnode(hit.fn));
    else this.insertNode(sym(hit.s.tex, hit.s.d, hit.s.cls, hit.s.f));
    this.autoUndo = { fn: function () {
      /* the letters back where they were typed, and the name gone from
         wherever it went */
      var at = made && rowOf.get(made);
      if (at && at !== r) at.k.splice(at.k.indexOf(made), 1);
      r.k = before; self.cur = { row: r, i: i };
    } };
    /* which name made which symbol, for a "{" that follows (braceName) */
    this.lastAuto = hit.b ? null : { word: at.w, node: r.k[j] };
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

  /* the caret is in words: the inside of a \text{…} */
  MathField.prototype.inTextSlot = function () {
    var p = this.parentOf(this.cur.row);
    return !!(p && p.node.t === 'txt');
  };
  MathField.prototype.typeChar = function (c) {
    /* typed over a selection, a character replaces it — before anything
       else is made of it: a digit after "π" selected with Ctrl+A is that
       digit, not an index to the π (only / and brackets wrap a selection) */
    if (this.sel && '/([{|'.indexOf(c) < 0) { this.deleteSel(); reparent(this.root); }
    /* a "." that stepped out of an exponent (x^2.) and is followed by a
       digit was a decimal point: it goes back in, x^{2.5} */
    var sd = this.softDot;
    this.softDot = null;
    if (sd && /[0-9]/.test(c) && this.cur.row === sd.row && this.cur.i === sd.i && sd.row.k[sd.i - 1] === sd.dot) {
      sd.row.k.splice(sd.i - 1, 1);
      sd.into.k.push(sd.dot);
      reparent(this.root);
      this.cur = { row: sd.into, i: sd.into.k.length };
    }
    /* in a part of \frac12, \sqrt2, \dot x — typed without "{" — the one
       thing it takes is there: on to the next part, or out */
    var ot = this.cur.row;
    if (oneTok.has(ot) && !braced.has(ot) && !this.sel && ot.k.length && this.cur.i === ot.k.length && c !== '}') {
      this.advance(); reparent(this.root);
    }
    var pr = this.parentOf(this.cur.row);
    /* Braces as in LaTeX: "{" where a part begins only opens it, and "}"
       closes it — on to the next part, or out — so x^{2}, \frac{a}{b} and
       \text{word} typed out in full come out as written. */
    if (c === '{' && pr && !this.sel && isEmptyRow(this.cur.row)) { braced.add(this.cur.row); this.render(); return; }
    /* and a brace straight after a name that takes one, typed without its
       backslash — "mddot{x}", "cdot{x}" — makes that thing of it: m ẍ, c ẋ */
    if (c === '{' && !this.sel && !this.inTextSlot() && this.braceName()) return;
    if (c === '}' && pr && pr.node.t !== 'paren') {
      /* it closes the nearest brace the user typed — in \sqrt{x^2 - y^2}
         the root's, not the exponent's, which had none — and with none
         typed, whatever the caret is in */
      this.sel = null;
      var br = this.cur.row;
      while (br && !braced.has(br)) { var bo = this.parentOf(br); br = bo ? rowOf.get(bo.node) : null; }
      if (br) this.cur = { row: br, i: br.k.length };
      this.advance(); this.render(); return;
    }
    if (this.inTextSlot()) { this.insertNode(ch(c, 'txtc')); return; }

    /* An index or exponent typed with _ or ^ is done when a relation comes
       (ω_d = …), and one that is a number when anything but a digit comes
       after it in an index (x_0, y) or an operator after it in an exponent
       (x^2 + 1). Letters stay in: x^{n+1}, a_{ij} — → or Space leaves. */
    /* (Not in braces the user typed: x_{i=1} means what it says.) An
       index or exponent of one symbol is done, too, when an operator or
       punctuation follows it: x^n + 1, ω_d = …, a_i, b. */
    if (pr && pr.node.t === 'scr' && !this.sel && this.cur.i === this.cur.row.k.length && this.cur.row.k.length &&
        this.cur.row !== this.soft && !braced.has(this.cur.row)) {
      var digits = this.cur.row.k.every(function (n) { return n.t === 'ch' && /^[0-9]$/.test(n.c); });
      var one = this.cur.row.k.length === 1 && (this.cur.row.k[0].t === 'ch' || this.cur.row.k[0].t === 'sym');
      var isSub = pr.node.sub === this.cur.row;
      if ('=<>'.indexOf(c) >= 0 || (one && '+-*,;:'.indexOf(c) >= 0) ||
          (digits && (isSub ? !/[0-9.^_]/.test(c) : ('+-*,;:)]|(['.indexOf(c) >= 0 || /[A-Za-z\\]/.test(c))))) {
        this.outOf(); reparent(this.root);
      }
    }
    /* A fraction made by "/" has no brace to close it: an operator or a
       relation at the end of its denominator ends it, as / binds tighter
       than + and = do — a/b + c, k/m = ω² */
    if (softDen.has(this.cur.row) && !this.sel && this.cur.i === this.cur.row.k.length && this.cur.row.k.length &&
        '+-*=<>,;:'.indexOf(c) >= 0) {
      this.outOf(); reparent(this.root);
    }

    /* A full stop, comma or semicolon at the very end of an exponent, an
       index, a root, an accent or a "/" fraction ends the sentence, not the
       box: it goes after the whole thing — x^2. is x², and ω_0, is ω₀ , —
       through as many boxes as end there. (Not in braces the user typed;
       a "." followed by a digit goes back in, see softDot.) */
    if ('.,;'.indexOf(c) >= 0 && !this.sel && this.cur.row !== this.soft) {
      this.autoWord(true);
      var into = null;
      for (;;) {
        var pr2 = this.parentOf(this.cur.row), cr = this.cur.row;
        if (!pr2 || braced.has(cr) || !cr.k.length || this.cur.i !== cr.k.length) break;
        var t2 = pr2.node.t;
        if (!(t2 === 'scr' || t2 === 'acc' || (t2 === 'sqrt' && pr2.node.k === cr) || softDen.has(cr))) break;
        if (!this.outOf()) break;
        reparent(this.root);
        if (!into) into = cr;
      }
      if (into) {
        var pn = ch(c);
        this.insertNode(pn);
        if (c === '.') this.softDot = { dot: pn, into: into, row: this.cur.row, i: this.cur.i };
        return;
      }
    }

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
      /* a name held back because it might grow ("sin" → "sinh", "pi" →
         "pitchfork") is settled by a letter that does not continue it:
         "sinx" is sin x, "pix" is π x */
      if (!autoOff) {
        var at = this.wordAt(false);
        if (at && at.auto && at.prefix && !AUTO[at.w + c] && !PREFIX[at.w + c]) this.autoWord(true);
      }
      this.insertNode(ch(c));
      this.autoUndo = null;       /* Backspace now takes back the letter, not the name */
      this.autoWord(false);
      return;
    }
    /* a non-letter ends any pending word */
    this.autoWord(true);
    if (this.combine(c)) return;

    if (c === '\\') { this.insertNode(ci()); return; }
    if (c === '/') {
      /* "//" is a slash as written: the fraction the first one made gives
         its numerator back, followed by "/" */
      var pf = this.parentOf(this.cur.row);
      if (pf && pf.node.t === 'frac' && pf.node.style === 'frac' && pf.node.d === this.cur.row && isEmptyRow(this.cur.row)) {
        this.unFrac(pf.node); this.changed(); return;
      }
      this.insertBuild('frac');
      var den = this.parentOf(this.cur.row);
      if (den && den.node.t === 'frac') softDen.add(den.node.d);
      /* and Backspace straight after it does the same */
      var made = this.parentOf(this.cur.row), self = this;
      if (made && made.node.t === 'frac') this.autoUndo = { fn: function () { if (rowOf.get(made.node)) self.unFrac(made.node); } };
      return;
    }
    /* ü doubles for ^ : on a Turkish keyboard ^ is a dead key that needs
       pressing twice, so there is an ordinary key for it too. */
    if (c === '^' || c === 'ü' || c === 'Ü') { this.applyScript('sup'); return; }
    if (c === '_') { this.applyScript('sub'); return; }
    if (/[0-9]/.test(c) && this.autoSubscript(c)) return;
    if (OPEN[c]) { this.insertBuild(c === '(' ? 'paren' : (c === '[' ? 'brack' : 'brace')); return; }
    if (c === ']') {
      var pi = this.parentOf(this.cur.row);
      if (pi && pi.node.t === 'sqrt' && pi.node.idx === this.cur.row) { this.cur = { row: pi.node.k, i: 0 }; this.render(); return; }
    }
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
    /* & : the next cell of a matrix; in a line of text it has nothing to align */
    if (c === '&' && (this.ampersand() || this.opts.onExit)) return;
    /* a symbol typed as itself — from a Greek layout, the emoji and symbol
       panel, a paste of one character: α is \alpha, ≤ is \leq */
    var g = c.charCodeAt(0) > 127 ? byGlyph()[c] : null;
    if (g) { this.insertNode(sym(g.tex, g.d, g.cls, g.f)); return; }
    this.insertNode(ch(c));
  };
  var glyphs = null;
  function byGlyph() {
    if (glyphs) return glyphs;
    glyphs = {};
    PT.symbols.groups.forEach(function (g) {
      g.items.forEach(function (it) { if (!it.build && it.tex && it.d && it.d.length === 1 && !it.f && !glyphs[it.d]) glyphs[it.d] = it; });
    });
    glyphs['−'] = null;   /* a minus sign is typed as one */
    return glyphs;
  }

  /* The names a "{" can follow: accents, roots, fractions, words, bold. */
  var BRACED = { hat: 1, widehat: 1, bar: 1, vec: 1, tilde: 1, dot: 1, ddot: 1, overline: 1, underline: 1,
    mathbf: 1, boldsymbol: 1, sqrt: 1, frac: 1, dfrac: 1, tfrac: 1, text: 1, mathrm: 1, textrm: 1 };
  /* "{" typed just after letters ending in such a name — or just after a
     symbol whose typed name ended in one ("cdot" became ⋅, but "c" and
     "dot{" was meant) — turns that name into its structure, the caret
     inside. False when there is no such name. */
  MathField.prototype.braceName = function () {
    var r = this.cur.row, i = this.cur.i, j = i, w = '', k;
    while (j > 0 && r.k[j - 1].t === 'ch' && /[A-Za-z]/.test(r.k[j - 1].c)) j--;
    for (k = j; k < i; k++) w += r.k[k].c;
    var prefix = '', name = null, s;
    for (s = 0; s < w.length; s++) if (BRACED[w.slice(s)]) { name = w.slice(s); break; }
    if (name) {
      r.k.splice(i - name.length, name.length);
      this.cur = { row: r, i: i - name.length };
    } else {
      var la = this.lastAuto, prev = r.k[i - 1];
      if (!la || la.node !== prev) return false;
      for (s = 1; s < la.word.length; s++) if (BRACED[la.word.slice(s)]) { name = la.word.slice(s); prefix = la.word.slice(0, s); break; }
      if (!name) return false;
      r.k.splice(i - 1, 1);
      var self = this;
      prefix.split('').forEach(function (ch1, q) { r.k.splice(i - 1 + q, 0, ch(ch1)); });
      this.cur = { row: r, i: i - 1 + prefix.length };
      void self;
    }
    this.lastAuto = null;
    reparent(this.root);
    this.insertBuild(PT.symbols.buildCmds[name] || name);
    if (this.cur.row !== this.root) braced.add(this.cur.row);
    return true;
  };

  /* A fraction set out on the line: numerator / denominator, the caret
     after the slash (or after the denominator, if it has one). */
  MathField.prototype.unFrac = function (n) {
    var outer = rowOf.get(n);
    if (!outer) return;
    var at = outer.k.indexOf(n), slash = ch('/', 'upr');
    var run = n.n.k.concat([slash], n.d.k);
    Array.prototype.splice.apply(outer.k, [at, 1].concat(run));
    reparent(this.root);
    this.sel = null;
    this.cur = { row: outer, i: at + (n.d.k.length ? run.length : n.n.k.length + 1) };
  };

  /* ---- matrices: the size asked for when one is made ---------------------
     Typing "matrix" (or \bmatrix, "cases", a palette button) does not drop
     a 2 × 2 in at once: a small picker under the caret asks how big —
     move over its grid, or use the arrow keys, and Enter or a click puts
     it in; Esc or Backspace takes the typed name back. The field keeps the
     focus throughout (the picker never takes it), so its keys come here
     first (see onKey). */
  var sheetOpen = false;
  var BRACKETS = [['pmatrix', '( )'], ['bmatrix', '[ ]'], ['Bmatrix', '{ }'], ['vmatrix', '| |'], ['Vmatrix', '‖ ‖'], ['matrix', 'none']];
  var MAXR = 10, MAXC = 10, GRID = 8;
  MathField.prototype.askMatrix = function (env, r, c) {
    this.closePicker();
    var self = this, cases = env === 'cases';
    var pk = { env: env, r: r, c: cases ? 2 : c, cases: cases };
    var box = el('div', 'popmenu mx-pick');
    box.addEventListener('mousedown', function (e) { e.preventDefault(); });
    var head = el('div', 'popg mx-pick-h');
    box.appendChild(head);
    var grid = el('div', 'mx-pick-grid');
    var cols = cases ? 2 : GRID;
    grid.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
    for (var i = 1; i <= GRID; i++) {
      for (var j = 1; j <= cols; j++) {
        (function (ri, ci) {
          var cell = el('span', 'mx-pick-c');
          cell.addEventListener('mouseenter', function () { pk.r = ri; if (!cases) pk.c = ci; show(); });
          cell.addEventListener('click', function () { pk.r = ri; if (!cases) pk.c = ci; self.placeMatrix(); });
          grid.appendChild(cell);
        })(i, j);
      }
    }
    box.appendChild(grid);
    if (!cases) {
      var kinds = el('div', 'mx-pick-k');
      BRACKETS.forEach(function (b) {
        var bt = el('button', 'mx-pick-b', b[1]);
        bt.type = 'button';
        bt.title = b[0] === 'matrix' ? 'No brackets' : 'Brackets ' + b[1];
        bt.addEventListener('click', function () { pk.env = b[0]; show(); });
        bt.__env = b[0];
        kinds.appendChild(bt);
      });
      box.appendChild(kinds);
    }
    box.appendChild(el('div', 'mx-pick-f', 'Arrow keys or the mouse · Enter to put it in · Esc to cancel'));
    function show() {
      head.textContent = cases ? (pk.r + (pk.r === 1 ? ' case' : ' cases')) : (pk.r + ' × ' + pk.c + ' matrix');
      [].forEach.call(grid.children, function (cell, k) {
        var ri = Math.floor(k / cols) + 1, ci = k % cols + 1;
        cell.classList.toggle('on', ri <= pk.r && ci <= pk.c);
      });
      [].forEach.call(box.querySelectorAll('.mx-pick-b'), function (bt) { bt.classList.toggle('on', bt.__env === pk.env); });
    }
    pk.el = box;
    pk.show = show;
    this.picker = pk;
    document.body.appendChild(box);
    show();
    /* under the caret */
    var at = this.host.querySelector('.mcaret') || this.host, rr = at.getBoundingClientRect();
    var left = Math.max(8, Math.min(window.innerWidth - box.offsetWidth - 8, rr.left - 12));
    var top = rr.bottom + 8 + box.offsetHeight < window.innerHeight ? rr.bottom + 8 : Math.max(8, rr.top - box.offsetHeight - 8);
    box.style.left = left + window.scrollX + 'px';
    box.style.top = top + window.scrollY + 'px';
  };
  MathField.prototype.closePicker = function () {
    if (!this.picker) return;
    this.picker.el.remove();
    this.picker = null;
  };
  MathField.prototype.placeMatrix = function () {
    var pk = this.picker;
    if (!pk) return;
    this.closePicker();
    this.insertNode(mat(pk.env, pk.r, pk.c));
  };
  /* keys while the picker is up: they size it, put it in, or cancel it */
  MathField.prototype.pickerKey = function (e) {
    var pk = this.picker, k = e.key;
    e.preventDefault();
    if (k === 'ArrowDown') pk.r = Math.min(MAXR, pk.r + 1);
    else if (k === 'ArrowUp') pk.r = Math.max(1, pk.r - 1);
    else if (k === 'ArrowRight' && !pk.cases) pk.c = Math.min(MAXC, pk.c + 1);
    else if (k === 'ArrowLeft' && !pk.cases) pk.c = Math.max(1, pk.c - 1);
    else if (k === 'Enter' || k === 'Tab' || k === ' ') { this.placeMatrix(); return; }
    else if (k === 'Escape') {
      /* nothing made, and the name typed is gone too */
      this.closePicker();
      this.autoUndo = null;
      this.render();
      return;
    } else if (k === 'Backspace') {
      /* nothing made: the name typed comes back as it was */
      this.closePicker();
      if (!this.undoAuto()) this.render();
      return;
    } else if (k.length === 1 && !e.ctrlKey && !e.metaKey) {
      /* typing on: the matrix goes in as it stands, and what was typed
         goes into its first cell */
      this.placeMatrix();
      return 'pass';
    } else return;
    pk.show();
  };

  /* ---- a matrix on a sheet of its own -------------------------------------
     Double-clicking a matrix (or "Edit large…") opens it large, alone on a
     page, with buttons for its rows, columns and brackets. It is the same
     matrix, edited where it stands: closing puts the caret back after it. */
  MathField.prototype.matrixNodeAt = function () {
    var at = this.matrixAt();
    if (at) return at.m;
    var prev = this.cur.row.k[this.cur.i - 1], next = this.cur.row.k[this.cur.i];
    if (prev && prev.t === 'mat') return prev;
    if (next && next.t === 'mat') return next;
    return firstMat(this.root);
  };
  MathField.prototype.openMatrix = function (m) {
    m = m || this.matrixNodeAt();
    if (!m) return false;
    var outer = this, cases = m.env === 'cases';
    this.closePicker();
    var back = el('div', 'dlg-back mx-back');
    var box = el('div', 'dlg mx-sheet');
    box.appendChild(el('div', 'dlg-t', cases ? 'Cases' : 'Matrix'));
    var tools = el('div', 'mx-tools');
    var paper = el('div', 'mx-paper');
    var host = el('div', 'mx-field');
    paper.appendChild(host);
    box.appendChild(tools);
    box.appendChild(paper);
    var foot = el('div', 'dlg-r');
    var done = el('button', 'dlg-btn primary', 'Done');
    done.type = 'button';
    foot.appendChild(done);
    box.appendChild(foot);
    back.appendChild(box);
    document.body.appendChild(back);

    var big = new MathField(host, {
      root: row([m]),
      noMatrixSheet: true,   /* already on its sheet */
      onEscape: function () { close(); },
      /* saved as it changes — without redrawing the formula underneath,
         which would take the matrix's place in it back */
      onChange: function () { if (outer.opts.onChange) outer.opts.onChange(outer); }
    });
    sheetOpen = true;
    var b0 = m.r[0][0];
    big.cur = { row: b0, i: b0.k.length };
    function btn(label, title, fn) {
      var b = el('button', 'dlg-btn mx-tool', label);
      b.type = 'button';
      b.title = title;
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function () { fn(); big.host.focus(); });
      tools.appendChild(b);
      return b;
    }
    /* on the cell the caret is in; with the caret elsewhere, the last one */
    function op(name) {
      if (!big.matrixAt()) { var lr = m.r[m.r.length - 1], lc = lr[lr.length - 1]; reparent(big.root); big.cur = { row: lc, i: lc.k.length }; }
      big.matrixOp(name);
    }
    btn('+ Row', 'Add a row below the caret', function () { op('addrow'); });
    btn('− Row', 'Remove the caret’s row', function () { op('delrow'); });
    if (!cases) {
      btn('+ Column', 'Add a column right of the caret', function () { op('addcol'); });
      btn('− Column', 'Remove the caret’s column', function () { op('delcol'); });
      var kinds = el('span', 'mx-kinds');
      BRACKETS.forEach(function (b) {
        var bt = el('button', 'dlg-btn mx-tool mx-kind' + (m.env === b[0] ? ' on' : ''), b[1]);
        bt.type = 'button';
        bt.title = b[0] === 'matrix' ? 'No brackets' : 'Brackets ' + b[1];
        bt.addEventListener('mousedown', function (e) { e.preventDefault(); });
        bt.addEventListener('click', function () {
          m.env = b[0];
          [].forEach.call(kinds.children, function (x) { x.classList.toggle('on', x === bt); });
          big.changed();
          big.host.focus();
        });
        kinds.appendChild(bt);
      });
      tools.appendChild(kinds);
    }
    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      sheetOpen = false;
      back.remove();
      /* the formula takes its matrix back, and the caret goes after it */
      reparent(outer.root);
      var r = rowOf.get(m);
      if (r) outer.cur = { row: r, i: r.k.indexOf(m) + 1 };
      outer.sel = null;
      outer.host.focus();
      outer.changed();
    }
    done.addEventListener('click', close);
    back.addEventListener('mousedown', function (e) { if (e.target === back) { e.preventDefault(); close(); } });
    host.focus();
    return true;
  };

  /* Ctrl+B: the selection in bold; with none, what is typed next — or, in
     bold already, back out of it */
  MathField.prototype.bold = function () {
    var p = this.parentOf(this.cur.row);
    if (!this.sel && p && p.node.t === 'acc' && p.node.kind === 'mathbf') { this.outOf(); this.render(); return; }
    var grab = this.takeSelection();
    var n = acc('mathbf', row(grab));
    this.insertAt(n);
    this.cur = grab.length ? { row: this.cur.row, i: this.cur.i + 1 } : { row: n.k, i: 0 };
    this.changed();
  };

  MathField.prototype.applyScript = function (kind) {
    var c = this.cur;
    var prev = c.row.k[c.i - 1];
    var wordOp = function (n) { return /^[A-Za-z]+$/.test(n.d || ''); };
    /* typing ^ or _ just after a big operator edits its limits (\lim has
       only the lower one) */
    if (prev && prev.t === 'big' && !(kind === 'sup' && wordOp(prev))) {
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
      /* "int" then "_": already in the lower limit, with nothing to hang an
         index on — not an index inside the limit */
      if (want === c.row && c.i === 0) { this.render(); return; }
      /* \lim's lower limit takes scripts of its own: x → 0^+ */
      if (want !== c.row && !wordOp(pb.node)) {
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

  /* The matrix or cases display the caret is in (at any depth): the node,
     and the row and column of the cell holding the caret. */
  MathField.prototype.matrixAt = function () {
    var r = this.cur.row, p = this.parentOf(r);
    while (p && p.node.t !== 'mat') { r = rowOf.get(p.node); p = r ? this.parentOf(r) : null; }
    if (!p) return null;
    var m = p.node, cols = m.r[0].length;
    return { m: m, ri: Math.floor(p.slot / cols), ci: p.slot % cols, direct: r === this.cur.row };
  };

  function firstMat(r) {
    for (var i = 0; i < r.k.length; i++) {
      var n = r.k[i];
      if (n.t === 'mat') return n;
      var sl = slots(n);
      for (var j = 0; j < sl.length; j++) { var m = firstMat(sl[j]); if (m) return m; }
    }
    return null;
  }
  MathField.prototype.hasMatrix = function () { return !!firstMat(this.root); };
  /* as matrixOp; with the caret outside any matrix, on the first one */
  MathField.prototype.matrixOpAnywhere = function (op) {
    if (!this.matrixAt()) {
      var m = firstMat(this.root);
      if (!m) return false;
      reparent(this.root);
      var last = m.r[m.r.length - 1], cell = last[last.length - 1];
      this.cur = { row: cell, i: cell.k.length };
    }
    return this.matrixOp(op);
  };

  /* Rows and columns of a matrix or cases display: added after, or
     removed at, the caret's cell; the caret goes to the new row or column,
     or stays in the row or column that took the removed one's place. */
  MathField.prototype.matrixOp = function (op) {
    var at = this.matrixAt();
    if (!at) return false;
    var m = at.m, cols = m.r[0].length, ri = at.ri, cidx = at.ci, i;
    var go = null;
    if (op === 'addrow') { var nr = []; for (i = 0; i < cols; i++) nr.push(row()); m.r.splice(ri + 1, 0, nr); go = [ri + 1, 0]; }
    else if (op === 'delrow') { if (m.r.length < 2) return false; m.r.splice(ri, 1); go = [Math.min(ri, m.r.length - 1), cidx]; }
    else if (op === 'addcol') {
      /* LaTeX's cases has two columns, its matrices at most ten */
      if (cols >= (m.env === 'cases' ? 2 : 10)) return false;
      m.r.forEach(function (rr) { rr.splice(cidx + 1, 0, row()); }); go = [ri, cidx + 1];
    }
    else if (op === 'delcol') { if (cols < 2) return false; m.r.forEach(function (rr) { rr.splice(cidx, 1); }); go = [ri, Math.min(cidx, cols - 2)]; }
    else return false;
    reparent(this.root);
    var cell = m.r[go[0]][go[1]];
    this.sel = null;
    this.cur = { row: cell, i: cell.k.length };
    this.changed();
    return true;
  };

  window.PT = window.PT || {};
  window.PT.math = {
    row: row, ch: ch, sym: sym, frac: frac, scr: scr, sqrt: sqrtn, big: big,
    paren: paren, acc: acc, txt: txt, mat: mat, raw: raw, fn: fnode,
    slots: slots, clone: clone, isEmptyRow: isEmptyRow,
    texRow: texRow, parseTex: parseTex, scanRow: scanRow,
    renderStatic: renderStatic, renderInline: renderInline, layout: layout, plainOf: plainOf,
    /* the command for a symbol given as its character: '≥' → '\geq' */
    /* a matrix is open on its own sheet (openMatrix): its formula is still being edited */
    matrixSheetOpen: function () { return sheetOpen; },
    glyphTex: function (c) { var g = byGlyph()[c]; return g ? g.tex : null; },
    touchTyping: function (on) { touchTyping = !!on; },
    MathField: MathField, BUILDS: BUILDS,
    setAutoWords: function (on) { autoOff = !on; },
    autoWords: function () { return !autoOff; }
  };
})();
