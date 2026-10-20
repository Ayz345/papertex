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

/* Patches. Each one names the exact text it changes and fails loudly if a
   new engine version no longer contains it, so an upgrade cannot drop a
   patch without anyone noticing. */
function patch(file, what, from, to) {
  const p = path.join(out, file);
  const src = fs.readFileSync(p, 'utf8');
  if (!src.includes(from)) throw new Error('bundle-engine: cannot apply "' + what + '" to ' + file + ' — the engine changed; re-check the patch');
  fs.writeFileSync(p, src.split(from).join(to));
}

/* 1. TeX's own log on failure. The worker reads document.log only to look
      for missing packages and never sends it back, so the app could say
      nothing better than "TeX gave no reason". Read it before the worker
      drops its file system, and pass it on. */
patch('siglum.worker.js', 'texLog: read',
  '    Module = null;\n    FS = null;',
  '    let texLog = null;   /* PaperTeX patch: TeX\'s log when the compile failed */\n' +
  '    if (!compileSuccess && FS) {\n' +
  '        try { texLog = new TextDecoder().decode(FS.readFile(\'/document.log\')); } catch (e) { texLog = null; }\n' +
  '    }\n' +
  '    Module = null;\n    FS = null;');
patch('siglum.worker.js', 'texLog: send',
  '            exitCode: lastExitCode,\n            auxFilesToCache: auxFiles,',
  '            exitCode: lastExitCode,\n            texLog,\n            auxFilesToCache: auxFiles,');
patch('siglum.js', 'texLog: pass on',
  '                error: result.error,\n                exitCode: result.exitCode,\n                log: result.log',
  '                error: result.error,\n                exitCode: result.exitCode,\n                log: result.log,\n                texLog: result.texLog');

/* 2. No package proxy unless one is configured. With none set, the engine
      falls back to http://localhost:8787 — on a published site, every
      visitor's browser would probe a port on their own machine whenever a
      package was missing. Without a proxy the fetcher now does nothing. */
patch('siglum.js', 'no default proxy',
  '      this.proxyUrl = options.proxyUrl || "http://localhost:8787";\n      this.bundlesUrl = options.bundlesUrl || this.proxyUrl + "/bundles";',
  '      this.proxyUrl = options.proxyUrl || null;   /* PaperTeX patch: no implicit localhost proxy */\n' +
  '      this.bundlesUrl = options.bundlesUrl || (this.proxyUrl ? this.proxyUrl + "/bundles" : null);');
patch('siglum.js', 'no proxy: no index',
  '    async lookupPackageForFile(fileName) {\n      const index',
  '    async lookupPackageForFile(fileName) {\n      if (!this.bundlesUrl) return null;\n      const index');
patch('siglum.js', 'no proxy: no fetch',
  '    async fetchPackage(packageName, options = {}) {\n',
  '    async fetchPackage(packageName, options = {}) {\n      if (!this.proxyUrl) return null;\n');

/* Keep the licence with the code we redistribute. */
fs.copyFileSync(
  path.join(root, 'node_modules/@siglum/engine/LICENSE'),
  path.join(out, 'LICENSE-siglum.txt')
);

/* 3. busytex.js from the site itself is loaded by its own address. The
      engine always fetched it and ran it from a blob: URL, which the site's
      Content-Security-Policy header refuses (script-src has no blob:), so
      compiling failed on any host that sends the header. A copy on another
      origin still goes through a blob (tools/build-web.js then allows
      blob: for that build). */
patch('siglum.worker.js', 'busytex.js by address',
  '    if (!busytexScriptLoaded) {\n        const response = await fetch(jsUrl);',
  '    if (!busytexScriptLoaded && new URL(jsUrl, self.location.href).origin === self.location.origin) {\n' +
  '        importScripts(jsUrl);   /* PaperTeX patch: same origin, no blob: needed */\n' +
  '        busytexScriptLoaded = true;\n' +
  '    }\n' +
  '    if (!busytexScriptLoaded) {\n        const response = await fetch(jsUrl);');

/* 4. A package's own packages decide which bundles load, too. The engine
      picks TeX Live bundles from the document's \usepackage lines and the
      packages those need (package-deps.json), but read that file as if its
      entries sat at the top level, when they are under "packages" — so it
      never followed them, and \usepackage{hyperref} alone stopped at
      "File `hycolor.sty' not found" (hycolor is in another bundle). */
patch('siglum.js', 'follow package deps',
  '        const pkgDeps = this.packageDeps?.[pkg] || [];',
  '        const pkgDeps = (this.packageDeps?.packages || this.packageDeps)?.[pkg] || [];   /* PaperTeX patch */');

/* 5. The format (the preamble, precompiled after a good compile) is built
      with the document's own files too. It was built without them, so for a
      document whose preamble loads a package handed over that way (babel's
      languages, engine/texmf/pkg/) it failed, retried for some ten seconds,
      and the next compile waited for it — every time. */
patch('siglum.js', 'format: pass files',
  '                this.generateFormat(source, { engine }).then(',
  '                this.generateFormat(source, { engine, additionalFiles: options.additionalFiles }).then(');
patch('siglum.js', 'format: use files',
  '      const ctanFiles = this.ctanFetcher.getCachedFiles();\n      this._log("Generating format file...");',
  '      const ctanFiles = this.ctanFetcher.getCachedFiles();\n' +
  '      for (const [filename, content] of Object.entries(options.additionalFiles || {})) {   /* PaperTeX patch */\n' +
  '        ctanFiles["/" + filename] = typeof content === "string" ? new TextEncoder().encode(content) : content;\n' +
  '      }\n' +
  '      this._log("Generating format file...");');

const kb = (f) => (fs.statSync(path.join(out, f)).size / 1024).toFixed(0) + ' kB';
console.log('engine/siglum.js         ' + kb('siglum.js'));
console.log('engine/siglum.worker.js  ' + kb('siglum.worker.js'));
