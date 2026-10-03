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
      .replace(/\u00a0/g, '~');
  }

  /* ---- inline HTML (a paragraph's rich text) -> LaTeX ---- */
  function inline(html, use) {
    /* an inert, cleaned copy: nothing in it can load or run */
    var box = PT.sanitize.parse(html);
    return walk(box, use).replace(/[ \t]+\n/g, '\n').replace(/ {2,}/g, ' ');
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
        M.scanRow(m, use);
        out += '$' + M.texRow(m) + '$';
        continue;
      }
      if (cls.indexOf('xref') >= 0) {
        var kind = n.dataset.kind || 'ref', lab = PT.sanitize.label(n.dataset.label);
        if (kind === 'cite') { out += '\\cite{' + lab + '}'; use.cite = true; }
        else if (kind === 'eqref') { out += '\\eqref{' + lab + '}'; use.amsmath = true; }
        else if (kind === 'pageref') out += '\\pageref{' + lab + '}';
        else out += '\\ref{' + lab + '}';
        use.hyperref = true;
        continue;
      }
      if (cls.indexOf('ftnote') >= 0) { out += '\\footnote{' + esc(n.dataset.text || '') + '}'; continue; }

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
  function blockTex(b, use, doc) {
    var s = '', L = function (lab) { return lab ? '\\label{' + PT.sanitize.label(lab) + '}' : ''; };
    switch (b.t) {
      case 'section': {
        var cmd = ['section', 'subsection', 'subsubsection', 'paragraph'][b.level - 1] || 'section';
        s = '\\' + cmd + (b.numbered === false ? '*' : '') + '{' + inline(b.html, use) + '}' + L(b.label);
        return s + '\n';
      }
      case 'para':
        return inline(b.html, use).trim() + '\n';
      case 'eq': {
        use.amsmath = true;
        var lines = b.lines.map(function (r) { M.scanRow(r, use); return r; });
        var star = b.numbered === false ? '*' : '';
        if (lines.length === 1) {
          return '\\begin{equation' + star + '}\n  ' + M.texRow(lines[0]).trim() +
            (b.label ? '\n  ' + L(b.label) : '') + '\n\\end{equation' + star + '}\n';
        }
        var env = (b.env === 'gather' ? 'gather' : 'align') + star;
        var body = lines.map(function (r, i) {
          var t = (b.env === 'gather' ? M.texRow(r).trim() : alignedLine(r));
          if (b.labels && b.labels[i]) t += ' \\label{' + PT.sanitize.label(b.labels[i]) + '}';
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
        if (b.kind === 'proof') {
          return '\\begin{proof}\n  ' + inline(b.html, use).trim() + '\n\\end{proof}\n';
        }
        return '\\begin{' + b.kind + '}' + (b.title ? '[' + inline(b.title, use).trim() + ']' : '') +
          L(b.label) + '\n  ' + inline(b.html, use).trim() + '\n\\end{' + b.kind + '}\n';
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
      case 'pagebreak':
        return '\\newpage\n';
      case 'toc':
        return '\\tableofcontents\n';
      case 'bib': {
        if (!doc.bib.length) return '';
        var n = String(doc.bib.length).length;
        var w2 = '9'.repeat(n);
        return '\\begin{thebibliography}{' + w2 + '}\n' +
          doc.bib.map(function (e) {
            var line = '\\bibitem{' + (e.key || 'ref') + '} ';
            var parts = [];
            if (e.author) parts.push(esc(e.author));
            if (e.title) parts.push('\\emph{' + esc(e.title) + '}');
            if (e.journal) parts.push(esc(e.journal));
            if (e.year) parts.push(esc(e.year));
            if (e.note) parts.push(esc(e.note));
            return line + parts.join(', ') + '.';
          }).join('\n') +
          '\n\\end{thebibliography}\n';
      }
      case 'raw':
        return (b.tex || '') + '\n';
      default:
        return '';
    }
  }

  /* ---- whole document ---- */
  function build(doc) {
    var use = {}, S = doc.settings, meta = doc.meta;
    var body = '';
    doc.blocks.forEach(function (b) { body += blockTex(b, use, doc) + '\n'; });

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
    if (use.thms) {
      p.push('');
      var order = ['theorem', 'lemma', 'corollary', 'proposition', 'definition', 'example', 'remark'];
      var first = null;
      order.forEach(function (k) {
        if (!use.thms[k]) return;
        var name = k.charAt(0).toUpperCase() + k.slice(1);
        if (!first) { p.push('\\newtheorem{' + k + '}{' + name + '}[section]'); first = k; }
        else p.push('\\newtheorem{' + k + '}[' + first + ']{' + name + '}');
      });
    }
    if (S.lineSpacing && S.lineSpacing !== 1) {
      p.push('');
      p.push('\\setstretch{' + S.lineSpacing + '}');
    }
    if (S.numbered === false) { p.push('\\setcounter{secnumdepth}{0}'); }

    var head = [];
    head.push('\\title{' + esc(meta.title || 'Untitled') + '}');
    var au = (meta.authors || []).filter(function (a) { return a.name; });
    if (au.length) {
      head.push('\\author{' + au.map(function (a) {
        var t = esc(a.name);
        if (a.affil) t += '\\\\ \\small ' + esc(a.affil);
        if (a.email) t += '\\\\ \\small \\texttt{' + esc(a.email) + '}';
        return t;
      }).join(' \\and ') + '}');
    }
    head.push('\\date{' + (meta.date === '' ? '' : esc(meta.date || '\\today').replace('\\textbackslash{}today', '\\today')) + '}');

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

  window.PT.latex = { build: build, inline: inline, esc: esc };
})();
