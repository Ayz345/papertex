/* Does the .tex reader (js/texread.js) still read what it should?

     npm run check:texread

   Reads every .tex the usability tests produced (written by PaperTeX) and
   the hand-written papers in tools/texread-fixtures/, outside a browser,
   and checks what comes back: no errors, the blocks each one must have.
   Writing the LaTeX again and compiling it needs the page — see
   tools/texread-fixtures/README.md. */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
/* just enough of a browser for math.js and texread.js, which build no DOM */
global.window = global;
global.PT = {};
global.navigator = { userAgent: '' };
global.document = { addEventListener() {}, createElement() { return { style: {}, classList: { add() {} }, appendChild() {}, setAttribute() {} }; } };
require(path.join(root, 'js/symbols.js'));
require(path.join(root, 'js/math.js'));
require(path.join(root, 'js/texread.js'));
require(path.join(root, 'js/unzip.js'));

const failures = [];
const check = (file, ok, what) => { if (!ok) failures.push(file + ': ' + what); };
const kinds = (d) => d.blocks.map((b) => b.t === 'theorem' ? b.kind : b.t);

const results = path.join(root, 'usability-test-2026-10-04', 'results');
const files = fs.readdirSync(results).filter((f) => f.endsWith('.tex')).map((f) => path.join(results, f));
for (const f of files) {
  const name = path.basename(f);
  let r;
  try { r = PT.texread.read(fs.readFileSync(f, 'utf8')); } catch (e) { check(name, false, 'threw ' + e.message); continue; }
  const k = kinds(r.doc);
  check(name, /Damped/.test(r.doc.meta.title), 'title not read');
  check(name, k.includes('para') && k.includes('eq'), 'no paragraphs or equations');
  check(name, !k.includes('raw') || r.doc.blocks.filter((b) => b.t === 'raw').every((b) => /^\\begin\{figure\}/.test(b.tex)), 'LaTeX code blocks other than a drawn figure');
}

