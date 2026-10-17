/* PaperTeX — the document model and the on-paper editor.
   Everything the user does happens on the page itself; blocks are the model. */
(function () {
  'use strict';
  var M = PT.math;

  var uidN = 0;
  function uid() { return 'b' + (++uidN) + Math.random().toString(36).slice(2, 6); }

  /* After Backspace has taken a block away, the repeats of that same held
     key are swallowed until it is let go (see removeBlock). */
  var bsHeld = false;
  function holdBackspace() { bsHeld = true; }
  document.addEventListener('keydown', function (e) {
    if (bsHeld && e.key === 'Backspace' && e.repeat) { e.preventDefault(); e.stopPropagation(); }
    else if (e.key !== 'Backspace' || !e.repeat) bsHeld = false;
  }, true);
  document.addEventListener('keyup', function (e) { if (e.key === 'Backspace') bsHeld = false; }, true);

  /* ------------------------------------------------------------- new document */
  /* Build inline-formula markup without hand-escaping an attribute. */
  function imath(tex) {
    var span = document.createElement('span');
    span.className = 'imath';
    span.contentEditable = 'false';
    span.dataset.m = JSON.stringify(M.parseTex(tex));
    var box = document.createElement('div');
    box.appendChild(span);
    return box.innerHTML;
  }

  function newDoc() {
    return {
      meta: {
        title: 'Untitled document',
        authors: [{ name: '', affil: '', email: '' }],
        date: '\\today', abstract: '', keywords: '',
        /* title, authors, date and theorem titles hold rich text (formulas,
           bold …) — older documents held plain text, see app.js normalizeDoc;
           so do the fields of reference entries (bibHtml) */
        headHtml: true, bibHtml: true
      },
      settings: {
        docclass: 'article', fontsize: '11pt', paper: 'a4paper', columns: 1,
        margin: '2.5cm', numbered: true, lineSpacing: 1, lang: 'english',
        titlepage: false, showAbstract: true
      },
      blocks: [
        { id: uid(), t: 'section', level: 1, html: 'Introduction', label: 'sec:intro', numbered: true },
        { id: uid(), t: 'para', html:
          'Write straight onto the page. Press <b>/</b> on an empty line for sections, figures and tables, ' +
          'and <b>$</b> anywhere in a sentence for a formula such as ' + imath('\\sigma_x^2 = \\langle x^2 \\rangle - \\langle x \\rangle^2') +
          ' — click it to edit it again. The LaTeX on the right is written for you as you type.' },
        { id: uid(), t: 'eq', numbered: true, label: 'eq:gauss', env: 'align', labels: ['eq:gauss'],
          lines: [M.parseTex('\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}')] },
        /* a line to start on, left empty: words here would end up in the PDF */
        { id: uid(), t: 'para', html: '' }
      ],
      bib: []
    };
  }

  function blockFactory(kind) {
    switch (kind) {
      case 'section': return { id: uid(), t: 'section', level: 1, html: '', label: '', numbered: true };
      case 'subsection': return { id: uid(), t: 'section', level: 2, html: '', label: '', numbered: true };
      case 'subsubsection': return { id: uid(), t: 'section', level: 3, html: '', label: '', numbered: true };
      case 'para': return { id: uid(), t: 'para', html: '' };
      case 'eq': return { id: uid(), t: 'eq', lines: [M.row()], numbered: true, label: '', env: 'align', labels: [] };
      case 'itemize': return { id: uid(), t: 'list', ordered: false, items: [{ html: '', level: 0 }] };
      case 'enumerate': return { id: uid(), t: 'list', ordered: true, items: [{ html: '', level: 0 }] };
      case 'figure': return { id: uid(), t: 'figure', src: '', filename: '', caption: 'Caption text.', width: 0.7, label: '', placement: 'htbp' };
      case 'table': return {
        id: uid(), t: 'table', rows: [['Header 1', 'Header 2', 'Header 3'], ['', '', ''], ['', '', '']],
        align: ['l', 'c', 'c'], header: true, booktabs: true, rules: false,
        caption: 'Caption text.', label: '', placement: 'htbp'
      };
      case 'plot': return chartBlock('function', { fns: [{ expr: 'sin x', name: '' }], xmin: '-2pi', xmax: '2pi', axes: 'middle', xlabel: '$x$', ylabel: '$y$' });
      case 'chart': return chartBlock('line', { data: 'Time (s), Distance (m)\n0, 0\n1, 1.8\n2, 4.1\n3, 6.2\n4, 7.9\n5, 10.1' });
      case 'pie': return chartBlock('pie', { data: 'Item\tShare\nRent\t40\nFood\t25\nTransport\t15\nSavings\t12\nOther\t8', width: 0.8 });
      case 'histogram': return chartBlock('hist', {
        data: 'Score\n62\n71\n55\n80\n67\n74\n90\n58\n69\n77\n84\n65\n72\n60\n79\n68\n73\n88\n64\n70',
        ycols: [0], xlabel: 'Score', ylabel: 'Students', legend: false
      });
      case 'polar': return chartBlock('polar', { fns: [{ expr: 'cos(3θ)', name: '' }], width: 0.6 });
      case 'surface': return chartBlock('surface', {
        fns: [{ expr: 'sin(x) cos(y)', name: '' }], xlabel: '$x$', ylabel: '$y$', zlabel: '$z$', aspect: 0.75
      });
      case 'theorem': return { id: uid(), t: 'theorem', kind: 'theorem', title: '', html: '', label: '' };
      case 'lemma': return { id: uid(), t: 'theorem', kind: 'lemma', title: '', html: '', label: '' };
      case 'definition': return { id: uid(), t: 'theorem', kind: 'definition', title: '', html: '', label: '' };
      case 'proof': return { id: uid(), t: 'theorem', kind: 'proof', title: '', html: '', label: '' };
      case 'code': return { id: uid(), t: 'code', lang: '', text: '', caption: '' };
      case 'quote': return { id: uid(), t: 'quote', html: '' };
      case 'pagebreak': return { id: uid(), t: 'pagebreak' };
      case 'toc': return { id: uid(), t: 'toc' };
      case 'bib': return { id: uid(), t: 'bib' };
      case 'raw': return { id: uid(), t: 'raw', tex: '' };
      default: return { id: uid(), t: 'para', html: '' };
    }
  }

  /* A chart: kind is function | line | scatter | bar | hist | pie | polar |
     surface. Data comes from a
     table in the document (from = its id) or from the chart's own rows
     (data, as comma- or tab-separated text). See chart.js. */
  function chartBlock(kind, o) {
    var b = {
      id: uid(), t: 'chart', kind: kind, fns: [], from: '', data: '', xcol: 0, ycols: [1],
      xmin: '', xmax: '', ymin: '', ymax: '', xlabel: '', ylabel: '', axes: 'box',
      grid: true, legend: true, marks: true, width: 0.75, caption: '', label: '', placement: 'htbp'
    };
    for (var k in o) b[k] = o[k];
    return b;
  }

  /* [kind, name, icon, what it is (in plain words), more words it is found by
     — the LaTeX names among them] */
  var MENU = [
    { g: 'Structure', items: [
      ['section', 'Section', 'H1', 'A heading: 1, 2, 3 …', 'heading title chapter h1'],
      ['subsection', 'Subsection', 'H2', 'A heading inside a section: 1.1, 1.2 …', 'heading h2'],
      ['subsubsection', 'Sub-subsection', 'H3', 'A third-level heading: 1.1.1 …', 'heading h3 subsubsection'],
      ['para', 'Paragraph', '¶', 'Body text', 'text normal'],
      ['abstract', 'Abstract', 'Ab', 'The summary under the title', 'summary abstract'],
      ['toc', 'Table of contents', '☰', 'The list of sections', 'contents tableofcontents'],
      ['pagebreak', 'Page break', '⤓', 'Start a new page', 'newpage clearpage'],
      ['footnote', 'Footnote', '¹', 'A note at the foot of the page', 'footnote note foot']
    ] },
    { g: 'Math', items: [
      ['eq', 'Equation', '∑', 'A formula on its own line, numbered', 'display formula math maths equation align'],
      ['theorem', 'Theorem', 'Th', 'A numbered statement, in italics', 'amsthm environment statement'],
      ['lemma', 'Lemma', 'Le', 'A numbered result used in a proof', 'amsthm environment'],
      ['definition', 'Definition', 'Df', 'A numbered definition', 'amsthm environment'],
      ['proof', 'Proof', '□', 'Ends with a □', 'amsthm environment qed']
    ] },
    { g: 'Blocks', items: [
      ['itemize', 'Bulleted list', '•', 'Points marked with bullets', 'bullet bullets list unordered itemize'],
      ['enumerate', 'Numbered list', '1.', 'Points numbered 1, 2, 3', 'numbered list ordered enumerate steps'],
      ['figure', 'Figure', '🖼', 'An image with a caption', 'image picture graphic includegraphics'],
      ['table', 'Table', '▦', 'Rows and columns, with a caption', 'tabular grid'],
      ['plot', 'Function plot', '📈', 'The graph of y = f(x)', 'graph pgfplots'],
      ['chart', 'Chart', '📊', 'Line, scatter or bar chart of data', 'graph data pgfplots'],
      ['histogram', 'Histogram', '▁▃▇', 'How often values come up, in bins', 'chart'],
      ['pie', 'Pie chart', '◔', 'Shares of a whole', 'chart tikz'],
      ['polar', 'Polar plot', '✿', 'r = f(θ) on a round grid', 'graph'],
      ['surface', '3D surface', '⛰', 'z = f(x, y)', 'graph pgfplots 3d'],
      ['quote', 'Quotation', '❝', 'Indented quoted text', 'quote'],
      ['code', 'Code', '⌨', 'Program code, set exactly as typed', 'verbatim lstlisting program'],
      ['bib', 'References', '📚', 'The list of works you cite', 'bibliography thebibliography citations'],
      ['raw', 'LaTeX code', '\\', 'LaTeX of your own, passed through as typed', 'raw tex latex escape']
    ] }
  ];
  /* How well a menu entry matches what was typed: its name first, then
     its other words, then its description — so "numbered" finds the
     numbered list before a section described as numbered. 0: no match. */
  function menuScore(it, q) {
    var words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return 1;
    var name = it[1].toLowerCase(), more = (it[4] || '').toLowerCase(), desc = it[3].toLowerCase();
    var total = 0;
    for (var i = 0; i < words.length; i++) {
      var w = words[i], s = 0;
      if (name.indexOf(w) === 0) s = 8;
      else if (new RegExp('(^|\\s)' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(name)) s = 6;
      else if (name.indexOf(w) >= 0) s = 4;
      else if (new RegExp('(^|\\s)' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(more)) s = 3;
      else if (desc.indexOf(w) >= 0 || more.indexOf(w) >= 0) s = 1;
      if (!s) return 0;
      /* the whole name: "table" is the table before the table of contents */
      if (name === w || name === String(q).trim().toLowerCase()) s += 4;
      total += s;
    }
    return total;
  }

  /* ------------------------------------------------------------- numbering */
  function numbering(doc) {
    var sec = [0, 0, 0, 0], eq = 0, fig = 0, tab = 0, thm = 0, lastSec = '0';
    var within = !!(doc.settings && doc.settings.thmWithin);
    var map = {};
    doc.blocks.forEach(function (b) {
      switch (b.t) {
        case 'section':
          if (b.numbered !== false && doc.settings.numbered) {
            sec[b.level - 1]++;
            for (var i = b.level; i < 4; i++) sec[i] = 0;
            b.__num = sec.slice(0, b.level).join('.');
            /* theorems count within the section, as \newtheorem{…}[section]
               does: a subsection neither resets them nor adds to the number */
            if (b.level === 1) { lastSec = String(sec[0]); if (within) thm = 0; }
          } else b.__num = '';
          if (b.label) map[b.label] = b.__num;
          break;
        case 'eq':
          /* an empty line is left out of the LaTeX, so it takes no number
             here either — the page and the PDF count alike, and nothing
             can refer to it */
          b.__nums = b.lines.map(function (r) {
            return b.numbered === false || M.isEmptyRow(r) ? '' : String(++eq);
          });
          if (b.label) map[b.label] = b.__nums[0];
          if (b.labels) b.labels.forEach(function (l, i) { if (l) map[l] = b.__nums[i]; });
          break;
        case 'figure': case 'chart':
          b.__num = String(++fig);
          if (b.label) map[b.label] = b.__num;
          break;
        case 'table':
          b.__num = String(++tab);
          if (b.label) map[b.label] = b.__num;
          break;
        case 'theorem':
          if (b.kind === 'proof') { b.__num = ''; break; }
          /* 1, 2, 3 as \newtheorem{theorem}{Theorem} counts — or, with the
             setting on, within each section: 2.1, 2.2 */
          b.__num = (within ? lastSec + '.' : '') + (++thm);
          if (b.label) map[b.label] = b.__num;
          break;
      }
    });
    var bn = bibNumbers(doc);
    doc.bib.forEach(function (e, i) { if (bn[i]) map[e.key] = String(bn[i]); });
    return map;
  }
  /* The reference list's numbers: an entry with nothing written in it yet
     is not printed, so it takes no number (null) */
  function bibEmpty(e) {
    return !['author', 'title', 'journal', 'year', 'note'].some(function (k) {
      var v = String(e[k] || '');
      return /imath/.test(v) || v.replace(/<[^>]*>/g, '').replace(/&nbsp;|[\s ​]/g, '');
    });
  }
  function bibNumbers(doc) {
    var n = 0;
    return doc.bib.map(function (e) { return bibEmpty(e) ? null : ++n; });
  }
  /* The .bib a document came with (doc.bibLibrary: every entry, cited or
     not, never printed). Citing one of its keys brings its entry into the
     reference list; a key in neither gets an empty entry to fill in.
     'have', 'library' or 'empty'. */
  function libraryWork(doc, key) {
    var w = (doc.bibLibrary || []).filter(function (e) { return e && e.key === key; })[0];
    return w ? JSON.parse(JSON.stringify(w)) : null;
  }
  function citeWork(doc, key) {
    var have = doc.bib.filter(function (e) { return e.key === key; })[0], w;
    if (have) {
      if (bibEmpty(have) && (w = libraryWork(doc, key))) { Object.assign(have, w); return 'library'; }
      return 'have';
    }
    w = libraryWork(doc, key);
    doc.bib.push(w || { key: key, author: '', title: '', journal: '', year: '' });
    if (!doc.blocks.some(function (b) { return b.t === 'bib'; })) doc.blocks.push(blockFactory('bib'));
    return w ? 'library' : 'empty';
  }
  /* Take out the citations of the work `key` from all the text in the
     document (or, with `to`, make them cite `to`); how many there were. */
  function dropCites(doc, key, to) {
    var count = 0;
    var clean = function (html) {
      if (!html || String(html).indexOf('data-label="' + key + '"') < 0) return html;
      var box = PT.sanitize.parse(String(html));
      [].forEach.call(box.querySelectorAll('.xref[data-kind="cite"]'), function (x) {
        if (x.getAttribute('data-label') !== key) return;
        if (to) x.setAttribute('data-label', to); else x.remove();
        count++;
      });
      return box.innerHTML;
    };
    doc.meta.abstract = clean(doc.meta.abstract);
    doc.blocks.forEach(function (b) {
      ['html', 'caption', 'title'].forEach(function (f) { if (typeof b[f] === 'string') b[f] = clean(b[f]); });
      if (b.items) b.items.forEach(function (it) { it.html = clean(it.html); });
      if (b.rows) b.rows.forEach(function (r) { r.forEach(function (c, i) { r[i] = clean(c); }); });
    });
    return count;
  }

  /* Which blocks are parts of a theorem or proof: an equation, paragraph
     or list marked `inEnv` straight after the theorem, or after another of
     its parts. A paragraph, equation or list put in between two parts
     becomes one too. A mark with nothing above to belong to — a heading
     dropped in between for a moment — is only not in effect: it is kept,
     and the part rejoins its proof when the way is clear again. Returns,
     for every block, the theorem block it belongs to, or null. */
  var PARTS = { para: 1, eq: 1, list: 1 };
  function envChain(doc) {
    var bl = doc.blocks, env = [], i;
    for (i = 1; i < bl.length - 1; i++) {
      if (!bl[i].inEnv && PARTS[bl[i].t] && bl[i + 1].inEnv && (bl[i - 1].t === 'theorem' || env[i - 1] || bl[i - 1].inEnv)) bl[i].inEnv = true;
    }
    for (i = 0; i < bl.length; i++) {
      var b = bl[i], prev = bl[i - 1];
      var owner = !prev ? null : prev.t === 'theorem' ? prev : env[i - 1];
      env.push(b.inEnv && owner && PARTS[b.t] ? owner : null);
    }
    return env;
  }
  /* A theorem with its parts, as one stretch of blocks: [first, last] */
  function groupAt(doc, idx) {
    var b = doc.blocks[idx], env = envChain(doc), end = idx;
    if (b && b.t === 'theorem') while (end + 1 < doc.blocks.length && env[end + 1] === b) end++;
    return [idx, end];
  }

  /* ------------------------------------------------------------- DOM helpers */
  function h(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function caretAtStart(el) {
    var s = window.getSelection();
    if (!s.rangeCount) return false;
    var r = s.getRangeAt(0);
    if (!r.collapsed || !el.contains(r.startContainer)) return false;
    var pre = document.createRange();
    pre.selectNodeContents(el);
    pre.setEnd(r.startContainer, r.startOffset);
    var f = pre.cloneContents();
    return f.textContent.length === 0 && f.querySelectorAll('*').length === 0;
  }
  function caretAtEnd(el) {
    var s = window.getSelection();
    if (!s.rangeCount) return false;
    var r = s.getRangeAt(0);
    if (!r.collapsed || !el.contains(r.startContainer)) return false;
    var post = document.createRange();
    post.selectNodeContents(el);
    post.setStart(r.startContainer, r.startOffset);
    var f = post.cloneContents();
    return f.textContent.length === 0 && f.querySelectorAll('*:not(br)').length === 0;
  }
  function splitAfterCaret(el) {
    var s = window.getSelection();
    if (!s.rangeCount) return '';
    var r = s.getRangeAt(0);
    var after = document.createRange();
    after.setStart(r.endContainer, r.endOffset);
    after.setEnd(el, el.childNodes.length);
    var frag = after.extractContents();
    var d = document.createElement('div');
    d.appendChild(frag);
    return d.innerHTML;
  }
  function placeCaret(el, atEnd) {
    if (!el) return;
    el.focus();
    var r = document.createRange();
    r.selectNodeContents(el);
    /* example words ("Header 1") are taken whole, to be typed over */
    if (!EXAMPLE.test(el.textContent.trim())) r.collapse(!atEnd);
    var s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }
  function insertNodeAtCaret(node) {
    var s = window.getSelection();
    if (!s.rangeCount) return;
    var r = s.getRangeAt(0);
    r.deleteContents();
    r.insertNode(node);
    r.setStartAfter(node);
    r.collapse(true);
    s.removeAllRanges();
    s.addRange(r);
  }

  /* ------------------------------------------------------------- the editor */
  function Editor(paperEl, doc, hooks) {
    this.paper = paperEl;
    this.doc = doc;
    this.hooks = hooks || {};
    this.fields = [];          /* live MathFields, so palettes can target them */
    this.activeField = null;
    this.focusHint = null;     /* {block, part, atEnd} restored after re-render */
    var self = this;
    document.addEventListener('selectionchange', function () { self.onSelChange(); });
    this.wirePaper();
  }

  Editor.prototype.change = function (structural) {
    if (this.hooks.onChange) this.hooks.onChange(structural);
    if (!structural) this.redrawCharts();
  };
  Editor.prototype.focusBlock = function (id, part, atEnd) {
    this.focusHint = { id: id, part: part || 'main', atEnd: atEnd !== false };
  };

  Editor.prototype.render = function () {
    var self = this;
    this.labels = numbering(this.doc);
    this.fields = [];
    this.paper.textContent = '';

    /* --- title block --- */
    var head = h('div', 'pt-head');
    var title = this.lineEditable('h1', 'pt-title', this.doc.meta.title, function (v) {
      self.doc.meta.title = v; self.change();
    });
    title.dataset.ph = 'Document title';
    head.appendChild(title);

    var auth = h('div', 'pt-authors');
    this.doc.meta.authors.forEach(function (a, i) {
      var w = h('div', 'pt-author');
      var nm = self.lineEditable('div', 'pt-aname', a.name, function (v) { a.name = v; self.change(); });
      nm.dataset.ph = 'Author name';
      var af = self.lineEditable('div', 'pt-aaff', a.affil, function (v) { a.affil = v; self.change(); });
      af.dataset.ph = 'Affiliation';
      w.appendChild(nm); w.appendChild(af);
      if (self.doc.meta.authors.length > 1) {
        var x = h('button', 'pt-xauth', '×');
        x.title = 'Remove author';
        x.onclick = function () { self.doc.meta.authors.splice(i, 1); self.change(true); self.render(); };
        w.appendChild(x);
      }
      auth.appendChild(w);
    });
    var addA = h('button', 'pt-addauth', '+ author');
    addA.title = 'Add another author';
    addA.onclick = function () {
      self.doc.meta.authors.push({ name: '', affil: '', email: '' });
      self.change(true); self.render();
      /* straight into the new name, to write it (not into the title) */
      var names = self.paper.querySelectorAll('.pt-aname'), nn = names[names.length - 1];
      if (nn) placeCaret(nn, true);
    };
    auth.appendChild(addA);
    head.appendChild(auth);

    var dt = this.lineEditable('div', 'pt-date', this.doc.meta.date === '\\today' ? escHTML(todayStr(this.doc.settings.lang)) : this.doc.meta.date, function (v) {
      self.doc.meta.date = v; self.change();
    });
    dt.dataset.ph = 'Date';
    dt.title = 'Leave as today\u2019s date to emit \\today';
    head.appendChild(dt);
    this.paper.appendChild(head);

    if (this.doc.settings.showAbstract) {
      var ab = h('div', 'pt-abstract');
      ab.appendChild(h('div', 'pt-abstitle', 'Abstract'));
      var abody = this.richEditable('div', 'pt-abbody', this.doc.meta.abstract, function (v) {
        self.doc.meta.abstract = v; self.change();
      });
      abody.dataset.ph = 'Write the abstract\u2026';
      ab.appendChild(abody);
      this.paper.appendChild(ab);
    }

    /* --- body --- */
    var body = h('div', 'pt-body' + (this.doc.settings.columns === 2 ? ' pt-two' : ''));
    /* equations, paragraphs and lists that belong to the theorem or proof
       above them: marked as its parts, and a proof's □ goes after its last
       part (see envChain) */
    var env = envChain(this.doc);
    this.envLast = {};
    env.forEach(function (o, i) { if (o) self.envLast[o.id] = i; });
    var wraps = this.doc.blocks.map(function (b, i) {
      var w = self.renderBlock(b, i);
      if (env[i]) {
        w.classList.add('blk-inenv');
        if (env[i].kind === 'proof') w.classList.add('blk-inproof');
        w.dataset.env = env[i].kind;
        var ew = w.querySelector('.pt-eqw');
        if (ew) ew.classList.add('pt-inenv');
      }
      body.appendChild(w);
      return w;
    });
    this.doc.blocks.forEach(function (b) {
      if (b.t !== 'theorem' || b.kind !== 'proof' || self.envLast[b.id] == null) return;
      var li = self.envLast[b.id], part = self.doc.blocks[li], w = wraps[li];
      var lines = w.querySelectorAll('.pt-eqline');
      if (part.t === 'eq' && part.numbered === false && lines.length) {
        /* \qedhere: at the end of the last line of the display */
        var q = h('span', 'pt-qed pt-qedhere', '□');
        q.contentEditable = 'false';
        lines[lines.length - 1].appendChild(q);
      } else {
        var qd = h('div', 'pt-qed pt-qedend', '□');
        qd.contentEditable = 'false';
        w.querySelector('.blk-in').appendChild(qd);
      }
    });
    var tail = h('div', 'pt-tail');
    var addBtn = h('button', 'pt-tailadd', '+  Add a block');
    /* at the end of the writing — which is above the reference list, if
       that is what the document ends with */
    addBtn.onclick = function (e) { self.openMenu(e.currentTarget, self.endOfText()); };
    tail.appendChild(addBtn);
    body.appendChild(tail);
    this.paper.appendChild(body);

    /* Maths is measured, not just styled — and measuring only works once the
       sheet is in the document. Blocks are built detached, so run the whole
       layout pass here, after everything is attached. */
    M.layout(this.paper);
    [].forEach.call(this.paper.querySelectorAll('.pt-eqal'), alignEq);
    this.refreshInlineMath();
    this.refreshXrefs();
    this.refreshFootnotes();
    this.restoreFocus();
    if (this.hooks.onRendered) this.hooks.onRendered();
  };

  Editor.prototype.restoreFocus = function () {
    var f = this.focusHint;
    this.focusHint = null;
    if (!f) return;
    var host = this.paper.querySelector('[data-bid="' + f.id + '"]');
    if (!host) return;
    var target = host.querySelector('[data-part="' + f.part + '"]');
    if (target && target.classList.contains('mfield')) { target.focus(); return; }
    if (target) placeCaret(target, f.atEnd);
  };

  /* Formulas live in the block HTML as data-m trees; draw them after every
     render so reloaded and pasted documents show real maths, not blanks. */
  Editor.prototype.refreshInlineMath = function () {
    [].forEach.call(this.paper.querySelectorAll('.imath'), function (span) {
      var tree;
      try { tree = JSON.parse(span.dataset.m); } catch (e) { return; }
      if (!tree || tree.t !== 'row') return;
      span.contentEditable = 'false';
      M.renderInline(span, tree);   /* may wrap where TeX would break it */
    });
  };

  Editor.prototype.refreshXrefs = function () {
    var labels = this.labels;
    [].forEach.call(this.paper.querySelectorAll('.xref'), function (x) {
      var v = labels[x.dataset.label];
      var kind = x.dataset.kind;
      if (v == null) { x.textContent = '??'; x.classList.add('bad'); return; }
      x.classList.remove('bad');
      x.textContent = kind === 'eqref' ? '(' + v + ')' : (kind === 'cite' ? '[' + v + ']' : v);
    });
  };

  /* plain-text editable */
  Editor.prototype.editable = function (tag, cls, value, onChange, plain) {
    var self = this;
    var e = h(tag, cls);
    e.contentEditable = 'true';
    e.spellcheck = false;
    if (plain) e.textContent = value || '';
    else e.innerHTML = PT.sanitize.clean(value);   /* stored HTML is data, never markup as-is */
    e.addEventListener('input', function () {
      /* emptied, it is truly empty — no <br> left behind — so its
         placeholder shows again (and only then) */
      if (!e.textContent && e.innerHTML) e.innerHTML = '';
      onChange(plain ? e.textContent : e.innerHTML);
    });
    e.addEventListener('mousedown', function (ev) { if (ev.button === 0) tripleSelects(ev, e); });
    e.addEventListener('keydown', function (ev) {
      if (plain && ev.key === 'Enter') { ev.preventDefault(); }
    });
    e.addEventListener('paste', function (ev) {
      ev.preventDefault();
      var t = (ev.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, t);
    });
    void self;
    return e;
  };

  /* Code and LaTeX typed into a <pre>: its text with every line break kept.
     Enter puts a "\n" in the text itself (the browser would make a <div> or
     a <br>, which textContent loses); text pasted or dropped in may still
     bring those, so they are read as line breaks too. A last <br> is only
     there to show an empty last line. */
  function preText(el) {
    var out = '', last = el.lastChild;
    while (last && last.lastChild && last.nodeName !== 'BR') last = last.lastChild;
    (function walk(n) {
      [].forEach.call(n.childNodes, function (c) {
        if (c.nodeType === 3) out += c.nodeValue;
        else if (c.nodeName === 'BR') { if (c !== last) out += '\n'; }
        else {
          if (/^(DIV|P)$/.test(c.nodeName) && out && !/\n$/.test(out)) out += '\n';
          walk(c);
        }
      });
    })(el);
    return out;
  }
  function plainLines(pre, onChange) {
    pre.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        ev.preventDefault();
        document.execCommand('insertLineBreak');
      }
    });
    pre.addEventListener('input', function () {
      if (!pre.textContent && !pre.querySelector('br + br, div')) pre.innerHTML = '';   /* emptied: the placeholder again */
      onChange(preText(pre));
    });
  }

  /* One line of rich text — a title, a name, a date: formulas ("$") and
  formatting as in a paragraph, but Enter does not start a new line. */
  Editor.prototype.lineEditable = function (tag, cls, value, onChange) {
    return this.richEditable(tag, cls, value, onChange, {
      onKey: function (ev) { if (ev.key === 'Enter') ev.preventDefault(); }
    });
  };

  /* rich text editable: bold/italic + inline math + refs */
  Editor.prototype.richEditable = function (tag, cls, value, onChange, opts) {
    var self = this;
    opts = opts || {};
    var e = h(tag, cls);
    e.contentEditable = 'true';
    e.spellcheck = true;
    e.innerHTML = PT.sanitize.clean(value);   /* stored HTML is data, never markup as-is */
    e.__rich = true;   /* takes formatting and inline formulas (see app.js richHost) */
    /* "$" opens an inline formula right where you are */
    /* `data`: the text just typed. It may be more than one character (a
       word from an input method, dictation, a typing tool): a "$" in it
       opens the formula there, and what follows it is typed into the
       formula. */
    var dollar = function (data) {
      var s = window.getSelection();
      if (!s.rangeCount || !s.focusNode || s.focusNode.nodeType !== 3 || !e.contains(s.focusNode)) return false;
      var tx = s.focusNode.nodeValue, off = s.focusOffset, after = '';
      var at = off - 1;
      /* (the browser may have made a space in it a no-break one) */
      var sp = function (t) { return t.replace(/ /g, ' '); };
      if (data && data.length > 1 && data.indexOf('$') >= 0 && sp(tx.slice(off - data.length, off)) === sp(data)) {
        at = off - data.length + data.indexOf('$');
        after = data.slice(data.indexOf('$') + 1);
      }
      if (!(at >= 0 && tx[at] === '$')) return false;
      s.focusNode.nodeValue = tx.slice(0, at) + tx.slice(off);
      var r = document.createRange();
      r.setStart(s.focusNode, at); r.collapse(true);
      s.removeAllRanges(); s.addRange(r);
      self.insertInlineMath(e, onChange);
      var f = self.activeField;
      if (after && f) {
        for (var i = 0; i < after.length; i++) {
          if (!f.hasFocus()) { document.execCommand('insertText', false, after.slice(i)); break; }
          f.onKey({ key: after[i], shiftKey: false, ctrlKey: false, metaKey: false, altKey: false,
            getModifierState: function () { return false; }, preventDefault: function () {}, stopPropagation: function () {} });
        }
      }
      return true;
    };
    e.__onChange = onChange;
    e.addEventListener('focus', function () { self.lastRich = e; });
    e.addEventListener('input', function (ev) {
      /* While a phone's keyboard is still composing a word, the text is
         the keyboard's: touching it would break the word. It is looked at
         once the word is committed (compositionend, below). */
      if (ev.isComposing) { onChange(e.innerHTML); return; }
      if (dollar(ev.inputType === 'insertText' ? ev.data : null)) return;
      if (self.texCommand(e, onChange)) return;
      if (opts.listStart && ev.inputType === 'insertText' && ev.data && /[  ]/.test(ev.data) && opts.listStart(ev.data)) return;
      /* a footnote mark deleted with the text around it */
      if (self.paper.querySelector(':scope > .pt-fnotes') || /ftnote/.test(e.innerHTML)) self.refreshFootnotes();
      /* emptied, Firefox and Safari leave a lone <br> behind: that is empty
         (the placeholder shows, and LaTeX gets no stray line break) */
      if (/^(\s|&nbsp;|​|<br\s*\/?>)*$/i.test(e.innerHTML) && /<br/i.test(e.innerHTML)) e.innerHTML = '';
      onChange(e.innerHTML);
    });
    /* a formula being edited in the line is a field of its own: its keys
       and pastes are not the paragraph's */
    var inField = function (ev) { return !!(ev.target.closest && ev.target.closest('.mfield')); };
    e.addEventListener('compositionend', function () {
      setTimeout(function () { if (document.activeElement === e) dollar(); }, 0);
    });
    /* "\" opens the command palette. Android keyboards send no key for it
       (keydown says "Unidentified"), only the text it types: catch that. */
    e.addEventListener('beforeinput', function (ev) {
      if (inField(ev) || ev.isComposing || ev.inputType !== 'insertText') return;
      /* likewise "/" on an empty line: the block menu, however it was typed */
      if (ev.data === '/' && opts.slashMenu && isBlank(e.innerHTML)) { ev.preventDefault(); opts.slashMenu(); return; }
      /* "/section" arriving in one go (a fast typist, a typing tool): the
         menu, searching for "section" */
      if (ev.data && /^\/[^\s\/]+$/.test(ev.data) && opts.slashMenu && isBlank(e.innerHTML)) { ev.preventDefault(); opts.slashMenu(ev.data.slice(1)); return; }
      if (ev.data !== '\\') return;
      if (!PT.palette || e.closest('.studio')) return;
      ev.preventDefault();
      PT.palette.open({ fromBackslash: true });
    });
    e.addEventListener('keydown', function (ev) {
      if (inField(ev)) return;
      if (self.mathAtCaret(ev, e, onChange)) return;
      if (markAtCaret(ev, e)) return;
      self.richKeys(ev, e, opts);
    });
    /* a cell or caption still holding its example words ("Header 1",
       "Caption text."): clicked into, they are selected, so typing replaces
       them instead of running on after them */
    /* Done when it gets the focus (Tab, the keyboard) and again when the
       mouse lets go (a click puts its own caret down after the focus) —
       both at once, never on a timer, which a busy or background page runs
       late, after the first keys */
    var takeExample = function () {
      if (document.activeElement !== e || !EXAMPLE.test(e.textContent.trim())) return;
      var s = window.getSelection();
      if (s.rangeCount && !s.isCollapsed) return;
      var r = document.createRange();
      r.selectNodeContents(e);
      s.removeAllRanges(); s.addRange(r);
    };
    e.addEventListener('focus', takeExample);
    e.addEventListener('mouseup', takeExample);
    e.addEventListener('paste', function (ev) {
      if (inField(ev)) return;
      ev.preventDefault();
      var t = (ev.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, t);
    });
    /* a press on a formula opens it right there, the caret where it was
       pressed (mousedown, so the text caret never lands beside it first) */
    e.addEventListener('mousedown', function (ev) {
      if (ev.button !== 0 || inField(ev)) return;
      var im = ev.target.closest ? ev.target.closest('.imath') : null;
      if (im && e.contains(im)) { ev.preventDefault(); self.editInlineMath(im, e, onChange, { x: ev.clientX, y: ev.clientY }); return; }
      var fn = ev.target.closest ? ev.target.closest('.ftnote') : null;
      if (fn && e.contains(fn)) { ev.preventDefault(); self.editFootnote(fn); return; }
      tripleSelects(ev, e);
    });
    return e;
  };

  var EXAMPLE = /^(Header \d+|Caption text\.)$/;

  /* Backspace or Delete beside a footnote mark marks it first (it shows
     selected), and only the next press takes it away, its note with it —
     a mark is one character wide and easy to delete without noticing. */
  function markAtCaret(ev, host) {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return false;
    if (ev.key !== 'Backspace' && ev.key !== 'Delete') return false;
    var mk = besideCaret(host, ev.key === 'Backspace' ? -1 : 1, 'ftnote');
    if (!mk) return false;
    ev.preventDefault();
    var r = document.createRange();
    r.selectNode(mk);
    var s = window.getSelection();
    s.removeAllRanges(); s.addRange(r);
    return true;
  }

  /* A triple click takes the whole paragraph, formulas and all — the
     browser's own stops at a formula, and what is typed over it then runs
     into the part it left behind. */
  function tripleSelects(ev, el) {
    if (ev.detail < 3) return;
    ev.preventDefault();
    el.focus();
    var r = document.createRange();
    r.selectNodeContents(el);
    var s = window.getSelection();
    s.removeAllRanges(); s.addRange(r);
  }

  /* LaTeX typed into running text, once its closing brace is typed:
     \cite{key}, \ref{label}, \eqref{label}, \emph{…}, \textbf{…},
     \footnote{…} become what they write — a citation, a reference, italics,
     bold, a footnote. Anything else is left as typed, with a word on how
     to find it. */
  var TEXCMD = /\\(cite|ref|eqref|autoref|cref|emph|textit|textbf|underline|footnote)\{([^{}]*)\}$/;
  Editor.prototype.texCommand = function (host, onChange) {
    var s = window.getSelection();
    if (!s.rangeCount || !s.isCollapsed || !s.focusNode || s.focusNode.nodeType !== 3 || !host.contains(s.focusNode)) return false;
    var node = s.focusNode, off = s.focusOffset, before = node.nodeValue.slice(0, off);
    var m = TEXCMD.exec(before);
    if (!m) {
      var other = /\\([A-Za-z]+)\{[^{}]*\}$/.exec(before);
      if (other && !this.texHinted && this.hooks.toast) {
        this.texHinted = true;
        this.hooks.toast('\\' + other[1] + ' is not written out here — PaperTeX writes the LaTeX. Press Ctrl+K to find what you need.');
      }
      return false;
    }
    var cmd = m[1], arg = m[2], at = off - m[0].length;
    node.nodeValue = node.nodeValue.slice(0, at) + node.nodeValue.slice(off);
    var r = document.createRange();
    r.setStart(node, at); r.collapse(true);
    s.removeAllRanges(); s.addRange(r);
    var made = [], self = this, addedBib = [], fromLib = [];
    if (cmd === 'cite' || cmd === 'ref' || cmd === 'eqref' || cmd === 'autoref' || cmd === 'cref') {
      arg.split(',').map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (key) {
        var x = document.createElement('span');
        x.className = 'xref';
        x.contentEditable = 'false';
        x.dataset.kind = cmd === 'cite' ? 'cite' : cmd === 'eqref' ? 'eqref' : 'ref';
        x.dataset.label = PT.sanitize.label(key);
        made.push(x);
        /* a work not in the reference list yet: its entry from the .bib the
           document came with, or an empty one to fill in — not a silent
           "[?]" in the PDF */
        if (cmd === 'cite') {
          var got = citeWork(self.doc, x.dataset.label);
          if (got === 'empty') addedBib.push(x.dataset.label);
          else if (got === 'library') fromLib.push(x.dataset.label);
        }
      });
      /* the list on the page shows the new entry at once (a list made just
         now appears with the next redraw) */
      var oldBib = (addedBib.length || fromLib.length) && this.paper.querySelector('.pt-bib');
      var bibBlock = this.doc.blocks.filter(function (b) { return b.t === 'bib'; })[0];
      if (oldBib && bibBlock) {
        var tmpBox = document.createElement('div');
        this.renderBib(bibBlock, tmpBox);
        if (tmpBox.firstChild) oldBib.replaceWith(tmpBox.firstChild);
      }
      if (addedBib.length && this.hooks.toast) {
        this.hooks.toast('“' + addedBib.join('”, “') + '” added to the reference list, empty — fill in the author and title there.');
      } else if (fromLib.length && this.hooks.toast) {
        this.hooks.toast('“' + fromLib.join('”, “') + '” added to the reference list from your .bib.');
      }
    } else if (cmd === 'footnote') {
      var f = document.createElement('span');
      f.className = 'ftnote';
      f.contentEditable = 'false';
      f.dataset.text = arg;
      made.push(f);
    } else {
      var t = document.createElement({ emph: 'i', textit: 'i', textbf: 'b', underline: 'u' }[cmd]);
      t.textContent = arg;
      made.push(t);
    }
    made.forEach(function (n) { insertNodeAtCaret(n); });
    /* the caret stays in text, after what was made */
    if (made.length) {
      var after = document.createRange();
      after.setStartAfter(made[made.length - 1]); after.collapse(true);
      caretInText(after, 1);
    }
    onChange(host.innerHTML);
    this.labels = numbering(this.doc);
    this.refreshXrefs();
    this.refreshFootnotes();
    return true;
  };

  /* Arrow keys and Backspace walk into a formula from the text beside it,
     as they would into any other word: → before it enters at its start,
     ← after it at its end, Backspace after it at its end (and Backspace
     again then takes it apart, piece by piece). */
  Editor.prototype.mathAtCaret = function (ev, host, onChange) {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return false;
    var back = ev.key === 'ArrowLeft' || ev.key === 'Backspace';
    if (!back && ev.key !== 'ArrowRight' && ev.key !== 'Delete') return false;
    var im = mathBeside(host, back ? -1 : 1);
    if (!im) return false;
    ev.preventDefault();
    this.editInlineMath(im, host, onChange, back ? 'end' : 'start');
    return true;
  };

  Editor.prototype.richKeys = function (ev, e, opts) {
    /* Ctrl/⌘ shortcuts (bold, italic, inline formula …) are bindable and
       dispatched by PT.keys before the key gets here. */
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey) return;
    /* \ in running text opens the command palette at the caret — blocks,
       symbols, formatting; pressing \ again there types a backslash */
    if (ev.key === '\\' && !ev.metaKey && PT.palette && !e.closest('.studio')) {   /* AltGr+… on many layouts */
      ev.preventDefault();
      PT.palette.open({ fromBackslash: true });
      return;
    }
    if (opts.onKey) opts.onKey(ev, e);
  };

  /* ------------------------------------------------- inline math in a paragraph */
  Editor.prototype.insertInlineMath = function (host, onChange) {
    var span = document.createElement('span');
    span.className = 'imath';
    span.contentEditable = 'false';
    span.dataset.m = JSON.stringify(M.row());
    insertNodeAtCaret(span);
    onChange(host.innerHTML);
    this.editInlineMath(span, host, onChange, 'end');
  };

  /* A formula is edited where it stands, in the line, at the size of the
     text around it: the span becomes a formula field until you leave it —
     by ← or → past its ends, "$", Enter, Esc, Tab or clicking elsewhere.
     `at` is 'start', 'end' or the point {x, y} it was pressed at. */
  Editor.prototype.editInlineMath = function (span, host, onChange, at) {
    if (span.__field) { span.__field.host.focus(); return; }
    var self = this, tree, done = false;
    try { tree = JSON.parse(span.dataset.m); } catch (e2) { tree = M.row(); }
    if (!tree || tree.t !== 'row') tree = M.row();
    span.textContent = '';
    span.classList.add('editing');
    var fh = document.createElement('span');
    fh.className = 'imath-f';
    span.appendChild(fh);
    var f = new M.MathField(fh, {
      root: tree,
      inline: true,
      onChange: function (fl) {
        span.dataset.m = JSON.stringify(fl.root);
        onChange(host.innerHTML);
      },
      onExit: function (fl, dir) { leave(dir); },
      onEscape: function () { leave('right'); },
      onEnter: function () { leave('right'); },
      /* in a table cell, Tab goes on to the next cell from anywhere in the
         formula, as it does from the cell's text (in a matrix, to the
         matrix's next cell) */
      onTab: function (fl, ev) {
        if (!(host.closest && host.closest('.st-grid, .pt-cell')) || fl.matrixAt()) return false;
        leave(ev.shiftKey ? 'left' : 'right');
        host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: ev.shiftKey, bubbles: true, cancelable: true }));
      },
      onLeave: function (fl, dir) {
        if (dir !== 'next' && dir !== 'prev') return;
        leave(dir === 'next' ? 'right' : 'left');
        /* in a table cell, Tab goes on to the next cell, as it does from
           the cell's text */
        if (host.closest && host.closest('.st-grid, .pt-cell')) {
          host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: dir === 'prev', bubbles: true, cancelable: true }));
        }
      },
      onBlur: function later() {
        /* gone to another window: still being edited when it comes back;
           gone to the command palette: still being edited when it puts the
           caret back here */
        var ae = document.activeElement;
        if ((PT.palette && PT.palette.isOpen()) || M.matrixSheetOpen() || (ae && ae.id === 'psearch')) { setTimeout(later, 150); return; }
        setTimeout(function () { if (!f.hasFocus()) finish(); }, 0);
      },
      onRender: function (fl) { span.classList.toggle('pt-inmat', fl.host.classList.contains('mf-inmat')); }
    });
    span.__field = f;
    self.activeField = f;
    if (at === 'start') f.cur = { row: f.root, i: 0 };
    fh.focus();
    if (at && at.x != null) {
      /* put the caret on the atom that was pressed, as a press inside does */
      var hit = document.elementFromPoint(at.x, at.y);
      if (hit && fh.contains(hit)) hit.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: at.x, clientY: at.y }));
    }
    f.render();

    /* back to a drawn formula; an empty one is taken out of the line */
    function finish() {
      if (done) return;
      done = true;
      f.autoWord(true);
      f.resolveCI(true);
      delete span.__field;
      if (self.activeField === f) self.activeField = null;
      span.classList.remove('editing');
      if (M.isEmptyRow(f.root)) {
        /* a space typed before it would end the line now, where the browser
           drops it as soon as you type on: keep it (LaTeX gets a plain space) */
        var pv = span.previousSibling;
        while (pv && pv.nodeType === 3 && !pv.nodeValue && pv.previousSibling) pv = pv.previousSibling;
        if (pv && pv.nodeType === 3 && / $/.test(pv.nodeValue)) pv.nodeValue = pv.nodeValue.slice(0, -1) + ' ';
        span.remove();
      } else { span.dataset.m = JSON.stringify(f.root); M.renderInline(span, f.root); }
      onChange(host.innerHTML);
    }
    /* and the text caret just before or after where it stood */
    function leave(dir) {
      var r = document.createRange();
      if (dir === 'left' || dir === 'remove') r.setStartBefore(span); else r.setStartAfter(span);
      r.collapse(true);
      finish();
      host.focus();
      caretInText(r, dir === 'left' || dir === 'remove' ? -1 : 1);
    }
  };

  /* ------------------------------------------------------------ footnotes */
  /* A footnote is a mark in the text (span.ftnote, its words in data-text,
     written out as \footnote{…}); the notes are listed under the text, and
     the mark or the note opens a small box to write it in. */
  Editor.prototype.footnoteInto = function (anchor) {
    var host = anchor && anchor.__rich ? anchor : this.lastRich;
    if (!host || !this.paper.contains(host)) {
      if (this.hooks.toast) this.hooks.toast('Click in the text where the footnote mark should go, then add it.');
      return;
    }
    var s = window.getSelection();
    if (!s.rangeCount || !host.contains(s.getRangeAt(0).startContainer)) placeCaret(host, true);
    else host.focus();
    this.insertFootnote(host);
  };
  Editor.prototype.insertFootnote = function (host) {
    var s = window.getSelection();
    if (s.rangeCount && !s.isCollapsed) s.collapseToEnd();   /* after the words, not over them */
    /* against the word before it: "adds,¹ and", not "adds, ¹and" */
    if (s.rangeCount && s.focusNode && s.focusNode.nodeType === 3 && host.contains(s.focusNode)) {
      var tn = s.focusNode, o = s.focusOffset;
      while (o > 0 && /[\s ​]/.test(tn.nodeValue[o - 1])) o--;
      if (o !== s.focusOffset) {
        var back = document.createRange();
        back.setStart(tn, o); back.collapse(true);
        s.removeAllRanges(); s.addRange(back);
      }
    }
    var mk = document.createElement('span');
    mk.className = 'ftnote';
    mk.contentEditable = 'false';
    mk.dataset.text = '';
    insertNodeAtCaret(mk);
    var after = document.createRange();
    after.setStartAfter(mk); after.collapse(true);
    caretInText(after, 1);
    if (host.__onChange) host.__onChange(host.innerHTML);
    this.refreshFootnotes();
    this.editFootnote(mk, true);
  };
  /* number the marks in reading order, and list the notes under the text */
  Editor.prototype.refreshFootnotes = function () {
    var self = this, marks = this.paper.querySelectorAll('.ftnote');
    var old = this.paper.querySelector(':scope > .pt-fnotes');
    if (old) old.remove();
    if (!marks.length) return;
    var box = h('div', 'pt-fnotes');
    box.contentEditable = 'false';
    [].forEach.call(marks, function (m, i) {
      var n = String(i + 1);
      if (m.textContent !== n) m.textContent = n;
      m.contentEditable = 'false';
      m.title = 'Footnote ' + n + ' — click to edit';
      var it = h('div', 'pt-fn');
      it.dataset.n = n;
      it.appendChild(h('sup', '', n));
      var tx = h('span', 'pt-fntx', m.dataset.text || '');
      tx.dataset.ph = 'Footnote text…';
      it.appendChild(tx);
      it.title = 'Click to edit this footnote';
      it.onclick = function () { self.editFootnote(m); };
      box.appendChild(it);
    });
    var body = this.paper.querySelector(':scope > .pt-body');
    this.paper.insertBefore(box, body ? body.nextSibling : null);
  };
  /* the box a footnote is written in, under its mark. `fresh`: just made —
     closed with nothing written, the mark goes again */
  Editor.prototype.editFootnote = function (mk, fresh) {
    var self = this, host = mk.closest('[contenteditable="true"]');
    closeAllPop();
    var m = h('div', 'popmenu small pt-fnpop');
    m.appendChild(h('div', 'popg', 'Footnote ' + (mk.textContent || '')));
    var ta = h('textarea', 'pt-fnin');
    ta.rows = 3;
    ta.value = mk.dataset.text || '';
    ta.placeholder = 'The note, as it reads at the foot of the page…';
    ta.setAttribute('aria-label', 'Footnote text');
    m.appendChild(ta);
    var bar = h('div', 'pt-fnbar');
    var del = h('button', 'pt-fndel', 'Remove');
    var ok = h('button', 'pt-fnok', 'Done');
    bar.appendChild(del); bar.appendChild(ok);
    m.appendChild(bar);
    var saved = function () {
      if (host && host.__onChange) host.__onChange(host.innerHTML);
      var row = self.paper.querySelector('.pt-fn[data-n="' + mk.textContent + '"] .pt-fntx');
      if (row) row.textContent = mk.dataset.text;
    };
    ta.addEventListener('input', function () { mk.dataset.text = ta.value.replace(/\s*\n\s*/g, ' '); saved(); });
    var closed = false;
    /* back to the text: after the mark, or where the mark was */
    function done(remove, keepFocus) {
      if (closed) return;
      closed = true;
      document.removeEventListener('mousedown', outside, true);
      m.remove();
      var gone = remove || (fresh && !String(mk.dataset.text || '').trim());
      var r = document.createRange(), nx = mk.nextSibling, lead = nx && nx.nodeType === 3 ? /^[\s ​]*/.exec(nx.nodeValue)[0].length : 0;
      if (gone) r.setStartBefore(mk);
      else if (lead) r.setStart(nx, lead);   /* past the space the mark was put before */
      else r.setStartAfter(mk);
      r.collapse(true);
      if (gone) mk.remove();
      if (host && host.__onChange) host.__onChange(host.innerHTML);
      self.refreshFootnotes();
      if (!keepFocus && host && document.body.contains(host)) { host.focus(); caretInText(r, 1); }
    }
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); done(false); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
    });
    ok.onclick = function () { done(false); };
    del.onclick = function () { done(true); };
    function outside(e) {
      if (!m.isConnected) { document.removeEventListener('mousedown', outside, true); return; }
      if (!m.contains(e.target)) done(false, true);
    }
    document.body.appendChild(m);
    posPop(m, mk);
    ta.focus();
    setTimeout(function () { if (!closed) document.addEventListener('mousedown', outside, true); }, 0);
  };

  /* The formula right next to the caret in `host` (dir −1: before it,
     +1: after it), looking past the invisible spacers the editor keeps. */
  function mathBeside(host, dir) { return besideCaret(host, dir, 'imath'); }
  /* the same, for any inline thing of class `cls` (a footnote mark …) */
  function besideCaret(host, dir, cls) {
    var s = window.getSelection();
    if (!s.rangeCount || !s.isCollapsed || !host.contains(s.focusNode)) return null;
    var n = s.focusNode, off = s.focusOffset, sib;
    if (n.nodeType === 3) {
      var rest = dir < 0 ? n.nodeValue.slice(0, off) : n.nodeValue.slice(off);
      if (rest.replace(/[​⁠﻿]/g, '')) return null;
      sib = dir < 0 ? n.previousSibling : n.nextSibling;
    } else {
      sib = n.childNodes[dir < 0 ? off - 1 : off] || null;
    }
    while (sib && sib.nodeType === 3 && !sib.nodeValue.replace(/[​⁠﻿]/g, '')) {
      sib = dir < 0 ? sib.previousSibling : sib.nextSibling;
    }
    return sib && sib.nodeType === 1 && sib.classList.contains(cls) ? sib : null;
  }

  /* Put the text caret at the collapsed range r, inside a text node, so the
     browser draws it at the line's height even beside a formula, at the end
     of the line, or between two formulas. `side` says which way the text
     continues: a new spacer goes there when there is no text to stand in. */
  function caretInText(r, side) {
    var node = r.startContainer, off = r.startOffset, t = null;
    if (node.nodeType === 3) t = { n: node, o: off };
    else {
      var before = node.childNodes[off - 1], after = node.childNodes[off];
      /* empty text pieces the browser leaves behind do not count */
      while (after && after.nodeType === 3 && !after.nodeValue && after.nextSibling && after.nextSibling.nodeType === 3) after = after.nextSibling;
      while (before && before.nodeType === 3 && !before.nodeValue && before.previousSibling && before.previousSibling.nodeType === 3) before = before.previousSibling;
      if (side > 0 && after && after.nodeType === 3) t = { n: after, o: 0 };
      else if (side < 0 && before && before.nodeType === 3) t = { n: before, o: before.nodeValue.length };
      else if (after && after.nodeType === 3) t = { n: after, o: 0 };
      else if (before && before.nodeType === 3) t = { n: before, o: before.nodeValue.length };
      else {
        var sp = document.createTextNode('​');
        node.insertBefore(sp, after || null);
        t = { n: sp, o: side > 0 ? 1 : 0 };
      }
    }
    /* an empty text piece is no place for a caret: the browser would type
       into the formatting before it (after \emph{…}, into the italics) */
    if (!t.n.nodeValue) { t.n.nodeValue = '​'; t.o = side > 0 ? 1 : 0; }
    var c = document.createRange();
    c.setStart(t.n, t.o); c.collapse(true);
    var s = window.getSelection();
    s.removeAllRanges(); s.addRange(c);
  }

  /* ------------------------------------------------------------ block chrome */
  Editor.prototype.renderBlock = function (b, idx) {
    var self = this;
    var wrap = h('div', 'blk blk-' + b.t);
    wrap.dataset.bid = b.id;

    var gut = h('div', 'gutter');
    var plus = h('button', 'g-btn g-plus', '+');
    plus.title = 'Insert block below';
    /* below a theorem or proof means below its parts too — not wedged
       between its text and its derivation */
    plus.onclick = function (e) { self.openMenu(e.currentTarget, groupAt(self.doc, idx)[1] + 1); };
    var more = h('button', 'g-btn g-more', '⋮');
    more.title = 'Options for this part';
    more.onclick = function (e) { self.blockMenu(e.currentTarget, b, idx); };
    gut.appendChild(plus); gut.appendChild(more);
    wrap.appendChild(gut);

    var content = h('div', 'blk-in');
    wrap.appendChild(content);
    this.renderBlockBody(b, content, idx);
    return wrap;
  };

  Editor.prototype.renderBlockBody = function (b, box, idx) {
    var self = this;
    switch (b.t) {
      case 'section': {
        var tag = ['h2', 'h3', 'h4', 'h5'][b.level - 1];
        var e = this.richEditable(tag, 'pt-sec lvl' + b.level, b.html, function (v) { b.html = v; self.change(); }, {
          onKey: function (ev) { self.textKeys(ev, b, idx, 'html'); }
        });
        e.dataset.part = 'main';
        e.dataset.ph = ['Section', 'Subsection', 'Sub-subsection'][b.level - 1] + ' title';
        if (b.__num) {
          var num = h('span', 'pt-secnum', b.__num);
          num.contentEditable = 'false';
          box.appendChild(num);
        }
        box.appendChild(e);
        return;
      }
      case 'para': {
        var p = this.richEditable('p', 'pt-para', b.html, function (v) { b.html = v; self.change(); }, {
          onKey: function (ev) { self.textKeys(ev, b, idx, 'html'); },
          slashMenu: function (q) { self.openMenu(p, idx, true, q); },
          /* "1. " or "- " typed at the start of a paragraph starts a list,
             as in a word processor; Ctrl+Z gives the characters back */
          listStart: function (data) {
            if (/imath|xref|ftnote/.test(p.innerHTML)) return false;
            /* the space that ends the mark must be in what was just typed,
               at the very start of the paragraph */
            var text = p.textContent.replace(/[​ ]/g, ' ');
            if (text.slice(-data.length) !== data.replace(/ /g, ' ')) return false;
            var mk = /^\s*(1[.)]|[-*•]) /.exec(text);
            if (!mk || mk[0].length <= text.length - data.length) return false;
            var lst = blockFactory(/^\s*1/.test(mk[1]) ? 'enumerate' : 'itemize');
            lst.items[0].html = text.slice(mk[0].length).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
            self.doc.blocks.splice(self.doc.blocks.indexOf(b), 1, lst);
            self.focusBlock(lst.id, 'item0');
            self.change(true); self.render();
            return true;
          }
        });
        p.dataset.part = 'main';
        p.dataset.ph = 'Type “/” for blocks, “$” for a formula…';
        box.appendChild(p);
        return;
      }
      case 'eq': return this.renderEq(b, box, idx);
      case 'list': return this.renderList(b, box, idx);
      case 'figure': return this.renderFigure(b, box, idx);
      case 'table': return this.renderTable(b, box, idx);
      case 'chart': return this.renderChart(b, box, idx);
      case 'theorem': {
        var t = h('div', 'pt-thm pt-thm-' + b.kind);
        var head = h('span', 'pt-thmh');
        head.contentEditable = 'false';
        var name = b.kind.charAt(0).toUpperCase() + b.kind.slice(1);
        /* "Theorem 1." — with a title "Theorem 1 (Title)." as in the PDF:
           the full stop moves after the title (paper.css) */
        head.textContent = name + (b.__num ? ' ' + b.__num : '');
        head.appendChild(h('span', 'pt-thmdot', '.'));
        t.appendChild(head);
        var ttl = this.lineEditable('span', 'pt-thmt', b.title, function (v) { b.title = v; self.change(); });
        ttl.dataset.ph = '(title)';
        t.appendChild(ttl);
        var bod = this.richEditable('span', 'pt-thmb', b.html, function (v) { b.html = v; self.change(); }, {
          onKey: function (ev) { self.textKeys(ev, b, idx, 'html'); }
        });
        bod.dataset.part = 'main';
        bod.dataset.ph = b.kind === 'proof' ? 'Proof…' : 'Statement…';
        t.appendChild(bod);
        /* a proof with parts below it ends after them instead */
        if (b.kind === 'proof' && !(this.envLast && this.envLast[b.id] != null)) {
          var q = h('span', 'pt-qed', '□'); q.contentEditable = 'false'; t.appendChild(q);
        }
        box.appendChild(t);
        return;
      }
      case 'quote': {
        var qb = this.richEditable('blockquote', 'pt-quote', b.html, function (v) { b.html = v; self.change(); }, {
          onKey: function (ev) { self.textKeys(ev, b, idx, 'html'); }
        });
        qb.dataset.part = 'main';
        qb.dataset.ph = 'Quotation…';
        box.appendChild(qb);
        return;
      }
      case 'code': {
        var wrapc = h('div', 'pt-codew');
        var bar = h('div', 'pt-codebar');
        bar.contentEditable = 'false';
        var sel = h('select', 'pt-lang');
        ['', 'Python', 'C', 'C++', 'Java', 'Matlab', 'R', 'Fortran', 'Bash'].forEach(function (l) {
          var o = h('option', '', l || 'Plain text, as typed');
          o.value = l;
          if (l === b.lang) o.selected = true;
          sel.appendChild(o);
        });
        sel.onchange = function () { b.lang = sel.value; self.change(true); };
        bar.appendChild(sel);
        wrapc.appendChild(bar);
        var pre = h('pre', 'pt-code');
        pre.contentEditable = 'true';
        pre.spellcheck = false;
        pre.textContent = b.text || '';
        pre.dataset.part = 'main';
        pre.dataset.ph = 'Code…';
        plainLines(pre, function (v) { b.text = v; self.change(); });
        pre.addEventListener('keydown', function (ev) {
          if (ev.key === 'Tab') { ev.preventDefault(); document.execCommand('insertText', false, '    '); }
          if (ev.key === 'Backspace' && !pre.textContent) { ev.preventDefault(); self.removeBlock(idx); }
        });
        wrapc.appendChild(pre);
        box.appendChild(wrapc);
        return;
      }
      case 'raw': {
        var rw = h('div', 'pt-raww');
        var rl = h('div', 'pt-rawl', 'LaTeX code');
        rl.contentEditable = 'false';
        rw.appendChild(rl);
        var ta = h('pre', 'pt-raw');
        ta.contentEditable = 'true';
        ta.spellcheck = false;
        ta.textContent = b.tex || '';
        ta.dataset.part = 'main';
        ta.dataset.ph = 'LaTeX of your own, written into the .tex as typed — e.g. \\vspace{1cm}';
        plainLines(ta, function (v) { b.tex = v; self.change(); });
        ta.addEventListener('keydown', function (ev) {
          if (ev.key === 'Tab') { ev.preventDefault(); document.execCommand('insertText', false, '  '); }
          if (ev.key === 'Backspace' && !ta.textContent) { ev.preventDefault(); self.removeBlock(idx); }
        });
        rw.appendChild(ta);
        box.appendChild(rw);
        return;
      }
      case 'pagebreak': {
        var pb = h('div', 'pt-pagebreak');
        pb.contentEditable = 'false';
        pb.appendChild(h('span', '', 'page break'));
        box.appendChild(pb);
        return;
      }
      case 'toc': {
        var tc = h('div', 'pt-toc');
        tc.contentEditable = 'false';
        tc.appendChild(h('div', 'pt-toch', 'Contents'));
        this.doc.blocks.forEach(function (x) {
          if (x.t !== 'section') return;
          var line = h('div', 'pt-tocl lvl' + x.level);
          if (x.__num) line.appendChild(h('span', 'pt-tocn', x.__num + '  '));
          line.appendChild(headingInto(h('span'), x.html));
          tc.appendChild(line);
        });
        box.appendChild(tc);
        return;
      }
      case 'bib': return this.renderBib(b, box);
    }
  };

  /* ---------------------------------------------------------------- equations */
  /* an equation line's number, "(2)"; a click takes numbering off */
  Editor.prototype.eqNumber = function (b, li) {
    var self = this;
    var n = h('div', 'pt-eqnum', '(' + b.__nums[li] + ')');
    n.contentEditable = 'false';
    n.title = 'Click to stop numbering this equation';
    n.onclick = function () { b.numbered = false; self.focusBlock(b.id, 'line' + li); self.change(true); self.render(); };
    return n;
  };
  /* Numbers worked out again and put right where they are shown — the
     equations' and the references' — without redrawing the page, so the
     formula being typed in keeps its caret. */
  Editor.prototype.renumber = function () {
    var self = this;
    this.labels = numbering(this.doc);
    this.doc.blocks.forEach(function (b) {
      if (b.t !== 'eq') return;
      var w = self.paper.querySelector('[data-bid="' + b.id + '"]');
      if (!w) return;
      [].forEach.call(w.querySelectorAll('.pt-eqline'), function (line, li) {
        var old = line.querySelector(':scope > .pt-eqnum'), want = b.numbered !== false && b.__nums[li];
        if (old && want) old.textContent = '(' + b.__nums[li] + ')';
        else if (old) old.remove();
        else if (want) line.appendChild(self.eqNumber(b, li));
      });
    });
    [].forEach.call(this.paper.querySelectorAll('.pt-eqal'), alignEq);   /* a number came or went: line up again */
    this.refreshXrefs();
  };

  Editor.prototype.renderEq = function (b, box, idx) {
    var self = this;
    var eqw = h('div', 'pt-eqw' + (b.lines.every(M.isEmptyRow) ? ' pt-eqempty' : ''));
    var aligned = b.env !== 'gather' && b.lines.length > 1;
    if (aligned) eqw.classList.add('pt-eqal');
    b.lines.forEach(function (lineRow, li) {
      var linew = h('div', 'pt-eqline');
      var fh = h('div', 'pt-eqf');
      fh.dataset.part = 'line' + li;
      linew.appendChild(fh);
      if (b.numbered !== false && b.__nums && b.__nums[li]) linew.appendChild(self.eqNumber(b, li));
      eqw.appendChild(linew);
      var wasEmpty = M.isEmptyRow(lineRow);

      var f = new M.MathField(fh, {
        root: lineRow,
        onChange: function () {
          self.change(); self.syncEqPreview(b);
          /* the first thing typed into an empty line gives it its number
             (and the equations after it theirs); the last thing deleted
             takes it away */
          var empty = M.isEmptyRow(lineRow);
          if (empty !== wasEmpty) { wasEmpty = empty; self.renumber(); }
        },
        onRender: function (fl) {
          if (aligned && eqw.isConnected) alignEq(eqw);
          /* nothing in it yet: drawn as an empty box, so it can be seen
             (and found, and deleted) — it writes nothing to the LaTeX */
          eqw.classList.toggle('pt-eqempty', b.lines.every(M.isEmptyRow));
          /* a hint below the equation while the caret is in a matrix */
          eqw.classList.toggle('pt-inmat', fl.host.classList.contains('mf-inmat'));
        },
        onFocus: function (fl) { self.activeField = fl; if (self.hooks.onFieldFocus) self.hooks.onFieldFocus(fl, b); },
        onEnter: function (fl, ev, done) {
          if (ev.shiftKey) { self.exitEq(b, idx); return; }
          /* Enter again straight after Enter left a matrix or cases display
             (math.js): this line is done — on to the next line, or after
             the last one out of the equation, never a stray empty line */
          if (done) {
            if (li < b.lines.length - 1) { self.focusBlock(b.id, 'line' + (li + 1)); self.render(); }
            else self.exitEq(b, idx);
            return;
          }
          /* Enter on an empty last line means "done": drop that line and go
             on writing below, as in a list */
          if (M.isEmptyRow(lineRow) && li === b.lines.length - 1) {
            if (b.lines.length > 1) { b.lines.splice(li, 1); if (b.labels) b.labels.splice(li, 1); }
            self.exitEq(b, idx);
            return;
          }
          b.lines.splice(li + 1, 0, M.row());
          if (b.labels) b.labels.splice(li + 1, 0, '');
          self.focusBlock(b.id, 'line' + (li + 1));
          self.change(true); self.render();
        },
        onEscape: function () { self.exitEq(b, idx); },
        /* the hint on an empty last line: Enter leaves (see onEnter) */
        enterLeaves: function () { return li === b.lines.length - 1 && b.lines.length > 1; },
        /* Backspace in a line that was already empty: the line goes, and
           with the last line the equation (never on the Backspace that
           emptied it, as after Ctrl+A) */
        onDeleteEmpty: function () {
          if (b.lines.length > 1) {
            b.lines.splice(li, 1);
            if (b.labels) b.labels.splice(li, 1);
            self.focusBlock(b.id, 'line' + Math.max(0, li - 1));
            self.change(true); self.render();
          } else self.removeBlock(idx);
        },
        onLeave: function (fl, dir) {
          if (dir === 'up' && li > 0) { self.focusBlock(b.id, 'line' + (li - 1)); self.render(); }
          else if (dir === 'down' && li < b.lines.length - 1) { self.focusBlock(b.id, 'line' + (li + 1)); self.render(); }
          else if (dir === 'up' || dir === 'prev') self.focusPrev(idx);
          else self.focusNext(idx);
        }
      });
      self.fields.push(f);
    });
    box.appendChild(eqw);
  };
  /* An align block as the PDF sets it: the first relation sign of every
     line (=, <, 	o …) stands in one column, the left sides flush right
     against it and the right sides flush left, the whole centred. A line
     without one sits wholly left of the column, as after a bare & in TeX. */
  function alignEq(eqw) {
    var roots = [].slice.call(eqw.querySelectorAll(':scope > .pt-eqline > .pt-eqf > .mroot'));
    if (roots.length < 2) return;
    roots.forEach(function (r) { r.style.marginLeft = ''; r.style.marginRight = ''; });
    var parts = roots.map(function (r) {
      var box = r.getBoundingClientRect(), rel = null;
      if (!box.width) return null;
      for (var c = r.firstElementChild; c; c = c.nextElementSibling) if (c.classList.contains('m-rel')) { rel = c; break; }
      /* the signs themselves line up — a line that starts with one keeps
         the space before it, as amsmath's {}= does — and a line without
         one ends where that space would begin */
      var at = rel ? rel.getBoundingClientRect().left - box.left : box.width + 0.2778 * (parseFloat(getComputedStyle(r).fontSize) || 16);
      return { l: at, r: box.width - at };
    });
    if (parts.some(function (x) { return !x; })) return;   /* not on screen yet */
    var L = Math.max.apply(null, parts.map(function (x) { return x.l; }));
    var R = Math.max.apply(null, parts.map(function (x) { return x.r; }));
    roots.forEach(function (r, i) {
      r.style.marginLeft = (L - parts[i].l).toFixed(2) + 'px';
      r.style.marginRight = (R - parts[i].r).toFixed(2) + 'px';
    });
  }
  /* Leaving an equation (Esc, Shift+Enter, Enter on an empty last line)
     always lands on an empty line below it — never at the start of the
     paragraph that follows, where typing would run into its first word. */
  /* A line made just for the caret is taken away again if it is left with
     nothing written in it: Esc, then a click elsewhere, leaves no stray
     empty paragraph behind. */
  Editor.prototype.exitEq = function (b, idx) {
    var self = this, next = this.doc.blocks[idx + 1], made = false;
    if (!next || next.t !== 'para' || !isBlank(next.html)) {
      next = blockFactory('para');
      this.doc.blocks.splice(idx + 1, 0, next);
      made = true;
    }
    this.focusBlock(next.id, 'main', false);
    this.change(true);
    this.render();
    var el = made && this.paper.querySelector('[data-bid="' + next.id + '"]');
    /* the last line of the document stays: there is always one to write on */
    if (!el || this.doc.blocks[this.doc.blocks.length - 1] === next) return;
    var check = function () {
      if (!el.isConnected) { el.removeEventListener('focusout', soon); return; }
      /* the palette or a menu over it: it is still the line being written */
      if ((PT.palette && PT.palette.isOpen()) || document.querySelector('.popmenu')) { setTimeout(check, 200); return; }
      if (el.contains(document.activeElement) || !document.hasFocus()) return;
      el.removeEventListener('focusout', soon);
      var at = self.doc.blocks.indexOf(next);
      if (at < 0 || !isBlank(next.html)) return;
      self.doc.blocks.splice(at, 1);
      el.remove();
      if (self.lastRich && !self.lastRich.isConnected) self.lastRich = null;
      self.change(true);
    };
    var soon = function () { setTimeout(check, 0); };
    el.addEventListener('focusout', soon);
  };
  Editor.prototype.syncEqPreview = function () { /* numbers only change structurally */ };

  /* -------------------------------------------------------------------- lists */
  Editor.prototype.renderList = function (b, box, idx) {
    var self = this;
    var list = h(b.ordered ? 'ol' : 'ul', 'pt-list');
    var counters = [0, 0, 0];
    b.items.forEach(function (it, ii) {
      var li = h('li', 'pt-li lvl' + (it.level || 0));
      li.style.marginLeft = (it.level || 0) * 1.4 + 'em';
      var lvl = it.level || 0;
      counters[lvl]++;
      for (var z = lvl + 1; z < 3; z++) counters[z] = 0;
      var mk = h('span', 'pt-mk');
      mk.contentEditable = 'false';
      mk.textContent = b.ordered
        ? [counters[lvl] + '.', '(' + alpha(counters[lvl]) + ')', roman(counters[lvl]) + '.'][lvl]
        : ['•', '–', '*'][lvl];
      li.appendChild(mk);
      var e = self.richEditable('span', 'pt-litext', it.html, function (v) { it.html = v; self.change(); }, {
        onKey: function (ev) { self.listKeys(ev, b, idx, ii, it); }
      });
      e.dataset.part = 'item' + ii;
      e.dataset.ph = 'List item…';
      li.appendChild(e);
      list.appendChild(li);
    });
    box.appendChild(list);
  };
  function alpha(n) { return String.fromCharCode(96 + n); }
  function roman(n) {
    var r = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
    return r[n - 1] || String(n);
  }

  Editor.prototype.listKeys = function (ev, b, idx, ii, it) {
    var self = this;
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      if (isBlank(it.html)) {
        if (it.level > 0) { it.level--; self.focusBlock(b.id, 'item' + ii); self.change(true); self.render(); return; }
        b.items.splice(ii, 1);
        var p = blockFactory('para');
        self.doc.blocks.splice(idx + 1, 0, p);
        if (!b.items.length) self.doc.blocks.splice(idx, 1);
        self.focusBlock(p.id, 'main', false);
        self.change(true); self.render(); return;
      }
      var rest = splitAfterCaret(ev.target);
      it.html = ev.target.innerHTML;
      b.items.splice(ii + 1, 0, { html: rest, level: it.level || 0 });
      self.focusBlock(b.id, 'item' + (ii + 1), false);
      self.change(true); self.render(); return;
    }
    if (ev.key === 'Tab') {
      ev.preventDefault();
      if (ev.shiftKey) it.level = Math.max(0, (it.level || 0) - 1);
      else if (ii > 0) it.level = Math.min(2, Math.min((b.items[ii - 1].level || 0) + 1, (it.level || 0) + 1));
      self.focusBlock(b.id, 'item' + ii);
      self.change(true); self.render(); return;
    }
    if (ev.key === 'Backspace' && caretAtStart(ev.target)) {
      if (it.level > 0) { ev.preventDefault(); it.level--; self.focusBlock(b.id, 'item' + ii, false); self.change(true); self.render(); return; }
      if (ii === 0 && isBlank(it.html) && b.items.length === 1) { ev.preventDefault(); self.removeBlock(idx); return; }
      if (ii > 0) {
        ev.preventDefault();
        var prev = b.items[ii - 1];
        prev.html = (prev.html || '') + (it.html || '');
        b.items.splice(ii, 1);
        self.focusBlock(b.id, 'item' + (ii - 1));
        self.change(true); self.render(); return;
      }
    }
    if (ev.key === '/' && isBlank(it.html)) { /* let it type */ }
  };

  /* ------------------------------------------------------------------ figures */
  Editor.prototype.renderFigure = function (b, box, idx) {
    var self = this;
    var fw = h('figure', 'pt-fig');
    var holder = h('div', 'pt-figimg');
    holder.contentEditable = 'false';
    var src = PT.sanitize.imageSrc(b.src);
    if (src) {
      var img = h('img');
      img.src = src;
      img.style.width = Math.round(b.width * 100) + '%';
      holder.appendChild(img);
    } else if (b.src) {
      /* only embedded images are shown: a remote address in a shared file
         would tell its owner who opened it */
      holder.appendChild(h('div', 'pt-drop', 'This figure points outside the document and was not loaded. Click to choose the image.'));
    } else {
      var drop = h('div', 'pt-drop');
      drop.innerHTML = '<div class="pt-dropi">🖼</div><div>Click to choose an image, or drop one here</div>' +
        '<div class="pt-dropsub">The image goes with the .tex when you export it</div>';
      holder.appendChild(drop);
    }
    holder.onclick = function () { self.pickImage(b); };
    holder.addEventListener('dragover', function (e) { e.preventDefault(); holder.classList.add('over'); });
    holder.addEventListener('dragleave', function () { holder.classList.remove('over'); });
    holder.addEventListener('drop', function (e) {
      e.preventDefault(); holder.classList.remove('over');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) self.loadImage(b, e.dataTransfer.files[0]);
    });
    fw.appendChild(holder);

    if (b.src) {
      var ctl = h('div', 'pt-figctl');
      ctl.contentEditable = 'false';
      var rng = h('input');
      rng.type = 'range'; rng.min = '20'; rng.max = '100'; rng.value = String(Math.round(b.width * 100));
      rng.title = 'Width relative to the text column';
      rng.oninput = function () {
        b.width = parseInt(rng.value, 10) / 100;
        var im = holder.querySelector('img');
        if (im) im.style.width = rng.value + '%';
        lblw.textContent = rng.value + '%';
        self.change();
      };
      var lblw = h('span', 'pt-figw', Math.round(b.width * 100) + '%');
      ctl.appendChild(rng); ctl.appendChild(lblw);
      var fn = h('span', 'pt-fign', b.filename || 'figure.png');
      ctl.appendChild(fn);
      fw.appendChild(ctl);
    }

    var cap = h('figcaption', 'pt-cap');
    var cl = h('span', 'pt-capl', 'Figure ' + (b.__num || '1') + ': ');
    cl.contentEditable = 'false';
    cap.appendChild(cl);
    var ce = this.richEditable('span', 'pt-capt', PT.latex.capClean(b.caption), function (v) { b.caption = v; self.change(); }, {
      onKey: function (ev) { self.textKeys(ev, b, idx, 'caption'); }
    });
    ce.dataset.part = 'main';
    ce.dataset.ph = 'Caption…';
    cap.appendChild(ce);
    fw.appendChild(cap);
    box.appendChild(fw);
  };

  /* ---- images arriving by paste or drop, anywhere on the page ---- */
  function imageIn(ev) {
    var dt = ev.clipboardData || ev.dataTransfer;
    if (!dt) return null;
    var i;
    if (dt.files) for (i = 0; i < dt.files.length; i++) {
      if (/^image\//.test(dt.files[i].type)) return dt.files[i];
    }
    if (dt.items) for (i = 0; i < dt.items.length; i++) {
      if (dt.items[i].kind === 'file' && /^image\//.test(dt.items[i].type)) return dt.items[i].getAsFile();
    }
    return null;
  }

  Editor.prototype.wirePaper = function () {
    var self = this;
    this.paper.addEventListener('paste', function (e) {
      var f = imageIn(e);
      if (f) {
        e.preventDefault();
        e.stopPropagation();
        self.dropImage(f, e.target);
        return;
      }
      /* LaTeX pasted onto the page is read, not pasted as its source —
         except where text is taken as typed: in a formula (which reads
         LaTeX itself), a code or LaTeX-code block, a table cell */
      var t = e.clipboardData && e.clipboardData.getData('text/plain');
      if (!t || !PT.texread || !PT.texread.isLatex(t)) return;
      var tg = e.target && e.target.closest ? e.target : (e.target && e.target.parentElement);
      if (!tg || tg.closest('.mfield, .mf-proxy, textarea, input, table, .pt-codew, .pt-raww')) return;
      if (tg.closest('[contenteditable="true"]') && !tg.closest('[contenteditable="true"]').__rich && !PT.texread.isDocument(t)) return;
      e.preventDefault();
      e.stopPropagation();
      self.pasteTex(t, tg);
    }, true);
    this.paper.addEventListener('dragover', function (e) {
      if (imageIn(e) || (e.dataTransfer && e.dataTransfer.types && [].indexOf.call(e.dataTransfer.types, 'Files') >= 0)) {
        e.preventDefault();
      }
    });
    this.paper.addEventListener('drop', function (e) {
      if (e.target.closest && e.target.closest('.pt-figimg')) return;  /* the figure handles its own */
      var f = imageIn(e);
      if (!f) return;
      e.preventDefault();
      self.dropImage(f, e.target);
    });
  };

  /* LaTeX pasted onto the page (see wirePaper), read by texread.js:
     - a sentence ("Let $x$ be … \cite{a}") goes in where the caret is;
     - anything with blocks in it goes in as blocks after the block you are
       in — in place of it, when that is an empty paragraph;
     - a whole document is asked about first: open it as a document of its
       own, or insert its body here.
     Works it cites join the reference list; its packages and \newcommand
     join the extra preamble. */
  Editor.prototype.pasteTex = function (text, target, asBlocks) {
    var self = this, doc = this.doc;
    if (!asBlocks && PT.texread.isDocument(text) && this.hooks.onTexDocument) {
      this.hooks.onTexDocument(text, function () { self.pasteTex(text, target, true); });
      return;
    }
    var r;
    try { r = PT.texread.read(text); } catch (err) { if (this.hooks.toast) this.hooks.toast('PaperTeX could not read that LaTeX.'); return; }
    var got = r.doc.blocks.filter(function (b) { return b.t !== 'bib' || !doc.blocks.some(function (x) { return x.t === 'bib'; }); });
    var bibBlock = got.filter(function (b) { return b.t === 'bib'; })[0];
    got = got.filter(function (b) { return b.t !== 'bib'; });
    if (got.length && got[got.length - 1].t === 'para' && isBlank(got[got.length - 1].html)) got.pop();
    /* the works it cites, its packages and shorthands */
    r.doc.bib.forEach(function (e) {
      if (doc.bib.some(function (w) { return w.key === e.key; })) { citeWork(doc, e.key); return; }
      doc.bib.push(bibEmpty(e) ? libraryWork(doc, e.key) || e : e);
    });
    if (bibBlock && r.doc.bib.length) doc.blocks.push(bibBlock);
    var mine = String(doc.settings.preamble || '').split('\n');
    var more = String(r.doc.settings.preamble || '').split('\n').filter(function (L) { return L.trim() && mine.indexOf(L) < 0; });
    if (more.length) doc.settings.preamble = mine.concat(more).filter(function (L) { return L.trim(); }).join('\n');

    var host = target.closest('[contenteditable="true"]');
    if (got.length === 1 && got[0].t === 'para' && host && host.__rich && !asBlocks) {
      /* a sentence: in the text, at the caret */
      /* the spaces around what was copied are part of it */
      var sp = function (re) { return re.test(text) ? ' ' : ''; };
      document.execCommand('insertHTML', false, sp(/^\s/) + got[0].html + sp(/\s$/));
      this.refreshInlineMath();
      if (this.refreshXrefs) this.refreshXrefs();
      if (this.refreshFootnotes) this.refreshFootnotes();
      if (bibBlock && r.doc.bib.length) { this.change(true); this.render(); }
    } else if (got.length) {
      var hb = target.closest('[data-bid]'), idx = doc.blocks.length - 1;
      if (hb) doc.blocks.forEach(function (b, i) { if (b.id === hb.dataset.bid) idx = i; });
      var cur = doc.blocks[idx];
      var spliceArgs = cur && cur.t === 'para' && isBlank(cur.html) ? [idx, 1] : [idx + 1, 0];
      Array.prototype.splice.apply(doc.blocks, spliceArgs.concat(got));
      this.focusBlock(got[got.length - 1].id, 'main', true);
      this.change(true);
      this.render();
    }
    if (r.notes.length && this.hooks.onTexNotes) this.hooks.onTexNotes(r.notes);
  };

  /* An image dropped on an empty figure fills it; anywhere else it becomes a
     new figure just below whatever block you were in. */
  Editor.prototype.dropImage = function (file, targetEl) {
    var self = this, at = this.doc.blocks.length, existing = null;
    var host = targetEl && targetEl.closest ? targetEl.closest('[data-bid]') : null;
    if (host) {
      this.doc.blocks.forEach(function (b, i) {
        if (b.id !== host.dataset.bid) return;
        at = i + 1;
        if (b.t === 'figure' && !b.src) { existing = b; at = i; }
      });
    }
    var blk = existing;
    if (!blk) {
      blk = blockFactory('figure');
      blk.caption = '';
      this.doc.blocks.splice(at, 0, blk);
    }
    this.loadImage(blk, file);
    void self;
  };

  /* LaTeX references figures by file name, so two of them must never collide. */
  Editor.prototype.uniqueFilename = function (name, forBlock) {
    var base = String(name || 'image.png').replace(/\s+/g, '_').replace(/[^\w.\-]/g, '');
    if (!/\.[a-z0-9]+$/i.test(base)) base += '.png';
    var used = {};
    this.doc.blocks.forEach(function (b) {
      if (b.t === 'figure' && b.filename && b !== forBlock) used[b.filename] = true;
    });
    if (!used[base]) return base;
    var dot = base.lastIndexOf('.'), stem = base.slice(0, dot), ext = base.slice(dot), n = 2;
    while (used[stem + '-' + n + ext]) n++;
    return stem + '-' + n + ext;
  };

  Editor.prototype.pickImage = function (b) {
    var self = this;
    var inp = h('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = function () { if (inp.files[0]) self.loadImage(b, inp.files[0]); };
    inp.click();
  };
  Editor.prototype.loadImage = function (b, file) {
    var self = this;
    var fr = new FileReader();
    fr.onload = function () {
      b.src = fr.result;
      b.filename = self.uniqueFilename(file.name || 'pasted-image.png', b);
      self.focusBlock(b.id, 'main');
      self.change(true);
      self.render();
      if (self.hooks.onImage) self.hooks.onImage(b);
    };
    fr.readAsDataURL(file);
  };

  /* ------------------------------------------------------------------- tables */
  /* the classes that make a table look on the page as it will in the PDF */
  function tableClass(b) {
    return 'pt-table' + (b.booktabs ? ' booktabs' : '') + (b.rules ? ' ruled' : '') +
      (b.zebra ? ' zebra' : '') + (b.header ? ' hashead' : '') + (b.boldFirst ? ' boldfirst' : '') +
      (b.boldHeader === false ? ' plainhead' : '') + (b.size ? ' sz-' + b.size : '');
  }

  Editor.prototype.renderTable = function (b, box, idx) {
    var self = this;
    var tw = h('div', 'pt-tabw');

    var cap = h('div', 'pt-cap pt-tcap' + (b.capBelow ? ' below' : ''));
    var cl = h('span', 'pt-capl', 'Table ' + (b.__num || '1') + ': ');
    cl.contentEditable = 'false';
    cap.appendChild(cl);
    var ce = this.richEditable('span', 'pt-capt', PT.latex.capClean(b.caption), function (v) { b.caption = v; self.change(); }, {
      onKey: function (ev) { self.textKeys(ev, b, idx, 'caption'); }
    });
    ce.dataset.ph = 'Caption…';
    cap.appendChild(ce);
    if (!b.capBelow) tw.appendChild(cap);

    var tbl = h('table', tableClass(b));
    b.rows.forEach(function (r, ri) {
      var tr = h('tr', ri === 0 && b.header ? 'hdr' : '');
      r.forEach(function (c, ci) {
        var td = h(ri === 0 && b.header ? 'th' : 'td', 'al-' + (b.align[ci] || 'l'));
        var e = self.richEditable('div', 'pt-cell', c, function (v) { b.rows[ri][ci] = v; self.change(); }, {
          onKey: function (ev) { self.tableKeys(ev, b, ri, ci); }
        });
        e.dataset.part = 'c' + ri + '_' + ci;
        e.addEventListener('focus', function () { self.tableCur = { id: b.id, ri: ri, ci: ci }; });
        td.appendChild(e);
        tr.appendChild(td);
      });
      tbl.appendChild(tr);
    });
    /* a block of cells copied from a spreadsheet lands cell by cell */
    tbl.addEventListener('paste', function (ev) {
      var text = ev.clipboardData && ev.clipboardData.getData('text/plain');
      var cell = ev.target.closest && ev.target.closest('.pt-cell');
      if (!text || !cell || !/[\t\n]/.test(text.replace(/\s+$/, ''))) return;
      ev.preventDefault();
      ev.stopPropagation();
      var at = /^c(\d+)_(\d+)$/.exec(cell.dataset.part);
      self.pasteCells(b, PT.chart.parseCSV(text), +at[1], +at[2]);
    }, true);
    tw.appendChild(tbl);
    if (b.capBelow) tw.appendChild(cap);

    /* rows and columns go in beside the cell you were last in; everything
       else is in the table editor */
    function cur() {
      var c = self.tableCur;
      return c && c.id === b.id && c.ri < b.rows.length && c.ci < b.align.length ? c : null;
    }
    var bar = h('div', 'pt-tabctl');
    bar.contentEditable = 'false';
    [['⤢  Edit table', 'Open the table editor: style, sorting, totals, CSV, alignment', function () {
      if (PT.studio) PT.studio.open(self, b, tw);
      return false;
    }, 'big'],
     ['+ row', 'Insert a row below the current one', function () {
       var c = cur(), at = c ? c.ri + 1 : b.rows.length;
       b.rows.splice(at, 0, b.align.map(function () { return ''; }));
       self.focusBlock(b.id, 'c' + at + '_' + (c ? c.ci : 0), false);
     }],
     ['− row', 'Delete the current row', function () {
       if (b.rows.length < 2) return;
       var c = cur();
       b.rows.splice(c ? c.ri : b.rows.length - 1, 1);
     }],
     ['+ col', 'Insert a column right of the current one', function () {
       var c = cur(), at = c ? c.ci + 1 : b.align.length;
       b.rows.forEach(function (r) { r.splice(at, 0, ''); });
       b.align.splice(at, 0, 'c');
       self.focusBlock(b.id, 'c' + (c ? c.ri : 0) + '_' + at, false);
     }],
     ['− col', 'Delete the current column', function () {
       if (b.align.length < 2) return;
       var c = cur(), at = c ? c.ci : b.align.length - 1;
       b.rows.forEach(function (r) { r.splice(at, 1); });
       b.align.splice(at, 1);
     }],
     ['📊 chart', 'Draw a chart from this table', function () { self.chartFromTable(b, idx); return false; }]
    ].forEach(function (it) {
      var bt = h('button', it[3] || '', it[0]);
      bt.title = it[1];
      bt.onmousedown = function (e) { e.preventDefault(); };   /* keep the cell's caret */
      bt.onclick = function () { if (it[2]() !== false) { self.change(true); self.render(); } };
      bar.appendChild(bt);
    });
    tw.appendChild(bar);
    box.appendChild(tw);
  };

  function escHTML(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* rows of text into the table from (ri, ci), growing it to fit */
  Editor.prototype.pasteCells = function (b, rows, ri, ci) {
    rows.forEach(function (r, i) {
      r.forEach(function (t, j) {
        while (b.rows.length <= ri + i) b.rows.push(b.align.map(function () { return ''; }));
        while (b.align.length <= ci + j) { b.rows.forEach(function (x) { x.push(''); }); b.align.push('r'); }
        b.rows[ri + i][ci + j] = escHTML(t);
      });
    });
    this.focusBlock(b.id, 'c' + (ri + rows.length - 1) + '_' + ci);
    this.change(true);
    this.render();
  };

  Editor.prototype.tableKeys = function (ev, b, ri, ci) {
    var self = this;
    if (ev.key === 'Tab') {
      ev.preventDefault();
      var flat = ri * b.rows[0].length + ci + (ev.shiftKey ? -1 : 1);
      var cols = b.rows[0].length;
      if (flat < 0) return;
      if (flat >= b.rows.length * cols) { b.rows.push(b.rows[0].map(function () { return ''; })); self.change(true); }
      var nr = Math.floor(flat / cols), nc = flat % cols;
      self.focusBlock(b.id, 'c' + nr + '_' + nc);
      self.render();
    }
  };

  /* ------------------------------------------------------------------- charts */
  Editor.prototype.renderChart = function (b, box, idx) {
    var self = this, C = PT.chart, doc = this.doc;
    var fw = h('figure', 'pt-fig pt-chart');
    var plot = h('div', 'pt-chplot');
    plot.contentEditable = 'false';
    plot.dataset.chart = b.id;
    plot.title = 'Click to open the chart editor';
    fw.appendChild(plot);
    /* drawn once it is on the page: it sizes itself to the column */
    setTimeout(function () { if (plot.isConnected) C.draw(plot, b, doc); }, 0);

    /* the whole chart is the way in to its settings */
    var edit = h('button', 'pt-chedit', '⤢  Edit chart');
    edit.contentEditable = 'false';
    edit.title = 'Open the chart editor: type, data, colours, axes, legend, size';
    function openStudio(e) {
      if (e) e.preventDefault();
      if (PT.studio) PT.studio.open(self, b, fw);
    }
    edit.onclick = openStudio;
    plot.addEventListener('click', openStudio);
    fw.appendChild(edit);

    var cap = h('figcaption', 'pt-cap');
    var cl = h('span', 'pt-capl', 'Figure ' + (b.__num || '1') + ': ');
    cl.contentEditable = 'false';
    cap.appendChild(cl);
    var ce = this.richEditable('span', 'pt-capt', PT.latex.capClean(b.caption), function (v) { b.caption = v; self.change(); }, {
      onKey: function (ev) { self.textKeys(ev, b, idx, 'caption'); }
    });
    ce.dataset.part = 'main';
    ce.dataset.ph = 'Caption…';
    cap.appendChild(ce);
    fw.appendChild(cap);
    box.appendChild(fw);
  };

  /* every chart again, a burst of edits at a time: a chart drawn from a
     table follows its cells as they are typed. A timer, not an animation
     frame, which never comes while the tab is in the background. */
  Editor.prototype.redrawCharts = function () {
    var self = this;
    if (this.chartTimer || !window.PT.chart) return;
    this.chartTimer = setTimeout(function () {
      self.chartTimer = 0;
      [].forEach.call(self.paper.querySelectorAll('.pt-chplot'), function (p) {
        var b = self.doc.blocks.filter(function (x) { return x.id === p.dataset.chart; })[0];
        if (b) PT.chart.draw(p, b, self.doc);
      });
    }, 30);
  };

  Editor.prototype.chartFromTable = function (t, idx) {
    var C = PT.chart, src = C.source({ from: t.id }, this.doc);
    var numericCol = function (i) {
      return src.rows.some(function (r) { return C.num(r[i]) !== null; }) &&
        src.rows.every(function (r) { return !r[i] || C.num(r[i]) !== null; });
    };
    var ys = [];
    for (var i = 1; i < src.head.length; i++) if (numericCol(i)) ys.push(i);
    if (!ys.length) ys = [Math.min(1, src.head.length - 1)];
    var b = chartBlock(numericCol(0) ? 'line' : 'bar', {
      from: t.id, xcol: 0, ycols: ys,
      xlabel: t.header ? src.head[0] : '', ylabel: t.header && ys.length === 1 ? src.head[ys[0]] : ''
    });
    this.doc.blocks.splice(idx + 1, 0, b);
    this.focusBlock(b.id, 'main');
    this.change(true);
    this.render();
    this.openStudioSoon(b);
  };

  /* -------------------------------------------------------------- bibliography */
  Editor.prototype.renderBib = function (b, box) {
    var self = this;
    var w = h('div', 'pt-bib');
    w.appendChild(h('div', 'pt-bibh', 'References'));
    var nums = bibNumbers(this.doc);
    this.doc.bib.forEach(function (e, i) {
      var it = h('div', 'pt-bibi');
      it.dataset.key = e.key;
      /* an entry with nothing in it yet has no number: it prints nothing */
      var n = h('span', 'pt-bibn' + (nums[i] ? '' : ' empty'), nums[i] ? '[' + nums[i] + ']' : '[ ]');
      n.contentEditable = 'false';
      it.appendChild(n);
      var body = h('span', 'pt-bibb');
      [['author', 'Author(s)'], ['title', 'Title'], ['journal', 'Journal / publisher'], ['year', 'Year']].forEach(function (f, k) {
        /* rich text, one line: italics, bold and formulas are kept */
        var put = function (v) {
          var was = !!nums[i];
          e[f[0]] = v;
          self.change();
          /* the entry got its first word, or lost its last: numbers move */
          if (was !== !!bibNumbers(self.doc)[i]) self.renumberBib();
        };
        var fe = self.doc.meta.bibHtml ? self.lineEditable('span', 'pt-bibf f-' + f[0], e[f[0]] || '', put)
          : self.editable('span', 'pt-bibf f-' + f[0], e[f[0]] || '', put, true);
        fe.dataset.ph = f[1];
        body.appendChild(fe);
        if (k < 3) body.appendChild(h('span', 'pt-bibsep', ', '));
      });
      it.appendChild(body);
      /* a new key is taken when you leave the field (or press Enter): its
         citations go with it; a key another work has is refused */
      var key = self.editable('span', 'pt-bibkey', e.key, function () {}, true);
      key.title = 'The name citations use for this work';
      var takeKey = function () {
        var v = key.textContent.replace(/[^A-Za-z0-9:_-]/g, ''), old = e.key;
        if (v === old) { key.textContent = old; return; }
        if (!v || self.doc.bib.some(function (x) { return x !== e && x.key === v; })) {
          key.textContent = old;
          if (v && self.hooks.toast) self.hooks.toast('Another work already has the key “' + v + '” — choose a different one.');
          return;
        }
        e.key = v;
        key.textContent = v;
        it.dataset.key = v;
        var moved = dropCites(self.doc, old, v);
        [].forEach.call(self.paper.querySelectorAll('.xref[data-kind="cite"]'), function (x) {
          if (x.getAttribute('data-label') === old) x.setAttribute('data-label', v);
        });
        /* an entry not written yet, given the key of a work in the .bib the
           document came with: that work's entry */
        var w = bibEmpty(e) && libraryWork(self.doc, v);
        if (w) { Object.assign(e, w); self.change(true); self.render(); }
        else self.change(true);
        var said = moved ? (moved === 1 ? 'Its citation now uses' : 'Its ' + moved + ' citations now use') + ' “' + v + '”.' : '';
        if (w) said = (said ? said + ' ' : '') + 'Filled in from your .bib.';
        if (said && self.hooks.toast) self.hooks.toast(said);
      };
      key.addEventListener('blur', takeKey);
      key.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); key.blur(); }
        else if (ev.key === 'Escape') { ev.preventDefault(); key.textContent = e.key; key.blur(); }
      });
      it.appendChild(key);
      /* the list is printed in this order: move an entry up or down */
      var up = h('button', 'pt-bibup', '↑'), dn = h('button', 'pt-bibdn', '↓');
      up.title = 'Move up'; dn.title = 'Move down';
      up.onclick = function () { if (i > 0) { self.doc.bib.splice(i - 1, 0, self.doc.bib.splice(i, 1)[0]); self.change(true); self.render(); } };
      dn.onclick = function () { if (i < self.doc.bib.length - 1) { self.doc.bib.splice(i + 1, 0, self.doc.bib.splice(i, 1)[0]); self.change(true); self.render(); } };
      it.appendChild(up); it.appendChild(dn);
      var del = h('button', 'pt-bibx', '×');
      del.title = 'Remove this work (and its citations in the text)';
      del.onclick = function () {
        self.doc.bib.splice(i, 1);
        /* its citations would print "??": they go with it (Ctrl+Z brings both back) */
        var gone = e.key && !self.doc.bib.some(function (x) { return x.key === e.key; }) ? dropCites(self.doc, e.key) : 0;
        self.change(true); self.render();
        if (gone && self.hooks.toast) self.hooks.toast('Removed the work and its ' + (gone === 1 ? 'citation' : gone + ' citations') + ' in the text — Ctrl+Z brings them back.');
      };
      it.appendChild(del);
      /* a click on the entry outside its fields (its number, a comma) goes
         into the entry — its first empty field — rather than leaving the
         caret wherever it was before */
      it.addEventListener('mousedown', function (ev) {
        if (ev.button !== 0 || ev.target.closest('.pt-bibf, .pt-bibkey, .pt-bibx, .pt-bibup, .pt-bibdn')) return;
        ev.preventDefault();
        var fs = [].slice.call(body.querySelectorAll('.pt-bibf'));
        var to = fs.filter(function (f) { return !f.textContent; })[0] || fs[0];
        if (to) placeCaret(to, true);
      });
      w.appendChild(it);
    });
    var add = h('button', 'pt-bibadd', '+ reference');
    add.onclick = function () {
      var key = self.newBibKey();
      self.doc.bib.push({ key: key, author: '', title: '', journal: '', year: '' });
      self.change(true); self.render();
      /* straight into the new entry, to write it */
      var row = self.paper.querySelector('.pt-bibi[data-key="' + key + '"] .f-author');
      if (row) { row.scrollIntoView({ block: 'nearest' }); placeCaret(row, true); }
    };
    w.appendChild(add);
    box.appendChild(w);
  };
  /* a key no other entry or label has: ref1, ref2 … */
  Editor.prototype.newBibKey = function () {
    var have = {};
    this.doc.bib.forEach(function (x) { have[x.key] = 1; });
    this.doc.blocks.forEach(function (x) { if (x.label) have[x.label] = 1; (x.labels || []).forEach(function (l) { have[l] = 1; }); });
    var n = this.doc.bib.length + 1;
    while (have['ref' + n]) n++;
    return 'ref' + n;
  };
  /* the reference list's numbers redrawn in place, and the citations' */
  Editor.prototype.renumberBib = function () {
    var nums = bibNumbers(this.doc);
    [].forEach.call(this.paper.querySelectorAll('.pt-bibi'), function (it, i) {
      var n = it.querySelector('.pt-bibn');
      if (!n) return;
      n.textContent = nums[i] ? '[' + nums[i] + ']' : '[ ]';
      n.classList.toggle('empty', !nums[i]);
    });
    this.labels = numbering(this.doc);
    this.refreshXrefs();
  };
  /* Put the works in the order they are first cited in the text, as
     numbered lists of references usually are; works not cited go last. */
  Editor.prototype.orderBibByCitation = function () {
    var first = {};
    [].forEach.call(this.paper.querySelectorAll('.xref[data-kind="cite"]'), function (x, k) {
      if (first[x.dataset.label] == null) first[x.dataset.label] = k;
    });
    var bib = this.doc.bib, pos = bib.map(function (e, i) { return { e: e, i: i }; });
    pos.sort(function (a, b) {
      var fa = first[a.e.key], fb = first[b.e.key];
      if (fa == null && fb == null) return a.i - b.i;
      if (fa == null) return 1;
      if (fb == null) return -1;
      return fa - fb;
    });
    this.doc.bib = pos.map(function (p) { return p.e; });
    this.change(true); this.render();
  };

  /* ------------------------------------------------- generic text block keys */
  Editor.prototype.textKeys = function (ev, b, idx, field) {
    var self = this;
    var el = ev.target;
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      if (b.t === 'section') {
        var nb = this.doc.blocks[idx + 1];
        if (!nb || nb.t !== 'para') { nb = blockFactory('para'); this.doc.blocks.splice(idx + 1, 0, nb); }
        this.focusBlock(nb.id, 'main', false);
        this.change(true); this.render(); return;
      }
      var rest = splitAfterCaret(el);
      b[field] = el.innerHTML;
      var np = blockFactory('para');
      np.html = rest;
      this.doc.blocks.splice(idx + 1, 0, np);
      this.focusBlock(np.id, 'main', false);
      this.change(true); this.render(); return;
    }
    if (ev.key === 'Backspace' && caretAtStart(el)) {
      var prev = this.doc.blocks[idx - 1];
      if (b.t === 'section' && isBlank(b.html)) {
        ev.preventDefault();
        if (b.level > 1) { b.level--; this.focusBlock(b.id, 'main'); this.change(true); this.render(); }
        else { var p2 = blockFactory('para'); this.doc.blocks.splice(idx, 1, p2); this.focusBlock(p2.id, 'main'); this.change(true); this.render(); }
        return;
      }
      if (isBlank(el.innerHTML) && this.doc.blocks.length > 1) {
        ev.preventDefault(); this.removeBlock(idx); return;
      }
      /* a paragraph is not pulled up into the heading above it: the caret
         goes to the heading's end, and the text stays a paragraph */
      if (prev && prev.t === 'section' && b.t === 'para') {
        ev.preventDefault();
        this.focusBlock(prev.id, 'main');
        this.render();
        return;
      }
      if (prev && (prev.t === 'para' || prev.t === 'section')) {
        ev.preventDefault();
        prev.html = (prev.html || '') + (b[field] || '');
        this.doc.blocks.splice(idx, 1);
        this.focusBlock(prev.id, 'main');
        this.change(true); this.render(); return;
      }
    }
    if (ev.key === 'ArrowUp' && caretAtStart(el)) { ev.preventDefault(); this.focusPrev(idx); return; }
    if (ev.key === 'ArrowDown' && caretAtEnd(el)) { ev.preventDefault(); this.focusNext(idx); return; }
    if (ev.key === '/' && isBlank(el.innerHTML) && b.t === 'para') {
      ev.preventDefault();
      this.openMenu(el, idx, true);
      return;
    }
    void self;
  };

  Editor.prototype.focusPrev = function (idx) {
    for (var i = idx - 1; i >= 0; i--) {
      var b = this.doc.blocks[i];
      var part = b.t === 'eq' ? 'line' + (b.lines.length - 1) : (b.t === 'list' ? 'item' + (b.items.length - 1) : 'main');
      var host = this.paper.querySelector('[data-bid="' + b.id + '"] [data-part="' + part + '"]');
      if (host) { if (host.classList.contains('mfield')) host.focus(); else placeCaret(host, true); return; }
    }
  };
  Editor.prototype.focusNext = function (idx) {
    for (var i = idx + 1; i < this.doc.blocks.length; i++) {
      var b = this.doc.blocks[i];
      var part = b.t === 'eq' ? 'line0' : (b.t === 'list' ? 'item0' : 'main');
      var host = this.paper.querySelector('[data-bid="' + b.id + '"] [data-part="' + part + '"]');
      if (host) { if (host.classList.contains('mfield')) host.focus(); else placeCaret(host, false); return; }
    }
  };

  Editor.prototype.removeBlock = function (idx) {
    /* Backspace held down: the block it emptied goes, and the repeats
       stop there instead of eating into the block above */
    holdBackspace();
    var prev = this.doc.blocks[idx - 1];
    this.doc.blocks.splice(idx, 1);
    if (!this.doc.blocks.length) this.doc.blocks.push(blockFactory('para'));
    if (prev) {
      var part = prev.t === 'eq' ? 'line' + (prev.lines.length - 1) : (prev.t === 'list' ? 'item' + (prev.items.length - 1) : 'main');
      this.focusBlock(prev.id, part);
    } else this.focusBlock(this.doc.blocks[0].id, 'main');
    this.change(true);
    this.render();
  };

  /* where "at the end" puts a new block: before the reference list when the
     document ends with one, since that is printed last */
  Editor.prototype.endOfText = function () {
    var bl = this.doc.blocks, n = bl.length;
    return n && bl[n - 1].t === 'bib' ? n - 1 : n;
  };

  /* the abstract switched on, and the caret in it */
  Editor.prototype.openAbstract = function () {
    if (!this.doc.settings.showAbstract) {
      this.doc.settings.showAbstract = true;
      this.change(true);
      this.render();
      if (this.hooks.onSettings) this.hooks.onSettings();
    }
    var a = this.paper.querySelector('.pt-abbody');
    if (a) { a.scrollIntoView({ block: 'center' }); placeCaret(a, true); }
  };

  /* `inEnv`: the new block is a part of the theorem or proof above it */
  Editor.prototype.insertBlock = function (kind, at, inEnv) {
    /* the reference list: one, at the end, where it is printed */
    if (kind === 'bib') {
      var have = this.doc.blocks.filter(function (x) { return x.t === 'bib'; })[0];
      if (have) {
        var el = this.paper.querySelector('[data-bid="' + have.id + '"]');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return have;
      }
      at = this.doc.blocks.length;
    }
    var b = blockFactory(kind);
    if (inEnv && PARTS[b.t]) b.inEnv = true;
    this.doc.blocks.splice(at, 0, b);
    /* a derivation in a proof is not numbered, as in most papers */
    if (b.inEnv && b.t === 'eq') {
      var own = envChain(this.doc)[at];
      if (own && own.kind === 'proof') b.numbered = false;
    }
    var part = b.t === 'eq' ? 'line0' : (b.t === 'list' ? 'item0' : 'main');
    this.focusBlock(b.id, part, false);
    this.change(true);
    this.render();
    this.openStudioSoon(b);
    return b;
  };
  /* a new chart or table opens straight into its editor, once it is drawn */
  Editor.prototype.openStudioSoon = function (b) {
    var self = this;
    if ((b.t === 'chart' || b.t === 'table') && PT.studio) {
      setTimeout(function () { if (self.doc.blocks.indexOf(b) >= 0) PT.studio.open(self, b); }, 40);
    }
  };

  /* ------------------------------------------------------------------- menus */
  Editor.prototype.openMenu = function (anchor, at, replaceEmptyPara, query) {
    var self = this;
    closeAllPop();
    var m = h('div', 'popmenu');
    var search = h('input', 'popsearch');
    search.placeholder = 'Insert…';
    m.appendChild(search);
    var listw = h('div', 'popitems');
    m.appendChild(listw);

    function entry(it) {
      var row = h('button', 'popitem');
      row.appendChild(h('span', 'popico', it[2]));
      var tx = h('span', 'poptx');
      tx.appendChild(h('span', 'popname', it[1]));
      tx.appendChild(h('span', 'popdesc', it[3]));
      row.appendChild(tx);
      row.onclick = function () {
        closeAllPop();
        /* a footnote is not a block: it goes into the text, at the caret */
        if (it[0] === 'footnote') { self.footnoteInto(anchor, replaceEmptyPara); return; }
        /* nor is the abstract: it sits under the title */
        if (it[0] === 'abstract') { self.openAbstract(); return; }
        var target = at;
        if (replaceEmptyPara) { self.doc.blocks.splice(at, 1); target = at; }
        self.insertBlock(it[0], target);
      };
      listw.appendChild(row);
    }
    function fill(q) {
      listw.textContent = '';
      if (q && q.trim()) {
        /* searching: one list, the best match first */
        var hits = [];
        MENU.forEach(function (g) { g.items.forEach(function (it, i) { var s = menuScore(it, q); if (s) hits.push({ it: it, s: s, o: hits.length + i }); }); });
        hits.sort(function (a, b) { return (b.s - a.s) || (a.o - b.o); });
        hits.forEach(function (x) { entry(x.it); });
        if (!hits.length) listw.appendChild(h('div', 'popnone', 'Nothing matches “' + q.trim() + '”.'));
      } else {
        MENU.forEach(function (g) {
          listw.appendChild(h('div', 'popg', g.g));
          g.items.forEach(entry);
        });
      }
      var first = listw.querySelector('.popitem');
      if (first) first.classList.add('sel');
    }
    search.value = query || '';
    fill(search.value);
    search.addEventListener('input', function () { fill(search.value); });
    search.addEventListener('keydown', function (e) {
      var items = [].slice.call(listw.querySelectorAll('.popitem'));
      var cur = listw.querySelector('.popitem.sel');
      var i = items.indexOf(cur);
      if (e.key === 'ArrowDown') { e.preventDefault(); if (cur) cur.classList.remove('sel'); items[Math.min(items.length - 1, i + 1)].classList.add('sel'); items[Math.min(items.length - 1, i + 1)].scrollIntoView({ block: 'nearest' }); }
      if (e.key === 'ArrowUp') { e.preventDefault(); if (cur) cur.classList.remove('sel'); items[Math.max(0, i - 1)].classList.add('sel'); items[Math.max(0, i - 1)].scrollIntoView({ block: 'nearest' }); }
      if (e.key === 'Enter') { e.preventDefault(); if (cur) cur.click(); }
      if (e.key === 'Escape') { e.preventDefault(); closeAllPop(); }
    });
    document.body.appendChild(m);
    posPop(m, anchor);
    search.focus();
    armOutside(m);
  };

  Editor.prototype.blockMenu = function (anchor, b, idx) {
    var self = this;
    closeAllPop();
    var m = h('div', 'popmenu small');
    function item(label, fn, cls) {
      var bt = h('button', 'popitem ' + (cls || ''));
      bt.appendChild(h('span', 'poptx', label));
      bt.onclick = function () { closeAllPop(); fn(); };
      m.appendChild(bt);
    }
    if (b.t === 'section') {
      m.appendChild(h('div', 'popg', 'Level'));
      [1, 2, 3].forEach(function (l) {
        item(['Section', 'Subsection', 'Sub-subsection'][l - 1] + (b.level === l ? '  ✓' : ''), function () {
          b.level = l; self.change(true); self.render();
        });
      });
      item(b.numbered === false ? 'Number this heading' : 'Remove its number', function () {
        b.numbered = b.numbered === false; self.change(true); self.render();
      });
    }
    if (b.t === 'eq') {
      m.appendChild(h('div', 'popg', 'Equation'));
      item(b.numbered === false ? 'Number it' : 'Remove number', function () { b.numbered = b.numbered === false; self.change(true); self.render(); });
      item(b.env === 'gather' ? 'Line up the lines at the = signs' : 'Centre each line instead of lining up', function () {
        b.env = b.env === 'gather' ? 'align' : 'gather'; self.change(true); self.render();
      });
      item('Add a line', function () { b.lines.push(M.row()); self.focusBlock(b.id, 'line' + (b.lines.length - 1)); self.change(true); self.render(); });
      /* rows and columns of the matrix or cases display the caret was in
         (or of the first one in the equation) */
      var mf = this.fields.filter(function (f) { return b.lines.indexOf(f.root) >= 0 && f.hasMatrix(); });
      var ff = mf.filter(function (f) { return f === self.activeField; })[0] || mf[0];
      if (ff) {
        m.appendChild(h('div', 'popg', 'Matrix or cases'));
        item('Edit it large…', function () { ff.openMatrix(); });
        var at = ff.matrixAt(), isCases = at ? at.m.env === 'cases' : false;
        [['addrow', 'Add a row below'], ['addcol', 'Add a column to the right'], ['delrow', 'Remove this row'], ['delcol', 'Remove this column']].forEach(function (o) {
          if (isCases && /col/.test(o[0])) return;   /* cases: a value and a condition, always */
          item(o[1], function () { ff.matrixOpAnywhere(o[0]); ff.host.focus(); });
        });
      }
    }
    if (b.t === 'list') {
      item(b.ordered ? 'Make it a bulleted list' : 'Make it a numbered list', function () { b.ordered = !b.ordered; self.change(true); self.render(); });
    }
    /* a part of the theorem or proof just above, or not */
    var above = this.doc.blocks[idx - 1];
    if (PARTS[b.t] && above && (above.t === 'theorem' || above.inEnv)) {
      var owner = envChain(this.doc)[idx] || (above.t === 'theorem' ? above : envChain(this.doc)[idx - 1]);
      var kname = owner ? owner.kind.charAt(0).toUpperCase() + owner.kind.slice(1) : 'Theorem';
      item((b.inEnv ? '✓ ' : '') + 'Part of the ' + kname.toLowerCase() + ' above', function () {
        if (b.inEnv) {
          /* and so is nothing after it */
          for (var j = idx; j < self.doc.blocks.length && self.doc.blocks[j].inEnv; j++) delete self.doc.blocks[j].inEnv;
        } else b.inEnv = true;
        self.change(true); self.render();
      });
    }
    if (b.t === 'theorem') {
      m.appendChild(h('div', 'popg', 'Environment'));
      ['theorem', 'lemma', 'corollary', 'proposition', 'definition', 'example', 'remark', 'proof'].forEach(function (k) {
        item(k.charAt(0).toUpperCase() + k.slice(1) + (b.kind === k ? '  ✓' : ''), function () { b.kind = k; self.change(true); self.render(); });
      });
    }
    if (b.t === 'bib') {
      m.appendChild(h('div', 'popg', 'Works'));
      item('Number them in the order they are cited', function () { self.orderBibByCitation(); });
    }
    if (b.t === 'table') {
      m.appendChild(h('div', 'popg', 'Data'));
      item('Make a chart from this table', function () { self.chartFromTable(b, idx); });
    }
    if (b.t === 'figure' || b.t === 'chart' || b.t === 'table' || b.t === 'eq' || b.t === 'section' || b.t === 'theorem') {
      m.appendChild(h('div', 'popg', 'Name, for referring to it'));
      var lw = h('div', 'poplab');
      var inp = h('input');
      inp.value = b.label || '';
      inp.placeholder = defaultLabelPrefix(b) + 'name';
      inp.oninput = function () { b.label = inp.value.replace(/[^A-Za-z0-9:_-]/g, ''); self.change(true); };
      inp.onkeydown = function (e) { if (e.key === 'Enter') { closeAllPop(); self.render(); } };
      lw.appendChild(inp);
      m.appendChild(lw);
    }
    m.appendChild(h('div', 'popg', 'This part'));
    /* a theorem or proof moves, copies and goes with its parts */
    var grp = groupAt(this.doc, idx), bl = this.doc.blocks;
    item('Move up', function () {
      if (grp[0] === 0) return;
      /* over the whole group above, if the block above is a part of one */
      var env = envChain(self.doc), to = grp[0] - 1;
      if (env[to]) to = bl.indexOf(env[to]);
      var moved = bl.splice(grp[0], grp[1] - grp[0] + 1);
      Array.prototype.splice.apply(bl, [to, 0].concat(moved));
      self.change(true); self.render();
    });
    item('Move down', function () {
      if (grp[1] >= bl.length - 1) return;
      var below = groupAt(self.doc, grp[1] + 1);
      var moved = bl.splice(grp[0], grp[1] - grp[0] + 1);
      var to = below[1] - moved.length + 1;
      Array.prototype.splice.apply(bl, [to, 0].concat(moved));
      self.change(true); self.render();
    });
    item('Add a paragraph above', function () {
      var np = blockFactory('para');
      bl.splice(grp[0], 0, np);
      self.focusBlock(np.id, 'main');
      self.change(true); self.render();
    });
    item('Duplicate', function () {
      var copies = bl.slice(grp[0], grp[1] + 1).map(function (x) { var c = JSON.parse(JSON.stringify(x)); c.id = uid(); return c; });
      Array.prototype.splice.apply(bl, [grp[1] + 1, 0].concat(copies));
      self.change(true); self.render();
    });
    /* references in the text to what is deleted print "??": say so */
    function warnRefs(gone) {
      var labs = [];
      gone.forEach(function (x) { if (x.label) labs.push(x.label); (x.labels || []).forEach(function (l) { if (l) labs.push(l); }); });
      if (!labs.length || !self.hooks.toast) return;
      var all = JSON.stringify(self.doc.blocks), n = 0;
      labs.forEach(function (l) { n += all.split('data-label=\\"' + l + '\\"').length - 1; });
      if (n) self.hooks.toast(n + (n === 1 ? ' reference' : ' references') + ' in the text pointed to it and now show “??” — Ctrl+Z brings it back.');
    }
    item('Delete', function () {
      /* its parts stay, as ordinary blocks */
      for (var j = grp[0] + 1; j <= grp[1]; j++) delete bl[j].inEnv;
      var gone = [bl[idx]];
      self.removeBlock(idx);
      warnRefs(gone);
    }, 'danger');
    /* a heading with everything under it, up to the next heading of its
       level or higher */
    if (b.t === 'section') {
      item('Delete the section, with its text', function () {
        var end = idx + 1;
        while (end < bl.length && bl[end].t !== 'bib' && !(bl[end].t === 'section' && bl[end].level <= b.level)) end++;
        var gone = bl.slice(idx, end);
        bl.splice(idx + 1, end - idx - 1);
        self.removeBlock(idx);
        warnRefs(gone);
      }, 'danger');
    }
    document.body.appendChild(m);
    posPop(m, anchor);
    armOutside(m);
  };

  function defaultLabelPrefix(b) {
    return { section: 'sec:', eq: 'eq:', figure: 'fig:', chart: 'fig:', table: 'tab:', theorem: 'thm:' }[b.t] || '';
  }
  /* Below the button if it fits; otherwise on whichever side has more
     room, and no taller than that room — it scrolls inside rather than
     running over the toolbar or off a short screen. */
  function posPop(m, anchor) {
    var r = anchor.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    m.style.maxHeight = '';
    var hgt = m.offsetHeight, below = vh - r.bottom - 16, above = r.top - 16;
    var up = hgt > below && above > below, room = up ? above : below;
    if (hgt > room) {
      m.style.maxHeight = Math.max(140, room) + 'px';
      m.style.overflowY = 'auto';
      hgt = m.offsetHeight;
    }
    var top = up ? r.top - hgt - 6 : r.bottom + 6;
    var left = Math.min(r.left, vw - m.offsetWidth - 10);
    m.style.left = Math.max(8, left) + window.scrollX + 'px';
    m.style.top = Math.max(8, top) + window.scrollY + 'px';
  }
  function closeAllPop() {
    [].forEach.call(document.querySelectorAll('.popmenu'), function (p) { p.remove(); });
  }
  function armOutside(m) {
    function off(e) {
      /* a menu closed by choosing in it leaves only this listener: it must
         not close the next menu on that menu's first click */
      if (!m.isConnected) { document.removeEventListener('mousedown', off, true); return; }
      if (m.contains(e.target)) return;
      closeAllPop();
      document.removeEventListener('mousedown', off, true);
    }
    setTimeout(function () { document.addEventListener('mousedown', off, true); }, 0);
  }

  /* --------------------------------------------- selection & format toolbar */
  Editor.prototype.onSelChange = function () {
    var s = window.getSelection();
    var bar = document.getElementById('seltools');
    if (!bar) return;
    if (!s.rangeCount || s.isCollapsed) { bar.classList.remove('on'); return; }
    var r = s.getRangeAt(0);
    var host = r.commonAncestorContainer;
    if (host.nodeType === 3) host = host.parentElement;
    if (!host || !this.paper.contains(host) || !host.closest('[contenteditable="true"]')) { bar.classList.remove('on'); return; }
    var rect = r.getBoundingClientRect();
    if (!rect.width && !rect.height) { bar.classList.remove('on'); return; }
    bar.classList.add('on');
    bar.style.left = Math.max(8, rect.left + window.scrollX + rect.width / 2 - bar.offsetWidth / 2) + 'px';
    bar.style.top = (rect.top + window.scrollY - bar.offsetHeight - 8) + 'px';
  };

  function stripTags(s) { return String(s || '').replace(/<[^>]*>/g, '').replace(/\u200b/g, '').trim(); }
  /* nothing in it: no text, and no formula, reference or footnote either
     (a line holding only a formula is not an empty line) */
  function isBlank(s) { return !stripTags(s) && !/class="[^"]*\b(imath|xref|ftnote)\b/.test(String(s || '')); }
  /* a heading as it reads in a list of contents: its formulas drawn, its
     links plain text */
  function headingInto(el, html) {
    el.innerHTML = PT.sanitize.clean(html);
    [].forEach.call(el.querySelectorAll('a'), function (a) { a.replaceWith.apply(a, [].slice.call(a.childNodes)); });
    [].forEach.call(el.querySelectorAll('.imath'), function (sp) {
      try { M.renderStatic(sp, JSON.parse(sp.dataset.m)); } catch (e) { sp.remove(); }
    });
    return el;
  }
  /* today, as \today prints it in the document's language ("October 4,
     2026", "4. Oktober 2026", "4 Ekim 2026") — not in the computer's */
  var DATE_LOCALE = { english: 'en-US', ngerman: 'de-DE', french: 'fr-FR', spanish: 'es-ES',
    italian: 'it-IT', turkish: 'tr-TR', portuguese: 'pt-PT' };
  function todayStr(lang) {
    var opts = { year: 'numeric', month: 'long', day: 'numeric' };
    try { return new Date().toLocaleDateString(DATE_LOCALE[lang] || 'en-US', opts); }
    catch (e) { return new Date().toLocaleDateString(undefined, opts); }
  }

  window.PT.doc = {
    newDoc: newDoc, Editor: Editor, blockFactory: blockFactory, numbering: numbering, envChain: envChain, menuScore: menuScore, bibEmpty: bibEmpty, bibNumbers: bibNumbers, citeWork: citeWork, libraryWork: libraryWork,
    MENU: MENU, uid: uid, stripTags: stripTags, isBlank: isBlank, headingInto: headingInto, closeAllPop: closeAllPop, tableClass: tableClass,
    insertNodeAtCaret: insertNodeAtCaret, placeCaret: placeCaret, posPop: posPop
  };
})();
