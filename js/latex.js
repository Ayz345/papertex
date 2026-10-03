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
    var box = document.createElement('div');
    box.innerHTML = html || '';
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
        var kind = n.dataset.kind || 'ref', lab = n.dataset.label || '';
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
        case 'a':
          use.hyperref = true;
          out += '\\href{' + (n.getAttribute('href') || '') + '}{' + walk(n, use) + '}';
          break;
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
    var s = '', L = function (lab) { return lab ? '\\label{' + lab + '}' : ''; };
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
          if (b.labels && b.labels[i]) t += ' \\label{' + b.labels[i] + '}';
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
        use.graphicx = true;
        var w = (b.width || 0.8);
        return '\\begin{figure}[' + (b.placement || 'htbp') + ']\n  \\centering\n' +
          '  \\includegraphics[width=' + w + '\\linewidth]{' + (b.filename || 'figure.png') + '}\n' +
          (b.caption ? '  \\caption{' + inline(b.caption, use).trim() + '}\n' : '') +
          (b.label ? '  \\label{' + b.label + '}\n' : '') +
          '\\end{figure}\n';
      }
      case 'table': {
        var cols = b.align.join(b.rules ? '|' : '');
        if (b.rules) cols = '|' + cols + '|';
        var t = '\\begin{table}[' + (b.placement || 'htbp') + ']\n  \\centering\n';
        if (b.caption) t += '  \\caption{' + inline(b.caption, use).trim() + '}\n';
        if (b.label) t += '  \\label{' + b.label + '}\n';
        t += '  \\begin{tabular}{' + cols + '}\n';
        if (b.booktabs) { use.booktabs = true; t += '    \\toprule\n'; }
        else if (b.rules) t += '    \\hline\n';
        b.rows.forEach(function (r, ri) {
          t += '    ' + r.map(function (c) { return inline(c, use).trim(); }).join(' & ') + ' \\\\\n';
          if (ri === 0 && b.header) t += b.booktabs ? '    \\midrule\n' : (b.rules ? '    \\hline\n' : '');
          else if (b.rules && !b.booktabs) t += '    \\hline\n';
        });
        if (b.booktabs) t += '    \\bottomrule\n';
        t += '  \\end{tabular}\n\\end{table}\n';
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
    if (use.amsthm) p.push('\\usepackage{amsthm}');
    if (use.graphicx) p.push('\\usepackage{graphicx}');
    if (use.booktabs) p.push('\\usepackage{booktabs}');
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
