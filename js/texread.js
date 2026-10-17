/* PaperTeX — reads a .tex file into a document: the other way round from
   latex.js.

     PT.texread.read(source) → { doc, notes }

   What PaperTeX itself writes comes back as the blocks it was written from:
   sections, paragraphs with their formulas, bold and italics, references,
   citations and footnotes; numbered and aligned equations; lists; theorems
   and proofs with what belongs to them; figures; tables; code; quotations;
   the reference list; the title, authors, date and abstract; the document
   class and the preamble settings PaperTeX has controls for.

   Anything else is kept, never dropped quietly:
     - in the body, as "LaTeX code" blocks, passed through as they were;
     - in the preamble, as the document's extra preamble (settings.preamble):
       packages, \newcommand and the like.
   `notes` lists, in plain words, what did not come back as it was — a
   figure's image to choose again, a .bib file that cannot be read …

   Works on text alone (no DOM), so it can be tested outside a browser. */
(function () {
  'use strict';
  var M = PT.math;

  /* ------------------------------------------------------------ scanning */
  function isEsc(s, i) {          /* is s[i] escaped by an odd run of backslashes? */
    var n = 0;
    while (i - 1 - n >= 0 && s[i - 1 - n] === '\\') n++;
    return n % 2 === 1;
  }
  /* s[i] is "{": the group's inside, and the index after its "}" */
  function group(s, i) {
    var depth = 0, j = i;
    for (; j < s.length; j++) {
      var c = s[j];
      if (c === '\\') { j++; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (!depth) return { text: s.slice(i + 1, j), end: j + 1 }; }
    }
    return { text: s.slice(i + 1), end: s.length };
  }
  /* s[i] is "[": an optional argument, braces respected */
  function optArg(s, i) {
    var depth = 0, j = i + 1;
    for (; j < s.length; j++) {
      var c = s[j];
      if (c === '\\') { j++; continue; }
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === ']' && !depth) return { text: s.slice(i + 1, j), end: j + 1 };
    }
    return { text: s.slice(i + 1), end: s.length };
  }
  function skipWs(s, i) { while (i < s.length && /[ \t\r\n]/.test(s[i])) i++; return i; }
  function skipSp(s, i) {          /* spaces and at most one line end: not a blank line */
    var nl = 0;
    while (i < s.length && /[ \t\r\n]/.test(s[i])) {
      if (s[i] === '\n' && ++nl > 1) break;
      i++;
    }
    return i;
  }
  /* a command's arguments: [opt]? {req} × n, as written */
  function args(s, i, nReq, allowOpt) {
    var out = { opt: null, req: [], end: i };
    var j = skipSp(s, i);
    if (allowOpt !== false && s[j] === '[') { var o = optArg(s, j); out.opt = o.text; j = skipSp(s, o.end); }
    for (var k = 0; k < nReq; k++) {
      if (s[j] === '{') { var g = group(s, j); out.req.push(g.text); out.end = g.end; j = skipSp(s, g.end); }
      else if (k === 0 && s[j] === '\\' && nReq === 1) {
        /* \section\foo — an unbraced one-command argument */
        var m = /^\\([A-Za-z]+|.)/.exec(s.slice(j));
        out.req.push(m[0]); out.end = j + m[0].length; j = out.end;
      } else break;
    }
    if (!out.req.length && out.opt !== null) out.end = j;
    return out;
  }
  function cmdAt(s, i) {           /* "\name" at i: name and the index after it */
    if (s[i] !== '\\') return null;
    var m = /^\\([A-Za-z@]+\*?|.)/.exec(s.slice(i));
    return m ? { name: m[1], end: i + m[0].length } : null;
  }
  /* the body of \begin{env} … \end{env}, nested ones of the same name counted;
     i is just after \begin{env} */
  function envBody(s, i, env) {
    var open = '\\begin{' + env + '}', close = '\\end{' + env + '}', depth = 1, j = i;
    while (j < s.length) {
      var a = s.indexOf(open, j), b = s.indexOf(close, j);
      if (b < 0) return { body: s.slice(i), end: s.length, open: true };
      if (a >= 0 && a < b) { depth++; j = a + open.length; continue; }
      depth--;
      if (!depth) return { body: s.slice(i, b), end: b + close.length };
      j = b + close.length;
    }
    return { body: s.slice(i), end: s.length, open: true };
  }
  /* split at a separator that is at the top level: not in braces, not in a
     nested environment, not escaped (\& is a character) */
  function splitTop(s, sep) {
    var parts = [], depth = 0, env = 0, last = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '\\') {
        if (s.startsWith('\\begin{', i)) env++;
        else if (s.startsWith('\\end{', i)) env--;
        else if (sep === '\\\\' && s[i + 1] === '\\' && !depth && !env) { parts.push(s.slice(last, i)); i++; last = i + 1; continue; }
        i++; continue;
      }
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === sep && !depth && !env) { parts.push(s.slice(last, i)); last = i + 1; }
    }
    parts.push(s.slice(last));
    return parts;
  }

  /* Comments go first — but not inside verbatim text. A line that is only
     a comment goes with its line end (it is not a blank line); "%" at the
     end of a text line joins it to the next, as in TeX. */
  var VERB_ENVS = ['verbatim', 'verbatim*', 'lstlisting', 'minted', 'comment', 'Verbatim'];
  function stripComments(src) {
    var keep = [], out = '', i = 0;
    var re = /\\begin\{(verbatim\*?|lstlisting|minted|comment|Verbatim)\}/g, m;
    while ((m = re.exec(src))) {
      var start = m.index, b = envBody(src, start + m[0].length, m[1]);
      out += uncomment(src.slice(i, start));
      if (m[1] === 'comment') { i = b.end; re.lastIndex = b.end; continue; }   /* a comment environment is a comment */
      keep.push(src.slice(start, b.end));
      out += '\u0000V' + (keep.length - 1) + '\u0000';
      i = b.end; re.lastIndex = b.end;
    }
    out += uncomment(src.slice(i));
    return { text: out, verb: keep };
  }
  function uncomment(s) {
    var lines = s.split('\n'), out = [];
    for (var k = 0; k < lines.length; k++) {
      var L = lines[k], cut = -1;
      for (var j = 0; j < L.length; j++) {
        if (L[j] === '\\' && L.startsWith('verb', j + 1) && !/[A-Za-z]/.test(L[j + 5] || 'a')) {   /* \verb|50%| is not a comment */
          var d0 = j + 5 + (L[j + 5] === '*' ? 1 : 0), d1 = L.indexOf(L[d0], d0 + 1);
          if (d1 > 0) { j = d1; continue; }
        }
        if (L[j] === '%' && !isEsc(L, j)) { cut = j; break; }
      }
      if (cut < 0) { out.push(L); continue; }
      var before = L.slice(0, cut);
      if (!before.trim()) continue;                          /* a comment line: gone, line end and all */
      if (k + 1 < lines.length) { lines[k + 1] = before + lines[k + 1].replace(/^[ \t]+/, ''); continue; }
      out.push(before);
    }
    return out.join('\n');
  }

  /* --------------------------------------------------------------- notes */
  function Notes() { this.list = []; this.seen = {}; }
  Notes.prototype.add = function (key, text) {
    if (this.seen[key]) { this.seen[key].n++; return; }
    var e = { text: text, n: 1 };
    this.seen[key] = e; this.list.push(e);
  };
  Notes.prototype.out = function () {
    return this.list.map(function (e) { return e.n > 1 ? e.text + ' (' + e.n + '×)' : e.text; });
  };

  /* ------------------------------------------------------------ inline text */
  function escHtml(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function escAttr(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function label(v) { return PT.sanitize && PT.sanitize.label ? PT.sanitize.label(v) : String(v || '').replace(/[{}\\%#$^&~\u0000-\u001f]/g, '').slice(0, 200); }

  function mathHtml(tex) {
    var tree;
    try { tree = M.parseTex(cleanMath(tex)); } catch (e) { tree = M.row([M.raw(tex)]); }
    return '<span class="imath" contenteditable="false" data-m="' + escAttr(JSON.stringify(tree)) + '"></span>';
  }
  /* The file's own shorthands without arguments — \newcommand{\R}{\mathbb{R}},
     \DeclareMathOperator{\tr}{tr} — written out in its formulas, so the page
     can draw them; the PDF is the same. (Set per read; see Reader.macro.) */
  var MACROS = {};
  function expand(t) {
    var names = Object.keys(MACROS);
    if (!names.length) return t;
    for (var n = 0; n < 4; n++) {   /* a shorthand made of another one */
      var before = t;
      t = t.replace(/\\([A-Za-z]+)(?![A-Za-z])/g, function (all, nm) { return MACROS.hasOwnProperty(nm) ? MACROS[nm] : all; });
      if (t === before) break;
    }
    return t;
  }
  /* what PaperTeX's formulas have no use for: labels, tags, spacing tweaks */
  function cleanMath(t) {
    return expand(String(t)).replace(/\\(nonumber|notag|qedhere)\b/g, '').replace(/\\(label|tag)\*?\{[^{}]*\}/g, '')
      .replace(/\\(displaystyle|textstyle)\b/g, '').trim();
  }

  var ACCENT = { "'": '́', '`': '̀', '^': '̂', '"': '̈', '~': '̃', '=': '̄', '.': '̇',
    u: '̆', v: '̌', H: '̋', c: '̧', k: '̨', r: '̊', d: '̣', b: '̱' };
  var LETTER = { i: 'ı', j: 'ȷ', o: 'ø', O: 'Ø', ss: 'ß', ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ', aa: 'å', AA: 'Å', l: 'ł', L: 'Ł' };
  var WORD = {
    LaTeX: 'LaTeX', TeX: 'TeX', LaTeXe: 'LaTeX2ε', ldots: '…', dots: '…', textellipsis: '…', textendash: '–', textemdash: '—',
    textquoteleft: '‘', textquoteright: '’', textquotedblleft: '“', textquotedblright: '”', S: '§', P: '¶', copyright: '©',
    textcopyright: '©', textregistered: '®', texttrademark: '™', textdegree: '°', degree: '°', textbackslash: '\\',
    textasciitilde: '~', textasciicircum: '^', textless: '<', textgreater: '>', textbar: '|', textbullet: '•',
    dag: '†', ddag: '‡', pounds: '£', euro: '€', textperiodcentered: '·', textmu: 'µ', slash: '/', ss: 'ß',
    quad: ' ', qquad: ' ', enspace: ' ', thinspace: ' ', space: ' ', '@': ''
  };
  var WRAP_TAG = { textbf: 'b', bfseries: 'b', textit: 'i', emph: 'i', textsl: 'i', itshape: 'i', slshape: 'i',
    underline: 'u', uline: 'u', sout: 's', st: 's', texttt: 'code', ttfamily: 'code', textsuperscript: 'sup',
    textsubscript: 'sub', hl: 'mark' };
  var SWITCH_TAG = { bf: 'b', bfseries: 'b', it: 'i', itshape: 'i', em: 'i', sl: 'i', slshape: 'i', tt: 'code', ttfamily: 'code' };
  var PLAIN_WRAP = { textrm: 1, textsf: 1, textup: 1, textnormal: 1, textmd: 1, textsc: 1, mbox: 1, makebox: 1, text: 1,
    fbox: 1, framebox: 1, foreignlanguage: 2, textcolor: 2, colorbox: 2, MakeUppercase: 1, MakeLowercase: 1, enquote: 1 };
  var DROP_ARGS = { label: 1, index: 1, vspace: 1, 'vspace*': 1, hspace: 1, 'hspace*': 1, phantom: 1, hphantom: 1, vphantom: 1,
    setlength: 2, addtolength: 2, setcounter: 2, addtocounter: 2, pagestyle: 1, thispagestyle: 1, color: 1, linespread: 1,
    bibliographystyle: 1, nocite: 1, thanks: 1, hypersetup: 1, addcontentsline: 3, markboth: 2, markright: 1, kern: 0 };
  var DROP_WORD = { noindent: 1, indent: 1, centering: 1, raggedright: 1, raggedleft: 1, par: 1, smallskip: 1, medskip: 1,
    bigskip: 1, vfill: 1, hfill: 1, null: 1, maketitle: 1, normalsize: 1, small: 1, footnotesize: 1, scriptsize: 1, tiny: 1,
    large: 1, Large: 1, LARGE: 1, huge: 1, Huge: 1, rm: 1, sf: 1, sc: 1, upshape: 1, mdseries: 1, normalfont: 1,
    nobreak: 1, allowbreak: 1, linebreak: 1, nolinebreak: 1, protect: 1, relax: 1, sloppy: 1, fussy: 1, frenchspacing: 1,
    xspace: 1, leavevmode: 1, clearpage: 1, newpage: 1 };

  function Ctx(notes) {
    this.notes = notes;
    this.cites = {};          /* every key cited, in order */
    this.citeOrder = [];
  }

  /* LaTeX text → the rich text a paragraph holds */
  Ctx.prototype.inline = function (s) {
    var out = '', i = 0, self = this;
    s = String(s || '');
    while (i < s.length) {
      var c = s[i];
      if (c === '\\') {
        var cm = cmdAt(s, i);
        var r = this.command(s, cm, i);
        out += r.html; i = r.end; continue;
      }
      if (c === '$') {
        if (s[i + 1] === '$') {   /* display maths inside running text: kept as a formula */
          var e2 = s.indexOf('$$', i + 2); if (e2 < 0) e2 = s.length;
          out += mathHtml(s.slice(i + 2, e2)); i = e2 + 2; continue;
        }
        var e = i + 1;
        while (e < s.length && !(s[e] === '$' && !isEsc(s, e))) e++;
        out += mathHtml(s.slice(i + 1, e)); i = e + 1; continue;
      }
      if (c === '{') {
        var g = group(s, i);
        /* {\bf …}, {\em …}: a switch at the start of a group */
        var sw = /^\s*\\([A-Za-z]+)(?![A-Za-z])\s*/.exec(g.text);
        if (sw && SWITCH_TAG[sw[1]]) {
          var t = SWITCH_TAG[sw[1]];
          out += '<' + t + '>' + this.inline(g.text.slice(sw[0].length)) + '</' + t + '>';
        } else out += this.inline(g.text);
        i = g.end; continue;
      }
      if (c === '}') { i++; continue; }
      if (c === '~') { out += ' '; i++; continue; }
      if (c === '`') {
        if (s[i + 1] === '`') { out += '“'; i += 2; } else { out += '‘'; i++; }
        continue;
      }
      if (c === "'" && s[i + 1] === "'") { out += '”'; i += 2; continue; }
      if (c === '-' && s[i + 1] === '-') {
        if (s[i + 2] === '-') { out += '—'; i += 3; } else { out += '–'; i += 2; }
        continue;
      }
      if (c === '\u0000') {   /* verbatim text placeholder inside a paragraph (\verb is not one) */
        var z = s.indexOf('\u0000', i + 1); i = z < 0 ? s.length : z + 1; continue;
      }
      if (/\s/.test(c)) { if (!/ $/.test(out)) out += ' '; i++; continue; }
      if (c === '&') { out += '&amp;'; i++; continue; }   /* a stray alignment tab: a character */
      out += escHtml(c); i++;
    }
    return out;
  };

  Ctx.prototype.command = function (s, cm, at) {
    var self = this, name = cm.name, end = cm.end, a;
    var html = function (h, e) { return { html: h, end: e }; };
    /* an escaped character */
    if (/^[&%$#_{}]$/.test(name)) return html(escHtml(name), end);
    if (name === '\\' || name === 'newline') {
      a = args(s, end, 0); var e0 = s[skipSp(s, end)] === '[' ? optArg(s, skipSp(s, end)).end : end;   /* \\[2pt] */
      return html('<br>', e0);
    }
    if (name === ' ' || name === ',' || name === ';' || name === ':' || name === '!' || name === '/' || name === '-') return html(name === ' ' || name === ',' || name === ';' ? ' ' : '', end);
    if (name === '(') {
      var close = s.indexOf('\\)', end); if (close < 0) close = s.length;
      return html(mathHtml(s.slice(end, close)), close + 2);
    }
    if (name === '[') {
      var close2 = s.indexOf('\\]', end); if (close2 < 0) close2 = s.length;
      return html(mathHtml(s.slice(end, close2)), close2 + 2);
    }
    /* accents: \'e, \'{e}, \c{c} */
    if (ACCENT[name] && (name.length === 1 || /[A-Za-z]/.test(name))) {
      var j = name.length === 1 && /[^A-Za-z]/.test(name) ? end : skipWs(s, end), base = '', e1 = j;
      if (s[j] === '{') { var gg = group(s, j); base = gg.text.trim(); e1 = gg.end; }
      else if (s[j] === '\\') { var cc = cmdAt(s, j); base = '\\' + cc.name; e1 = cc.end; }
      else if (j < s.length) { base = s[j]; e1 = j + 1; }
      /* \'e, \'{e}, \'{\i}: a letter, or a dotless one written as a command */
      if (base[0] === '\\') base = LETTER[base.slice(1)] || '';
      if (base.length === 1) return html(escHtml((base + ACCENT[name]).normalize('NFC')), e1);
    }
    if (LETTER[name] && !/^[A-Za-z]/.test(s[end] || '')) return html(LETTER[name], end);
    if (WORD.hasOwnProperty(name)) {
      var e2 = s.startsWith('{}', end) ? end + 2 : end;
      return html(escHtml(WORD[name]), e2);
    }
    if (name === 'today') return html(escHtml(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })), end);
    /* \verb|text|: set as code */
    if (name === 'verb' || name === 'verb*') {
      var dl = s[end], ve = s.indexOf(dl, end + 1);
      if (!dl || ve < 0) return html('', end);
      return html('<code>' + escHtml(s.slice(end + 1, ve)) + '</code>', ve + 1);
    }
    /* siunitx: \SI{3}{\metre}, \num{…} … — kept as written, in a formula
       (they work in maths too), so the units are not lost */
    if (/^(SI|si|num|qty|unit|ang|SIrange|numrange|qtyrange|SIlist|numlist|complexnum|tablenum)$/.test(name)) {
      var e4 = end;
      while (true) { var q4 = skipSp(s, e4); if (s[q4] === '{') e4 = group(s, q4).end; else if (s[q4] === '[') e4 = optArg(s, q4).end; else break; }
      return html('<span class="imath" contenteditable="false" data-m="' + escAttr(JSON.stringify(M.row([M.raw(s.slice(at, e4))]))) + '"></span>', e4);
    }
    if (name === 'ensuremath') { a = args(s, end, 1, false); return html(mathHtml(a.req[0] || ''), a.end); }
    if (name === 'begin') {
      /* an environment inside running text: displayed maths or a small
         one; the block reader handles the rest */
      var nm = /^\{([^{}]+)\}/.exec(s.slice(end));
      if (nm) {
        var b = envBody(s, end + nm[0].length, nm[1]);
        if (/^(equation|align|gather|multline|displaymath|math|eqnarray)\*?$/.test(nm[1])) return html(mathHtml(b.body.replace(/\\\\/g, ' ').replace(/&/g, '')), b.end);
        this.notes.add('env-inline:' + nm[1], '“' + nm[1] + '” inside a paragraph: its text was kept, not its layout');
        return html(this.inline(b.body), b.end);
      }
    }
    if (WRAP_TAG[name] && !SWITCH_TAG[name]) {
      a = args(s, end, 1, false);
      if (!a.req.length) return html('', end);
      var t = WRAP_TAG[name];
      return html('<' + t + '>' + this.inline(a.req[0]) + '</' + t + '>', a.end);
    }
    if (SWITCH_TAG[name]) return html('', end);   /* a switch outside a group: its effect is not kept */
    if (name === 'href') {
      a = args(s, end, 2, false);
      var u = (a.req[0] || '').replace(/\\([%#&_~])/g, '$1');
      if (!/^(https?:\/\/|mailto:|#)/i.test(u)) return html(this.inline(a.req[1] || ''), a.end);
      return html('<a href="' + escAttr(u) + '">' + this.inline(a.req[1] || '') + '</a>', a.end);
    }
    if (name === 'url' || name === 'nolinkurl') {
      a = args(s, end, 1, false);
      var u2 = (a.req[0] || '').replace(/\\([%#&_~])/g, '$1');
      return html(/^(https?:\/\/|mailto:)/i.test(u2) ? '<a href="' + escAttr(u2) + '">' + escHtml(u2) + '</a>' : escHtml(u2), a.end);
    }
    if (/^(cite|citep|citet|citealp|citeauthor|citeyear|parencite|textcite|autocite|footcite|Cite|Citep|Citet|nocite)\*?$/.test(name)) {
      /* \cite[p.~4]{key}: the page note is not kept */
      var e3 = skipSp(s, end), pre = [];
      while (s[e3] === '[') { var oa = optArg(s, e3); pre.push(oa.text); e3 = skipSp(s, oa.end); }
      if (s[e3] !== '{') return html('', end);
      var ga = group(s, e3);
      if (pre.some(function (p) { return p.trim(); })) this.notes.add('citeopt', 'Page numbers in citations (\\cite[p. 4]{…}) were left out');
      var keys = ga.text.split(',').map(function (k) { return k.trim(); }).filter(Boolean);
      keys.forEach(function (k) { if (!self.cites[k]) { self.cites[k] = 1; self.citeOrder.push(k); } });
      if (name === 'nocite') return html('', ga.end);
      return html(keys.map(function (k) { return xref('cite', k); }).join(', '), ga.end);
    }
    if (/^(ref|autoref|cref|Cref|nameref|vref|eqref|pageref)\*?$/.test(name)) {
      a = args(s, end, 1, false);
      var kind = name === 'eqref' ? 'eqref' : name === 'pageref' ? 'pageref' : 'ref';
      if (/^(autoref|cref|Cref|nameref|vref)$/.test(name)) this.notes.add('autoref', '\\' + name + ' became \\ref: write the word (“Figure”, “Section”) before it yourself');
      return html((a.req[0] || '').split(',').map(function (k) { return xref(kind, k.trim()); }).join(', '), a.end);
    }
    if (name === 'footnote') {
      a = args(s, end, 1);
      var fh = this.inline(a.req[0] || '');
      if (/class="imath"|<(b|i|a)\b/.test(fh)) this.notes.add('fnrich', 'Footnotes hold plain text here: formulas and bold or italics in them became plain words');
      return html('<span class="ftnote" contenteditable="false" data-text="' + escAttr(plain(fh)) + '"></span>', a.end);
    }
    if (DROP_ARGS.hasOwnProperty(name)) {
      a = args(s, end, DROP_ARGS[name]);
      return html('', a.end);
    }
    if (DROP_WORD[name]) return html('', s.startsWith('{}', end) ? end + 2 : end);
    if (PLAIN_WRAP[name]) {
      a = args(s, end, PLAIN_WRAP[name]);
      return html(this.inline(a.req[a.req.length - 1] || ''), a.end);
    }
    /* a command PaperTeX does not know: its text argument kept, the command
       named in the notes */
    a = args(s, end, 1);
    this.notes.add('cmd:' + name, '\\' + name + ' is not something PaperTeX has: ' + (a.req.length ? 'its text was kept without it' : 'left out'));
    return html(a.req.length ? this.inline(a.req[0]) : '', a.req.length ? a.end : end);
  };

  function xref(kind, key) {
    return '<span class="xref" contenteditable="false" data-kind="' + kind + '" data-label="' + escAttr(label(key)) + '"></span>';
  }
  /* rich text → its words (for a footnote, which holds text only) */
  function plain(html) {
    return String(html).replace(/<span class="imath"[^>]*data-m="([^"]*)"[^>]*><\/span>/g, function (_, m) {
      try { return M.plainOf(JSON.parse(m.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'))); }
      catch (e) { return ''; }
    }).replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  }
  function blankHtml(h) { return !plain(h) && !/class="(imath|xref|ftnote)"/.test(h); }

  /* ---------------------------------------------------------- equations */
  /* the lines of a displayed equation: each with its label, the first "&"
     kept as the alignment point */
  function eqLines(body, notes) {
    var b = body.trim();
    /* \begin{split} / aligned / gathered inside an equation: its lines */
    var inner = /^\\begin\{(split|aligned|gathered|alignedat)\}(\{[^{}]*\})?([\s\S]*)\\end\{\1\}$/.exec(b);
    if (inner) b = inner[3];
    var lines = [], labels = [];
    splitTop(b, '\\\\').forEach(function (L) {
      var lab = '';
      L = L.replace(/\\label\{([^{}]*)\}/, function (_, x) { lab = x.trim(); return ''; });
      if (/\\(nonumber|notag)\b/.test(L)) notes.add('nonumber', 'An equation is numbered as a whole here: \\nonumber on single lines was not kept');
      L = cleanMath(L);
      if (!L.trim()) return;
      var parts = splitTop(L, '&');
      var row;
      try {
        if (parts.length === 1) row = M.parseTex(L);
        else {
          /* a &= b, or eqnarray's a &=& b: one alignment point */
          var left = M.parseTex(parts[0]), right = M.parseTex(parts.slice(1).join(' '));
          /* "&" just before the first relation is where PaperTeX aligns
             anyway: not written into the formula, where it would show */
          var isRel = function (n) { return n && (n.t === 'ch' || n.t === 'sym') && n.cls === 'rel'; };
          var atRel = isRel(right.k[0]) && !left.k.some(isRel);
          row = M.row(atRel ? left.k.concat(right.k) : left.k.concat([M.ch('&')], right.k));
        }
      } catch (e) {
        row = M.row([M.raw(L)]);
        notes.add('mathfail', 'A formula PaperTeX could not read was kept as written');
      }
      lines.push(row); labels.push(lab);
    });
    return { lines: lines, labels: labels };
  }

  /* ----------------------------------------------------------- the reader */
  var KINDS = ['theorem', 'lemma', 'corollary', 'proposition', 'definition', 'example', 'remark'];
  var KIND_ALIAS = { thm: 'theorem', lem: 'lemma', cor: 'corollary', coro: 'corollary', prop: 'proposition',
    defn: 'definition', def: 'definition', dfn: 'definition', rem: 'remark', rmk: 'remark', ex: 'example', exmp: 'example', eg: 'example' };
  var MATH_ENV = /^(equation|align|gather|multline|flalign|eqnarray|displaymath|alignat)(\*?)$/;

  function Reader(notes, verb) {
    this.notes = notes;
    this.opts = {};           /* read()'s options: a project's files, its .bib */
    this.broken = [];         /* LaTeX that is plainly not finished (see env) */
    this.verb = verb;
    this.ctx = new Ctx(notes);
    this.thm = {};            /* environment name → theorem kind, from \newtheorem */
    this.bib = [];
    this.meta = {};
    this.uidN = 0;
  }
  Reader.prototype.id = function () {
    return PT.doc && PT.doc.uid ? PT.doc.uid() : 'b' + (++this.uidN) + Math.random().toString(36).slice(2, 6);
  };
  /* a definition PaperTeX can write out in formulas: no arguments */
  Reader.prototype.macro = function (def) {
    var m = /^\\(?:newcommand|renewcommand|providecommand)\*?\s*\{?\\([A-Za-z]+)\}?\s*\{([\s\S]*)\}\s*$/.exec(def.trim());
    if (m && group('{' + m[2] + '}', 0).end === m[2].length + 2) { MACROS[m[1]] = '{' + m[2] + '}'; return; }
    var o = /^\\DeclareMathOperator(\*?)\s*\{?\\([A-Za-z]+)\}?\s*\{([^{}]*)\}\s*$/.exec(def.trim());
    if (o) MACROS[o[2]] = '\\operatorname' + o[1] + '{' + o[3] + '}';
  };
  Reader.prototype.thmKind = function (env) {
    if (env === 'proof') return 'proof';
    if (this.thm[env]) return this.thm[env];
    if (KINDS.indexOf(env) >= 0) return env;
    return KIND_ALIAS[env] || null;
  };
  Reader.prototype.verbText = function (s) {
    var self = this;
    return s.replace(/\u0000V(\d+)\u0000/g, function (_, n) { return self.verb[+n]; });
  };

  /* the body of a document (or of an environment) → blocks */
  Reader.prototype.blocks = function (s) {
    var self = this, out = [], para = '', i = 0;
    function flush() {
      var t = para; para = '';
      if (!t.trim()) return;
      var h = self.ctx.inline(t).trim();
      /* "Keywords: …", as PaperTeX writes them */
      var kw = /^<b>Keywords:<\/b>\s*([\s\S]*)$/.exec(h);
      if (kw) { self.meta.keywords = plain(kw[1]); return; }
      if (!blankHtml(h)) out.push({ id: self.id(), t: 'para', html: h });
    }
    function push(b) { flush(); if (b) out.push(b); }
    function raw(tex) {
      tex = self.verbText(tex).trim();
      if (!tex) return;
      flush();
      var last = out[out.length - 1];
      /* one block for a run of loose commands; an environment (a drawing,
         a chart PaperTeX wrote) stays a block of its own */
      if (last && last.t === 'raw' && !/^\\begin\{/.test(tex) && !/^\\begin\{/.test(last.tex)) last.tex += '\n' + tex;
      else out.push({ id: self.id(), t: 'raw', tex: tex });
    }

    while (i < s.length) {
      var c = s[i];
      /* a blank line ends a paragraph */
      if (c === '\n') {
        var j = i + 1;
        while (j < s.length && /[ \t\r]/.test(s[j])) j++;
        if (s[j] === '\n') { flush(); i = j + 1; continue; }
        para += ' '; i++; continue;
      }
      if (c === '\u0000' && s[i + 1] === 'C') {
        /* a chart PaperTeX wrote: its settings (a "% papertex:chart" line),
           then the figure that draws it — read as the chart again */
        var zc = s.indexOf('\u0000', i + 1), json = this.charts[+s.slice(i + 2, zc)];
        i = zc + 1;
        var fj = skipWs(s, i), fm = /^\\begin\{(figure\*?)\}/.exec(s.slice(fj)), blk = null;
        try { blk = JSON.parse(json); } catch (e) { blk = null; }
        if (blk && typeof blk === 'object' && fm) {
          var fb = envBody(s, fj + fm[0].length, fm[1]);
          blk.t = 'chart'; blk.id = this.id(); blk._drawn = s.slice(fj, fb.end);
          push(blk);
          i = fb.end;
        }
        continue;
      }
      if (c === '\u0000') {     /* a verbatim environment, set aside before comments went */
        var z = s.indexOf('\u0000', i + 1);
        var vtxt = this.verb[+s.slice(i + 2, z)];
        push(this.codeBlock(vtxt));
        i = z + 1; continue;
      }
      if (c === '$' && s[i + 1] === '$') {
        var e = s.indexOf('$$', i + 2); if (e < 0) e = s.length;
        push(this.eqBlock(s.slice(i + 2, e), false, false));
        i = e + 2; continue;
      }
      if (c === '$') {          /* inline maths: carried whole, so nothing in it ends the paragraph */
        var e2 = i + 1;
        while (e2 < s.length && !(s[e2] === '$' && !isEsc(s, e2))) e2++;
        para += s.slice(i, e2 + 1); i = e2 + 1; continue;
      }
      if (c === '{') { var g = group(s, i); para += s.slice(i, g.end); i = g.end; continue; }
      if (c !== '\\') { para += c; i++; continue; }

      var cm = cmdAt(s, i), name = cm.name, a;
      if (name === '[') {
        var close = s.indexOf('\\]', cm.end); if (close < 0) close = s.length;
        push(this.eqBlock(s.slice(cm.end, close), false, false));
        i = close + 2; continue;
      }
      if (name === 'begin') {
        var m = /^\s*\{([^{}]+)\}/.exec(s.slice(cm.end));
        if (!m) { para += '\\begin'; i = cm.end; continue; }
        var env = m[1], start = i, after = cm.end + m[0].length;
        var b = envBody(s, after, env);
        var r = this.env(env, b.body, s.slice(start, b.end), b.open);
        if (r === 'inline') { para += s.slice(start, b.end); }
        else if (r === 'raw') raw(s.slice(start, b.end));
        else { flush(); r.forEach(function (x) { if (x) out.push(x); }); }
        i = b.end; continue;
      }
      var sec = /^(part|chapter|section|subsection|subsubsection|paragraph)(\*?)$/.exec(name);
      if (sec) {
        a = args(s, cm.end, 1);
        var lvl = { part: 1, chapter: 1, section: 1, subsection: 2, subsubsection: 3, paragraph: 4 }[sec[1]];
        if (sec[1] === 'part' || sec[1] === 'chapter') this.notes.add('chapter', '\\' + sec[1] + ' became a section');
        var blk = { id: this.id(), t: 'section', level: lvl, html: this.ctx.inline(a.req[0] || '').trim(), label: '', numbered: !sec[2] };
        var k = skipWs(s, a.end), lb = /^\\label\{([^{}]*)\}/.exec(s.slice(k));
        if (lb) { blk.label = label(lb[1].trim()); a.end = k + lb[0].length; }
        push(blk); i = a.end; continue;
      }
      if (name === 'label') {
        /* a label on its own line, after the block it names */
        a = args(s, cm.end, 1, false);
        var prev = out[out.length - 1];
        if (!para.trim() && prev && 'label' in prev && !prev.label) prev.label = label((a.req[0] || '').trim());
        i = a.end; continue;
      }
      if (name === 'tableofcontents') { push({ id: this.id(), t: 'toc' }); i = cm.end; continue; }
      if (name === 'clearpage' || name === 'newpage' || name === 'pagebreak' || name === 'cleardoublepage') {
        push({ id: this.id(), t: 'pagebreak' }); i = s[skipSp(s, cm.end)] === '[' ? optArg(s, skipSp(s, cm.end)).end : cm.end; continue;
      }
      if (name === 'maketitle' || name === 'par') { flush(); i = cm.end; continue; }
      if (name === 'title' || name === 'author' || name === 'date') {
        a = args(s, cm.end, 1); this.head(name, a.req[0] || ''); i = a.end; continue;
      }
      if (name === 'bibliography' || name === 'printbibliography' || name === 'addbibresource') {
        a = args(s, cm.end, name === 'printbibliography' ? 0 : 1);
        if (name !== 'addbibresource') {
          push({ id: this.id(), t: 'bib' });
          if (!this.opts.bib) this.notes.add('bibfile', 'A .bib file cannot be read here: the works you cite were added to the reference list, empty, to fill in');
        }
        i = Math.max(a.end, cm.end); continue;
      }
      if (/^(input|include|includeonly|appendix|addcontentsline|bibliographystyle|frontmatter|mainmatter|backmatter|listoffigures|listoftables|printindex)$/.test(name)) {
        a = args(s, cm.end, /^(appendix|frontmatter|mainmatter|backmatter|listoffigures|listoftables|printindex)$/.test(name) ? 0 : 1);
        if (name !== 'bibliographystyle') {
          /* the file it names is not here: kept as a comment, so the PDF
             still compiles and the line is not lost */
          if (name === 'input' || name === 'include') {
            this.notes.add('input', 'Other files (\\' + name + ') cannot be read here: the line was kept, commented out, as LaTeX code');
            raw('% ' + s.slice(i, Math.max(a.end, cm.end)));
          } else raw(s.slice(i, Math.max(a.end, cm.end)));
        }
        i = Math.max(a.end, cm.end); continue;
      }
      if (/^(vspace|vspace\*|bigskip|medskip|smallskip|vfill|noindent)$/.test(name) && !para.trim()) {
        /* spacing between blocks: PaperTeX spaces its blocks itself */
        a = args(s, cm.end, /^vspace/.test(name) ? 1 : 0);
        if (name !== 'noindent') this.notes.add('vspace', 'Hand-made spacing (\\vspace, \\bigskip …) was left out');
        var kwm = name === 'noindent' ? /^\s*\\textbf\{Keywords:\}/.exec(s.slice(cm.end)) : null;
        if (kwm) { para += '\\textbf{Keywords:}'; i = cm.end + kwm[0].length; continue; }
        i = Math.max(a.end, cm.end); continue;
      }
      if (/^(newcommand|renewcommand|providecommand|def|DeclareMathOperator|newenvironment|renewenvironment|setlength|newtheorem|theoremstyle)\*?$/.test(name)) {
        /* preamble-like commands in the body: still LaTeX, kept as such */
        var dEnd = this.defEnd(s, cm);
        this.macro(s.slice(i, dEnd)); raw(s.slice(i, dEnd)); i = dEnd; continue;
      }
      /* anything else is part of the paragraph's text, with its arguments */
      var e3 = cm.end;
      while (true) {
        var q = skipSp(s, e3);
        if (s[q] === '{') { e3 = group(s, q).end; continue; }
        if (s[q] === '[' && /^(footnote|cite\w*|parencite|textcite|autocite|item|\\)$/.test(name)) { e3 = optArg(s, q).end; continue; }
        break;
      }
      para += s.slice(i, e3); i = e3;
    }
    flush();
    return out;
  };

  /* where a definition ends: \newcommand{\x}[1][d]{…}, \def\x#1{…} */
  Reader.prototype.defEnd = function (s, cm) {
    var j = skipWs(s, cm.end);
    if (cm.name === 'def') {
      var m = /^\\[A-Za-z@]+[^{]*/.exec(s.slice(j));
      j += m ? m[0].length : 0;
      return s[j] === '{' ? group(s, j).end : j;
    }
    var n = { newcommand: 2, renewcommand: 2, providecommand: 2, DeclareMathOperator: 2, newenvironment: 3, renewenvironment: 3,
      setlength: 2, newtheorem: 2, theoremstyle: 1 }[cm.name.replace('*', '')] || 1;
    for (var k = 0; k < n; k++) {
      j = skipWs(s, j);
      while (s[j] === '[') j = skipWs(s, optArg(s, j).end);
      if (s[j] === '{') j = group(s, j).end;
      else if (s[j] === '\\') j = cmdAt(s, j).end;
    }
    j = skipSp(s, j);
    while (s[j] === '[') { j = skipWs(s, optArg(s, j).end); if (s[j] === '{') j = group(s, j).end; }
    return j;
  };

  /* one environment → blocks, or 'raw' (kept as LaTeX), or 'inline' (part
     of the paragraph around it) */
  Reader.prototype.env = function (env, body, whole, open) {
    var self = this, mm = MATH_ENV.exec(env);
    /* Not finished yet: an environment that never ends, or displayed maths
       that runs into a blank line, a heading or a float — none of which
       LaTeX allows in maths. (The LaTeX pane waits for these.) */
    if (open || (mm && (/\n[ \t]*\n/.test(body.trim()) || /\\(section|subsection|chapter|begin\{(figure|table|itemize|enumerate|equation|align|gather))\b/.test(body)))) {
      this.broken.push('\\begin{' + env + '} has no \\end{' + env + '} yet');
    }
    if (mm) {
      var multi = mm[1] !== 'equation' && mm[1] !== 'displaymath';
      return [this.eqBlock(body, !mm[2] && mm[1] !== 'displaymath', multi, mm[1])];
    }
    if (env === 'itemize' || env === 'enumerate' || env === 'description') return [this.list(env, body)];
    if (env === 'figure' || env === 'figure*') return this.figure(body, whole) || 'raw';
    if (env === 'table' || env === 'table*') return this.table(body, whole) || 'raw';
    if (env === 'tabular' || env === 'tabular*' || env === 'tabularx') return this.table(whole, whole) || 'raw';
    if (env === 'center' || env === 'flushleft' || env === 'flushright') {
      if (/\\begin\{tabular/.test(body)) return this.table(body, whole) || 'raw';
      if (/\\includegraphics/.test(body) && !/tikzpicture|\\begin\{axis/.test(body)) return this.figure(body, whole) || 'raw';
      return this.blocks(body);
    }
    if (env === 'abstract') {
      var ab = this.blocks(body).filter(function (b) { return b.html; });
      this.meta.abstract = ab.map(function (b) { return b.html; }).join('<br>');
      return [];
    }
    if (env === 'quote' || env === 'quotation' || env === 'verse') {
      var qb = this.blocks(body).filter(function (b) { return b.html; });
      return [{ id: this.id(), t: 'quote', html: qb.map(function (b) { return b.html; }).join('<br>') }];
    }
    if (env === 'thebibliography') { this.bibItems(body); return [{ id: this.id(), t: 'bib' }]; }
    if (env === 'document') return this.blocks(body);
    var kind = this.thmKind(env);
    if (kind) return this.theorem(kind, body);
    if (env === 'math') return 'inline';
    if (env === 'minipage' || env === 'small' || env === 'footnotesize') return this.blocks(body.replace(/^\s*(\[[^\]]*\])?\s*\{[^{}]*\}/, ''));
    this.notes.add('env:' + env, '“' + env + '” is not something PaperTeX has: kept as LaTeX code');
    return 'raw';
  };

  Reader.prototype.eqBlock = function (body, numbered, multi, env) {
    var r = eqLines(body, this.notes);
    if (!r.lines.length) return null;
    if (env === 'alignat' || env === 'flalign' || env === 'eqnarray') this.notes.add('eqenv', env + ' became align');
    return {
      id: this.id(), t: 'eq', numbered: numbered, env: env === 'gather' || env === 'multline' ? 'gather' : 'align',
      lines: r.lines, labels: r.labels, label: r.labels[0] || ''
    };
  };

  Reader.prototype.list = function (env, body) {
    var self = this, items = [];
    var ordered = env === 'enumerate';
    function walk(src, level, desc) {
      var cur = null, i = 0, depth = 0;
      function close() {
        if (!cur) return;
        var t = cur.text.trim();
        var h = self.ctx.inline(t).trim();
        items.splice(cur.at, 0, { html: (cur.term != null ? '<b>' + self.ctx.inline(cur.term).trim() + '</b> ' : '') + h, level: level });
        cur = null;
      }
      while (i < src.length) {
        if (src[i] === '{') { var g = group(src, i); if (cur) cur.text += src.slice(i, g.end); i = g.end; continue; }
        if (src.startsWith('\\begin{', i)) {
          var m = /^\\begin\{([^{}]+)\}/.exec(src.slice(i));
          var b = envBody(src, i + m[0].length, m[1]);
          if (/^(itemize|enumerate|description)$/.test(m[1])) {
            close();
            walk(b.body, Math.min(level + 1, 3), m[1] === 'description');
          } else if (cur) {
            if (MATH_ENV.test(m[1])) cur.text += '$' + b.body.replace(/\\\\/g, ' ').replace(/&/g, '').replace(/\\label\{[^{}]*\}/g, '') + '$';
            else { cur.text += self.ctx.inline(b.body) ? src.slice(i, b.end) : ''; self.notes.add('listenv', 'A “' + m[1] + '” inside a list item: only its text was kept'); }
          }
          i = b.end; continue;
        }
        var cm = cmdAt(src, i);
        if (cm && cm.name === 'item') {
          close();
          var j = skipSp(src, cm.end), term = null;
          if (src[j] === '[') { var o = optArg(src, j); term = o.text; j = o.end; }
          cur = { text: '', term: desc ? (term || '') : null, at: items.length };
          if (term && !desc) self.notes.add('itemlabel', 'Item labels (\\item[…]) were left out');
          i = j; continue;
        }
        if (cm) { if (cur) cur.text += src.slice(i, cm.end); i = cm.end; continue; }
        if (cur) cur.text += src[i];
        i++;
      }
      close();
    }
    walk(body, 0, env === 'description');
    if (!items.length) items.push({ html: '', level: 0 });
    return { id: this.id(), t: 'list', ordered: ordered, items: items };
  };

  /* caption and label of a float */
  Reader.prototype.capLab = function (body) {
    var cap = '', lab = '', at = -1;
    var ci = body.search(/\\caption(?![A-Za-z])/);
    if (ci >= 0) {
      var a = args(body, ci + 8, 1);
      cap = this.ctx.inline(a.req[0] || '').trim(); at = ci;
    }
    var lm = /\\label\{([^{}]*)\}/.exec(body);
    if (lm) lab = label(lm[1].trim());
    return { caption: cap, label: lab, at: at };
  };
  function placement(whole) {
    var m = /^\\begin\{[^{}]+\}\s*\[([^\]]*)\]/.exec(whole || '');
    return m && /^[htbpH!]+$/.test(m[1]) ? m[1] : 'htbp';
  }

  Reader.prototype.figure = function (body, whole) {
    if (/tikzpicture|\\begin\{axis|subfigure|subfloat|\\begin\{minipage/.test(body)) {
      this.notes.add('tikz', 'Drawings and sub-figures (TikZ, pgfplots, subfigure) were kept as LaTeX code');
      return null;
    }
    var gs = body.match(/\\includegraphics/g);
    /* PaperTeX's own frame for a figure whose image is not chosen yet */
    var ph = !gs && /Image not chosen yet/.test(body) && /\\parbox\[c\]\[[^\]]*\]\[c\]\{([0-9.]+)\\linewidth\}/.exec(body);
    if (ph) {
      var pcl = this.capLab(body);
      return [{ id: this.id(), t: 'figure', src: '', filename: '', caption: pcl.caption, width: Math.max(0.1, Math.min(1, parseFloat(ph[1]) || 0.8)),
        label: pcl.label, placement: placement(whole) }];
    }
    if (!gs || gs.length !== 1) return null;
    var gi = body.indexOf('\\includegraphics'), a = args(body, gi + 16, 1);
    var w = 0.8, opt = a.opt || '';
    var wm = /width\s*=\s*([0-9.]*)\s*\\(linewidth|textwidth|columnwidth|hsize)/.exec(opt);
    if (wm) w = Math.max(0.1, Math.min(1, parseFloat(wm[1] || '1')));
    else if (/width/.test(opt)) this.notes.add('figwidth', 'A figure width in cm or pt became a share of the line width');
    var cl = this.capLab(body);
    var file = (a.req[0] || '').trim();
    if (!(this.opts.hasFile && this.opts.hasFile(file))) this.notes.add('figimg', 'Images are not in the .tex file: choose each figure’s image again (' + file + ')');
    return [{
      id: this.id(), t: 'figure', src: '', filename: file.replace(/[{}\\%#]/g, ''), caption: cl.caption, width: Math.round(w * 100) / 100,
      label: cl.label, placement: placement(whole)
    }];
  };

  Reader.prototype.table = function (body, whole) {
    var self = this;
    var tm = /\\begin\{(tabularx?|tabular\*)\}/.exec(body);
    if (!tm) return null;
    var bi = tm.index + tm[0].length;
    if (tm[1] !== 'tabular') {   /* tabular* and tabularx have a width first */
      bi = skipWs(body, bi); if (body[bi] === '{') bi = group(body, bi).end;
    }
    bi = skipWs(body, bi);
    if (body[bi] === '[') bi = optArg(body, bi).end;
    bi = skipWs(body, bi);
    if (body[bi] !== '{') return null;
    var spec = group(body, bi), tb = envBody(body, spec.end, tm[1]);
    if ((body.match(/\\begin\{tabular/g) || []).length > 1 || /\\multirow/.test(tb.body)) {
      this.notes.add('tablecomplex', 'A table with merged rows or nested tables was kept as LaTeX code');
      return null;
    }
    /* columns: l c r; p{…} m{…} b{…} X as l; |: ruled; @{…} >{…} <{…} skipped */
    var align = [], rules = false, sp = spec.text.replace(/\*\{(\d+)\}\{([^{}]*)\}/g, function (_, n, x) { return new Array(+n + 1).join(x); });
    for (var k = 0; k < sp.length; k++) {
      var c = sp[k];
      if (c === '|') rules = true;
      else if (/[lcr]/.test(c)) align.push(c);
      else if (/[pmbX]/.test(c)) { align.push('l'); if (sp[k + 1] === '{') k = group(sp, k + 1).end - 1; }
      else if (/[@><!]/.test(c) && sp[k + 1] === '{') k = group(sp, k + 1).end - 1;
    }
    var src = tb.body, booktabs = /\\toprule/.test(src);
    var rowsTex = splitTop(src, '\\\\');
    var rows = [], ruleAfterFirst = false;
    rowsTex.forEach(function (r, ri) {
      var hadRule = /^\s*(\[[^\]]*\])?\s*\\(midrule|hline|cmidrule)/.test(r);
      if (rows.length === 1 && hadRule && /\\midrule|\\hline/.test(r)) ruleAfterFirst = true;
      var t = r.replace(/^\s*\[[^\]]*\]/, '').replace(/\\(toprule|midrule|bottomrule|hline|endhead|endfirsthead)\b(\[[^\]]*\])?/g, '')
        .replace(/\\(cline|cmidrule)(\([^)]*\))?\{[^{}]*\}/g, '').replace(/\\rowcolor(\[[^\]]*\])?\{[^{}]*\}/g, '');
      if (!t.trim()) return;
      var cells = [];
      splitTop(t, '&').forEach(function (cell) {
        var mc = /^\s*\\multicolumn\{(\d+)\}\{[^{}]*\}\{([\s\S]*)\}\s*$/.exec(cell);
        if (mc) {
          cells.push(mc[2]);
          for (var n = 1; n < +mc[1]; n++) cells.push('');
          self.notes.add('multicol', 'Merged columns (\\multicolumn) became separate cells');
        } else cells.push(cell);
      });
      rows.push(cells.map(function (x) { return x.trim(); }));
    });
    if (!rows.length) return null;
    var w = Math.max(align.length, Math.max.apply(null, rows.map(function (r) { return r.length; })));
    while (align.length < w) align.push('c');
    rows.forEach(function (r) { while (r.length < w) r.push(''); });
    var bold = function (x) { return /^\\textbf\{[\s\S]*\}$/.test(x) && group(x, 7).end === x.length || /^\{\\bf(series)?\s/.test(x); };
    var unbold = function (x) { return bold(x) ? (x[0] === '{' ? x.replace(/^\{\\bf(series)?\s*/, '').slice(0, -1) : x.slice(8, -1)) : x; };
    var headBold = rows.length > 1 && rows[0].every(function (x) { return !x || bold(x); }) && rows[0].some(bold);
    var header = rows.length > 1 && (ruleAfterFirst || headBold);
    var firstBold = rows.length > (header ? 2 : 1) && rows.slice(header ? 1 : 0).every(function (r) { return !r[0] || bold(r[0]); }) && rows.slice(header ? 1 : 0).some(function (r) { return bold(r[0]); });
    var html = rows.map(function (r, ri) {
      return r.map(function (x, ci) {
        if ((ri === 0 && header && headBold) || (firstBold && ci === 0 && !(ri === 0 && header))) x = unbold(x);
        return self.ctx.inline(x).trim();
      });
    });
    var cl = this.capLab(body), tabAt = body.indexOf(tm[0]);
    var size = /\\(small|footnotesize|large)\b/.exec(body.slice(0, tabAt));
    var zebra = /\\rowcolors/.test(body);
    return [{
      id: this.id(), t: 'table', rows: html, align: align.slice(0, w), header: header, booktabs: booktabs, rules: rules && !booktabs,
      boldHeader: header ? headBold : undefined, boldFirst: firstBold || undefined,
      caption: cl.caption, label: cl.label, placement: placement(whole),
      capBelow: cl.at > tabAt, size: size ? size[1] : undefined, zebra: zebra || undefined
    }];
  };

  Reader.prototype.theorem = function (kind, body) {
    var title = '', lab = '';
    var t = body.replace(/^\s*\[([^\]]*)\]/, function (_, x) { title = x.replace(/^\{([\s\S]*)\}$/, '$1'); return ''; });
    t = t.replace(/^\s*\\label\{([^{}]*)\}/, function (_, x) { lab = x.trim(); return ''; });
    t = t.replace(/\\qedhere\b/g, '');
    var inner = this.blocks(t);
    var b = { id: this.id(), t: 'theorem', kind: kind, title: title ? this.ctx.inline(title).trim() : '', html: '', label: label(lab) };
    var out = [b], i = 0;
    if (inner[0] && inner[0].t === 'para') { b.html = inner[0].html; i = 1; }
    /* what follows in it belongs to it: paragraphs, equations, lists */
    for (; i < inner.length; i++) {
      var p = inner[i];
      if (p.t === 'para' || p.t === 'eq' || p.t === 'list') { p.inEnv = true; out.push(p); }
      else { this.notes.add('thmpart', 'A ' + p.t + ' inside a ' + kind + ' was placed after it'); out.push(p); }
    }
    /* a part must sit between the theorem and another part: a trailing
       non-part ends the chain, as the editor expects */
    return out;
  };

  Reader.prototype.codeBlock = function (v) {
    var m = /^\\begin\{(verbatim\*?|lstlisting|minted|Verbatim)\}/.exec(v);
    if (!m) return null;
    var rest = v.slice(m[0].length), lang = '', caption = '';
    if (m[1] === 'minted') {
      rest = rest.replace(/^\s*(\[[^\]]*\])?\s*\{([^{}]*)\}/, function (_, o, l) { lang = l; return ''; });
    } else if (rest[0] === '[' || /^[ \t]*\[/.test(rest)) {
      rest = rest.replace(/^[ \t]*\[([^\]]*)\]/, function (_, o) {
        var lm = /language\s*=\s*\{?([A-Za-z+#]+)\}?/.exec(o); if (lm) lang = lm[1];
        var cm = /caption\s*=\s*\{([^{}]*)\}|caption\s*=\s*([^,\]]*)/.exec(o); if (cm) caption = (cm[1] || cm[2] || '').trim();
        return '';
      });
    }
    var endTag = '\\end{' + m[1] + '}';
    var text = rest.slice(0, rest.lastIndexOf(endTag)).replace(/^[ \t]*\n/, '').replace(/\n[ \t]*$/, '');
    if (lang && m[1] === 'minted') lang = lang.charAt(0).toUpperCase() + lang.slice(1);
    return { id: this.id(), t: 'code', lang: lang, text: text, caption: caption };
  };

  Reader.prototype.bibItems = function (body) {
    var self = this;
    var parts = body.split(/\\bibitem(?![A-Za-z])/).slice(1);
    parts.forEach(function (p) {
      var j = skipWs(p, 0);
      if (p[j] === '[') j = skipWs(p, optArg(p, j).end);
      var key = '';
      if (p[j] === '{') { var g = group(p, j); key = g.text.trim(); j = g.end; }
      var h = self.ctx.inline(p.slice(j)).trim().replace(/\s*<br>\s*$/, '');
      var e = { key: label(key) || 'ref' + (self.bib.length + 1), author: '', title: '', journal: '', year: '' };
      /* "Author, <i>Title</i>, Journal, Year." — as PaperTeX writes them;
         other layouts: author before the title, the rest as is */
      var ti = /<i>([\s\S]*?)<\/i>/.exec(h);
      if (ti) {
        e.author = h.slice(0, ti.index).replace(/[\s,.:]+$/, '');
        e.title = ti[1];
        var tail = h.slice(ti.index + ti[0].length).replace(/^[\s,.:]+/, '').replace(/\.\s*$/, '');
        var bits = tail.split(/,\s*/), yi = -1;
        bits.forEach(function (b, k) { if (/^\(?\s*(1[5-9]|20)\d\d[a-z]?\s*\)?$/.test(b.trim())) yi = k; });
        if (yi >= 0) {
          e.year = bits[yi].replace(/[()\s]/g, '');
          e.journal = bits.slice(0, yi).join(', ');
          if (yi < bits.length - 1) e.note = bits.slice(yi + 1).join(', ');
        } else e.journal = tail;
      } else {
        e.note = h.replace(/\.\s*$/, '');
      }
      self.bib.push(e);
    });
  };

  /* \title, \author, \date */
  Reader.prototype.head = function (what, v) {
    var self = this;
    v = v.replace(/\\thanks\{[^{}]*\}/g, '');
    if (what === 'title') { this.meta.title = this.ctx.inline(v.replace(/\\\\/g, ' ')).trim(); return; }
    if (what === 'date') {
      var d = v.trim();
      this.meta.date = d === '\\today' ? '\\today' : d === '' ? '' : this.ctx.inline(d).trim();
      return;
    }
    this.meta.authors = v.split(/\\and(?![A-Za-z])/).map(function (one) {
      var lines = splitTop(one, '\\\\').map(function (x) { return x.trim(); }).filter(Boolean);
      var a = { name: self.ctx.inline(lines.shift() || '').trim(), affil: '', email: '' }, aff = [];
      lines.forEach(function (L) {
        var em = /\\(texttt|href|url)\{(?:mailto:)?([^{}@\s]+@[^{}\s]+)\}/.exec(L) || /([^\s{}]+@[^\s{}]+)/.exec(L);
        if (em) a.email = (em[2] || em[1]).replace(/^mailto:/, '');
        else aff.push(self.ctx.inline(L).trim());
      });
      a.affil = aff.filter(Boolean).join(', ');
      return a;
    }).filter(function (a) { return a.name || a.affil; });
  };

  /* ------------------------------------------------------------ preamble */
  /* what PaperTeX always loads itself. The ones it loads only when a block
     needs them (graphicx, pgfplots, booktabs, listings …) are kept: LaTeX
     code kept from the file may need them, and loading one twice is fine. */
  var AUTO_PKG = { inputenc: 1, fontenc: 1, amsmath: 1, amssymb: 1, geometry: 1, hyperref: 1, babel: 1, fixltx2e: 1 };
  var LANGS = { english: 1, ngerman: 1, german: 'ngerman', french: 1, spanish: 1, italian: 1, turkish: 1, portuguese: 1,
    british: 'english', american: 'english', USenglish: 'english', UKenglish: 'english', francais: 'french', brazilian: 'portuguese' };

  Reader.prototype.preamble = function (s, settings) {
    var self = this, extra = [], i = 0;
    while (i < s.length) {
      if (s[i] !== '\\') { i++; continue; }
      var cm = cmdAt(s, i), name = cm.name, a;
      if (name === 'documentclass') {
        a = args(s, cm.end, 1);
        var cls = (a.req[0] || 'article').trim();
        if (/^(article|report|book)$/.test(cls)) settings.docclass = cls;
        else {
          settings.docclass = /book/.test(cls) ? 'book' : /report|thesis/.test(cls) ? 'report' : 'article';
          this.notes.add('class', 'The document class “' + cls + '” became ' + settings.docclass);
        }
        (a.opt || '').split(',').map(function (o) { return o.trim(); }).forEach(function (o) {
          if (/^(10|11|12)pt$/.test(o)) settings.fontsize = o;
          else if (/^(a4|letter|a5)paper$/.test(o)) settings.paper = o;
          else if (o === 'twocolumn') settings.columns = 2;
          else if (o === 'onecolumn') settings.columns = 1;
          else if (o === 'titlepage') settings.titlepage = true;
        });
        i = a.end; continue;
      }
      if (name === 'usepackage' || name === 'RequirePackage') {
        a = args(s, cm.end, 1);
        var opts = a.opt || '', keepPk = [];
        (a.req[0] || '').split(',').map(function (p) { return p.trim(); }).filter(Boolean).forEach(function (p) {
          if (p === 'geometry') {
            var mg = /(?:^|,)\s*margin\s*=\s*([0-9.]+\s*(?:cm|mm|in|pt))/.exec(opts);
            if (mg) settings.margin = mg[1].replace(/\s+/g, '');
            else if (opts.trim()) self.notes.add('geometry', 'Page layout options other than margin= were not kept (geometry: ' + opts.trim() + ')');
          } else if (p === 'babel') {
            var langs = opts.split(',').map(function (x) { return x.trim(); }).filter(Boolean), last = langs[langs.length - 1];
            var L = last && LANGS[last];
            if (L) settings.lang = L === 1 ? last : L;
            else if (last) { settings.lang = 'english'; keepPk.push('\\usepackage[' + opts + ']{babel}'); }
          } else if (!AUTO_PKG[p]) keepPk.push('\\usepackage' + (opts && (a.req[0] || '').indexOf(',') < 0 ? '[' + opts + ']' : '') + '{' + p + '}');
        });
        extra.push.apply(extra, keepPk);
        i = a.end; continue;
      }
      if (name === 'newtheorem' || name === 'newtheorem*') {
        /* \newtheorem{env}[counter]{Name}[within] */
        a = { req: [], end: cm.end };
        var p2 = skipWs(s, cm.end);
        if (s[p2] === '{') { var g1 = group(s, p2); a.req.push(g1.text); p2 = skipWs(s, g1.end); }
        if (s[p2] === '[') p2 = skipWs(s, optArg(s, p2).end);
        if (s[p2] === '{') { var g2 = group(s, p2); a.req.push(g2.text); p2 = g2.end; }
        a.end = p2;
        var env = (a.req[0] || '').trim(), disp = (a.req[1] || '').trim().toLowerCase();
        var k = KINDS.indexOf(disp) >= 0 ? disp : KIND_ALIAS[env] || null;
        if (!k) { k = 'theorem'; this.notes.add('thm:' + env, '“' + (a.req[1] || env) + '” statements became theorems'); }
        this.thm[env] = k;
        if (/^\[section\]$/.test(s.slice(skipSp(s, a.end), skipSp(s, a.end) + 9))) settings.thmWithin = true;
        var after = skipSp(s, a.end);
        if (s[after] === '[') { var o2 = optArg(s, after); if (/section/.test(o2.text)) settings.thmWithin = true; a.end = o2.end; }
        i = a.end; continue;
      }
      if (name === 'title' || name === 'author' || name === 'date') {
        a = args(s, cm.end, 1); this.head(name, a.req[0] || ''); i = a.end; continue;
      }
      if (name === 'setcounter') {
        a = args(s, cm.end, 2);
        if (a.req[0] === 'secnumdepth' && /^-?\d+$/.test((a.req[1] || '').trim()) && +a.req[1] <= 0) settings.numbered = false;
        else extra.push(s.slice(i, a.end));
        i = a.end; continue;
      }
      if (/^(onehalfspacing|doublespacing|singlespacing)$/.test(name)) {
        settings.lineSpacing = { onehalfspacing: 1.5, doublespacing: 2, singlespacing: 1 }[name]; i = cm.end; continue;
      }
      if (name === 'setstretch' || name === 'linespread') {
        a = args(s, cm.end, 1);
        var v = parseFloat(a.req[0]);
        if (v > 0) settings.lineSpacing = name === 'linespread' ? Math.round(v / 1.2 * 4) / 4 || 1 : v;
        i = a.end; continue;
      }
      if (/^(hypersetup|theoremstyle|graphicspath|bibliographystyle|pagestyle)$/.test(name)) {
        a = args(s, cm.end, 1); i = a.end; continue;
      }
      if (/^(newcommand|renewcommand|providecommand|def|DeclareMathOperator|newenvironment|renewenvironment|setlength|usetikzlibrary|usepgfplotslibrary|pgfplotsset|definecolor|newcounter|numberwithin|let|lstset|tikzset|DeclareUnicodeCharacter|captionsetup|setlist|newlength|newif|makeatletter|makeatother|AtBeginDocument|sisetup|allowdisplaybreaks|addbibresource)\*?$/.test(name)) {
        var dEnd = /^(makeatletter|makeatother|allowdisplaybreaks)$/.test(name) ? cm.end :
          name === 'let' ? (/^\\let\\[A-Za-z@]+\s*=?\s*\\[A-Za-z@]+/.exec(s.slice(i)) || [s.slice(i, cm.end)])[0].length + i :
          /^(usetikzlibrary|usepgfplotslibrary|pgfplotsset|definecolor|newcounter|numberwithin|lstset|tikzset|DeclareUnicodeCharacter|captionsetup|setlist|newlength|newif|AtBeginDocument|sisetup|addbibresource)$/.test(name) ? args(s, cm.end, { definecolor: 3, numberwithin: 2, DeclareUnicodeCharacter: 2, setlist: 1 }[name] || 1).end :
          this.defEnd(s, cm);
        if (name === 'addbibresource') {
          if (!this.opts.bib) this.notes.add('bibfile', 'A .bib file cannot be read here: the works you cite were added to the reference list, empty, to fill in');
        } else extra.push(s.slice(i, dEnd).trim());
        this.macro(s.slice(i, dEnd));
        i = dEnd; continue;
      }
      /* anything else in the preamble: kept as it was written */
      a = args(s, cm.end, 1);
      var endA = Math.max(a.end, cm.end);
      extra.push(s.slice(i, endA).trim());
      this.notes.add('pre:' + name, '\\' + name + ' in the preamble was kept as it is');
      i = endA;
    }
    return extra.filter(Boolean).join('\n');
  };

  /* ------------------------------------------------------------ projects */
  /* A project's other .tex files, written in where \input, \include or
     \subfile name them (not inside a comment). files: path → text. */
  function findFile(files, name, exts) {
    var n = String(name || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
    var keys = Object.keys(files);
    var tries = [n].concat((exts || []).map(function (e) { return n + e; }));
    for (var t = 0; t < tries.length; t++) {
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k].replace(/\\/g, '/').replace(/^\.\//, '');
        if (key === tries[t] || key.slice(-tries[t].length - 1) === '/' + tries[t]) return keys[k];
      }
    }
    return null;
  }
  function commentAt(line) {
    for (var j = 0; j < line.length; j++) {
      if (line[j] === '\\') { j++; continue; }
      if (line[j] === '%') return j;
    }
    return -1;
  }
  function expandInputs(src, files, depth) {
    if (!files || depth > 8) return src;
    return src.split('\n').map(function (line) {
      var cut = commentAt(line), code = cut < 0 ? line : line.slice(0, cut), rest = cut < 0 ? '' : line.slice(cut);
      code = code.replace(/\\(input|include|subfile)\s*\{([^{}]+)\}/g, function (all, cmd, name) {
        var key = findFile(files, name, ['.tex']);
        if (key == null || typeof files[key] !== 'string') return all;
        var inner = files[key].replace(/^[\s\S]*?\\begin\{document\}/, '').replace(/\\end\{document\}[\s\S]*$/, '');   /* a subfile's own wrapper */
        return (cmd === 'include' ? '\\clearpage\n' : '') + expandInputs(inner, files, depth + 1) + '\n';
      });
      return code + rest;
    }).join('\n');
  }

  /* A .bib file → { key: { type, fields } }. Values in braces, quotes or
     bare (numbers, @string names), joined with #. */
  function parseBib(text) {
    var t = String(text || '').replace(/\r/g, ''), out = {}, strings = { jan: 'January', feb: 'February', mar: 'March',
      apr: 'April', may: 'May', jun: 'June', jul: 'July', aug: 'August', sep: 'September', oct: 'October', nov: 'November', dec: 'December' };
    var i = 0;
    function value(b, k) {   /* one value at b[k]: returns [text, end] */
      var parts = [];
      while (k < b.length) {
        k = skipWs(b, k);
        if (b[k] === '{') { var g = group(b, k); parts.push(g.text); k = g.end; }
        else if (b[k] === '"') {
          var e = k + 1, depth = 0;
          while (e < b.length && !(b[e] === '"' && !depth && b[e - 1] !== '\\')) { if (b[e] === '{') depth++; else if (b[e] === '}') depth--; e++; }
          parts.push(b.slice(k + 1, e)); k = e + 1;
        } else {
          var m = /^[^,#}\s]+/.exec(b.slice(k));
          if (!m) break;
          parts.push(strings.hasOwnProperty(m[0].toLowerCase()) ? strings[m[0].toLowerCase()] : m[0]); k += m[0].length;
        }
        k = skipWs(b, k);
        if (b[k] === '#') { k++; continue; }
        break;
      }
      return [parts.join(''), k];
    }
    while ((i = t.indexOf('@', i)) >= 0) {
      var m = /^@\s*(\w+)\s*([{(])/.exec(t.slice(i));
      if (!m) { i++; continue; }
      var type = m[1].toLowerCase(), j = i + m[0].length - 1, body;
      if (m[2] === '{') body = group(t, j);
      else { var cl = t.indexOf(')', j); body = { text: t.slice(j + 1, cl < 0 ? t.length : cl), end: cl < 0 ? t.length : cl + 1 }; }
      i = body.end;
      if (type === 'comment' || type === 'preamble') continue;
      var b = body.text;
      if (type === 'string') {
        var sm = /^\s*([A-Za-z][\w-]*)\s*=\s*/.exec(b);
        if (sm) strings[sm[1].toLowerCase()] = value(b, sm[0].length)[0];
        continue;
      }
      var comma = b.indexOf(',');
      if (comma < 0) continue;
      var key = b.slice(0, comma).trim(), fields = {}, k = comma + 1;
      while (k < b.length) {
        var fm = /^[\s,]*([A-Za-z][\w:-]*)\s*=\s*/.exec(b.slice(k));
        if (!fm) break;
        k += fm[0].length;
        var v = value(b, k);
        fields[fm[1].toLowerCase()] = v[0].replace(/\s+/g, ' ').trim();
        k = v[1];
      }
      if (key) out[key] = { type: type, fields: fields };
    }
    return out;
  }
  /* a .bib entry → a reference-list entry (rich text, as PaperTeX keeps them) */
  function bibEntry(key, e, ctx) {
    var f = e.fields, h = function (s) { return s ? ctx.inline(s).trim() : ''; };
    /* "Last, First and Other, A." → "First Last and A. Other" */
    var names = (f.author || f.editor || '').split(/\s+and\s+/i).map(function (n) {
      var p = n.split(','); return p.length === 2 ? (p[1].trim() + ' ' + p[0].trim()) : n.trim();
    }).filter(Boolean);
    var who = names.length > 2 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names.join(' and ');
    var where = f.journal || f.booktitle || f.publisher || f.school || f.institution || f.howpublished || '';
    if (f.volume) where += (where ? ' ' : '') + f.volume + (f.number ? '(' + f.number + ')' : '');
    if (f.pages) where += (where ? ', ' : '') + f.pages.replace(/-+/g, '--');
    var note = f.note || (f.doi ? 'doi:' + f.doi : f.url ? '\\url{' + f.url + '}' : '');
    var out = { key: key, author: h(who), title: h(f.title), journal: h(where), year: h(f.year || (f.date || '').slice(0, 4)) };
    if (note) out.note = h(note);
    return out;
  }

  /* --------------------------------------------------------------- read */
  function read(src, opts) {
    opts = opts || {};
    var notes = new Notes();
    /* a chart's settings ride in a comment: kept before comments go */
    var charts = [];
    src = expandInputs(String(src || '').replace(/\r\n?/g, '\n'), opts.files, 0).replace(/^[ \t]*% ?papertex:chart (\{.*\})[ \t]*$/gm, function (_, j) {
      charts.push(j);
      return '\u0000C' + (charts.length - 1) + '\u0000';
    });
    var sc = stripComments(src);
    var rd = new Reader(notes, sc.verb);
    rd.charts = charts;
    rd.opts = opts;
    MACROS = {};
    var s = sc.text;
    var base = PT.doc && PT.doc.newDoc ? PT.doc.newDoc() : { meta: {}, settings: {}, blocks: [], bib: [] };
    var settings = base.settings;
    settings.margin = '2.5cm';

    var bd = s.indexOf('\\begin{document}');
    var pre = bd >= 0 ? s.slice(0, bd) : '';
    var body;
    if (bd >= 0) {
      var ed = s.indexOf('\\end{document}', bd);
      body = s.slice(bd + 16, ed >= 0 ? ed : s.length);
    } else body = s;   /* a fragment: just a body */
    settings.preamble = rd.preamble(pre, settings);
    /* without \documentclass, the LaTeX page has no margins set by hand:
       PaperTeX's own default stays */

    var blocks = rd.blocks(body).filter(Boolean);
    /* charts read back: the table each takes its data from, by its place
       among the tables; and a chart whose drawing was since edited as
       LaTeX is that LaTeX (the edit wins over the settings) */
    var tables = blocks.filter(function (b) { return b.t === 'table'; });
    var docNow = { meta: base.meta, settings: settings, blocks: blocks, bib: rd.bib };
    blocks = blocks.map(function (b) {
      if (b.t !== 'chart') return b;
      if (typeof b.fromTable === 'number') { b.from = b.fromTable >= 0 && tables[b.fromTable] ? tables[b.fromTable].id : ''; }
      delete b.fromTable;
      var drawn = b._drawn; delete b._drawn;
      if (PT.latex && PT.latex.texOf && PT.chart) {
        var flat = function (t) { return String(t || '').replace(/(^|[^\\])%.*$/gm, '$1').replace(/\s+/g, ' ').trim(); };
        if (flat(PT.latex.texOf(b, docNow)) !== flat(drawn)) {
          notes.add('chartedit', 'A chart whose LaTeX was edited by hand was kept as that LaTeX');
          return { id: rd.id(), t: 'raw', tex: drawn };
        }
      }
      return b;
    });
    /* every work cited has an entry, and the list is somewhere */
    /* every work cited has an entry: from the project's .bib when there is
       one (
ocite{*}: all of it), else empty, to fill in */
    var bibdb = opts.bib ? parseBib(opts.bib) : {};
    var cited = rd.ctx.citeOrder.slice();
    if (cited.indexOf('*') >= 0) cited = cited.filter(function (k) { return k !== '*'; }).concat(Object.keys(bibdb));
    var missing = [];
    cited.forEach(function (k) {
      var key = label(k);
      if (rd.bib.some(function (e) { return e.key === key; })) return;
      if (bibdb[k]) rd.bib.push(bibEntry(key, bibdb[k], rd.ctx));
      else { rd.bib.push({ key: key, author: '', title: '', journal: '', year: '' }); if (opts.bib) missing.push(k); }
    });
    if (missing.length) notes.add('bibmissing', 'Not in the .bib file, so left empty to fill in: ' + missing.join(', '));
    if (rd.bib.length && !blocks.some(function (b) { return b.t === 'bib'; })) blocks.push({ id: rd.id(), t: 'bib' });
    /* a package kept from the file that the writer loads anyway for these
       blocks: once is enough */
    var has = function (f) { return blocks.some(f); };
    var html = blocks.map(function (b) { return (b.html || '') + (b.items || []).map(function (x) { return x.html; }).join(''); }).join('');
    var writes = {
      booktabs: has(function (b) { return b.t === 'table' && b.booktabs; }),
      amsthm: has(function (b) { return b.t === 'theorem'; }),
      listings: has(function (b) { return b.t === 'code' && b.lang; }),
      ulem: /<s>/.test(html), soul: /<mark>/.test(html),
      setspace: settings.lineSpacing && settings.lineSpacing !== 1
    };
    settings.preamble = settings.preamble.split('\n').filter(function (L) {
      var m = /^\\usepackage\{([A-Za-z0-9-]+)\}$/.exec(L.trim());
      return !(m && writes[m[1]]);
    }).join('\n');
    /* a line to go on writing at the end */
    if (!blocks.length || blocks[blocks.length - 1].t !== 'para') blocks.push({ id: rd.id(), t: 'para', html: '' });

    var m = rd.meta;
    var meta = base.meta;
    meta.title = m.title != null ? m.title : '';
    meta.authors = m.authors && m.authors.length ? m.authors : [{ name: '', affil: '', email: '' }];
    meta.date = m.date != null ? m.date : (bd >= 0 ? '\\today' : '\\today');
    meta.abstract = m.abstract || '';
    meta.keywords = m.keywords || '';
    meta.headHtml = true; meta.bibHtml = true;
    settings.showAbstract = !!m.abstract || bd < 0;
    /* preamble lines the page writes by itself for these blocks (a chart's
       pgfplots setup …) are not "extra" (only where the writer is here) */
    if (PT.latex && PT.latex.build) {
      try {
        var auto = PT.latex.build({ meta: meta, settings: Object.assign({}, settings, { preamble: '' }), blocks: blocks, bib: rd.bib }, { chartData: false })
          .split('\\begin{document}')[0].split('\n').map(function (x) { return x.trim(); });
        settings.preamble = String(settings.preamble || '').split('\n').filter(function (x) { return x.trim() && auto.indexOf(x.trim()) < 0; }).join('\n');
      } catch (e) { /* keep it as read */ }
    }
    return { doc: { meta: meta, settings: settings, blocks: blocks, bib: rd.bib }, notes: notes.out(), broken: rd.broken };
  }

  /* does this text look like LaTeX, not a project file? */
  function looksLikeTex(text) {
    var t = String(text || '').trim();
    if (/^[{[]/.test(t)) return false;
    return /\\(documentclass|begin\{document\}|section|begin\{|usepackage|title)\b/.test(t);
  }

  /* A whole project — an Overleaf .zip, or several files picked together:
     files is path → Uint8Array. The main .tex is the one with
     \documentclass (main.tex first); its \input files, .bib files and
     images come from the rest. Images the page can show are put into
     their figures; PDF and EPS ones are named in the notes. */
  var RASTER = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
  function decode(bytes) {
    var t = new TextDecoder('utf-8').decode(bytes);
    /* not UTF-8 (an older project in Latin-1): read it as that */
    if ((t.match(/�/g) || []).length > 2) { try { t = new TextDecoder('windows-1252').decode(bytes); } catch (e) { /* keep */ } }
    return t;
  }
  function b64(bytes) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function readProject(files) {
    var texts = {}, bibs = [], names = Object.keys(files);
    names.forEach(function (n) {
      if (/\.(tex|ltx|sty|cls)$/i.test(n)) texts[n] = decode(files[n]);
      else if (/\.bib$/i.test(n)) bibs.push(decode(files[n]));
    });
    var mains = Object.keys(texts).filter(function (n) { return /\.(tex|ltx)$/i.test(n) && /\\documentclass/.test(texts[n]); });
    if (!mains.length) mains = Object.keys(texts).filter(function (n) { return /\.(tex|ltx)$/i.test(n); });
    if (!mains.length) throw new Error('There is no .tex file in it');
    mains.sort(function (a, b) {
      var ma = /(^|\/)main\.tex$/i.test(a), mb = /(^|\/)main\.tex$/i.test(b);
      if (ma !== mb) return ma ? -1 : 1;
      var da = /\\begin\{document\}/.test(texts[a]), db = /\\begin\{document\}/.test(texts[b]);
      if (da !== db) return da ? -1 : 1;
      return texts[b].length - texts[a].length;
    });
    var main = mains[0];
    var image = function (name) { return findFile(files, name, ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.eps']); };
    var r = read(texts[main], { files: texts, bib: bibs.join('\n'), hasFile: function (n) { return !!image(n); } });   /* a PDF image has its own note below */
    var vector = [];
    r.doc.blocks.forEach(function (b) {
      if (b.t !== 'figure' || b.src || !b.filename) return;
      var k = image(b.filename);
      if (!k) return;
      var ext = k.split('.').pop().toLowerCase();
      if (!RASTER[ext]) { vector.push(k.replace(/^.*[\\/]/, '')); return; }
      b.src = 'data:' + RASTER[ext] + ';base64,' + b64(files[k]);
      b.filename = k.replace(/^.*[\\/]/, '');   /* the compiler gets it by this name */
    });
    if (vector.length) r.notes.unshift('PDF and EPS images cannot be shown on the page: save them as PNG and choose them again (' + vector.join(', ') + ')');
    r.main = main;
    return r;
  }

  /* Pasted text: a whole document (open it, or insert its body), LaTeX to
     read into blocks, or ordinary text. Ordinary text with a "$5" or a
     Windows path in it must stay ordinary: only LaTeX's own commands, or
     $…$ with maths in it, count. */
  function isDocument(text) { return /\\documentclass\b|\\begin\{document\}/.test(String(text || '')); }
  function isLatex(text) {
    var t = String(text || '');
    if (isDocument(t)) return true;
    if (/\\(section|subsection|subsubsection|chapter|paragraph|begin|item|cite|citep|citet|ref|eqref|autoref|cref|label|emph|textbf|textit|texttt|underline|footnote|frac|sqrt|sum|int|alpha|beta|gamma|mathbb|mathrm|left|includegraphics|caption|maketitle|tableofcontents)\b/.test(t)) return true;
    if (/\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/.test(t)) return true;
    return /(^|[^\\$])\$[^$\n]*[\\^_{][^$\n]*\$/.test(t);
  }

  window.PT = window.PT || {};
  window.PT.texread = { read: read, readProject: readProject, parseBib: parseBib, looksLikeTex: looksLikeTex, isLatex: isLatex, isDocument: isDocument };
})();
