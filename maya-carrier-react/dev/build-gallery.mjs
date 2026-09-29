import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'dist');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
await esbuild.build({
  entryPoints: [path.join(HERE, 'gallery.tsx'), path.join(HERE, 'detail.tsx')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  jsx: 'automatic',
  outdir: OUT,
  loader: { '.json': 'json' },
  logLevel: 'warning',
});
fs.copyFileSync(path.join(HERE, '..', 'src', 'styles.css'), path.join(OUT, 'styles.css'));
fs.writeFileSync(
  path.join(OUT, 'detail.html'),
  `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MAYA detail harness</title><link rel="stylesheet" href="./styles.css">
<script type="module" src="./detail.js"></script></head>
<body><main id="maya" class="app"></main></body></html>`,
);
fs.writeFileSync(
  path.join(OUT, 'index.html'),
  `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MAYA widget gallery</title><link rel="stylesheet" href="./styles.css">
<script type="module" src="./gallery.js"></script></head>
<body><main id="maya" class="app"></main></body></html>`,
);
console.log('gallery -> dev/dist/index.html');
