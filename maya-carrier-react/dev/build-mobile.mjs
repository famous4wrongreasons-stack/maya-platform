import fs from 'node:fs';
import esbuild from 'esbuild';
const out = new URL('../../output/playwright/mobile/', import.meta.url);
fs.mkdirSync(out, { recursive: true });
await esbuild.build({ entryPoints: [new URL('./mobile.tsx', import.meta.url).pathname], bundle: true, format: 'esm', jsx: 'automatic', target: 'es2022', outfile: new URL('main.js', out).pathname });
fs.copyFileSync(new URL('../src/styles.css', import.meta.url), new URL('styles.css', out));
fs.writeFileSync(new URL('index.html', out), '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="styles.css"><script type="module" src="main.js"></script><body><main id="maya" class="app"></main></body></html>');
