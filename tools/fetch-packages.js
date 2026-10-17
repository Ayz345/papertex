/* Fetch the LaTeX packages the engine's TeX Live subset lacks.

   The WebAssembly TeX Live (engine/texlive/) carries a subset of TeX Live,
   so a paper that loads listings, cleveref, enumitem, float, … stopped with
   "File `listings.sty' not found". Now that PaperTeX opens people's own .tex
   files, that is most papers. This fetches the pure-macro ones — ready-made
   runtime files from TeX Live's own package archives — into
   engine/texmf/pkg/ with a manifest, and js/compile.js hands them to the
   compiler only for a document that loads them.

   For each package: TeX Live's file-to-package index (the engine ships it,
   engine/texlive/bundles/file-to-package.json) names the archive that holds
   the .sty; the archive's tex/ tree is kept; every \RequirePackage /
   \usepackage / \input in the files that .sty reaches, that the engine
   lacks, is fetched the same way, recursively. The manifest lists, per
   package, only the files it reaches (plus the .cfg/.def/.tex/… beside it,
   which TeX finds by name), so a document downloads just those. Packages that need something the browser cannot have — fonts
   the engine lacks, or an external program — are left out and listed.

   All are LPPL or similar free licences; every file is kept as distributed,
   notice included. Needs `tar` with xz support (Windows 10+, macOS, Linux).

   Run:  node tools/fetch-packages.js */
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const bundlesDir = path.join(root, 'engine', 'texlive', 'bundles');
const dest = path.join(root, 'engine', 'texmf', 'pkg');

/* what documents \usepackage, by .sty name */
const WANTED = [
  /* the ones real papers reached for and the engine lacked */
  'listings', 'physics', 'cleveref', 'enumitem', 'float', 'multirow', 'cancel',
  'algorithm', 'algorithmic', 'algpseudocode', 'wrapfig', 'placeins', 'appendix',
  'titlesec', 'braket', 'nicefrac', 'makecell', 'threeparttable', 'diagbox',
  'lipsum', 'blindtext', 'comment', 'authblk', 'hyphenat', 'gensymb', 'tocloft',
  'parskip', 'ragged2e', 'sidecap', 'adjustbox', 'csquotes', 'mhchem', 'chemfig',
  'upgreek', 'minted', 'marvosym', 'stmaryrd', 'mathrsfs', 'dsfont', 'bbm',
  'esint', 'biblatex', 'pdflscape',
  /* other common pure-macro packages the engine also lacks */
  'subfig', 'todonotes', 'fancyvrb', 'xurl', 'framed', 'footmisc', 'acronym',
  'changepage', 'thmtools', 'arydshln', 'bigstrut', 'varwidth', 'xkeyval',
  'xstring', 'chngcntr', 'titling', 'abstract', 'sectsty', 'tocbibind',
  'needspace', 'tikz-cd', 'paralist', 'cases', 'epigraph', 'lettrine', 'tensor',
  'cite', 'accents', 'wasysym', 'xltabular', 'ltablex', 'tabu', 'standalone',
  'subfiles', 'import', 'dirtytalk', 'isomath', 'fixmath', 'commath', 'mwe'
];

/* never fetched: they cannot work inside the browser */
const UNSUPPORTED = {
  biblatex: 'needs the external program biber to build its bibliography',
  minted: 'needs Python (Pygments) and shell escape',
  pythontex: 'needs Python and an external build step',
  svg: 'needs Inkscape and shell escape',
  glossaries: 'needs the external program makeglossaries',
  nomencl: 'needs the external program makeindex',
  gnuplottex: 'needs gnuplot and shell escape'
};

/* Where archives come from, first that has it wins. First, TeX Live 2024 as
   frozen (February 2025): the engine's LaTeX is 2024-11-01, the kernel of
   that time, and today's versions of some packages need a newer one —
   current pdflscape stops at \IfPDFManagementActiveF, undefined there.
   Then today's TeX Live, for anything newer than that. */
