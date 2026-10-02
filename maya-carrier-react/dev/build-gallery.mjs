import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'dist');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
await esbuild.build({
  entryPoints: [path.join(HERE, 'gallery.tsx'), path.join(HERE, 'detail.tsx'), path.join(HERE, 'l25-render.tsx')],
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

fs.writeFileSync(path.join(OUT, 'l25-render.html'), '<!doctype html><html><head><meta charset="utf-8"><title>L25 mount proof</title><script type="module" src="./l25-render.js"></script></head><body><main id="maya"></main></body></html>');

// L25 counterfactual: remove only the mounted observation from a disposable bundle.
// The production source is never edited, and neither page performs network calls.
await esbuild.build({
  entryPoints: [path.join(HERE, 'l25-render.tsx')], bundle: true, format: 'esm',
  target: 'es2022', jsx: 'automatic', outfile: path.join(OUT, 'l25-no-observation.js'),
  loader: { '.json': 'json' }, logLevel: 'warning',
  plugins: [{ name: 'l25-observation-counterfactual', setup(build) {
    build.onLoad({ filter: /[/\\]WidgetCard\.tsx$/ }, ({ path: file }) => {
      const source = fs.readFileSync(file, 'utf8');
      const anchor = "if (item.display === 'live') rendered?.(item.id);";
      if (source.split(anchor).length !== 2) throw new Error('L25 counterfactual anchor drift');
      return { contents: source.replace(anchor, '/* counterfactual: no observation */'), loader: 'tsx' };
    });
  } }],
});
fs.writeFileSync(path.join(OUT, 'l25-no-observation.html'), '<!doctype html><html><head><meta charset="utf-8"><title>L25 counterfactual</title><script type="module" src="./l25-no-observation.js"></script></head><body><main id="maya"></main></body></html>');
