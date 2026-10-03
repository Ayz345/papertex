/* Zip the runnable app: the single-file page, the compiler it looks for
   beside itself, and the launcher.  Run:  npm run package

   Staged in dist/app/ first so the zip holds exactly that — not TeX Live
   (engine/texlive/, ~220 MB; the app fetches what it needs), not the
   package sources in engine/texmf/ (already inside the page). */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const stage = path.join(root, 'dist', 'app');
const zip = path.join(root, 'papertex-app.zip');

execFileSync(process.execPath, [path.join(root, 'build.js')], { stdio: 'inherit' });

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(path.join(stage, 'engine'), { recursive: true });
fs.copyFileSync(path.join(root, 'papertex.html'), path.join(stage, 'papertex.html'));
fs.copyFileSync(path.join(root, 'start-papertex.cmd'), path.join(stage, 'start-papertex.cmd'));
for (const f of ['siglum.js', 'siglum.worker.js', 'LICENSE-siglum.txt']) {
  fs.copyFileSync(path.join(root, 'engine', f), path.join(stage, 'engine', f));
}
/* babel's language files, fetched at compile time for non-English documents */
fs.mkdirSync(path.join(stage, 'engine', 'texmf', 'babel'), { recursive: true });
for (const f of fs.readdirSync(path.join(root, 'engine', 'texmf', 'babel'))) {
  fs.copyFileSync(path.join(root, 'engine', 'texmf', 'babel', f), path.join(stage, 'engine', 'texmf', 'babel', f));
}
fs.copyFileSync(path.join(root, 'fonts', 'LICENSE-KaTeX.txt'), path.join(stage, 'LICENSE-KaTeX-fonts.txt'));
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(stage, 'LICENSE.txt'));
const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'desktop', 'papertex.png')).toString('base64');
fs.writeFileSync(path.join(stage, 'about.html'),
  fs.readFileSync(path.join(root, 'about.html'), 'utf8').split('desktop/papertex.png').join(icon));

fs.rmSync(zip, { force: true });
/* .NET's zip classes are always present on Windows and need no extra
   dependency just to make one zip. Each entry is named explicitly with
   forward slashes: Compress-Archive and ZipFile.CreateFromDirectory under
   Windows PowerShell both write "engine\siglum.js", which unpacks on macOS
   and Linux as one oddly named file instead of a folder. */
const q = (s) => "'" + s.replace(/'/g, "''") + "'";
const entries = [];
(function list(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) list(p); else entries.push(p);
  }
})(stage);
execFileSync('powershell', ['-NoProfile', '-Command',
  'Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem; ' +
  '$z = [IO.Compression.ZipFile]::Open(' + q(zip) + ", 'Create'); " +
  entries.map((p) => '[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($z, ' + q(p) + ', ' +
    q(path.relative(stage, p).split(path.sep).join('/')) + ')').join('; ') +
  '; $z.Dispose()'
], { stdio: 'inherit' });

console.log('papertex-app.zip  ' + (fs.statSync(zip).size / 1024).toFixed(0) + ' kB');