const MIRRORS = [
  'https://ftp.math.utah.edu/pub/tex/historic/systems/texlive/2024/tlnet-final/archive/',
  'https://ftp.tu-chemnitz.de/pub/tug/historic/systems/texlive/2024/tlnet-final/archive/',
  'https://mirror.ctan.org/systems/texlive/tlnet/archive/',
  'https://mirrors.mit.edu/CTAN/systems/texlive/tlnet/archive/',
  'https://ctan.math.illinois.edu/systems/texlive/tlnet/archive/',
  'https://ftp.fau.de/ctan/systems/texlive/tlnet/archive/'
];

/* the engine's own files, by bare name */
const engineFiles = Object.keys(JSON.parse(fs.readFileSync(path.join(bundlesDir, 'file-manifest.json'), 'utf8')));
const engineTex = new Set(engineFiles.filter((f) => f.includes('/tex/')).map((f) => f.split('/').pop()));
const engineTfm = engineFiles.filter((f) => f.endsWith('.tfm')).map((f) => f.split('/').pop().slice(0, -4));
fs.readdirSync(path.join(root, 'engine', 'texmf')).forEach((f) => { if (/\.sty$/.test(f)) engineTex.add(f); });
const fileToPackage = JSON.parse(fs.readFileSync(path.join(bundlesDir, 'file-to-package.json'), 'utf8'));
/* which bundle the engine loads a package from, and which it always loads */
const registry = JSON.parse(fs.readFileSync(path.join(bundlesDir, 'bundles.json'), 'utf8'));
const engineDeps = JSON.parse(fs.readFileSync(path.join(bundlesDir, 'package-deps.json'), 'utf8')).packages || {};
function bundleClosure(list) {
  const out = new Set();
  (function add(names) {
    names.forEach((b) => {
      if (out.has(b)) return;
      out.add(b);
      add((registry.bundles[b] && registry.bundles[b].requires) || []);
    });
  })(list);
  return out;
}
const always = bundleClosure(registry.engines.pdflatex.required);
const alwaysX = bundleClosure(registry.engines.xelatex.required);
always.forEach((b) => { if (!alwaysX.has(b)) always.delete(b); });

/* does loading engine package p take a bundle the engine does not always load? */
function outsideAlways(p, seen = new Set()) {
  if (seen.has(p)) return false;
  seen.add(p);
  const b = registry.packages[p];
  if (b && !always.has(b)) return true;
  return (engineDeps[p] || []).some((d) => outsideAlways(d, seen));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'papertex-pkg-'));

function get(url, out, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 8) return reject(new Error(url + ': too many redirects'));
    const req = https.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).toString(), out, hops + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(url + ': HTTP ' + res.statusCode)); }
      const f = fs.createWriteStream(out);
      res.pipe(f);
      f.on('finish', () => f.close(resolve));
      f.on('error', reject);
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error(url + ': timed out')));
    req.on('error', reject);
  });
}

async function download(archive) {
  const file = path.join(tmp, archive + '.tar.xz');
  let last;
  for (const m of MIRRORS) {
    try {
      await get(m + archive + '.tar.xz', file);
      return { file, from: /historic/.test(m) ? 'texlive-2024-final' : 'tlnet' };
    } catch (e) { last = e; }
  }
  throw last;
}

function walk(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

const TEXT = /\.(sty|cls|cfg|def|clo|fd|tex|ldf|prf|dfu|ltx|cnf)$/;
const uncomment = (text) => text.replace(/(^|[^\\])%.*$/gm, '$1');

/* \RequirePackage{a,b} / \usepackage[x]{c} in a file */
function requires(src) {
  const names = new Set();
  const re = /\\(?:RequirePackage(?:WithOptions)?|usepackage)\s*(?:\[[^\]]*\]\s*)?\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    m[1].split(',').map((s) => s.trim()).forEach((n) => {
      if (/^[A-Za-z][\w.-]*$/.test(n)) names.add(n);
    });
  }
  return names;
}

