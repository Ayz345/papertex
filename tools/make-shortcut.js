/* Put a PaperTeX shortcut on the Windows desktop.

   It points straight at electron.exe with the app as its argument, rather than
   at a .cmd wrapper, so launching it opens the window with no console flashing
   up behind it.

   Run:  node tools/make-shortcut.js */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

if (process.platform !== 'win32') {
  console.error('This script makes a Windows .lnk. On macOS or Linux use the');
  console.error('installer from `npm run dist` instead.');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const exe = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const entry = path.join(root, 'desktop', 'main.js');
const icon = path.join(root, 'desktop', 'papertex.ico');

for (const [what, p] of [['Electron', exe], ['the app entry point', entry]]) {
  if (!fs.existsSync(p)) {
    console.error('Cannot find ' + what + ' at:\n  ' + p +
      (what === 'Electron' ? '\nRun `npm install` first.' : ''));
    process.exit(1);
  }
}

/* PowerShell has no backslash escapes: single-quote everything and double any
   embedded single quote. JSON.stringify would mangle every path separator. */
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

const ps = [
  '$desktop = [Environment]::GetFolderPath(' + q('Desktop') + ')',
  '$lnk = Join-Path $desktop ' + q('PaperTeX.lnk'),
  '$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)',
  '$s.TargetPath = ' + q(exe),
  '$s.Arguments = ' + q('"' + entry + '"'),
  '$s.WorkingDirectory = ' + q(root),
  '$s.Description = ' + q('PaperTeX - write on the paper, get the LaTeX'),
  fs.existsSync(icon) ? '$s.IconLocation = ' + q(icon) : '',
  '$s.Save()',
  'Write-Output $lnk'
].filter(Boolean).join('; ');

const out = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim();
console.log('Shortcut created:\n  ' + out);
