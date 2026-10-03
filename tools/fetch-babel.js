/* Fetch babel's language files for the languages PaperTeX offers.

   The engine's TeX Live subset has babel itself but none of its languages,
   so any document not in English failed to compile in the browser. These
   are the ready-to-use .ldf files from TeX Live's own package archives,
   kept under engine/texmf/babel/ with a manifest, and handed to the
   compiler only for a document that asks for that language.

   All are LPPL-licensed; each file keeps its notice.
   Needs `tar` with xz support (Windows 10+, macOS, Linux all have it).

   Run:  node tools/fetch-babel.js */
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

/* language option (as in Document → Language) → TeX Live package */
const LANGS = {
  turkish: 'babel-turkish',
  ngerman: 'babel-german',
  french: 'babel-french',
  spanish: 'babel-spanish',
  italian: 'babel-italian',
  portuguese: 'babel-portuges'
};
const MIRROR = 'https://mirror.ctan.org/systems/texlive/tlnet/archive/';
const dest = path.join(__dirname, '..', 'engine', 'texmf', 'babel');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'papertex-babel-'));

function get(url, out) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).toString(), out));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(url + ': HTTP ' + res.statusCode)); }
      const f = fs.createWriteStream(out);
      res.pipe(f);
      f.on('finish', () => f.close(resolve));
    }).on('error', reject);
  });
}

(async () => {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  const manifest = {};
  for (const [lang, pkg] of Object.entries(LANGS)) {
    const archive = path.join(tmp, pkg + '.tar.xz');
    await get(MIRROR + pkg + '.tar.xz', archive);
    const dir = path.join(tmp, pkg);
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('tar', ['-xf', archive, '-C', dir]);
    const runtime = path.join(dir, 'tex', 'generic', pkg);
    const files = fs.readdirSync(runtime).filter((f) => /\.(ldf|cfg|def)$/.test(f)).sort();
    if (!files.length) throw new Error(pkg + ': no language files found');
    files.forEach((f) => fs.copyFileSync(path.join(runtime, f), path.join(dest, f)));
    manifest[lang] = files;
    console.log('  ' + lang.padEnd(11) + files.join(', '));
  }
  fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.rmSync(tmp, { recursive: true, force: true });
  const kb = fs.readdirSync(dest).reduce((s, f) => s + fs.statSync(path.join(dest, f)).size, 0) / 1024;
  console.log('engine/texmf/babel/  ' + Object.keys(manifest).length + ' languages, ' + kb.toFixed(0) + ' kB');
})().catch((e) => { console.error('fetch-babel: ' + e.message); process.exit(1); });
