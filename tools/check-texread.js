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

/* unfinished LaTeX (the pane waits for it) — and finished LaTeX is not */
const results0 = fs.readFileSync(files[0], 'utf8'), at = results0.indexOf('\\section{');
check('unfinished', PT.texread.read(results0.slice(0, at) + '\\begin{equation}\n' + results0.slice(at)).broken.length === 1, 'an unclosed equation before a section');
check('unfinished', PT.texread.read('\\section{A}\n\\begin{align}\na=b').broken.length === 1, 'an align with no end');
check('unfinished', PT.texread.read('\\begin{equation}\na\n\nb\n\\end{equation}').broken.length === 1, 'a blank line inside maths');
files.concat([hw]).forEach((f) => check(path.basename(f), !PT.texread.read(fs.readFileSync(f, 'utf8')).broken.length, 'finished LaTeX taken for unfinished'));

if (failures.length) {
  console.error('texread: ' + failures.length + ' problem(s)\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('texread: ' + files.length + ' PaperTeX documents and the hand-written paper read as expected.');
