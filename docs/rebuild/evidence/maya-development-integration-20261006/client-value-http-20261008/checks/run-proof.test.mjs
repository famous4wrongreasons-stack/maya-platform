import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { commandsFor } from './run-proof.mjs';
const input={pgBin:'/synthetic/pg',cluster:'/tmp/client-value-private/pg',port:55479,database:'maya_widget_gate_proof_c9occ_abcdef',log:'/tmp/client-value-evidence/postgres.log',receipt:'/tmp/client-value-private/private.json',output:'/tmp/client-value-evidence'};
test('finite current React proof uses a new process on both sides of a real PG restart',()=>{
 const commands=commandsFor(input);
 assert.deepEqual(commands.map(c=>c.name),['initdb','pg-start','createdb','migrations','react-web-build','prepare','pg-restart','resume']);
 const stages=commands.filter(c=>['prepare','resume'].includes(c.name));
 for(const stage of stages){
  assert.ok(stage.args.includes('--runInBand'));
  assert.ok(stage.args.includes('test/widgets-live/client-value-restart.probe-spec.ts'));
  assert.equal(stage.env.JEST_CLIENT_VALUE_STAGE,stage.name);
  assert.equal(stage.env.JEST_CLIENT_VALUE_RECEIPT,input.receipt);
  assert.equal(stage.env.JEST_CLIENT_VALUE_OUTPUT,input.output);
  assert.equal(stage.timeoutMs,480000);
 }
 assert.match(commands[1].args.join(' '),/-h 127\.0\.0\.1 -p 55479/);
 assert.match(commands[1].args.join(' '),/shared_buffers=64MB.*work_mem=4MB.*max_connections=30/);
 assert.deepEqual(commands[6].args.slice(-3),['-m','fast','restart']);
 assert.ok(commands[4].args.includes('--target=web'));
});
test('existing isolation boundaries reject shared ports, unrelated databases and shell-sensitive private paths',()=>{
 for(const patch of [{port:5432},{database:'production'},{cluster:'/tmp/unsafe path'},{cluster:"/tmp/unsafe'quote"}])assert.throws(()=>commandsFor({...input,...patch}));
});
test('the /tmp entry really reaches strict CLI admission despite the macOS realpath alias',()=>{
 assert.throws(()=>execFileSync(process.execPath,['/tmp/maya-client-value-http-20261008/run-proof.mjs','--not-authorized'],{timeout:5000,env:{PATH:process.env.PATH},stdio:'pipe'}), error=>error.status===1&&String(error.stderr).includes('ERR_PARSE_ARGS_UNKNOWN_OPTION'));
});
