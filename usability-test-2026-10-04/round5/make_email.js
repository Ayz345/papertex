/* handout/email.md → handout/email.html: Mira's email as a webmail page, so
   testers can copy its LaTeX inside the browser (they cannot paste from
   outside it). Copy the result into the snapshot's __seed/ folder.

     node make_email.js [snapshot folder] */
const fs = require('fs');
const path = require('path');

const md = fs.readFileSync(path.join(__dirname, 'handout', 'email.md'), 'utf8');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*]+)\*/g, '<i>$1</i>');
const prose = (t) => t.trim().split(/\n\n+/).map((p) => '<p>' + inline(p).replace(/\n/g, '<br>') + '</p>').join('\n');
const parts = md.split(/```latex\n|```\n?/);
const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Inbox — Rod paper: can you finish it?</title>' +
  '<style>body{font:15px/1.6 system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#222;background:#f6f7f9}' +
  '.mail{background:#fff;border:1px solid #ddd;border-radius:8px;padding:20px 28px}' +
  'pre{background:#f2f2f2;border:1px solid #ddd;padding:12px;border-radius:6px;font:13px/1.5 Consolas,monospace;white-space:pre-wrap}' +
  '.bar{font-size:12px;color:#666;margin-bottom:8px}</style></head><body><div class="bar">Webmail · Inbox</div><div class="mail">' +
  prose(parts[0]) + '<pre>' + esc(parts[1].replace(/^ {3}/gm, '')) + '</pre>' + prose(parts[2]) + '</div></body></html>';
fs.writeFileSync(path.join(__dirname, 'handout', 'email.html'), html);
if (process.argv[2]) fs.copyFileSync(path.join(__dirname, 'handout', 'email.html'), path.join(process.argv[2], '__seed', 'email.html'));
console.log('handout/email.html', html.length, 'bytes');
