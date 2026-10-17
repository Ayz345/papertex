/* PaperTeX — reads a .zip (an Overleaf project download) into its files.

     PT.unzip(arrayBuffer) → Promise<{ 'path/name.ext': Uint8Array, … }>

   Only what a project archive uses: stored and deflated entries, read from
   the central directory (sizes there are right even when the local headers
   leave them out). Deflate is the browser's own (DecompressionStream). No
   ZIP64, no encryption: such an archive is refused with an error. */
(function () {
  'use strict';

  function u16(d, o) { return d[o] | (d[o + 1] << 8); }
  function u32(d, o) { return (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0; }

  function inflate(bytes) {
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('This browser cannot unpack .zip files'));
    var ds = new DecompressionStream('deflate-raw');
    var out = new Blob([bytes]).stream().pipeThrough(ds);
    return new Response(out).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  function unzip(buf) {
    var d = new Uint8Array(buf);
    /* the end-of-central-directory record, searched from the end (a
       comment may follow it) */
    var eocd = -1;
    for (var i = d.length - 22; i >= Math.max(0, d.length - 22 - 65535); i--) {
      if (u32(d, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return Promise.reject(new Error('Not a .zip file'));
    var count = u16(d, eocd + 10), at = u32(d, eocd + 16);
    if (count === 0xffff || at === 0xffffffff) return Promise.reject(new Error('This .zip is too large (ZIP64)'));
    var jobs = [], files = {};
    for (var n = 0; n < count; n++) {
      if (u32(d, at) !== 0x02014b50) return Promise.reject(new Error('A damaged .zip file'));
      var flags = u16(d, at + 8), method = u16(d, at + 10), csize = u32(d, at + 20);
      var nlen = u16(d, at + 28), xlen = u16(d, at + 30), clen = u16(d, at + 32), local = u32(d, at + 42);
      /* names read as UTF-8; Windows' own zip tool writes \ where / belongs */
      var name = new TextDecoder('utf-8').decode(d.subarray(at + 46, at + 46 + nlen)).replace(/\\/g, '/');
      at += 46 + nlen + xlen + clen;
      if (/\/$/.test(name) || /(^|\/)(__MACOSX|\.DS_Store)/.test(name)) continue;   /* folders, macOS litter */
      if (flags & 1) return Promise.reject(new Error('This .zip is password-protected'));
      var start = local + 30 + u16(d, local + 26) + u16(d, local + 28);
      var raw = d.subarray(start, start + csize);
      (function (name, method, raw) {
        if (method === 0) files[name] = raw.slice();
        else if (method === 8) jobs.push(inflate(raw).then(function (b) { files[name] = b; }));
        /* other methods: left out */
      })(name, method, raw);
    }
    return Promise.all(jobs).then(function () { return files; });
  }

  window.PT = window.PT || {};
  window.PT.unzip = unzip;
})();
