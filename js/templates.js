/* PaperTeX — starting points for a new document.

   Each template builds an ordinary document — the same model as anything
   typed by hand — so there is nothing special to save, export or compile.
   The text in them says what goes where; formulas, references and the
   bibliography are real, so a template compiles as it stands. */
(function () {
  'use strict';
  var M = PT.math, D = PT.doc;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /* an inline formula, as the editor stores it */
  function im(tex) { return '<span class="imath" contenteditable="false" data-m="' + esc(JSON.stringify(M.parseTex(tex))) + '"></span>'; }
  function ref(label, kind) { return '<span class="xref" contenteditable="false" data-kind="' + (kind || 'ref') + '" data-label="' + esc(label) + '"></span>'; }
  function cite(key) { return ref(key, 'cite'); }

  function sec(text, opts) {
    opts = opts || {};
    return { id: D.uid(), t: 'section', level: opts.level || 1, html: text, label: opts.label || '', numbered: opts.numbered !== false };
  }
  function para(html) { return { id: D.uid(), t: 'para', html: html }; }
  function eq(lines, labels) {
    return { id: D.uid(), t: 'eq', env: 'align', numbered: !!labels, label: labels ? labels[0] : '',
      labels: labels || [], lines: lines.map(function (l) { return M.parseTex(l); }) };
  }
  function list(items, ordered) {
    return { id: D.uid(), t: 'list', ordered: !!ordered, items: items.map(function (h) { return { html: h, level: 0 }; }) };
  }
  function thm(kind, title, html, label) { return { id: D.uid(), t: 'theorem', kind: kind, title: title || '', html: html, label: label || '' }; }
  function base(title, overrides) {
    var d = D.newDoc();
    d.meta.title = title;
    d.meta.abstract = '';
    d.blocks = [];
    Object.keys(overrides || {}).forEach(function (k) { d.settings[k] = overrides[k]; });
    return d;
  }

  var TEMPLATES = [
    {
      id: 'blank', name: 'Blank', icon: '▢', desc: 'A title and an empty page',
      build: function () {
        var d = base('Untitled document', { showAbstract: false });
        d.blocks = [para('')];
        return d;
      }
    },
    {
      id: 'article', name: 'Article', icon: '¶', desc: 'Abstract, sections, an equation, a table, references',
      build: function () {
        var d = base('Title of the article');
        d.meta.abstract = 'One paragraph: the question, what you did, what you found, and why it matters.';
        d.blocks = [
          sec('Introduction', { label: 'sec:intro' }),
          para('Set out the problem and what is already known about it ' + cite('knuth1984') +
            '. End with what this article adds, and how the rest of it is organised.'),
          sec('Method', { label: 'sec:method' }),
          para('Describe the model. The central relation is'),
          eq(['E = mc^2'], ['eq:main']),
          para('where ' + im('m') + ' is the mass and ' + im('c') + ' the speed of light. Equation ' +
            ref('eq:main', 'eqref') + ' is referenced by its label, so its number stays right when you move it.'),
          sec('Results', { label: 'sec:results' }),
          para('Report what you found. Tables and figures go in from the / menu on an empty line.'),
          { id: D.uid(), t: 'table', rows: [['Quantity', 'Value', 'Uncertainty'], ['a', '1.00', '0.02'], ['b', '2.50', '0.05']],
            align: ['l', 'c', 'c'], header: true, booktabs: true, rules: false,
            caption: 'Main results.', label: 'tab:results', placement: 'htbp' },
          sec('Discussion'),
          para('What the results mean, their limits, and what should come next.'),
          sec('Conclusion'),
          para('The answer to the question in the introduction, in two or three sentences.'),
          { id: D.uid(), t: 'bib' }
        ];
        d.bib = [{ key: 'knuth1984', author: 'D. E. Knuth', title: 'The TeXbook', journal: 'Addison-Wesley', year: '1984' }];
        return d;
      }
    },
    {
      id: 'homework', name: 'Homework', icon: '✎', desc: 'Problems and worked solutions',
      build: function () {
        var d = base('Problem Set 1', { showAbstract: false, numbered: false });
        d.meta.authors = [{ name: 'Your Name', affil: 'Course code', email: '' }];
        d.blocks = [
          sec('Problem 1', { numbered: false }),
          para('<i>Evaluate ' + im('\\int_{0}^{1} x e^{x}\\,dx') + '.</i>'),
          para('<b>Solution.</b> Integrate by parts with ' + im('u = x') + ' and ' + im('dv = e^{x}\\,dx') + ':'),
          eq(['\\int_{0}^{1} x e^{x}\\,dx = \\left[x e^{x}\\right]_{0}^{1} - \\int_{0}^{1} e^{x}\\,dx',
              '= e - (e - 1)', '= 1']),
          sec('Problem 2', { numbered: false }),
          para('<i>Show that ' + im('\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}') + '.</i>'),
          para('<b>Solution.</b> By induction on ' + im('n') + '. For ' + im('n = 1') + ' both sides are 1. If it holds for ' +
            im('n') + ', then'),
          eq(['\\sum_{k=1}^{n+1} k = \\frac{n(n+1)}{2} + (n+1) = \\frac{(n+1)(n+2)}{2}']),
          para('which is the claim for ' + im('n+1') + '.')
        ];
        return d;
      }
    },
    {
      id: 'lab', name: 'Lab report', icon: '⚗', desc: 'Theory, method, data table, error analysis',
      build: function () {
        var d = base('Lab Report: Measuring g with a Pendulum');
        d.meta.abstract = 'What was measured, how, the result with its uncertainty, and how it compares with the accepted value.';
        d.blocks = [
          sec('Introduction'),
          para('Why the experiment is done and what it tests.'),
          sec('Theory', { label: 'sec:theory' }),
          para('For small amplitudes the period of a simple pendulum of length ' + im('L') + ' is'),
          eq(['T = 2\\pi\\sqrt{\\frac{L}{g}}'], ['eq:period']),
          para('so measuring ' + im('T') + ' and ' + im('L') + ' gives ' + im('g = \\frac{4\\pi^2 L}{T^2}') + '.'),
          sec('Apparatus and Method'),
          list(['Measure the length of the pendulum to the centre of the bob.',
                'Release it from a small angle and time 20 full swings.',
                'Repeat for five different lengths.'], true),
          { id: D.uid(), t: 'figure', src: '', filename: '', caption: 'The experimental setup.', width: 0.6, label: 'fig:setup', placement: 'htbp' },
          sec('Results'),
          { id: D.uid(), t: 'table', rows: [['L (m)', 'T (s)', 'g (m/s²)'], ['0.50', '1.42', '9.79'], ['0.75', '1.74', '9.78'], ['1.00', '2.01', '9.77']],
            align: ['c', 'c', 'c'], header: true, booktabs: true, rules: false,
            caption: 'Measured periods and the resulting values of g.', label: 'tab:data', placement: 'htbp' },
          para('The uncertainty follows from propagating the errors in ' + im('L') + ' and ' + im('T') + ':'),
          eq(['\\frac{\\delta g}{g} = \\sqrt{\\left(\\frac{\\delta L}{L}\\right)^2 + \\left(2\\frac{\\delta T}{T}\\right)^2}'], ['eq:error']),
          sec('Discussion'),
          para('Compare with the accepted value, and name the largest sources of error.'),
          sec('Conclusion'),
          para('The result, with its uncertainty, in one or two sentences.')
        ];
        return d;
      }
    },
    {
      id: 'notes', name: 'Lecture notes', icon: '❡', desc: 'Definitions, theorems and proofs',
      build: function () {
        var d = base('Lecture 1: Limits', { showAbstract: false });
        d.blocks = [
          sec('Definition of a limit'),
          thm('definition', 'Limit', 'We write ' + im('\\lim_{x \\to a} f(x) = L') + ' if for every ' + im('\\varepsilon > 0') +
            ' there is a ' + im('\\delta > 0') + ' such that ' + im('0 < |x - a| < \\delta') + ' implies ' + im('|f(x) - L| < \\varepsilon') + '.', 'def:limit'),
          sec('Basic results'),
          thm('theorem', 'Uniqueness', 'A function has at most one limit at a point.', 'thm:unique'),
          thm('proof', '', 'Suppose ' + im('L') + ' and ' + im('M') + ' are both limits and take ' +
            im('\\varepsilon = \\frac{|L - M|}{2}') + '. Close enough to ' + im('a') + ', ' + im('f(x)') +
            ' is within ' + im('\\varepsilon') + ' of both, which is impossible unless ' + im('L = M') + '.'),
          sec('Example'),
          eq(['\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1']),
          para('Notes for the next lecture go here.')
        ];
        return d;
      }
    }
  ];

  window.PT = window.PT || {};
  window.PT.templates = TEMPLATES;
})();
