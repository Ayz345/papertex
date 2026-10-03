/* Assemble the website: everything a static host needs, in dist/web/.

     node tools/build-web.js                      the app; TeX Live from the public CDN
     node tools/build-web.js --with-texlive       … and TeX Live served from the site itself
     node tools/build-web.js --engine=https://assets.example.com/tl2025
                                                  … TeX Live from your own asset host

   The public CDN is a fallback, not a plan: a site that relies on it stops
   compiling the day it goes away. See DEPLOY.md.

   Output:
     index.html            the home page (index.html), with the files it uses
     app.html              the editor: the single-file build (papertex.html),
                           engine location and Content-Security-Policy set for
                           this deployment; hosts serve it at /app
     about.html            the About page, with the files it uses
     engine/               the compiler's script and worker (+ texlive/ if asked)
     _headers              security and caching headers, in the format Netlify
                           and Cloudflare Pages read; other hosts: copy them over
     LICENSES/             the third-party licences the app ships under */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist', 'web');
const args = process.argv.slice(2);
const withTexlive = args.includes('--with-texlive');
const engineArg = (args.find((a) => a.startsWith('--engine=')) || '').slice(9).replace(/\/+$/, '');
const CDN_ORIGIN = 'https://cdn.siglum.org';
/* the smallest per-file limit among common static hosts (Cloudflare Pages) */
const FILE_LIMIT = 25 * 1024 * 1024;

if (withTexlive && engineArg) fail('Use --with-texlive or --engine, not both.');
if (engineArg && !/^https:\/\/[^/]+/.test(engineArg)) fail('--engine must be an https:// URL.');

function fail(msg) { console.error('build-web: ' + msg); process.exit(1); }
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.name.startsWith('._') || e.name === '.DS_Store') continue;   /* macOS metadata */
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
}
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc); else acc.push({ p, size: fs.statSync(p).size });
  }
  return acc;
}
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';

/* 1. a fresh single-file build */
execFileSync(process.execPath, [path.join(root, 'build.js')], { stdio: 'inherit' });

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'engine'), { recursive: true });

/* 2. where the compiler finds TeX Live, and the one origin it may talk to */
let html = fs.readFileSync(path.join(root, 'papertex.html'), 'utf8');
let engineOrigin;
if (engineArg) engineOrigin = new URL(engineArg).origin;
else if (withTexlive) engineOrigin = null;               /* same origin: 'self' covers it */
else engineOrigin = CDN_ORIGIN;

