/* PaperTeX — the document model and the on-paper editor.
   Everything the user does happens on the page itself; blocks are the model. */
(function () {
  'use strict';
  var M = PT.math;

  var uidN = 0;
  function uid() { return 'b' + (++uidN) + Math.random().toString(36).slice(2, 6); }

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
        date: '\\today', abstract: '', keywords: ''
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
        { id: uid(), t: 'para', html: 'Delete this text and start on your own document.' }
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
      case 'theorem': return { id: uid(), t: 'theorem', kind: 'theorem', title: '', html: '', label: '' };
      case 'lemma': return { id: uid(), t: 'theorem', kind: 'lemma', title: '', html: '', label: '' };
      case 'definition': return { id: uid(), t: 'theorem', kind: 'definition', title: '', html: '', label: '' };
      case 'proof': return { id: uid(), t: 'theorem', kind: 'proof', title: '', html: '', label: '' };
      case 'code': return { id: uid(), t: 'code', lang: '', text: '', caption: '' };
      case 'quote': return { id: uid(), t: 'quote', html: '' };
      case 'pagebreak': return { id: uid(), t: 'pagebreak' };
      case 'toc': return { id: uid(), t: 'toc' };
      case 'bib': return { id: uid(), t: 'bib' };
      case 'raw': return { id: uid(), t: 'raw', tex: '% raw LaTeX passed straight through\n' };
      default: return { id: uid(), t: 'para', html: '' };
    }
  }

  var MENU = [
    { g: 'Structure', items: [
      ['section', 'Section', 'H1', 'Numbered heading'],
      ['subsection', 'Subsection', 'H2', 'Second level'],
      ['subsubsection', 'Sub-subsection', 'H3', 'Third level'],
      ['para', 'Paragraph', '¶', 'Body text'],
      ['toc', 'Table of contents', '☰', '\\tableofcontents'],
      ['pagebreak', 'Page break', '⤓', '\\newpage']
    ] },
    { g: 'Math', items: [
      ['eq', 'Equation', '∑', 'Display equation, numbered'],
      ['theorem', 'Theorem', 'Th', 'amsthm environment'],
      ['lemma', 'Lemma', 'Le', 'amsthm environment'],
      ['definition', 'Definition', 'Df', 'amsthm environment'],
      ['proof', 'Proof', '□', 'Proof environment']
    ] },
    { g: 'Blocks', items: [
      ['itemize', 'Bullet list', '•', 'itemize'],
      ['enumerate', 'Numbered list', '1.', 'enumerate'],
      ['figure', 'Figure', '🖼', 'Image with caption'],
      ['table', 'Table', '▦', 'tabular with caption'],
      ['quote', 'Quote', '❝', 'quote environment'],
      ['code', 'Code', '⌨', 'verbatim / lstlisting'],
      ['bib', 'Bibliography', '📚', 'thebibliography'],
      ['raw', 'Raw LaTeX', '\\', 'Escape hatch']
    ] }
  ];

  /* ------------------------------------------------------------- numbering */
  function numbering(doc) {
    var sec = [0, 0, 0, 0], eq = 0, fig = 0, tab = 0, thm = 0, lastSec = '0';
    var map = {};
    doc.blocks.forEach(function (b) {
      switch (b.t) {
        case 'section':
          if (b.numbered !== false && doc.settings.numbered) {
            sec[b.level - 1]++;
            for (var i = b.level; i < 4; i++) sec[i] = 0;
            b.__num = sec.slice(0, b.level).join('.');
            lastSec = b.__num;
            thm = 0;
          } else b.__num = '';
          if (b.label) map[b.label] = b.__num;
          break;
        case 'eq':
          b.__nums = b.lines.map(function () {
            return b.numbered === false ? '' : String(++eq);
          });
          if (b.label) map[b.label] = b.__nums[0];
          if (b.labels) b.labels.forEach(function (l, i) { if (l) map[l] = b.__nums[i]; });
          break;
        case 'figure':
          b.__num = String(++fig);
          if (b.label) map[b.label] = b.__num;
          break;
        case 'table':
          b.__num = String(++tab);
          if (b.label) map[b.label] = b.__num;
          break;
        case 'theorem':
          if (b.kind === 'proof') { b.__num = ''; break; }
          b.__num = lastSec + '.' + (++thm);
          if (b.label) map[b.label] = b.__num;
          break;
      }
    });
    doc.bib.forEach(function (e, i) { map[e.key] = String(i + 1); });
    return map;
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
    r.collapse(!atEnd);
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
    var title = this.editable('h1', 'pt-title', this.doc.meta.title, function (v) {
      self.doc.meta.title = v; self.change();
    }, true);
    title.dataset.ph = 'Document title';
    head.appendChild(title);

    var auth = h('div', 'pt-authors');
    this.doc.meta.authors.forEach(function (a, i) {
      var w = h('div', 'pt-author');
      var nm = self.editable('div', 'pt-aname', a.name, function (v) { a.name = v; self.change(); }, true);
      nm.dataset.ph = 'Author name';
      var af = self.editable('div', 'pt-aaff', a.affil, function (v) { a.affil = v; self.change(); }, true);
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
    addA.onclick = function () { self.doc.meta.authors.push({ name: '', affil: '', email: '' }); self.change(true); self.render(); };
    auth.appendChild(addA);
    head.appendChild(auth);

    var dt = this.editable('div', 'pt-date', this.doc.meta.date === '\\today' ? todayStr() : this.doc.meta.date, function (v) {
      self.doc.meta.date = v; self.change();
    }, true);
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
    this.doc.blocks.forEach(function (b, i) {
      body.appendChild(self.renderBlock(b, i));
    });
    var tail = h('div', 'pt-tail');
    var addBtn = h('button', 'pt-tailadd', '+  Add a block');
    addBtn.onclick = function (e) { self.openMenu(e.currentTarget, self.doc.blocks.length); };
    tail.appendChild(addBtn);
    body.appendChild(tail);
    this.paper.appendChild(body);

    /* Maths is measured, not just styled — and measuring only works once the
       sheet is in the document. Blocks are built detached, so run the whole
       layout pass here, after everything is attached. */
    M.layout(this.paper);
    this.refreshInlineMath();
    this.refreshXrefs();
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
      M.renderStatic(span, tree);
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
    e.addEventListener('input', function () { onChange(plain ? e.textContent : e.innerHTML); });
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

  /* rich text editable: bold/italic + inline math + refs */
  Editor.prototype.richEditable = function (tag, cls, value, onChange, opts) {
    var self = this;
    opts = opts || {};
    var e = h(tag, cls);
    e.contentEditable = 'true';
    e.spellcheck = true;
    e.innerHTML = PT.sanitize.clean(value);   /* stored HTML is data, never markup as-is */
    e.__rich = true;   /* takes formatting and inline formulas (see app.js richHost) */
    e.addEventListener('input', function () {
      /* "$" opens an inline formula right where you are */
      var s = window.getSelection();
      if (s.rangeCount && s.focusNode && s.focusNode.nodeType === 3) {
        var tx = s.focusNode.nodeValue, off = s.focusOffset;
        if (off > 0 && tx[off - 1] === '$') {
          s.focusNode.nodeValue = tx.slice(0, off - 1) + tx.slice(off);
          var r = document.createRange();
          r.setStart(s.focusNode, off - 1); r.collapse(true);
          s.removeAllRanges(); s.addRange(r);
          self.insertInlineMath(e, onChange);
          return;
        }
      }
      onChange(e.innerHTML);
    });
    e.addEventListener('keydown', function (ev) { self.richKeys(ev, e, opts); });
    e.addEventListener('paste', function (ev) {
      ev.preventDefault();
      var t = (ev.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, t);
    });
    e.addEventListener('click', function (ev) {
      var im = ev.target.closest ? ev.target.closest('.imath') : null;
      if (im && e.contains(im)) { ev.preventDefault(); self.editInlineMath(im, e, onChange); }
    });
    return e;
  };

  Editor.prototype.richKeys = function (ev, e, opts) {
    /* Ctrl/⌘ shortcuts (bold, italic, inline formula …) are bindable and
       dispatched by PT.keys before the key gets here. */
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey) return;
    /* \ in running text opens the command palette at the caret — blocks,
       symbols, formatting; pressing \ again there types a backslash */
    if (ev.key === '\\' && !ev.metaKey && PT.palette) {   /* AltGr+… on many layouts */
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
    span.textContent = '\u2009';
    insertNodeAtCaret(span);
    var sp = document.createTextNode('\u200b');
    span.parentNode.insertBefore(sp, span.nextSibling);
    onChange(host.innerHTML);
    this.editInlineMath(span, host, onChange);
  };

  Editor.prototype.editInlineMath = function (span, host, onChange) {
    var self = this;
    closePop();
    var pop = h('div', 'mathpop');
    var lab = h('div', 'mathpop-h', 'Inline formula');
    var hint = h('span', 'mathpop-hint', 'Esc or click away to finish');
    lab.appendChild(hint);
    pop.appendChild(lab);
    var fieldHost = h('div', 'mathpop-f');
    pop.appendChild(fieldHost);
    var quick = h('div', 'mathpop-q');
    ['frac', 'sup', 'sub', 'sqrt', 'paren', 'sum', 'int', 'vec', 'hat', 'text'].forEach(function (bn) {
      var bt = h('button', '', ({ frac: 'a/b', sup: 'x²', sub: 'xᵢ', sqrt: '√', paren: '( )', sum: '∑', int: '∫', vec: 'v⃗', hat: 'x̂', text: 'Abc' })[bn]);
      bt.title = bn;
      bt.onmousedown = function (ev) { ev.preventDefault(); f.insertBuild(bn); };
      quick.appendChild(bt);
    });
    pop.appendChild(quick);
    document.body.appendChild(pop);

    var r = span.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.left - 12)) + 'px';
    pop.style.top = (r.bottom + window.scrollY + 8) + 'px';

    var tree;
    try { tree = JSON.parse(span.dataset.m); } catch (e2) { tree = M.row(); }
    var f = new M.MathField(fieldHost, {
      root: tree,
      inline: true,
      onChange: function (fl) {
        span.dataset.m = JSON.stringify(fl.root);
        M.renderStatic(span, fl.root);
        onChange(host.innerHTML);
      },
      onEscape: function () { closePop(); host.focus(); },
      onEnter: function () { closePop(); host.focus(); }
    });
    self.activeField = f;
    M.renderStatic(span, tree);
    f.host.focus();

    function closePop() {
      var old = document.querySelector('.mathpop');
      if (old) old.remove();
      document.removeEventListener('mousedown', outside, true);
    }
    function outside(ev) {
      if (pop.contains(ev.target) || span.contains(ev.target)) return;
      if (ev.target.closest && ev.target.closest('.sympanel')) return;
      var t = tree;
      if (M.isEmptyRow(t)) { span.remove(); onChange(host.innerHTML); }
      closePop();
    }
    setTimeout(function () { document.addEventListener('mousedown', outside, true); }, 0);
  };

  /* ------------------------------------------------------------ block chrome */
  Editor.prototype.renderBlock = function (b, idx) {
    var self = this;
    var wrap = h('div', 'blk blk-' + b.t);
    wrap.dataset.bid = b.id;

    var gut = h('div', 'gutter');
    var plus = h('button', 'g-btn g-plus', '+');
    plus.title = 'Insert block below';
    plus.onclick = function (e) { self.openMenu(e.currentTarget, idx + 1); };
    var more = h('button', 'g-btn g-more', '⋮');
    more.title = 'Block options';
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
          onKey: function (ev) { self.textKeys(ev, b, idx, 'html'); }
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
      case 'theorem': {
        var t = h('div', 'pt-thm pt-thm-' + b.kind);
        var head = h('span', 'pt-thmh');
        head.contentEditable = 'false';
        var name = b.kind.charAt(0).toUpperCase() + b.kind.slice(1);
        head.textContent = name + (b.__num ? ' ' + b.__num : '') + '.';
        t.appendChild(head);
        var ttl = this.editable('span', 'pt-thmt', b.title, function (v) { b.title = v; self.change(); }, true);
        ttl.dataset.ph = '(title)';
        t.appendChild(ttl);
        var bod = this.richEditable('span', 'pt-thmb', b.html, function (v) { b.html = v; self.change(); }, {
          onKey: function (ev) { self.textKeys(ev, b, idx, 'html'); }
        });
        bod.dataset.part = 'main';
        bod.dataset.ph = 'Statement…';
        t.appendChild(bod);
        if (b.kind === 'proof') { var q = h('span', 'pt-qed', '□'); q.contentEditable = 'false'; t.appendChild(q); }
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
          var o = h('option', '', l || 'plain (verbatim)');
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
        pre.addEventListener('input', function () { b.text = pre.textContent; self.change(); });
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
        var rl = h('div', 'pt-rawl', 'raw LaTeX');
        rl.contentEditable = 'false';
        rw.appendChild(rl);
        var ta = h('pre', 'pt-raw');
        ta.contentEditable = 'true';
        ta.spellcheck = false;
        ta.textContent = b.tex || '';
        ta.dataset.part = 'main';
        ta.addEventListener('input', function () { b.tex = ta.textContent; self.change(); });
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
          line.textContent = (x.__num ? x.__num + '  ' : '') + stripTags(x.html);
          tc.appendChild(line);
        });
        box.appendChild(tc);
        return;
      }
      case 'bib': return this.renderBib(b, box);
    }
  };

  /* ---------------------------------------------------------------- equations */
  Editor.prototype.renderEq = function (b, box, idx) {
    var self = this;
    var eqw = h('div', 'pt-eqw');
    b.lines.forEach(function (lineRow, li) {
      var linew = h('div', 'pt-eqline');
      var fh = h('div', 'pt-eqf');
      fh.dataset.part = 'line' + li;
      linew.appendChild(fh);
      if (b.numbered !== false && b.__nums && b.__nums[li]) {
        var n = h('div', 'pt-eqnum', '(' + b.__nums[li] + ')');
        n.contentEditable = 'false';
        n.title = 'Click to stop numbering this equation';
        n.onclick = function () { b.numbered = false; self.change(true); self.render(); };
        linew.appendChild(n);
      }
      eqw.appendChild(linew);

      var f = new M.MathField(fh, {
        root: lineRow,
        onChange: function () { self.change(); self.syncEqPreview(b); },
        onFocus: function (fl) { self.activeField = fl; if (self.hooks.onFieldFocus) self.hooks.onFieldFocus(fl, b); },
        onEnter: function (fl, ev) {
          if (ev.shiftKey) { self.exitEq(b, idx); return; }
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
        onLeave: function (fl, dir) {
          if (dir === 'up' && li > 0) { self.focusBlock(b.id, 'line' + (li - 1)); self.render(); }
          else if (dir === 'down' && li < b.lines.length - 1) { self.focusBlock(b.id, 'line' + (li + 1)); self.render(); }
          else if (dir === 'up') self.focusPrev(idx);
          else self.focusNext(idx);
        }
      });
      fh.addEventListener('keydown', function (ev) {
        if (ev.key === 'Backspace' && M.isEmptyRow(lineRow) && b.lines.length > 1) {
          ev.preventDefault();
          b.lines.splice(li, 1);
          if (b.labels) b.labels.splice(li, 1);
          self.focusBlock(b.id, 'line' + Math.max(0, li - 1));
          self.change(true); self.render();
        } else if (ev.key === 'Backspace' && M.isEmptyRow(lineRow) && b.lines.length === 1) {
          ev.preventDefault();
          self.removeBlock(idx);
        }
      });
      self.fields.push(f);
    });
    box.appendChild(eqw);
  };
  Editor.prototype.exitEq = function (b, idx) {
    var next = this.doc.blocks[idx + 1];
    if (!next || next.t !== 'para') {
      next = blockFactory('para');
      this.doc.blocks.splice(idx + 1, 0, next);
    }
    this.focusBlock(next.id, 'main', false);
    this.change(true);
    this.render();
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
      if (!stripTags(it.html)) {
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
      if (ii === 0 && !stripTags(it.html) && b.items.length === 1) { ev.preventDefault(); self.removeBlock(idx); return; }
      if (ii > 0) {
        ev.preventDefault();
        var prev = b.items[ii - 1];
        prev.html = (prev.html || '') + (it.html || '');
        b.items.splice(ii, 1);
        self.focusBlock(b.id, 'item' + (ii - 1));
        self.change(true); self.render(); return;
      }
    }
    if (ev.key === '/' && !stripTags(it.html)) { /* let it type */ }
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
        '<div class="pt-dropsub">The file name goes into \\includegraphics</div>';
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
    var ce = this.richEditable('span', 'pt-capt', b.caption, function (v) { b.caption = v; self.change(); }, {
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
      if (!f) return;
      e.preventDefault();
      e.stopPropagation();
      self.dropImage(f, e.target);
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
  Editor.prototype.renderTable = function (b, box, idx) {
    var self = this;
    var tw = h('div', 'pt-tabw');

    var cap = h('div', 'pt-cap pt-tcap');
    var cl = h('span', 'pt-capl', 'Table ' + (b.__num || '1') + ': ');
    cl.contentEditable = 'false';
    cap.appendChild(cl);
    var ce = this.richEditable('span', 'pt-capt', b.caption, function (v) { b.caption = v; self.change(); }, {
      onKey: function (ev) { self.textKeys(ev, b, idx, 'caption'); }
    });
    ce.dataset.ph = 'Caption…';
    cap.appendChild(ce);
    tw.appendChild(cap);

    var tbl = h('table', 'pt-table' + (b.booktabs ? ' booktabs' : '') + (b.rules ? ' ruled' : ''));
    b.rows.forEach(function (r, ri) {
      var tr = h('tr', ri === 0 && b.header ? 'hdr' : '');
      r.forEach(function (c, ci) {
        var td = h(ri === 0 && b.header ? 'th' : 'td', 'al-' + (b.align[ci] || 'l'));
        var e = self.richEditable('div', 'pt-cell', c, function (v) { b.rows[ri][ci] = v; self.change(); }, {
          onKey: function (ev) { self.tableKeys(ev, b, ri, ci); }
        });
        e.dataset.part = 'c' + ri + '_' + ci;
        td.appendChild(e);
        tr.appendChild(td);
      });
      tbl.appendChild(tr);
    });
    tw.appendChild(tbl);

    var bar = h('div', 'pt-tabctl');
    bar.contentEditable = 'false';
    [['+ row', function () { b.rows.push(b.rows[0].map(function () { return ''; })); }],
     ['− row', function () { if (b.rows.length > 1) b.rows.pop(); }],
     ['+ col', function () { b.rows.forEach(function (r) { r.push(''); }); b.align.push('c'); }],
     ['− col', function () { if (b.align.length > 1) { b.rows.forEach(function (r) { r.pop(); }); b.align.pop(); } }],
     ['header', function () { b.header = !b.header; }],
     ['booktabs', function () { b.booktabs = !b.booktabs; b.rules = false; }],
     ['grid', function () { b.rules = !b.rules; b.booktabs = false; }]
    ].forEach(function (pair) {
      var bt = h('button', '', pair[0]);
      bt.onclick = function () { pair[1](); self.change(true); self.render(); };
      bar.appendChild(bt);
    });
    var alg = h('span', 'pt-algs');
    alg.appendChild(h('span', 'pt-alglbl', 'align:'));
    b.align.forEach(function (a, ci) {
      var s = h('select', 'pt-alg');
      ['l', 'c', 'r'].forEach(function (v) {
        var o = h('option', '', v); o.value = v;
        if (v === a) o.selected = true;
        s.appendChild(o);
      });
      s.onchange = function () { b.align[ci] = s.value; self.change(true); self.render(); };
      alg.appendChild(s);
    });
    bar.appendChild(alg);
    tw.appendChild(bar);
    box.appendChild(tw);
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

  /* -------------------------------------------------------------- bibliography */
  Editor.prototype.renderBib = function (b, box) {
    var self = this;
    var w = h('div', 'pt-bib');
    w.appendChild(h('div', 'pt-bibh', 'References'));
    this.doc.bib.forEach(function (e, i) {
      var it = h('div', 'pt-bibi');
      var n = h('span', 'pt-bibn', '[' + (i + 1) + ']');
      n.contentEditable = 'false';
      it.appendChild(n);
      var body = h('span', 'pt-bibb');
      [['author', 'Author(s)'], ['title', 'Title'], ['journal', 'Journal / publisher'], ['year', 'Year']].forEach(function (f, k) {
        var fe = self.editable('span', 'pt-bibf f-' + f[0], e[f[0]] || '', function (v) { e[f[0]] = v; self.change(); }, true);
        fe.dataset.ph = f[1];
        body.appendChild(fe);
        if (k < 3) body.appendChild(h('span', 'pt-bibsep', ', '));
      });
      it.appendChild(body);
      var key = self.editable('span', 'pt-bibkey', e.key, function (v) { e.key = v.replace(/[^A-Za-z0-9:_-]/g, ''); self.change(); }, true);
      key.title = 'Citation key used by \\cite';
      it.appendChild(key);
      var del = h('button', 'pt-bibx', '×');
      del.onclick = function () { self.doc.bib.splice(i, 1); self.change(true); self.render(); };
      it.appendChild(del);
      w.appendChild(it);
    });
    var add = h('button', 'pt-bibadd', '+ reference');
    add.onclick = function () {
      self.doc.bib.push({ key: 'ref' + (self.doc.bib.length + 1), author: '', title: '', journal: '', year: '' });
      self.change(true); self.render();
    };
    w.appendChild(add);
    box.appendChild(w);
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
      if (b.t === 'section' && stripTags(b.html) === '') {
        ev.preventDefault();
        if (b.level > 1) { b.level--; this.focusBlock(b.id, 'main'); this.change(true); this.render(); }
        else { var p2 = blockFactory('para'); this.doc.blocks.splice(idx, 1, p2); this.focusBlock(p2.id, 'main'); this.change(true); this.render(); }
        return;
      }
      if (!stripTags(el.innerHTML) && this.doc.blocks.length > 1) {
        ev.preventDefault(); this.removeBlock(idx); return;
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
    if (ev.key === '/' && !stripTags(el.innerHTML) && b.t === 'para') {
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

  Editor.prototype.insertBlock = function (kind, at) {
    var b = blockFactory(kind);
    this.doc.blocks.splice(at, 0, b);
    var part = b.t === 'eq' ? 'line0' : (b.t === 'list' ? 'item0' : 'main');
    this.focusBlock(b.id, part, false);
    this.change(true);
    this.render();
    return b;
  };

  /* ------------------------------------------------------------------- menus */
  Editor.prototype.openMenu = function (anchor, at, replaceEmptyPara) {
    var self = this;
    closeAllPop();
    var m = h('div', 'popmenu');
    var search = h('input', 'popsearch');
    search.placeholder = 'Insert…';
    m.appendChild(search);
    var listw = h('div', 'popitems');
    m.appendChild(listw);

    function fill(q) {
      listw.textContent = '';
      MENU.forEach(function (g) {
        var hits = g.items.filter(function (it) {
          return !q || (it[1] + ' ' + it[3]).toLowerCase().indexOf(q.toLowerCase()) >= 0;
        });
        if (!hits.length) return;
        listw.appendChild(h('div', 'popg', g.g));
        hits.forEach(function (it) {
          var row = h('button', 'popitem');
          row.appendChild(h('span', 'popico', it[2]));
          var tx = h('span', 'poptx');
          tx.appendChild(h('span', 'popname', it[1]));
          tx.appendChild(h('span', 'popdesc', it[3]));
          row.appendChild(tx);
          row.onclick = function () {
            var target = at;
            if (replaceEmptyPara) { self.doc.blocks.splice(at, 1); target = at; }
            closeAllPop();
            self.insertBlock(it[0], target);
          };
          listw.appendChild(row);
        });
      });
      var first = listw.querySelector('.popitem');
      if (first) first.classList.add('sel');
    }
    fill('');
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
      item(b.numbered === false ? 'Number this heading' : 'Unnumbered (starred)', function () {
        b.numbered = b.numbered === false; self.change(true); self.render();
      });
    }
    if (b.t === 'eq') {
      m.appendChild(h('div', 'popg', 'Equation'));
      item(b.numbered === false ? 'Number it' : 'Remove number', function () { b.numbered = b.numbered === false; self.change(true); self.render(); });
      item(b.env === 'gather' ? 'Align at relation (align)' : 'Centre each line (gather)', function () {
        b.env = b.env === 'gather' ? 'align' : 'gather'; self.change(true); self.render();
      });
      item('Add a line', function () { b.lines.push(M.row()); self.focusBlock(b.id, 'line' + (b.lines.length - 1)); self.change(true); self.render(); });
    }
    if (b.t === 'list') {
      item(b.ordered ? 'Make it a bullet list' : 'Make it numbered', function () { b.ordered = !b.ordered; self.change(true); self.render(); });
    }
    if (b.t === 'theorem') {
      m.appendChild(h('div', 'popg', 'Environment'));
      ['theorem', 'lemma', 'corollary', 'proposition', 'definition', 'example', 'remark', 'proof'].forEach(function (k) {
        item(k.charAt(0).toUpperCase() + k.slice(1) + (b.kind === k ? '  ✓' : ''), function () { b.kind = k; self.change(true); self.render(); });
      });
    }
    if (b.t === 'figure' || b.t === 'table' || b.t === 'eq' || b.t === 'section' || b.t === 'theorem') {
      m.appendChild(h('div', 'popg', 'Label'));
      var lw = h('div', 'poplab');
      var inp = h('input');
      inp.value = b.label || '';
      inp.placeholder = defaultLabelPrefix(b) + 'name';
      inp.oninput = function () { b.label = inp.value.replace(/[^A-Za-z0-9:_-]/g, ''); self.change(true); };
      inp.onkeydown = function (e) { if (e.key === 'Enter') { closeAllPop(); self.render(); } };
      lw.appendChild(inp);
      m.appendChild(lw);
    }
    m.appendChild(h('div', 'popg', 'Block'));
    item('Move up', function () {
      if (idx === 0) return;
      var t = self.doc.blocks.splice(idx, 1)[0];
      self.doc.blocks.splice(idx - 1, 0, t);
      self.change(true); self.render();
    });
    item('Move down', function () {
      if (idx >= self.doc.blocks.length - 1) return;
      var t = self.doc.blocks.splice(idx, 1)[0];
      self.doc.blocks.splice(idx + 1, 0, t);
      self.change(true); self.render();
    });
    item('Duplicate', function () {
      var c = JSON.parse(JSON.stringify(b));
      c.id = uid();
      self.doc.blocks.splice(idx + 1, 0, c);
      self.change(true); self.render();
    });
    item('Delete', function () { self.removeBlock(idx); }, 'danger');
    document.body.appendChild(m);
    posPop(m, anchor);
    armOutside(m);
  };

  function defaultLabelPrefix(b) {
    return { section: 'sec:', eq: 'eq:', figure: 'fig:', table: 'tab:', theorem: 'thm:' }[b.t] || '';
  }
  function posPop(m, anchor) {
    var r = anchor.getBoundingClientRect();
    var top = r.bottom + window.scrollY + 6;
    var left = r.left + window.scrollX;
    if (left + m.offsetWidth > window.innerWidth - 10) left = window.innerWidth - m.offsetWidth - 10;
    if (r.bottom + m.offsetHeight > window.innerHeight - 10) top = r.top + window.scrollY - m.offsetHeight - 6;
    m.style.left = Math.max(8, left) + 'px';
    m.style.top = Math.max(8, top) + 'px';
  }
  function closeAllPop() {
    [].forEach.call(document.querySelectorAll('.popmenu'), function (p) { p.remove(); });
  }
  function armOutside(m) {
    function off(e) {
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
  function todayStr() {
    var d = new Date();
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  window.PT.doc = {
    newDoc: newDoc, Editor: Editor, blockFactory: blockFactory, numbering: numbering,
    MENU: MENU, uid: uid, stripTags: stripTags, closeAllPop: closeAllPop,
    insertNodeAtCaret: insertNodeAtCaret, placeCaret: placeCaret
  };
})();
