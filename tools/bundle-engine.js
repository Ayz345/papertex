/* Bundle @siglum/engine (MIT, TeX Live 2025) into a plain browser global so the
   app can stay build-free classic scripts.

   Produces:
     engine/siglum.js         — IIFE exposing window.Siglum, loaded on demand
     engine/siglum.worker.js  — the compile worker, passed as workerUrl

   The 29 MB wasm and the TeX Live bundles are NOT vendored here; they are
   fetched at runtime from whatever `enginePaths` in js/app.js points at.

   Run:  node tools/bundle-engine.js */
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'engine');
fs.mkdirSync(out, { recursive: true });

esbuild.buildSync({
  entryPoints: [path.join(root, 'node_modules/@siglum/engine/src/index.js')],
  bundle: true,
  format: 'iife',
  globalName: 'Siglum',
  platform: 'browser',
  target: 'es2020',
  outfile: path.join(out, 'siglum.js'),
  legalComments: 'inline',
  alias: { 'blake3-wasm/browser.js': path.join(__dirname, 'blake3-stub.js') },
  logLevel: 'warning'
});

/* The worker is self-contained; a bundler build must hand it over by URL
   because import.meta.url no longer points inside the package. */
fs.copyFileSync(
  path.join(root, 'node_modules/@siglum/engine/src/worker.js'),
  path.join(out, 'siglum.worker.js')
);

/* Keep the licence with the code we redistribute. */
fs.copyFileSync(
  path.join(root, 'node_modules/@siglum/engine/LICENSE'),
  path.join(out, 'LICENSE-siglum.txt')
);

const kb = (f) => (fs.statSync(path.join(out, f)).size / 1024).toFixed(0) + ' kB';
console.log('engine/siglum.js         ' + kb('siglum.js'));
console.log('engine/siglum.worker.js  ' + kb('siglum.worker.js'));