/* a paper PaperTeX did not write */
const hw = path.join(__dirname, 'texread-fixtures', 'handwritten.tex');
const r = PT.texread.read(fs.readFileSync(hw, 'utf8'));
const d = r.doc, k = kinds(d), H = 'handwritten.tex';
const para = d.blocks.filter((b) => b.t === 'para').map((b) => b.html).join('\n');
check(H, d.meta.title === 'On the Stability of Small Things', 'title (\\thanks not dropped?)');
check(H, d.meta.authors.length === 2 && d.meta.authors[0].email === 'ana@example.org' && d.meta.authors[0].affil === 'University of Somewhere', 'authors');
check(H, d.meta.date === '' && /two/.test(d.meta.abstract) && !/comment/.test(d.meta.abstract), 'date or abstract');
check(H, d.settings.fontsize === '12pt' && d.settings.paper === 'letterpaper' && d.settings.margin === '1in' && d.settings.thmWithin === true, 'settings');
check(H, /\\newcommand\{\\R\}/.test(d.settings.preamble) && /siunitx/.test(d.settings.preamble) && !/hyperref|geometry|inputenc/.test(d.settings.preamble), 'extra preamble');
check(H, /Erdős/.test(para) && /Gödel—and also Poincaré/.test(para) && /“quoted”/.test(para) && /50% of cases and \$5/.test(para), 'accents, dashes, quotes, escapes');
check(H, /<b>bold<\/b>/.test(para) && /<i>emphasis<\/i>/.test(para), '{\\bf …} and {\\em …}');
check(H, (para.match(/data-kind="cite"/g) || []).length === 2 && /data-kind="eqref" data-label="eq:main"/.test(para), 'citations and \\eqref');
check(H, /class="ftnote"[^>]*data-text="A note with x\^2 in it\."/.test(para), 'footnote');
check(H, /\\\\SI\{3\}\{\\\\metre\}/.test(para), '\\SI kept in a formula');
const eqs = d.blocks.filter((b) => b.t === 'eq');
check(H, eqs.length === 5, 'five displayed equations, got ' + eqs.length);
check(H, eqs[2] && eqs[2].lines.length === 2 && eqs[2].labels[0] === 'eq:main' && eqs[2].numbered, 'align with label and \\nonumber');
check(H, eqs[3] && eqs[3].lines.length === 2 && !eqs[3].numbered, 'equation* with split');
check(H, eqs[2] && !eqs[2].lines[0].k.some((n) => n.t === 'ch' && n.c === '&'), '"&" before "=" not kept in the formula');
check(H, k.join(' ').includes('theorem proof eq theorem definition'), 'theorem, proof with its equation, conjecture as theorem, definition: ' + k.join(' '));
check(H, eqs[4] && eqs[4].inEnv === true, 'the proof\'s equation belongs to it');
const lists = d.blocks.filter((b) => b.t === 'list');
check(H, lists[0] && lists[0].ordered && lists[0].items.map((i) => i.level).join('') === '00110', 'nested enumerate');
check(H, lists[1] && /<b>Term<\/b> Its meaning/.test(lists[1].items[0].html), 'description list');
check(H, lists[2] && /<code>code<\/code>/.test(lists[2].items[0].html), '\\verb');
const tb = d.blocks.find((b) => b.t === 'table');
check(H, tb && tb.rules && tb.header && tb.rows.length === 3 && tb.rows[0][0] === 'Name' && tb.capBelow && tb.label === 'tab:vals', 'ruled table');
const fg = d.blocks.find((b) => b.t === 'figure');
check(H, fg && fg.filename === 'plot.pdf' && fg.width === 0.5 && fg.label === 'fig:plot' && fg.placement === 't', 'figure');
const code = d.blocks.filter((b) => b.t === 'code');
check(H, code.length === 2 && code[0].lang === 'Python' && code[0].caption === 'Hello' && /100% sure/.test(code[0].text) && /raw % text/.test(code[1].text), 'listings and verbatim, % kept');
check(H, d.blocks.some((b) => b.t === 'raw' && /^% \\input\{appendix\}/.test(b.tex)), '\\input kept, commented out');
check(H, d.bib.length === 2 && d.bib[0].title === 'Science and Hypothesis' && d.bib[0].year === '1905' && /Gödel/.test(d.bib[1].note), 'bibliography');
check(H, r.notes.length >= 6, 'notes');

/* a project: main.tex + \input file + .bib + image (an Overleaf download) */
const projDir = path.join(__dirname, 'texread-fixtures', 'project'), proj = {};
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else proj[path.relative(projDir, p).replace(/\\/g, '/')] = new Uint8Array(fs.readFileSync(p));
  }
})(projDir);
const P = 'project/', pr = PT.texread.readProject(proj), pd = pr.doc;
check(P, pr.main === 'main.tex' && pd.meta.title === 'A Small Project', 'main file and title');
check(P, pd.blocks.some((b) => b.t === 'section' && b.html === 'Introduction' && b.label === 'sec:intro'), '\\input{sections/intro} written in');
check(P, !pd.blocks.some((b) => b.t === 'raw'), 'nothing left as LaTeX code (the commented-out \\input stays out)');
const ein = pd.bib.find((e) => e.key === 'einstein1905'), kn = pd.bib.find((e) => e.key === 'knuth84');
check(P, ein && ein.author === 'Albert Einstein' && /Körper/.test(ein.title) && /Annalen der Physik 322\(10\), 891–921/.test(ein.journal) && ein.year === '1905' && /doi:/.test(ein.note), '.bib article (@string, braces, accents, pages)');
check(P, kn && kn.author === 'Donald E. Knuth' && /TeXbook/.test(kn.title) && kn.journal === 'Addison-Wesley', '.bib book in quotes');
check(P, pd.bib.length === 3 && !pd.bib.some((e) => e.key === 'unused2020'), 'only cited works');
const lib = pd.bibLibrary || [], un = lib.find((e) => e.key === 'unused2020');
check(P, un && un.title && lib.some((e) => e.key === 'einstein1905' && /Körper/.test(e.title)), 'the whole .bib kept as the library (uncited works too)');
check('fragment', !PT.texread.read('Some \\cite{a} text.').doc.bibLibrary, 'no library without a .bib');

