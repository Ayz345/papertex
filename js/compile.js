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
  /* the engine takes one progress callback, when it is made; each compile
     brings its own, so the engine's calls are passed to the current one */
  var progressTo = null;

  /* Where the wasm engine and TeX Live come from, first match wins:
       1. <meta name="papertex-engine" content="https://your.host/tl2025"> —
          a deployment that hosts them elsewhere says so here;
       2. engine/texlive/ beside the page — tools/fetch-texlive.js puts them
          there, for the desktop app and for a site that serves them itself;
       3. the public CDN, as a last resort.
     CFG.source records which, for the error message when it fails. */
  CFG.source = 'cdn';
  function useLocalAssetsIfPresent() {
    if (assetsChecked) return Promise.resolve();
    assetsChecked = true;
    var meta = document.querySelector('meta[name="papertex-engine"]');
    var base = meta && meta.content.trim().replace(/\/+$/, '');
    /* a site built with tools/build-web.js says where TeX Live is, so there
       is nothing to probe for (and no 404 in the console when it is the CDN) */
    if (base === 'engine/texlive') { local(); return Promise.resolve(); }
    if (base === 'cdn') return Promise.resolve();
    if (base) {
      CFG.wasm = base + '/busytex.wasm';
      CFG.bundles = base + '/bundles';
      CFG.source = base;
      return Promise.resolve();
    }
    function local() {
      CFG.wasm = 'engine/texlive/busytex.wasm';
      CFG.bundles = 'engine/texlive/bundles';
      CFG.source = 'local';
    }
    if (window.papertexNative) {
      return window.papertexNative.engineAssets().then(function (r) { if (r && r.local) local(); },
        function () { /* keep the defaults */ });
    }
    return fetch('engine/texlive/bundles/file-manifest.json', { method: 'HEAD', cache: 'no-store' })
      .then(function (r) { if (r.ok) local(); }, function () { /* not served here */ });
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
    progressTo = onProgress || null;
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
        onProgress: function (stage, detail) { if (progressTo) progressTo(stage, detail); }
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

  /* babel's language files are not in the engine's TeX Live either. They
     live beside the compiler (engine/texmf/babel/, from tools/fetch-babel.js)
     and are fetched only for a document set in that language. */
  var babelCache = {};
  function fetchText(url) {
    if (!babelCache[url]) {
      babelCache[url] = fetch(url).then(function (r) {
        if (!r.ok) throw new Error(url + ': ' + r.status);
        return r.text();
      });
      babelCache[url].catch(function () { delete babelCache[url]; });
    }
    return babelCache[url];
  }
  function babelFiles(tex) {
    var m = /\\usepackage\[([A-Za-z]+)\]\{babel\}/.exec(tex);
    if (!m) return Promise.resolve({});
    var base = CFG.script.replace(/[^/]*$/, '') + 'texmf/babel/';
    return fetchText(base + 'manifest.json').then(function (txt) {
      var names = (JSON.parse(txt)[m[1]] || []);
      return Promise.all(names.map(function (n) { return fetchText(base + n); })).then(function (bodies) {
        var files = {};
        names.forEach(function (n, i) { files[n] = bodies[i]; });
        return files;
      });
    }).catch(function () { return {}; });   /* then TeX says which file it missed */
  }

  /* Nor are many everyday packages — listings, cleveref, enumitem, float, …
     They live beside the compiler too (engine/texmf/pkg/, from
     tools/fetch-packages.js), and a document gets the files of the packages
     it loads, with what those need. Fetched as bytes: some are Latin-1. */
  var pkgCache = {};
  function fetchBytes(url) {
    if (!pkgCache[url]) {
      pkgCache[url] = fetch(url).then(function (r) {
        if (!r.ok) throw new Error(url + ': ' + r.status);
        return r.arrayBuffer();
      }).then(function (b) { return new Uint8Array(b); });
      pkgCache[url].catch(function () { delete pkgCache[url]; });
    }
    return pkgCache[url];
  }
  function packageFiles(tex) {
    var none = { files: {}, needs: [] };
    var src = tex.replace(/(^|[^\\])%.*$/gm, '$1'), names = {}, m;
    var re = /\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\]\s*)?\{([^}]*)\}/g;
    while ((m = re.exec(src))) {
      m[1].split(',').forEach(function (n) { n = n.trim(); if (n) names[n] = true; });
    }
    if (!Object.keys(names).length) return Promise.resolve(none);
    var base = CFG.script.replace(/[^/]*$/, '') + 'texmf/pkg/';
    return fetchText(base + 'manifest.json').then(function (txt) {
      var manifest = JSON.parse(txt), want = {}, needs = {};
      Object.keys(names).forEach(function (n) {
        var e = Object.prototype.hasOwnProperty.call(manifest, n) && manifest[n];
        if (!e) return;
        e.files.forEach(function (f) { want[f] = true; });
        (e.needs || []).forEach(function (p) { needs[p] = true; });
      });
      var list = Object.keys(want);
      return Promise.all(list.map(function (f) {
        return fetchBytes(base + f).catch(function () { return null; });
      })).then(function (bodies) {
        var files = {};
        list.forEach(function (f, i) { if (bodies[i]) files[f] = bodies[i]; });
        return { files: files, needs: Object.keys(needs) };
      });
    }).catch(function () { return none; });   /* then TeX says which file it missed */
  }

  function compile(tex, doc, onProgress) {
    var logs = [];
    return getCompiler(onProgress).then(function (c) {
      c.onLog = function (m) { logs.push(String(m)); };
      return Promise.all([babelFiles(tex), packageFiles(tex)]).then(function (got) {
        var files = sidecarFiles(tex, doc);
        Object.keys(got[0]).forEach(function (k) { files[k] = got[0][k]; });
        Object.keys(got[1].files).forEach(function (k) { if (!files[k]) files[k] = got[1].files[k]; });
        /* The engine picks which parts of TeX Live to load from the
           \usepackage lines it sees in the document; packages that only our
           files load (amsmath for physics, tikz for chemfig, …) are named to
           it here, after \end{document}, where TeX never reads. */
        if (got[1].needs.length) {
          tex += '\n% Loaded by the packages above, for the engine:\n% \\RequirePackage{' + got[1].needs.join(',') + '}\n';
        }
        return c.compile(tex, { additionalFiles: files });
      });
    }).then(function (r) {
      if (r.success && r.pdf) return { pdf: r.pdf };
      /* TeX's own log (document.log) comes back as texLog — see the patch
         in tools/bundle-engine.js; the callback only carries the engine's
         housekeeping. Reading just that is why every failure used to say
         "TeX gave no reason". */
      var log = (r.texLog || '') + '\n' + (r.log || '') + '\n' + logs.join('\n');
      return {
        /* no log at all: TeX never ran — the engine failed to start (a
           file it needs was refused or missing), not the document */
        error: firstError(log) || r.error || (r.texLog ?
          'The document did not compile, and TeX gave no reason.' :
          'The LaTeX engine did not start, so your document was not typeset. Reload the page and try again; Download .tex still works.'),
        log: log
      };
    });
  }

  window.PT = window.PT || {};
  window.PT.compile = { run: compile, config: CFG };
})();
