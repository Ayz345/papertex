/* Zip the runnable app: the single-file page plus the engine folder it looks
   for beside itself.  Run:  node tools/package-app.js */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const zip = path.join(root, 'papertex-app.zip');
fs.rmSync(zip, { force: true });

/* PowerShell's Compress-Archive is always present on Windows and needs no
   extra dependency just to make one zip. */
execFileSync('powershell', ['-NoProfile', '-Command',
  'Compress-Archive -Path ' +
  JSON.stringify(path.join(root, 'papertex.html')) + ',' +
  JSON.stringify(path.join(root, 'engine')) + ',' +
  JSON.stringify(path.join(root, 'start-papertex.cmd')) +
  ' -DestinationPath ' + JSON.stringify(zip) + ' -Force'
], { stdio: 'inherit' });

console.log('papertex-app.zip  ' + (fs.statSync(zip).size / 1024).toFixed(0) + ' kB');
