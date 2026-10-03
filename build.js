/* Inline every stylesheet and script into one self-contained page.
   Run:  node build.js
   Produces papertex.html (double-click it, or host it anywhere). */
const fs = require('fs');
const path = require('path');

const root = __dirname;
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

html = html.replace(/[ \t]*<link rel="stylesheet" href="([^"]+)">\n?/g, (_, href) => {
  const css = fs.readFileSync(path.join(root, href), 'utf8');
  return '<style>\n/* ' + href + ' */\n' + css + '</style>\n';
});

html = html.replace(/[ \t]*<script src="([^"]+)"><\/script>\n?/g, (_, src) => {
  const js = fs.readFileSync(path.join(root, src), 'utf8');
  return '<script>\n/* ' + src + ' */\n' + js + '</script>\n';
});

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
