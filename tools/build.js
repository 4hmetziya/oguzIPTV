#!/usr/bin/env node
'use strict';
// Builds a clean webOS package of oguzIPTV.
//
//   node tools/build.js              -> build/app (clean folder) + build/out/<id>_<version>_all.ipk, config.js included
//   node tools/build.js --no-config  -> same, but WITHOUT your private config.js (use this for anything you share)
//   node tools/build.js --folder     -> only prepare build/app, do not call ares-package
//
// Only the files the app really needs are copied, so the package stays small (no README, tools, old .ipk files, ...).

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const withConfig = !args.includes('--no-config');
const folderOnly = args.includes('--folder');

const info = JSON.parse(fs.readFileSync(path.join(root, 'appinfo.json'), 'utf8'));
const buildDir = path.join(root, 'build');
const appDir = path.join(buildDir, 'app');
const outDir = path.join(buildDir, 'out');

// 1) the version in appinfo.json and the one shown inside the app must agree
const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const inApp = /const APP_VERSION = '([^']+)'/.exec(appJs);
if (!inApp || inApp[1] !== info.version) {
  console.error('Version mismatch: appinfo.json says ' + info.version + ', app.js says ' + (inApp ? inApp[1] : '(not found)'));
  process.exit(1);
}

// 2) files that belong into the package
const files = [
  'appinfo.json', 'index.html', 'app.js', 'style.css',
  'icon.jpg', 'largeIcon.jpg', 'logo.png',
  'assets/placeholder.png',
  'lib/hls.min.js', 'lib/jszip.min.js', 'lib/qrcode.js',
  'lib/licenses/hls.js-LICENSE', 'lib/licenses/jszip-LICENSE.markdown', 'lib/licenses/qrcode-generator-LICENSE',
];

fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(appDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

for (const f of files) {
  const from = path.join(root, f);
  if (!fs.existsSync(from)) {
    console.error('Missing file: ' + f);
    process.exit(1);
  }
  const to = path.join(appDir, f);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

// 3) config.js: your private one, or an empty one (the app works without it, only the online subtitle sources are off)
const configTarget = path.join(appDir, 'config.js');
const configSource = path.join(root, 'config.js');
if (withConfig && fs.existsSync(configSource)) {
  fs.copyFileSync(configSource, configTarget);
  console.log('config.js: included (private package - do not share the .ipk)');
} else {
  fs.writeFileSync(configTarget, "// empty on purpose: no private settings in this package\nwindow.OGUZ_CONFIG = {};\n");
  console.log('config.js: EMPTY (safe to share)');
}

// 4) safety net: refuse to build a shareable package that still contains something that looks like a key
if (!withConfig || !fs.existsSync(configSource)) {
  const suspicious = /(api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9_-]{16,}['"]/i;
  for (const f of files.filter((x) => /\.(js|html)$/.test(x) && !x.startsWith('lib/'))) {
    if (suspicious.test(fs.readFileSync(path.join(appDir, f), 'utf8'))) {
      console.error('Refusing to build: ' + f + ' contains something that looks like an API key.');
      process.exit(1);
    }
  }
}

const bytes = files.reduce((n, f) => n + fs.statSync(path.join(appDir, f)).size, 0);
console.log('Prepared build/app: ' + (files.length + 1) + ' files, ' + (bytes / 1024).toFixed(0) + ' KB');
if (folderOnly) process.exit(0);

// 5) package with the LG webOS CLI
const ares = process.platform === 'win32' ? 'ares-package.cmd' : 'ares-package';
const result = spawnSync(ares, [appDir, '-o', outDir, '--no-minify'], { stdio: 'inherit', shell: process.platform === 'win32' });
if (result.status !== 0) {
  console.error('ares-package failed (is the webOS CLI installed?  npm i -g @webos-tools/cli)');
  process.exit(result.status || 1);
}
const ipk = fs.readdirSync(outDir).find((f) => f.endsWith('.ipk'));
console.log('Done: build/out/' + ipk + ' (' + (fs.statSync(path.join(outDir, ipk)).size / 1024).toFixed(0) + ' KB)');
console.log('Install:  ares-install --device <tv> build/out/' + ipk + '   then   ares-launch --device <tv> ' + info.id);
