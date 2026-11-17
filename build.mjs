import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
const r = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020' });
const js = r.outputFiles[0].text, tpl = readFileSync('template.html', 'utf8');
mkdirSync('dist', { recursive: true });
const page = tpl + '\n<script>\n' + js + '\n</script>\n';
writeFileSync('dist/index.html', page);
writeFileSync('dist/local.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0;font-size:14px}[hidden]{display:none!important}</style></head><body>' + page + '</body></html>');
console.log('built', (page.length / 1024 | 0) + ' KB');