/* hand-made spacing between paragraphs is kept as LaTeX code; inside a
   paragraph it is still left out */
const sp = (t) => PT.texread.read(t).doc.blocks.map((b) => b.t === 'raw' ? 'raw:' + b.tex : b.t).join(' | ');
check('spacing', sp('One.\n\n\\vspace{1cm}\n\nTwo.') === 'para | raw:\\vspace{1cm} | para', '\\vspace{1cm} between paragraphs: ' + sp('One.\n\n\\vspace{1cm}\n\nTwo.'));
check('spacing', sp('One.\n\n\\vspace*{2em}\n\\bigskip\n\nTwo.') === 'para | raw:\\vspace*{2em}\n\\bigskip | para', 'a run of spacing is one block');
check('spacing', sp('One.\n\n\\medskip\nTwo.') === 'para | raw:\\medskip | para', '\\medskip starting a paragraph');
check('spacing', sp('\\hfill\n\nOne.') === 'raw:\\hfill | para', '\\hfill on its own');
check('spacing', sp('One \\vspace{1cm} two.') === 'para' && !/vspace/.test(PT.texread.read('One \\vspace{1cm} two.').doc.blocks[0].html), 'inside a paragraph, left out');
check('spacing', sp('\\noindent One.') === 'para', '\\noindent is not spacing');
check(H, d.blocks.some((b) => b.t === 'raw' && b.tex === '\\vspace{1cm}'), '\\vspace{1cm} kept');
check(P, pr.notes.some((n) => /missingkey/.test(n)) && !pr.notes.some((n) => /\.bib file cannot be read/.test(n)), 'notes: the key not in the .bib, and no "cannot read .bib"');
const pf = pd.blocks.find((b) => b.t === 'figure');
check(P, pf && /^data:image\/png;base64,/.test(pf.src) && pf.filename === 'plot.png' && pf.width === 0.6, 'figure image from figures/plot.png');

/* unfinished LaTeX (the pane waits for it) — and finished LaTeX is not */
const results0 = fs.readFileSync(files[0], 'utf8'), at = results0.indexOf('\\section{');
check('unfinished', PT.texread.read(results0.slice(0, at) + '\\begin{equation}\n' + results0.slice(at)).broken.length === 1, 'an unclosed equation before a section');
check('unfinished', PT.texread.read('\\section{A}\n\\begin{align}\na=b').broken.length === 1, 'an align with no end');
check('unfinished', PT.texread.read('\\begin{equation}\na\n\nb\n\\end{equation}').broken.length === 1, 'a blank line inside maths');
files.concat([hw]).forEach((f) => check(path.basename(f), !PT.texread.read(fs.readFileSync(f, 'utf8')).broken.length, 'finished LaTeX taken for unfinished'));

/* the same project as a .zip (made on Windows: its names use "\") */
const zipped = fs.readFileSync(path.join(__dirname, 'texread-fixtures', 'project.zip'));
PT.unzip(zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.length)).then((z) => {
  const zr = PT.texread.readProject(z), zf = zr.doc.blocks.find((b) => b.t === 'figure');
  check('project.zip', Object.keys(z).sort().join(',') === 'figures/plot.png,main.tex,refs.bib,sections/intro.tex', 'entries and their names');
  check('project.zip', zf && zf.filename === 'plot.png' && /^data:image\/png/.test(zf.src) && zr.doc.bib.length === 3, 'figure image and references');
}, (e) => check('project.zip', false, 'unzip failed: ' + e.message)).then(() => {
  if (failures.length) {
    console.error('texread: ' + failures.length + ' problem(s)\n  ' + failures.join('\n  '));
    process.exit(1);
  }
  console.log('texread: ' + files.length + ' PaperTeX documents, the hand-written paper and a project (folder and .zip) read as expected.');
});
