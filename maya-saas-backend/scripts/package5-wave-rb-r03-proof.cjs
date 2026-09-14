/** Reuse the existing all-eight Wave 3 proof with a stricter, fresh R03 DB guard.
 * Providers are the proof's in-memory synthetic gateway; no production effects.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const backend = path.resolve(__dirname, '..');
const value = process.argv[2];
const url = new URL(value);
if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' ||
    url.port !== '55508' || url.pathname !== '/maya_rb_r03')
  throw Error('Only the new owned Wave R-B R03 PostgreSQL database is permitted');
const original = path.join(backend, 'scripts/package5-wave3-all8-executable-proof.ts');
const bytes = fs.readFileSync(original);
let source = bytes.toString('utf8');
const oldGuard = "if (!name.startsWith('maya_c06_p5_wave3_'))";
if (source.split(oldGuard).length !== 2) throw Error('Expected exact existing proof DB guard');
source = source.replace(oldGuard, "if (name !== 'maya_rb_r03' || new URL(value).hostname !== '127.0.0.1' || new URL(value).port !== '55508')");
process.env.DATABASE_URL = value;
require('ts-node').register({project: path.join(backend, 'tsconfig.scripts.json'), transpileOnly: true});
const ts = require('typescript');
const compiled = ts.transpileModule(source, {compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  esModuleInterop: true, experimentalDecorators: true, emitDecoratorMetadata: true,
}}).outputText;
process.stderr.write(JSON.stringify({originalProof: path.basename(original), sourceSha256: crypto.createHash('sha256').update(bytes).digest('hex'), guardChanges: 1, database: 'maya_rb_r03', provider: 'synthetic in-memory ProofProvider'}) + '\n');
const probe = new Module(original, module);
probe.filename = original;
probe.paths = Module._nodeModulePaths(path.dirname(original));
probe._compile(compiled, original);
