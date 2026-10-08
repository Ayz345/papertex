/* Is dist/web/ built from the sources as they are now?

     npm run check:dist

   dist/web/ is a build output, easy to forget: a source changed after the
   last `npm run build:web` means the site would ship the old version. This
   lists every source file newer than the build and fails if there is one;
   run it before uploading dist/web/. */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const built = path.join(root, 'dist', 'web', 'app.html');

if (!fs.existsSync(built)) {
  console.error('dist/web/ has not been built — run  npm run build:web');
  process.exit(1);
}
const at = fs.statSync(built).mtimeMs;

/* everything the site is made from */
const SOURCES = ['app.html', 'index.html', 'about.html', 'build.js', 'tools/build-web.js'];
const DIRS = [['js', /\.js$/], ['css', /\.css$/], ['fonts', /\.(woff2|json|txt)$/], ['engine', /\.js$/]];

function walk(dir, re, list) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'texlive') walk(p, re, list); }
    else if (re.test(e.name)) list.push(p);
  });
}
const files = SOURCES.map((f) => path.join(root, f)).filter((f) => fs.existsSync(f));
DIRS.forEach(([d, re]) => walk(path.join(root, d), re, files));

const newer = files.filter((f) => fs.statSync(f).mtimeMs > at + 1000)
  .map((f) => path.relative(root, f).replace(/\\/g, '/'));

if (newer.length) {
  console.error('dist/web/ is older than its sources — run  npm run build:web  before uploading.');
  console.error('Changed since the build (' + new Date(at).toLocaleString() + '):');
  newer.forEach((f) => console.error('  ' + f));
  process.exit(1);
}
console.log('dist/web/ is up to date with its ' + files.length + ' source files.');
