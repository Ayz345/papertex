/* Inline every stylesheet and script into one self-contained page.
   Run:  node build.js
   Produces papertex.html (double-click it, or host it anywhere). */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = __dirname;
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

html = html.replace(/[ \t]*<link rel="stylesheet" href="([^"]+)">\n?/g, (_, href) => {
  const css = fs.readFileSync(path.join(root, href), 'utf8');
  return '<style>\n/* ' + href + ' */\n' + css + '</style>\n';
});

/* the favicon too: the single file must not need anything beside it */
const iconUrl = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'desktop', 'papertex.png')).toString('base64');
html = html.replace(/(<link rel="icon" href=")desktop\/papertex\.png(")/, (_, a, b) => a + iconUrl + b);

const hashes = [];
html = html.replace(/[ \t]*<script src="([^"]+)"><\/script>\n?/g, (_, src) => {
  const js = fs.readFileSync(path.join(root, src), 'utf8');
  if (/<\/script/i.test(js)) throw new Error(src + ' contains "</script" — escape it as "<\\/script"');
  const body = '\n/* ' + src + ' */\n' + js;
  hashes.push("'sha256-" + crypto.createHash('sha256').update(body, 'utf8').digest('base64') + "'");
  return '<script>' + body + '</script>\n';
});

/* Inline scripts are allowed by their exact hashes, never wholesale: an
   injected <script> has no matching hash and does not run. 'self' stays for
   the compiler, which is loaded from engine/ only when it is needed. */
const csp = /(<meta http-equiv="Content-Security-Policy" content="[^"]*script-src 'self'(?: 'wasm-unsafe-eval')?)/;
if (!csp.test(html)) throw new Error('index.html has no Content-Security-Policy with script-src \'self\'');
html = html.replace(csp, (m) => m + ' ' + hashes.join(' '));

fs.writeFileSync(path.join(root, 'papertex.html'), html);

/* A second flavour for publishing: no <!DOCTYPE>/<html>/<head>/<body>, since
   an Artifact supplies that skeleton itself. */
const inner = html
  .replace(/^[\s\S]*?<head>/, '')
  .replace(/<\/head>\s*<body>/, '')
  .replace(/<\/body>\s*<\/html>\s*$/, '')
  .replace(/<meta[^>]*>\s*/g, '')
  .trim();
fs.writeFileSync(path.join(root, 'papertex.artifact.html'), inner + '\n');

const kb = (s) => (fs.statSync(path.join(root, s)).size / 1024).toFixed(0) + ' kB';
console.log('papertex.html          ' + kb('papertex.html'));
console.log('papertex.artifact.html ' + kb('papertex.artifact.html'));
