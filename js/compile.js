/* PaperTeX — compiling the generated LaTeX to a real PDF, in the browser.

   The engine is @siglum/engine (MIT): TeX Live 2025 built to WebAssembly. It
   is loaded only when someone actually asks for a PDF, so the editor stays
   light. Nothing is uploaded anywhere — the wasm and the TeX Live bundles are
   fetched as static files and cached by the browser. */
(function () {
  'use strict';

  /* Point these at your own host in production. Depending on someone else's
     CDN is how the previous generation of browser LaTeX engines died. */
  var CFG = {
    script: 'engine/siglum.js',
    worker: 'engine/siglum.worker.js',
    wasm: 'https://cdn.siglum.org/tl2025/busytex.wasm',
    bundles: 'https://cdn.siglum.org/tl2025/bundles',
    ctanProxy: null            /* set to your proxy to allow any CTAN package */
  };

  var scriptPromise = null, compiler = null, assetsChecked = false;

  /* The desktop build can carry TeX Live with it. If those files are present,
     use them and never touch the network — see tools/fetch-texlive.js. */
  function useLocalAssetsIfPresent() {
    if (assetsChecked || !window.papertexNative) return Promise.resolve();
    assetsChecked = true;
    return window.papertexNative.engineAssets().then(function (r) {
      if (!r || !r.local) return;
      CFG.wasm = 'engine/texlive/busytex.wasm';
      CFG.bundles = 'engine/texlive/bundles';
    }, function () { /* keep the defaults */ });
  }

  function loadScript(src) {
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise(function (resolve, reject) {
      if (window.Siglum) return resolve(window.Siglum);
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () {
        window.Siglum ? resolve(window.Siglum)
          : reject(new Error('engine loaded but exported nothing'));
      };
      s.onerror = function () { reject(new Error('no-engine')); };
      document.head.appendChild(s);
    });
    return scriptPromise;
  }

  function getCompiler(onProgress) {
    if (compiler) return Promise.resolve(compiler);
    /* A page opened straight off disk has the opaque origin "null", and no
       browser will start a Worker from one. Nothing here can work around it;
       the page has to be served. */
    if (location.protocol === 'file:') return Promise.reject(new Error('file-origin'));
    return useLocalAssetsIfPresent().then(function () {
      return loadScript(CFG.script);
    }).then(function (S) {
      var opts = {
        wasmUrl: CFG.wasm,
        bundlesUrl: CFG.bundles,
        workerUrl: CFG.worker,
        onProgress: onProgress
      };
      if (CFG.ctanProxy) opts.ctanProxyUrl = CFG.ctanProxy;
      compiler = new S.SiglumCompiler(opts);
      return compiler.init().then(function () { return compiler; });
    });
  }

  function dataURLToBytes(u) {
    var parts = String(u).split(','), bin = atob(parts[1]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  /* The engine's TeX Live subset omits a handful of packages we emit; ship
     those alongside the document rather than requiring a CTAN proxy. */
  function sidecarFiles(tex, doc) {
    var files = {}, texmf = window.PT.texmf || {};
    function need(pkg, extras) {
      if (tex.indexOf('{' + pkg + '}') < 0) return;
      (extras || [pkg + '.sty']).forEach(function (f) {
        if (texmf[f]) files[f] = texmf[f];
      });
    }
    need('booktabs');
    need('setspace');
    need('ulem');
    need('soul', ['soul.sty', 'soul-ori.sty', 'soulutf8.sty']);

    (doc.blocks || []).forEach(function (b) {
      if (b.t === 'figure' && b.src && b.filename) {
        try { files[b.filename] = dataURLToBytes(b.src); } catch (e) { /* skip */ }
      }
    });
    return files;
  }

  /* Pull the first real LaTeX error out of the log, which is otherwise
     thousands of lines of font loading. */
  function firstError(log) {
    if (!log) return null;
    var lines = String(log).split('\n');
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].replace(/^\[TeX(?: ERR)?\]\s?/, '');
      if (/^! /.test(l) || /^! LaTeX Error/.test(l)) {
        var msg = l.replace(/^!\s*/, '');
        for (var j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          var nxt = lines[j].replace(/^\[TeX(?: ERR)?\]\s?/, '').trim();
          if (!nxt || /^Type |^See the|^ \.\.\./.test(nxt)) break;
          msg += ' ' + nxt;
        }
        return msg.trim().slice(0, 300);
      }
    }
    return null;
  }

  function compile(tex, doc, onProgress) {
    var logs = [];
    return getCompiler(onProgress).then(function (c) {
      c.onLog = function (m) { logs.push(String(m)); };
      return c.compile(tex, { additionalFiles: sidecarFiles(tex, doc) });
    }).then(function (r) {
      if (r.success && r.pdf) return { pdf: r.pdf };
      return {
        error: firstError(logs.join('\n')) || r.error ||
          'The document did not compile, and TeX gave no reason.'
      };
    });
  }

  window.PT = window.PT || {};
  window.PT.compile = { run: compile, config: CFG };
})();
