// Bundle the harness entry for Node. esbuild is the carrier's own bundler; nothing new is added.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '.bundle.mjs');

await esbuild.build({
  entryPoints: [path.join(HERE, 'pipeline.tsx')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  jsx: 'automatic',
  outfile: OUT,
  logLevel: 'warning',
  // React stays EXTERNAL: react-dom/server.node is CommonJS and calls require('util'), which a
  // bundled ESM file cannot do. Node resolves it from the carrier's own node_modules at run time.
  external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime'],
});
export const BUNDLE = OUT;
