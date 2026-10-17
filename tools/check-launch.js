/* Is dist/web/ fit to go live?

     npm run check:launch

   check:dist says the build is current; this says it is a launch build.
   It fails on what a test build gets away with: TeX Live from the public
   CDN, no site address, parts of the About page still to write. Each
   failure says what to do. */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const web = path.join(root, 'dist', 'web');
const read = (f) => (fs.existsSync(path.join(web, f)) ? fs.readFileSync(path.join(web, f), 'utf8') : null);
const problems = [];

/* 1. built from the sources as they are now */
const dist = spawnSync(process.execPath, [path.join(__dirname, 'check-dist.js')], { encoding: 'utf8' });
if (dist.status !== 0) {
  process.stderr.write(dist.stderr || dist.stdout);
  process.exit(1);
}

const app = read('app.html');
const engine = (/<meta name="papertex-engine" content="([^"]*)"/.exec(app) || [])[1];

/* 2. TeX Live from somewhere the site controls */
if (!engine || engine === 'cdn') {
  problems.push('TeX Live comes from the public CDN (cdn.siglum.org). Rebuild with\n' +
    '      npm run build:web -- --with-texlive --site=…        (host allows files over 25 MB)\n' +
    '      npm run build:web -- --engine=https://… --site=…    (TeX Live on your own asset host)');
} else if (engine === 'engine/texlive') {
  for (const f of ['busytex.wasm', 'busytex.js', 'bundles/file-manifest.json']) {
    if (!fs.existsSync(path.join(web, 'engine', 'texlive', f))) problems.push('dist/web/engine/texlive/' + f + ' is missing — run  npm run fetch-texlive  and rebuild.');
  }
}

/* 3. the site's address, for canonical links, link previews and the sitemap */
const pages = { 'index.html': read('index.html'), 'app.html': app, 'about.html': read('about.html') };
const missing = Object.keys(pages).filter((p) => !/<link rel="canonical"/.test(pages[p] || ''));
if (missing.length) problems.push('No site address in ' + missing.join(', ') + ' — rebuild with --site=https://your-address');
for (const f of ['404.html', 'robots.txt', 'sitemap.xml', 'img/og-card.png', '_headers']) {
  if (read(f) === null) problems.push('dist/web/' + f + ' is missing — rebuild' + (f === 'sitemap.xml' ? ' with --site=…' : ''));
}

/* 4. nothing left for the author to write */
if (/class="todo"/.test(pages['about.html'] || '')) {
  problems.push('about.html still has dashed "to write" boxes — fill them in (or remove them) in about.html and rebuild.');
}

if (problems.length) {
  console.error('Not ready to launch:\n');
  problems.forEach((p) => console.error('  ✗ ' + p + '\n'));
  process.exit(1);
}
console.log('dist/web/ is a launch build: current, TeX Live from ' + engine + ', address set, nothing left to write.');
console.log('Still check by hand after uploading: open the site, write something, press Make PDF.');
