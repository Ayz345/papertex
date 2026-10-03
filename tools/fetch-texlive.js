/* Download the wasm engine and TeX Live bundles into engine/texlive/ so the
   desktop app compiles with no network at all — and so a deployed site does
   not depend on someone else's CDN staying up.

   About 220 MB, once.   Run:  node tools/fetch-texlive.js */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const CDN = 'https://cdn.siglum.org/tl2025/';
const BUNDLE = 'siglum-bundles-v0.1.0.tar.gz';
const dest = path.join(__dirname, '..', 'engine', 'texlive');
fs.mkdirSync(dest, { recursive: true });

function get(url, out) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(out);
    const name = path.basename(out);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        return resolve(get(res.headers.location, out));
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error(name + ': HTTP ' + res.statusCode));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let seen = 0, lastShown = 0;
      res.on('data', (c) => {
        seen += c.length;
        if (seen - lastShown > 4e6 || seen === total) {
          lastShown = seen;
          const pct = total ? ' (' + Math.round((seen / total) * 100) + '%)' : '';
          process.stdout.write('\r  ' + name + ' ' + (seen / 1048576).toFixed(0) + ' MB' + pct + '   ');
        }
      });
      res.pipe(file);
      file.on('finish', () => { file.close(() => { process.stdout.write('\n'); resolve(); }); });
    }).on('error', (e) => { file.close(); reject(e); });
  });
}

(async () => {
  console.log('Fetching the LaTeX engine into engine/texlive/ …');
  await get(CDN + 'busytex.wasm', path.join(dest, 'busytex.wasm'));
  await get(CDN + 'busytex.js', path.join(dest, 'busytex.js'));

  const tarball = path.join(dest, BUNDLE);
  await get(CDN + BUNDLE, tarball);

  process.stdout.write('  extracting bundles … ');
  execFileSync('tar', ['-xzf', tarball, '-C', dest], { stdio: 'inherit' });
  fs.rmSync(tarball, { force: true });
  console.log('done');

  const manifest = path.join(dest, 'bundles', 'file-manifest.json');
  if (!fs.existsSync(manifest)) {
    console.error('\nThe bundles did not land at engine/texlive/bundles/.');
    console.error('Look inside engine/texlive/ and move the bundles folder there.');
    process.exit(1);
  }
  console.log('\nengine/texlive/ is ready — the app will now compile offline.');
})().catch((e) => {
  console.error('\nFailed: ' + e.message);
  console.error('The app still compiles using the CDN; this only adds offline use.');
  process.exit(1);
});