/* files it \input's: \input simplekv.tex, \input{foo}, \InputIfFileExists{bar.def} */
function inputs(src) {
  const names = new Set();
  const re = /\\(?:input|@input|@@input|InputIfFileExists)(?![A-Za-z@])\s*\{?\s*([A-Za-z][\w.-]*)/g;
  let m;
  while ((m = re.exec(src))) names.add(m[1].replace(/\.$/, ''));
  return names;
}

/* font names a file asks NFSS for (\DeclareFontShape size specs) */
function fontsUsed(src) {
  const names = new Set();
  const shape = /\\DeclareFontShape\s*\{[^}]*\}\s*\{[^}]*\}\s*\{[^}]*\}\s*\{[^}]*\}\s*\{([^}]*)\}/g;
  let m;
  while ((m = shape.exec(src))) {
    m[1].replace(/<[^>]*>/g, ' ').replace(/\[[^\]]*\]/g, ' ').split(/\s+/).forEach((t) => {
      if (/^(s|gen|sgen|sub|ssub|subf|ssubf|fixed|sfixed)$/.test(t)) return;
      if (/^[a-z][a-z0-9-]{2,}$/i.test(t)) names.add(t);
    });
  }
  return names;
}
const fontPresent = (name) => engineTfm.some((t) => t.startsWith(name));

/* archive → { files: [{name, src}], text: {name: uncommented text}, bad } */
const archives = {};

async function fetchArchive(archive) {
  if (archives[archive]) return archives[archive];
  const rec = archives[archive] = { files: [], text: {}, bad: null };
  let file;
  try { ({ file, from: rec.from } = await download(archive)); } catch (e) { rec.bad = 'download failed: ' + e.message; return rec; }
  const dir = path.join(tmp, archive);
  fs.mkdirSync(dir, { recursive: true });
  /* relative paths: GNU tar reads C:\… as a remote host */
  execFileSync('tar', ['-xf', path.basename(file), '-C', archive], { cwd: tmp });
  const all = walk(dir);
  const prog = all.find((f) => /^(bin|scripts)\//.test(f));
  if (prog) rec.bad = 'comes with a program (' + prog.split('/').slice(0, 2).join('/') + '), not just macros';
  /* fonts it ships itself: only tex/ is kept, so they must be in the engine */
  const missingTfm = all.filter((f) => f.endsWith('.tfm')).map((f) => f.split('/').pop().slice(0, -4))
    .filter((t) => !engineTfm.includes(t));
  if (!rec.bad && missingTfm.length) rec.bad = 'needs fonts the engine lacks (' + missingTfm.slice(0, 3).join(', ') + (missingTfm.length > 3 ? ', …' : '') + ')';
  const fonts = new Set();
  for (const rel of all.filter((f) => f.startsWith('tex/'))) {
    const name = rel.split('/').pop();
    if (engineTex.has(name)) continue;          /* the engine's own copy wins */
    rec.files.push({ name, src: path.join(dir, rel) });
    if (TEXT.test(name)) {
      rec.text[name] = uncomment(fs.readFileSync(path.join(dir, rel), 'latin1'));
      fontsUsed(rec.text[name]).forEach((f) => fonts.add(f));
    }
  }
  /* fonts declared but none of them available: a font package whose fonts
     live in another archive the engine lacks (bbm, wasysym, …) */
  if (!rec.bad && fonts.size && ![...fonts].some(fontPresent)) {
    rec.bad = 'needs fonts the engine lacks (' + [...fonts].slice(0, 3).join(', ') + (fonts.size > 3 ? ', …' : '') + ')';
  }
  if (!rec.bad && !rec.files.some((f) => /\.sty$/.test(f.name))) rec.bad = 'archive has no .sty the engine lacks';
  return rec;
}

/* the archive's files a .sty reaches: those it names (listings.cfg,
   lstlang1.sty, …) or \RequirePackage's, followed within the archive */
function reach(rec, start) {
  const own = new Set(Object.keys(rec.text));
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const f = queue.shift();
    const t = rec.text[f];
    const req = requires(t);
    for (const o of own) {
      if (seen.has(o)) continue;
      const stem = o.replace(/\.(sty|tex|def|cfg|clo|fd|ldf|prf|dfu|ltx|cnf)$/, '');
      if (t.includes(o) || (o.endsWith('.sty') && req.has(stem)) || new RegExp('\\\\(?:@?input|InputIfFileExists)\\s*\\{?' + stem.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + '[\\s}]').test(t)) {
        seen.add(o);
        queue.push(o);
      }
    }
  }
  return seen;
}

