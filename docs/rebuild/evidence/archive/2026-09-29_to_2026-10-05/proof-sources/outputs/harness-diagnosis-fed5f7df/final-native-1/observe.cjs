// External diagnostics only. No body/header/credential logging; no timing or product changes.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const cp = require('node:child_process');
const { syncBuiltinESMExports } = require('node:module');
const { monitorEventLoopDelay } = require('node:perf_hooks');
const dir = process.env.NODE_MAYA_DIAG_DIR;
if (dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `events-${process.pid}.jsonl`);
  const started = Date.now(); let seq = 0;
  const ids = new WeakMap(); const pending = new Map();
  const id = o => { if (!ids.has(o)) ids.set(o, ++seq); return ids.get(o); };
  const log = (event, data = {}) => fs.appendFileSync(file, JSON.stringify({at:Date.now(), pid:process.pid, ppid:process.ppid, event, ...data})+'\n');
  const socket = s => ({id:id(s), localPort:s.localPort, remotePort:s.remotePort, remoteAddress:s.remoteAddress,
    connecting:s.connecting, destroyed:s.destroyed, readyState:s.readyState, bytesRead:s.bytesRead, bytesWritten:s.bytesWritten});
  const handles = () => process._getActiveHandles().map(h => ({type:h.constructor?.name,
    ...(h instanceof net.Socket ? socket(h) : {}), ...(h instanceof net.Server ? {id:id(h),listening:h.listening,address:h.address()} : {})}));
  const listen = net.Server.prototype.listen;
  net.Server.prototype.listen = function(...args) {
    const key = `listen:${id(this)}:${++seq}`, begin = Date.now();
    log('listen-start', {key, args:args.filter(a=>typeof a==='string'||typeof a==='number')});
    this.once('listening',()=>log('listening',{key,ms:Date.now()-begin,address:this.address()}));
    return listen.apply(this,args);
  };
  const emit = http.Server.prototype.emit;
  http.Server.prototype.emit = function(event,...args) {
    if(event==='request') {
      const [req,res]=args, key=`request:${id(this)}:${++seq}`, begin=Date.now();
      const route=req.url.split('?')[0]; pending.set(key,{begin,route});
      log('server-request',{key,route,socket:socket(req.socket)});
      res.once('finish',()=>{pending.delete(key);log('server-finish',{key,status:res.statusCode,ms:Date.now()-begin});});
      res.once('close',()=>log('server-response-close',{key,finished:res.writableFinished,ms:Date.now()-begin}));
    }
    if(event==='connection') { const s=args[0];log('server-connection',{server:id(this),socket:socket(s)});s.once('close',()=>log('server-socket-close',{server:id(this),socket:socket(s)})); }
    return emit.call(this,event,...args);
  };
  const close=http.Server.prototype.close;
  http.Server.prototype.close=function(cb) {
    const key=`close:${id(this)}:${++seq}`,begin=Date.now();pending.set(key,{begin});
    log('server-close-start',{key,listening:this.listening,address:this.address()});
    this.getConnections((e,count)=>log('server-close-connections',{key,count,error:e?.code}));
    return close.call(this,(...args)=>{pending.delete(key);log('server-close-end',{key,ms:Date.now()-begin,error:args[0]?.code});if(cb)cb(...args);});
  };
  const request=http.request;
  http.request=function(...args) {
    const req=request.apply(this,args),key=`client:${++seq}`,begin=Date.now(),route=req.path?.split('?')[0];
    pending.set(key,{begin,route});log('client-request',{key,route,host:req.host});
    req.once('socket',s=>{log('client-socket',{key,reused:req.reusedSocket,socket:socket(s)});
      s.once('connect',()=>log('client-connect',{key,socket:socket(s),ms:Date.now()-begin}));
      s.once('close',()=>log('client-socket-close',{key,socket:socket(s),ms:Date.now()-begin}));});
    req.once('finish',()=>log('client-finish',{key,ms:Date.now()-begin}));
    req.once('response',res=>{log('client-response',{key,status:res.statusCode,ms:Date.now()-begin});
      res.once('end',()=>{pending.delete(key);log('client-end',{key,ms:Date.now()-begin});});
      res.once('aborted',()=>log('client-aborted',{key,ms:Date.now()-begin}));});
    req.once('error',e=>{pending.delete(key);log('client-error',{key,error:e.code||e.message,ms:Date.now()-begin});});
    return req;
  };
  const spawnSync=cp.spawnSync;
  cp.spawnSync=function(command,args,opts) {
    const serial=++seq; const begin=Date.now();
    const isJest=Array.isArray(args)&&args.includes('jest');
    const isLive=isJest&&args.includes('./test/jest-widgets-live.json');
    if(isJest)log('jest-start',{serial,command,args,cwd:opts?.cwd});
    const r=spawnSync.apply(this,arguments);
    if(isJest) {
      fs.writeFileSync(path.join(dir,`jest-${process.pid}-${serial}.stdout`),r.stdout||'');
      fs.writeFileSync(path.join(dir,`jest-${process.pid}-${serial}.stderr`),r.stderr||'');
      const reportArg=args.find(x=>x.startsWith('--outputFile='));
      if(reportArg&&fs.existsSync(reportArg.slice(13))) fs.copyFileSync(reportArg.slice(13),path.join(dir,`jest-${process.pid}-${serial}.json`));
      log('jest-exit',{serial,status:r.status,signal:r.signal,error:r.error?.code,ms:Date.now()-begin});
    }
    if(isJest&&process.env.NODE_MAYA_DIAG_BASELINE_ONLY==='1'&&process.argv[1]?.endsWith('widgets-mutation-battery.mjs')) {
      log('diagnostic-stop-after-stock-unmutated-baseline',{status:r.status,signal:r.signal});
      process.exit(r.status??1);
    }
    return r;
  };
  syncBuiltinESMExports();
  const delay=monitorEventLoopDelay({resolution:50});delay.enable();
  setInterval(()=>{log('sample',{uptimeMs:Date.now()-started,resources:process.resourceUsage(),memory:process.memoryUsage(),
    eventLoopMaxMs:delay.max/1e6,pending:[...pending].map(([key,v])=>({key,...v,ms:Date.now()-v.begin})),handles:handles()});delay.reset();},5000).unref();
  process.on('exit',code=>log('exit',{code,uptimeMs:Date.now()-started,handles:handles(),resources:process.resourceUsage()}));
  log('start',{argv:process.argv,cwd:process.cwd(),node:process.version});
}
