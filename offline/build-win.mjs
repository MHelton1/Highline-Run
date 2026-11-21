// The offline builds, made from dist/local.html after `node build.mjs`:
//   dist/offline.html                  the game with its fonts built in, for any browser with no internet
//   dist/Highline-Run-Windows.zip      a Windows app (Electron): unzip, run "Highline Run.exe"
// usage: node offline/build-win.mjs        (the Electron download is kept in offline/.cache)
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, renameSync, cpSync, statSync, readdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import * as ResEdit from 'resedit';

const require = createRequire(import.meta.url);
const ELECTRON = '45.4.1', VERSION = '1.28.0', NAME = 'Highline Run';
const here = (p) => new URL(p, import.meta.url).pathname;
const dist = (p) => new URL('../dist/' + p, import.meta.url).pathname;

// 1. the page, with the fonts inside it instead of loaded from the web
let page = readFileSync(dist('local.html'), 'utf8');
const css = readFileSync(here('fonts.css'), 'utf8').replace(/url\(([\w-]+\.woff2)\)/g, (_, f) => `url(data:font/woff2;base64,${readFileSync(here('fonts/' + f)).toString('base64')})`);
const link = /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/[^"]*">/;
if (!link.test(page)) throw new Error('font link not found in dist/local.html');
page = page.replace(link, `<style>${css}</style>`);
if (/https?:\/\/(?!www\.w3\.org)/.test(page.replace(/<script>[\s\S]*<\/script>/, ''))) console.warn('warning: the page still names a web address outside its script');
writeFileSync(dist('offline.html'), page);
console.log('offline.html', (page.length / 1024 | 0) + ' KB');

// 2. the icon: drawn in offline/icon.html at four sizes and kept in offline/icons/ (so a build without a browser can use
// them; delete that folder to draw them again), then packed into an .ico
const SIZES = [256, 48, 32, 16], icon = (n) => here(`icons/icon-${n}.png`);
if (!SIZES.every((n) => existsSync(icon(n)))) {
  const { chromium } = require('playwright');
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.goto('file://' + here('icon.html'));
  const pngs = await pg.evaluate((sizes) => sizes.map((n) => { const c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(document.getElementById('c'), 0, 0, n, n); return c.toDataURL('image/png').split(',')[1]; }), SIZES);
  await b.close();
  mkdirSync(here('icons'), { recursive: true }); SIZES.forEach((n, i) => writeFileSync(icon(n), Buffer.from(pngs[i], 'base64')));
}
const imgs = SIZES.map((n) => [n, readFileSync(icon(n))]);
const head = Buffer.alloc(6 + 16 * imgs.length); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
let off = head.length;
imgs.forEach(([n, png], i) => { const o = 6 + 16 * i; head[o] = n & 255; head[o + 1] = n & 255; head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6); head.writeUInt32LE(png.length, o + 8); head.writeUInt32LE(off, o + 12); off += png.length; });
const ico = Buffer.concat([head, ...imgs.map(([, p]) => p)]);

// 3. Electron for Windows, with the game as its app
mkdirSync(here('.cache'), { recursive: true });
const zip = here(`.cache/electron-v${ELECTRON}-win32-x64.zip`);
if (!existsSync(zip)) execFileSync('curl', ['-sSfL', '-o', zip, `https://github.com/electron/electron/releases/download/v${ELECTRON}/electron-v${ELECTRON}-win32-x64.zip`], { stdio: 'inherit' });
const out = dist('win'), dir = out + '/' + NAME;
rmSync(out, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
execFileSync('unzip', ['-q', zip, '-d', dir]);
renameSync(dir + '/electron.exe', `${dir}/${NAME}.exe`);
rmSync(dir + '/resources/default_app.asar', { force: true });
for (const f of readdirSync(dir + '/locales')) if (f !== 'en-US.pak') rmSync(dir + '/locales/' + f);   // English only: 40 MB less
const app = dir + '/resources/app'; mkdirSync(app, { recursive: true });
writeFileSync(app + '/package.json', JSON.stringify({ name: 'highline-run', productName: NAME, version: VERSION, main: 'main.js' }, null, 2));
cpSync(here('app/main.js'), app + '/main.js');
cpSync(here('app/preload.js'), app + '/preload.js');
writeFileSync(app + '/index.html', page);
writeFileSync(app + '/icon.png', imgs[0][1]);

// 4. the .exe's icon and name in Windows (no Wine needed)
const exePath = `${dir}/${NAME}.exe`, exe = ResEdit.NtExecutable.from(readFileSync(exePath)), res = ResEdit.NtExecutableResource.from(exe);
const iconFile = ResEdit.Data.IconFile.from(ico);
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const gid = groups.length ? groups[0].id : 1, lang = groups.length ? groups[0].lang : 1033;
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, gid, lang, iconFile.icons.map((i) => i.data));
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
if (vi) {
  const [a, bb, c] = VERSION.split('.').map(Number);
  vi.setFileVersion(a, bb, c, 0, 1033); vi.setProductVersion(a, bb, c, 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, { FileDescription: NAME, ProductName: NAME, InternalName: NAME, OriginalFilename: NAME + '.exe', CompanyName: NAME, LegalCopyright: '' });
  vi.removeStringValue({ lang: 1033, codepage: 1200 }, 'SquirrelAwareVersion');
  vi.outputToResourceEntries(res.entries);
}
res.outputResource(exe);
writeFileSync(exePath, Buffer.from(exe.generate()));

writeFileSync(dir + '/HOW TO PLAY.txt', [
  'Highline Run for Windows', '',
  'Double-click "Highline Run.exe" to play. No internet is needed.', '',
  'The first time, Windows may say "Windows protected your PC" because the app is not signed by a publisher.',
  'Click "More info", then "Run anyway".', '',
  'F11 or Alt+Enter switches full screen. Esc opens the menu, and Controls in the menu changes keys and controller buttons.',
  'Xbox, Switch and PlayStation controllers work when connected by USB or Bluetooth.', '',
  'Progress is saved on this PC (in %APPDATA%\\Highline Run). It is separate from the version you play in a browser.',
  'Keep this whole folder together: the .exe needs the files next to it.', '',
].join('\r\n'));

// 5. the zip
const zipOut = dist('Highline-Run-Windows.zip'); rmSync(zipOut, { force: true });
execFileSync('zip', ['-qr9', zipOut, NAME], { cwd: out });
console.log('Highline-Run-Windows.zip', (statSync(zipOut).size / 1048576).toFixed(1) + ' MB');
