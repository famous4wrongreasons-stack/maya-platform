const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const root = '/tmp/maya-b29-contour/maya-saas-backend';
const wave = Number(process.argv[2]);
assert(wave >= 1 && wave <= 6);
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55503');
assert.equal(url.pathname, `/maya_c06_p5_wave${wave}_b33_final_20260906`);
const req = Module.createRequire(path.join(root, 'package.json'));
req('ts-node').register({project:path.join(root,'tsconfig.scripts.json'),transpileOnly:true});
const filename = path.join(root, 'scripts', `package5-wave${wave}-all${[6,13,8,12,1,6][wave-1]}-executable-proof.ts`);
let source = fs.readFileSync(filename,'utf8');
if(wave === 6) {
 assert(source.includes("url.port !== '55486'"));
 source = source.replace("url.port !== '55486'", "url.port !== '55503'");
}
const m = new Module(filename, module);
m.filename = filename;
m.paths = Module._nodeModulePaths(path.dirname(filename));
m._compile(req('typescript').transpileModule(source,{compilerOptions:{target:7,module:1,esModuleInterop:true,experimentalDecorators:true,emitDecoratorMetadata:true}}).outputText, filename);