html = html.replace(/(<meta name="papertex-engine" content=")[^"]*(")/, (_, a, b) => a + (engineArg || '') + b);
const cspRe = /(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/;
const cspMatch = cspRe.exec(html);
if (!cspMatch) fail('papertex.html has no Content-Security-Policy meta tag');
const csp = cspMatch[2].replace(/connect-src [^;]*/, 'connect-src \'self\'' + (engineOrigin ? ' ' + engineOrigin : ''));
html = html.replace(cspRe, (_, a, b, c) => a + csp + c);
fs.writeFileSync(path.join(out, 'app.html'), html);

/* 3. the compiler, and TeX Live if it is to be served from here */
for (const f of ['siglum.js', 'siglum.worker.js']) {
  fs.copyFileSync(path.join(root, 'engine', f), path.join(out, 'engine', f));
}
/* babel's language files, fetched at compile time for non-English documents */
copyDir(path.join(root, 'engine', 'texmf', 'babel'), path.join(out, 'engine', 'texmf', 'babel'));
if (withTexlive) {
  const tl = path.join(root, 'engine', 'texlive');
  if (!fs.existsSync(path.join(tl, 'bundles', 'file-manifest.json'))) {
    fail('engine/texlive/ is missing or incomplete — run  npm run fetch-texlive  first.');
  }
  copyDir(tl, path.join(out, 'engine', 'texlive'));
}

/* 3b. the plain pages, home and About, as they are, with every local file
   they point to (stylesheets, scripts, images, and what the stylesheets
   point to in turn) */
const copied = new Set();
function copyAsset(rel, fromDir) {
  rel = rel.split(/[?#]/)[0];
  /* other pages, folders ("./"), other sites and in-page anchors are links, not files */
  if (!rel || rel === '.' || /^(?:[a-z]+:|\/\/|\/)/i.test(rel) || /(?:\.html|\/)$/i.test(rel)) return;
  const abs = path.normalize(path.join(fromDir, rel));
  if (!abs.startsWith(root + path.sep)) fail(rel + ' points outside the project');
  const key = path.relative(root, abs);
  if (copied.has(key)) return;
  if (!fs.existsSync(abs)) fail(key.split(path.sep).join('/') + ' is referenced but does not exist');
  copied.add(key);
  fs.mkdirSync(path.dirname(path.join(out, key)), { recursive: true });
  fs.copyFileSync(abs, path.join(out, key));
  if (/\.css$/i.test(abs)) {
    const css = fs.readFileSync(abs, 'utf8');
    for (const m of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) copyAsset(m[1], path.dirname(abs));
    for (const m of css.matchAll(/@import\s+['"]([^'"]+)['"]/g)) copyAsset(m[1], path.dirname(abs));
  }
}
for (const page of ['index.html', 'about.html']) {
  const src = fs.readFileSync(path.join(root, page), 'utf8');
  fs.writeFileSync(path.join(out, page), src);
  for (const m of src.matchAll(/\s(?:src|href|poster)="([^"]+)"/g)) copyAsset(m[1], root);
  for (const m of src.matchAll(/\ssrcset="([^"]+)"/g)) {
    m[1].split(',').forEach((c) => copyAsset(c.trim().split(/\s+/)[0], root));
  }
}
if (/class="todo"/.test(fs.readFileSync(path.join(out, 'about.html'), 'utf8'))) {
  console.log('\n  NOTE: about.html still has parts for you to write (the dashed boxes).');
}
if (/PLACEHOLDER home page/.test(fs.readFileSync(path.join(out, 'index.html'), 'utf8'))) {
  console.log('\n  NOTE: index.html is still the placeholder home page.');
}

/* 4. licences of what the app ships */
fs.mkdirSync(path.join(out, 'LICENSES'), { recursive: true });
fs.copyFileSync(path.join(root, 'fonts', 'LICENSE-KaTeX.txt'), path.join(out, 'LICENSES', 'KaTeX-fonts.txt'));
fs.copyFileSync(path.join(root, 'engine', 'LICENSE-siglum.txt'), path.join(out, 'LICENSES', 'siglum-engine.txt'));
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(out, 'LICENSES', 'PaperTeX.txt'));
/* the home page's libraries: js/vendor/NAME-LICENSE.txt ships as LICENSES/NAME.txt */
const vendor = path.join(root, 'js', 'vendor');
if (fs.existsSync(vendor)) {
  for (const f of fs.readdirSync(vendor)) {
    const m = /^(.+?)[-_.]?LICEN[CS]E(?:\.txt|\.md)?$/i.exec(f);
    if (m) fs.copyFileSync(path.join(vendor, f), path.join(out, 'LICENSES', m[1] + '.txt'));
  }
}

/* 5. headers: the same policy as the page, plus what only a header can say */
const headers = [
  '/*',
  '  Content-Security-Policy: ' + csp + "; frame-ancestors 'self'",
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: no-referrer',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
  '  Cross-Origin-Opener-Policy: same-origin',
  '',
  /* pages and their unversioned files: always ask whether they changed */
  ...['/', '/index.html', '/app', '/app.html', '/about', '/about.html', '/css/*', '/js/*', '/desktop/*']
    .flatMap((p) => [p, '  Cache-Control: no-cache', '']),
  '/engine/*',
  '  Cache-Control: public, max-age=86400',
  '',
  '/engine/texlive/*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '',
  '/*.wasm',
  '  Content-Type: application/wasm',
  ''
].join('\n');
fs.writeFileSync(path.join(out, '_headers'), headers);

/* 6. what was built, and anything a host might refuse */
const files = walk(out);
const total = files.reduce((s, f) => s + f.size, 0);
const big = files.filter((f) => f.size > FILE_LIMIT);
console.log('\ndist/web/  ' + files.length + ' files, ' + mb(total));
console.log('  TeX Live: ' + (engineArg ? engineArg : withTexlive ? 'served from this site (engine/texlive/)' :
  'public CDN fallback — fine for testing, not for launch (see DEPLOY.md)'));
if (big.length) {
  console.log('\n  Larger than 25 MB, which some hosts (Cloudflare Pages) refuse per file:');
  big.forEach((f) => console.log('    ' + path.relative(out, f.p).replace(/\\/g, '/') + '  ' + mb(f.size)));
  console.log('  On such a host, put engine/texlive/ on object storage and build with --engine=<its URL>.');
}
console.log('\nUpload the contents of dist/web/ to any static host. Test it locally with:');
console.log('  python -m http.server 8790 --directory dist/web');
