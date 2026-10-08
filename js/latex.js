/* PaperTeX — turns the on-paper document into a .tex source file.
   The document model is the source of truth; LaTeX is generated output. */
(function () {
  'use strict';
  var M = PT.math;

  var ESC = {
    '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#', '_': '\\_',
    '{': '\\{', '}': '\\}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}',
    '\\': '\\textbackslash{}', '<': '\\textless{}', '>': '\\textgreater{}'
  };
  function esc(s) {
    return String(s)
      .replace(/[\u200b\u200c\u2060\ufeff]/g, '')  /* editor spacers, never content */
      .replace(/[&%$#_{}~^\\<>]/g, function (c) { return ESC[c]; })
      .replace(/"([^"]*)"/g, '``$1\u2019\u2019')
      .replace(/\u2018/g, '`').replace(/\u2019/g, "'")
      .replace(/\u201c/g, '``').replace(/\u201d/g, "''")
      .replace(/\u2014/g, '---').replace(/\u2013/g, '--')
      /* the browser turns a typed space into a no-break one next to a
         formula or at the end of a line: it is an ordinary space */
      .replace(/\u00a0/g, ' ')
      .replace(MATHCHAR, mathChar);
  }
  /* A maths symbol or Greek letter typed (or pasted) into ordinary text —
     "c ≥ 0", "α particles": pdfLaTeX's text fonts have none of them, and
     the whole document would fail. Each is written as the command it is,
     set as maths. (Accented letters, ×, ±, ° … are fine as they are:
     LaTeX's utf8 knows them.) */
  var MATHCHAR = /[\u0370-\u03ff\u2100-\u2bff]|\ud835[\udc00-\udfff]/g;
  function mathChar(c) {
    var t = M.glyphTex ? M.glyphTex(c) : null;
    return t ? '\\ensuremath{' + t + '}' : c;
  }

  /* for a PDF string: TeX's special characters made safe, and symbols by
     their names (a PDF title is not typeset: "α decay" reads "alpha decay") */
  function pdfEsc(s) {
    return String(s).replace(/[\u200b\u2060\ufeff]/g, '').replace(/[&%$#_{}~^\\<>]/g, function (c) { return ESC[c]; })
      .replace(MATHCHAR, function (c) { var t = M.glyphTex ? M.glyphTex(c) : null; return t ? t.replace(/^\\/, '') : ''; });
  }

  /* The words of a piece of rich text, its formulas spelled out plainly,
     for where only text can go: a file name, a window title, the PDF's
     title, the list of documents. */
  function plainText(html) {
    var box = PT.sanitize.parse(String(html || ''));
    [].forEach.call(box.querySelectorAll('.imath'), function (sp) {
      var t = '';
      try { t = M.plainOf(JSON.parse(sp.dataset.m)); } catch (e) { t = ''; }
      sp.textContent = t;
    });
    return (box.textContent || '').replace(/[​⁠﻿]/g, '').replace(/\s+/g, ' ').trim();
  }

  /* ---- inline HTML (a paragraph's rich text) -> LaTeX ---- */
  function inline(html, use) {
    /* an inert, cleaned copy: nothing in it can load or run */
    var box = PT.sanitize.parse(html);
    /* a line break at the very start or end ends no line: TeX would stop
       with "There's no line here to end" */
    return walk(box, use).replace(/[ \t]+\n/g, '\n').replace(/ {2,}/g, ' ')
      .replace(/^(\s*\\\\\n)+/, '').replace(/(\\\\\n\s*)+$/, '');
  }

  function walk(node, use) {
    var out = '';
    for (var i = 0; i < node.childNodes.length; i++) {
      var n = node.childNodes[i];
      if (n.nodeType === 3) { out += esc(n.nodeValue); continue; }
      if (n.nodeType !== 1) continue;
      var tag = n.tagName.toLowerCase();
      var cls = n.className || '';

      if (cls.indexOf('imath') >= 0) {
        var m = readMath(n);
        if (!m.k || !m.k.length) continue;   /* "$$" would start display maths */
        M.scanRow(m, use);
        out += '$' + M.texRow(m).replace(/\s*\n\s*/g, ' ') + '$';   /* one line: a blank one would end the paragraph */
        continue;
      }
      if (cls.indexOf('xref') >= 0) {
        var kind = n.dataset.kind || 'ref', lab = PT.sanitize.label(n.dataset.label);
        out = out.replace(/ $/, '~');   /* "Figure~\ref{…}": never broken across lines */
        if (kind === 'cite') { out += '\\cite{' + lab + '}'; use.cite = true; }
        else if (kind === 'eqref') { out += '\\eqref{' + lab + '}'; use.amsmath = true; }
        else if (kind === 'pageref') out += '\\pageref{' + lab + '}';
        else out += '\\ref{' + lab + '}';
        use.hyperref = true;
        continue;
      }
      if (cls.indexOf('ftnote') >= 0) {
        /* the mark sits against the word or the full stop before it */
        var gap = /\s$/.test(out);
        out = out.replace(/\s+$/, '') + '\\footnote{' + esc(n.dataset.text || '') + '}';
        /* a mark put after a space: the space goes after it instead, so
           the words on either side stay apart */
        var nx = n.nextSibling;
        if (gap && nx && nx.nodeType === 3 && /^[^\s .,;:!?)]/.test(nx.nodeValue.replace(/^[​⁠﻿]+/, ''))) out += ' ';
        continue;
      }

      switch (tag) {
        case 'b': case 'strong': out += wrap('\\textbf', n, use); break;
        case 'i': case 'em': out += wrap('\\emph', n, use); break;
        case 'u': out += wrap('\\underline', n, use); break;
        case 's': case 'strike': out += wrap('\\sout', n, use); use.ulem = true; break;
        case 'code': case 'tt': out += wrap('\\texttt', n, use); break;
        case 'sup': out += wrap('\\textsuperscript', n, use); break;
        case 'sub': out += wrap('\\textsubscript', n, use); use.fixltx = true; break;
        case 'mark': out += wrap('\\hl', n, use); use.soul = true; break;
        case 'br': out += '\\\\\n'; break;
        case 'a': {
          /* braces would end the argument early; % and # must be escaped */
          var href = PT.sanitize.href(n.getAttribute('href')).replace(/[{}\\]/g, '').replace(/[%#]/g, '\\$&');
          if (!href) { out += walk(n, use); break; }
          use.hyperref = true;
          out += '\\href{' + href + '}{' + walk(n, use) + '}';
          break;
        }
        case 'div': case 'p': out += walk(n, use) + '\n'; break;
        default: out += walk(n, use);
      }
    }
    return out;
  }
  function wrap(cmd, n, use) { return cmd + '{' + walk(n, use) + '}'; }

  function readMath(span) {
    try { return JSON.parse(span.dataset.m); }
    catch (e) { return M.row(); }
  }

  /* ---- alignment marker for multi-line equations ---- */
  function alignedLine(r) {
    var i, k = r.k;
    for (i = 0; i < k.length; i++) {
      var n = k[i];
      if ((n.t === 'ch' || n.t === 'sym') && n.cls === 'rel') {
        return M.texRow({ t: 'row', k: k.slice(0, i) }).trim() + ' &' +
               M.texRow({ t: 'row', k: k.slice(i) }).trim();
      }
    }
    return M.texRow(r).trim();
  }

  /* ---- blocks ---- */
  /* parts: the blocks that belong to a theorem or proof (see PT.doc
     envChain); qedhere: this equation ends a proof, and the □ goes on its
     last line */
  function blockTex(b, use, doc, parts, qedhere) {
    var s = '', L = function (lab) { return lab ? '\\label{' + PT.sanitize.label(lab) + '}' : ''; };
    var QH = qedhere ? ' \\qedhere' : '';
    switch (b.t) {
      case 'section': {
        var cmd = ['section', 'subsection', 'subsubsection', 'paragraph'][b.level - 1] || 'section';
        s = '\\' + cmd + (b.numbered === false ? '*' : '') + '{' + inline(b.html, use) + '}' + L(b.label);
        return s + '\n';
      }
      case 'para':
        return inline(b.html, use).trim() + '\n';
      case 'eq': {
        /* Empty lines write nothing (a line of only spaces inside maths
           is a paragraph break to TeX: "Missing $ inserted"), and an
           equation with nothing in it is left out altogether. */
        var keep = [], keptLabels = [];
        b.lines.forEach(function (r, i) {
          if (M.isEmptyRow(r)) return;
          keep.push(r);
          keptLabels.push((b.labels && b.labels[i]) || (i === 0 ? b.label : '') || '');
        });
        if (!keep.length) return '';
        if (keep.length !== b.lines.length) {
          b = { t: 'eq', lines: keep, labels: keptLabels, label: keptLabels[0] || '', numbered: b.numbered, env: b.env };
        }
        use.amsmath = true;
        var lines = b.lines.map(function (r) { M.scanRow(r, use); return r; });
        var star = b.numbered === false ? '*' : '';
        if (lines.length === 1) {
          return '\\begin{equation' + star + '}\n  ' + M.texRow(lines[0]).trim() + QH +
            (b.label ? '\n  ' + L(b.label) : '') + '\n\\end{equation' + star + '}\n';
        }
        var env = (b.env === 'gather' ? 'gather' : 'align') + star;
        var body = lines.map(function (r, i) {
          var t = (b.env === 'gather' ? M.texRow(r).trim() : alignedLine(r));
          /* the equation's own label names its first line */
          var lab = (b.labels && b.labels[i]) || (i === 0 ? b.label : '');
          if (lab) t += ' \\label{' + PT.sanitize.label(lab) + '}';
          if (i === lines.length - 1) t += QH;
          return '  ' + t;
        }).join(' \\\\\n');
        return '\\begin{' + env + '}\n' + body + '\n\\end{' + env + '}\n';
      }
      case 'list': {
        var env2 = b.ordered ? 'enumerate' : 'itemize';
        var out = '\\begin{' + env2 + '}\n', open = 0;
        b.items.forEach(function (it) {
          var lvl = it.level || 0;
          while (open < lvl) { out += '  '.repeat(open + 1) + '\\begin{' + env2 + '}\n'; open++; }
          while (open > lvl) { out += '  '.repeat(open) + '\\end{' + env2 + '}\n'; open--; }
          out += '  '.repeat(open + 1) + '\\item ' + inline(it.html, use).trim() + '\n';
        });
        while (open > 0) { out += '  '.repeat(open) + '\\end{' + env2 + '}\n'; open--; }
        return out + '\\end{' + env2 + '}\n';
      }
      case 'figure': {
        var w = (b.width || 0.8);
        /* A figure whose image has not been chosen yet would name a file
           that does not exist, and the whole document would fail to
           compile. Until there is an image, set a framed placeholder. */
        var hasImage = !!(b.src && b.filename);
        if (hasImage) use.graphicx = true;
        return '\\begin{figure}[' + (b.placement || 'htbp') + ']\n  \\centering\n' +
          (hasImage
            ? '  \\includegraphics[width=' + w + '\\linewidth]{' + String(b.filename).replace(/[{}\\%#]/g, '') + '}\n'
            : '  \\fbox{\\parbox[c][' + (w * 0.6).toFixed(2) + '\\linewidth][c]{' + w + '\\linewidth}{\\centering\\small\\itshape Image not chosen yet}}\n') +
          (b.caption ? '  \\caption{' + inline(b.caption, use).trim() + '}\n' : '') +
          (b.label ? '  \\label{' + PT.sanitize.label(b.label) + '}\n' : '') +
          '\\end{figure}\n';
      }
      case 'chart':
        return PT.chart.tex(b, doc, use, inline);
      case 'table': {
        var cols = b.align.join(b.rules ? '|' : '');
        if (b.rules) cols = '|' + cols + '|';
        var t = '\\begin{table}[' + (b.placement || 'htbp') + ']\n  \\centering\n';
        var size = { small: '\\small', footnotesize: '\\footnotesize', large: '\\large' }[b.size];
        if (size) t += '  ' + size + '\n';
        /* striped rows: every other body row shaded (xcolor's table option) */
        /* the 2nd, 4th … body row; xcolor counts rows from the header */
        if (b.zebra) { use.colortbl = true; t += '  \\rowcolors{2}' + (b.header ? '{ptzebra}{}' : '{}{ptzebra}') + '\n'; }
        var capLab = (b.caption ? '  \\caption{' + inline(b.caption, use).trim() + '}\n' : '') +
          (b.label ? '  \\label{' + PT.sanitize.label(b.label) + '}\n' : '');
        if (!b.capBelow) t += capLab;
        t += '  \\begin{tabular}{' + cols + '}\n';
        if (b.booktabs) { use.booktabs = true; t += '    \\toprule\n'; }
        else if (b.rules) t += '    \\hline\n';
        b.rows.forEach(function (r, ri) {
          var head = ri === 0 && b.header;
          t += '    ' + r.map(function (c, ci) {
            var x = inline(c, use).trim();
            /* bold as on the page: the header row, and the first column if asked */
            var bold = x && ((head && b.boldHeader !== false) || (!head && ci === 0 && b.boldFirst));
            return bold ? '\\textbf{' + x + '}' : x;
          }).join(' & ') + ' \\\\\n';
          if (head) t += b.booktabs ? '    \\midrule\n' : (b.rules ? '    \\hline\n' : '');
          else if (b.rules && !b.booktabs) t += '    \\hline\n';
        });
        if (b.booktabs) t += '    \\bottomrule\n';
        t += '  \\end{tabular}\n';
        if (b.capBelow) t += capLab;
        t += '\\end{table}\n';
        return t;
      }
      case 'theorem': {
        use.amsthm = true;
        (use.thms = use.thms || {})[b.kind] = true;
        /* braced, so a ] in the title cannot end it early; rich text (with
           formulas) in documents that say so, plain text in older ones */
        var tt = doc && doc.meta && doc.meta.headHtml ? inline(b.title || '', use).trim() : esc(String(b.title || '').trim());
        var ttl = tt ? '[{' + tt + '}]' : '';
        /* its own text, then its parts: a derivation inside the proof, so
           the □ comes after it (on its last line, when that is a display) */
        var inner = '  ' + inline(b.html, use).trim() + '\n';
        (parts || []).forEach(function (p, k) {
          var last = k === parts.length - 1;
          var qh = last && b.kind === 'proof' && p.t === 'eq' && p.numbered === false;
          var prev = k ? parts[k - 1] : { t: 'para' };
          if (!joins(prev, p)) inner += '\n';
          inner += blockTex(p, use, doc, null, qh);
        });
        if (b.kind === 'proof') return '\\begin{proof}' + ttl + '\n' + inner + '\\end{proof}\n';
        return '\\begin{' + b.kind + '}' + ttl + L(b.label) + '\n' + inner + '\\end{' + b.kind + '}\n';
      }
      case 'code':
        if (b.lang) {
          use.listings = true;
          return '\\begin{lstlisting}[language=' + b.lang + (b.caption ? ',caption={' + b.caption + '}' : '') + ']\n' +
            (b.text || '') + '\n\\end{lstlisting}\n';
        }
        return '\\begin{verbatim}\n' + (b.text || '') + '\n\\end{verbatim}\n';
      case 'quote':
        return '\\begin{quote}\n  ' + inline(b.html, use).trim() + '\n\\end{quote}\n';
      /* \clearpage, not \newpage: a figure or chart that did not fit before
         the break comes out before it, instead of floating onto the next
         page with what follows */
      case 'pagebreak':
        return '\\clearpage\n';
      case 'toc':
        return '\\tableofcontents\n';
      case 'bib': {
        /* an entry with nothing written in it yet prints nothing — not "[2] ." */
        var works = doc.bib.filter(function (e) { return !(PT.doc && PT.doc.bibEmpty && PT.doc.bibEmpty(e)); });
        if (!works.length) return '';
        var n = String(works.length).length;
        var w2 = '9'.repeat(n);
        return '\\begin{thebibliography}{' + w2 + '}\n' +
          works.map(function (e) {
            var line = '\\bibitem{' + (e.key || 'ref') + '} ';
            var parts = [];
            /* rich text (italics, formulas) in documents that say so */
            var T = doc.meta && doc.meta.bibHtml ? function (s) { return inline(s, use).trim(); } : esc;
            var full = function (s) { return doc.meta && doc.meta.bibHtml ? !!plainText(s) || /imath/.test(s || '') : !!s; };
            if (full(e.author)) parts.push(T(e.author));
            if (full(e.title)) parts.push('\\emph{' + T(e.title) + '}');
            if (full(e.journal)) parts.push(T(e.journal));
            if (full(e.year)) parts.push(T(e.year));
            if (full(e.note)) parts.push(T(e.note));
            /* ends with a full stop — one: not after one already typed */
            var joined = parts.join(', ');
            return line + joined + (/[.!?]\s*$/.test(joined.replace(/\}+$/, '')) ? '' : '.');
          }).join('\n') +
          '\n\\end{thebibliography}\n';
      }
      case 'raw':
        return (b.tex || '') + '\n';
      default:
        return '';
    }
  }

  /* A displayed equation or a list sits inside its paragraph, as on the
     page: no blank line between it and the text before or after it, so
     that text goes on without a new indent ("For each h we: … Table 1
     lists the results"). */
  var INSIDE = { eq: 1, list: 1 };
  function joins(a, b) { return !!((INSIDE[a.t] && b.t === 'para') || (a.t === 'para' && INSIDE[b.t])); }

  /* ---- whole document ---- */
  function build(doc) {
    var use = {}, S = doc.settings, meta = doc.meta;

    /* The title block first: formulas in it may call for packages too.
       Title, authors and date are rich text (formulas, bold …) in documents
       that say so; older ones hold plain text. */
    var rich = !!meta.headHtml;
    var H = rich ? function (s) { return inline(s || '', use).trim(); } : esc;
    var filled = function (s) { return rich ? !!plainText(s) || /imath/.test(s || '') : !!s; };
    var head = [];
    head.push('\\title{' + (filled(meta.title) ? H(meta.title) : 'Untitled') + '}');
    var au = (meta.authors || []).filter(function (a) { return filled(a.name); });
    if (au.length) {
      head.push('\\author{' + au.map(function (a) {
        var t = H(a.name);
        if (filled(a.affil)) t += '\\\\ \\small ' + H(a.affil);
        if (a.email) t += '\\\\ \\small \\texttt{' + esc(a.email) + '}';
        return t;
      }).join(' \\and ') + '}');
    }
    head.push('\\date{' + (meta.date === '' ? '' : !meta.date || meta.date === '\\today' ? '\\today' :
      H(meta.date).replace('\\textbackslash{}today', '\\today')) + '}');

    /* An empty paragraph writes nothing — and must not come between an
       equation and the text it belongs to. The parts of a theorem or
       proof are written inside it. */
    var env = PT.doc && PT.doc.envChain ? PT.doc.envChain(doc) : [];
    var isBlankPara = function (b) { return b.t === 'para' && !plainText(b.html) && !/class="[^"]*\b(imath|xref|ftnote)\b/.test(b.html || ''); };
    var isBlankEq = function (b) { return b.t === 'eq' && b.lines.every(M.isEmptyRow); };
    var list = [];
    doc.blocks.forEach(function (b, i) {
      if (isBlankPara(b) || isBlankEq(b)) return;
      if (env[i]) { var own = list[list.length - 1]; if (own && own.parts && own.b === env[i]) { own.parts.push(b); return; } }
      list.push({ b: b, parts: b.t === 'theorem' ? [] : null });
    });
    var body = '';
    list.forEach(function (x, i) {
      var b = x.b, next = list[i + 1] && list[i + 1].b;
      /* A displayed equation sits inside its paragraph, as on the page: no
         blank line before it (that would leave an empty line above it) nor
         after it, so the text below goes on without a new indent. */
      var joined = next && joins(b, next);
      body += blockTex(b, use, doc, x.parts) + (joined ? '' : '\n');
    });

    var opts = [S.fontsize, S.paper];
    if (S.columns === 2) opts.push('twocolumn');
    if (S.titlepage) opts.push('titlepage');

    var p = [];
    p.push('\\documentclass[' + opts.join(',') + ']{' + S.docclass + '}');
    p.push('\\usepackage[utf8]{inputenc}');
    p.push('\\usepackage[T1]{fontenc}');
    if (S.lang && S.lang !== 'english') p.push('\\usepackage[' + S.lang + ']{babel}');
    p.push('\\usepackage{amsmath, amssymb}');
    /* before pgfplots, which loads xcolor without the table option */
    if (use.colortbl) { p.push('\\usepackage[table]{xcolor}'); p.push('\\definecolor{ptzebra}{gray}{0.93}'); }
    if (use.amsthm) p.push('\\usepackage{amsthm}');
    if (use.graphicx) p.push('\\usepackage{graphicx}');
    if (use.booktabs) p.push('\\usepackage{booktabs}');
    if (use.pgfplots) p.push.apply(p, PT.chart.preamble(use));
    if (use.listings) p.push('\\usepackage{listings}');
    if (use.ulem) p.push('\\usepackage[normalem]{ulem}');
    if (use.soul) p.push('\\usepackage{soul}');
    if (S.margin) p.push('\\usepackage[margin=' + S.margin + ']{geometry}');
    if (S.lineSpacing && S.lineSpacing !== 1) p.push('\\usepackage{setspace}');
    p.push('\\usepackage{hyperref}');
    /* the PDF's own title and author, as a viewer's title bar and a search
       show them: plain words, formulas spelled out */
    var pdfT = rich ? plainText(meta.title) : String(meta.title || '').trim();
    var pdfA = au.map(function (a) { return rich ? plainText(a.name) : a.name; }).join(', ');
    var pdfInfo = [];
    if (pdfT) pdfInfo.push('pdftitle={' + pdfEsc(pdfT) + '}');
    if (pdfA) pdfInfo.push('pdfauthor={' + pdfEsc(pdfA) + '}');
    if (pdfInfo.length) p.push('\\hypersetup{' + pdfInfo.join(', ') + '}');
    if (use.thms) {
      p.push('');
      var order = ['theorem', 'lemma', 'corollary', 'proposition', 'definition', 'example', 'remark'];
      var first = null;
      order.forEach(function (k) {
        if (!use.thms[k]) return;
        var name = k.charAt(0).toUpperCase() + k.slice(1);
        /* 1, 2, 3 — or 2.1, 2.2 within sections, when the document asks */
        if (!first) { p.push('\\newtheorem{' + k + '}{' + name + '}' + (S.thmWithin ? '[section]' : '')); first = k; }
        else p.push('\\newtheorem{' + k + '}[' + first + ']{' + name + '}');
      });
    }
    if (S.lineSpacing && S.lineSpacing !== 1) {
      p.push('');
      p.push('\\setstretch{' + S.lineSpacing + '}');
    }
    if (S.numbered === false) { p.push('\\setcounter{secnumdepth}{0}'); }

    var out = p.join('\n') + '\n\n' + head.join('\n') + '\n\n\\begin{document}\n\\maketitle\n';
    if (meta.abstract && meta.abstract.replace(/<[^>]*>/g, '').trim()) {
      out += '\n\\begin{abstract}\n' + inline(meta.abstract, use).trim() + '\n\\end{abstract}\n';
    }
    if (meta.keywords) out += '\n\\noindent\\textbf{Keywords:} ' + esc(meta.keywords) + '\n';
    out += '\n' + body.replace(/\n{3,}/g, '\n\n').trim() + '\n\n\\end{document}\n';

    /* fix \date{\today} escaping */
    out = out.replace(/\\date\{\\textbackslash\{\}today\}/, '\\date{\\today}');
    return out;
  }

  /* one block's LaTeX on its own, to find which block a TeX error is in */
  function texOf(b, doc) { try { return blockTex(b, {}, doc, b.t === 'theorem' ? [] : null); } catch (e) { return ''; } }

  window.PT.latex = { build: build, inline: inline, esc: esc, plainText: plainText, texOf: texOf };
})();