/* a node is a package (listings → listings.sty) or a file \input by one
   (simplekv.tex, for chemfig) */
const fileOf = (key) => (/\.(tex|def|cfg)$/.test(key) ? key : key + '.sty');
/* TeX Live's index lists simplekv.sty but not the simplekv.tex beside it */
const archiveOf = (key) => fileToPackage[fileOf(key)] || fileToPackage[key.replace(/\.(tex|def|cfg)$/, '') + '.sty'];
const warnings = [];

(async () => {
  /* one node per .sty: its archive, the packages it reaches that we fetch
     (deps), and those the engine has (needs) */
  const node = {};
  const unsupported = {};
  const primary = [...WANTED];
  const queue = primary.map((n) => [n, true]);
  while (queue.length) {
    const [name, fetchNew, hint] = queue.shift();
    if (node[name]) {
      /* first met as a side file, now needed by a package asked for */
      if (fetchNew && !node[name].primary) { node[name].primary = true; node[name].deps.forEach((d) => queue.push([d, true, node[d] && node[d].archive])); }
      continue;
    }
    if (unsupported[name]) continue;
    if (engineTex.has(fileOf(name))) { if (WANTED.includes(name)) warnings.push(name + ': already in the engine'); continue; }
    const archive = hint || archiveOf(name);
    const why = UNSUPPORTED[name] || UNSUPPORTED[archive] || (!archive && 'not in TeX Live');
    if (why) { if (fetchNew) unsupported[name] = why; continue; }
    if (!fetchNew && !archives[archive]) continue;
    const rec = await fetchArchive(archive);
    if (rec.bad) { if (fetchNew) unsupported[name] = rec.bad + ' [' + archive + ']'; continue; }
    if (!rec.text[fileOf(name)]) { unsupported[name] = archive + ' has no ' + fileOf(name); continue; }
    const deps = new Set(), needs = new Set();
    reach(rec, fileOf(name)).forEach((f) => {
      requires(rec.text[f]).forEach((r) => {
        if (r === name || /-\d{4}-\d{2}-\d{2}$/.test(r)) return;   /* a LaTeX rollback release */
        if (engineTex.has(r + '.sty')) needs.add(r);
        else if (!rec.text[r + '.sty']) deps.add(r);
      });
      inputs(rec.text[f]).forEach((i) => {
        const file = /\.[a-z]+$/.test(i) ? i : i + '.tex';
        if (!rec.text[file] && !rec.text[i] && !engineTex.has(file) && !engineTex.has(i) && archiveOf(file) && archiveOf(file) !== archive) deps.add(file);   /* not an optional .cfg of its own */
      });
    });
    /* its sister .sty files are reached through \RequirePackage like any other */
    const sisters = new Set();
    reach(rec, fileOf(name)).forEach((f) => { if (f.endsWith('.sty') && f !== fileOf(name)) { deps.add(f.slice(0, -4)); sisters.add(f.slice(0, -4)); } });
    node[name] = { archive, deps, needs, primary: fetchNew };
    deps.forEach((d) => queue.push([d, fetchNew, sisters.has(d) ? archive : null]));
    /* the archive's other .sty files are loadable names too, if what they
       need is already here */
    rec.files.forEach((f) => { if (f.name.endsWith('.sty')) queue.push([f.name.slice(0, -4), false, archive]); });
    process.stdout.write('.');
  }
  process.stdout.write('\n');

  /* a package's files: its archive's, and those of every archive it needs */
  function closure(name) {
    const names = new Set(), arcs = new Set(), needs = new Set(), missing = new Set(), files = new Set();
    (function walkNode(n) {
      if (names.has(n)) return;
      names.add(n);
      const x = node[n];
      arcs.add(x.archive);
      reach(archives[x.archive], fileOf(n)).forEach((f) => files.add(f));
      x.needs.forEach((p) => needs.add(p));
      x.deps.forEach((d) => { if (node[d]) walkNode(d); else missing.add(d); });
    })(name);
    /* and the files TeX finds by name at run time: .cfg, .def, .fd, .tex, … */
    arcs.forEach((a) => archives[a].files.forEach((f) => { if (!/\.sty$/.test(f.name) && !/\.(mp4|avi|mov)$/.test(f.name)) files.add(f.name); }));
    return { arcs, needs, missing, files };
  }

  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  const used = new Set(Object.values(node).map((x) => x.archive));
  const owner = {};
  for (const a of used) {
    for (const f of archives[a].files) {
      if (owner[f.name] && owner[f.name] !== a) { warnings.push(f.name + ' is in both ' + owner[f.name] + ' and ' + a + '; kept ' + owner[f.name]); continue; }
      owner[f.name] = a;
    }
  }

  const manifest = {};
  for (const n of Object.keys(node).sort()) {
    if (fileOf(n) !== n + '.sty' || owner[n + '.sty'] !== node[n].archive) continue;
    const { arcs, needs, missing, files: reached } = closure(n);
    if (missing.size && !node[n].primary) continue;   /* a side file of an archive, needing more */
    if (missing.size) warnings.push(n + ' may load ' + [...missing].map((d) => d + ' (' + (unsupported[d] || 'not fetched') + ')').join(', '));
    const files = [];
    arcs.forEach((a) => archives[a].files.forEach((f) => { if (owner[f.name] === a && reached.has(f.name)) files.push(f.name); }));
    /* engine packages whose bundle the engine would not load on its own:
       it picks bundles from the document's \usepackage lines, and these are
       named only inside our files (js/compile.js tells it about them) */
    const extra = [...needs].filter((p) => outsideAlways(p)).sort();
    manifest[n] = { archive: node[n].archive, from: archives[node[n].archive].from, files: files.sort() };
    if (arcs.size > 1) manifest[n].with = [...arcs].filter((a) => a !== node[n].archive).sort();
    if (extra.length) manifest[n].needs = extra;
  }
  /* only the files some package uses */
  const src = {};
  used.forEach((a) => archives[a].files.forEach((f) => { if (owner[f.name] === a) src[f.name] = f.src; }));
  new Set(Object.values(manifest).flatMap((e) => e.files)).forEach((f) => fs.copyFileSync(src[f], path.join(dest, f)));
  fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.rmSync(tmp, { recursive: true, force: true });

  const kb = fs.readdirSync(dest).reduce((s, f) => s + fs.statSync(path.join(dest, f)).size, 0) / 1024;
  const wanted = WANTED.filter((n) => manifest[n]);
  console.log('Included (' + wanted.length + ' of ' + WANTED.length + ' asked for; ' + Object.keys(manifest).length + ' loadable names):');
  wanted.forEach((n) => console.log('  ' + n.padEnd(16) + manifest[n].archive + (manifest[n].with ? '  + ' + manifest[n].with.join(', ') : '') + (manifest[n].needs ? '  [needs ' + manifest[n].needs.join(', ') + ']' : '')));
  const extraArchives = [...used].filter((a) => !wanted.some((n) => manifest[n].archive === a));
  if (extraArchives.length) console.log('Fetched as dependencies: ' + extraArchives.join(', '));
  console.log('Unsupported:');
  Object.keys(unsupported).sort().forEach((n) => console.log('  ' + n.padEnd(16) + unsupported[n]));
  if (warnings.length) { console.log('Notes:'); [...new Set(warnings)].forEach((w) => console.log('  ' + w)); }
  console.log('engine/texmf/pkg/  ' + fs.readdirSync(dest).length + ' files, ' + kb.toFixed(0) + ' kB');
})().catch((e) => { console.error('fetch-packages: ' + e.stack); process.exit(1); });
