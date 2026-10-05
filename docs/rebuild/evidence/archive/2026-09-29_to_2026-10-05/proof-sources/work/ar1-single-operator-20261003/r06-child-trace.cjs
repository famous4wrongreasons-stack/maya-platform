const cp = require('node:child_process');
const fs = require('node:fs');
const original = cp.spawnSync;
cp.spawnSync = function(command, args, options) {
  const relevant = command === 'python3' && Array.isArray(args) && args.includes('test_package5_operational_delivery');
  const started = Date.now();
  const r = original.apply(this, arguments);
  if (relevant) fs.appendFileSync(process.env.R06_TRACE_FILE, JSON.stringify({pid:process.pid,started,elapsedMs:Date.now()-started,cwd:options?.cwd,timeout:options?.timeout,status:r.status,signal:r.signal,error:r.error?{code:r.error.code,message:r.error.message}:null,stdout:r.stdout,stderr:r.stderr})+'\n');
  return r;
};
