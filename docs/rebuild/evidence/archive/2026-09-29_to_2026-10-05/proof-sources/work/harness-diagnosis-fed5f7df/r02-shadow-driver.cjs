const http=require('node:http'); const cp=require('node:child_process'); const fs=require('node:fs');const path=require('node:path');
const out=process.env.NODE_MAYA_R02_OUT;fs.mkdirSync(out,{recursive:true});let hits=0;
const shadow=http.createServer((req,res)=>{hits++;req.resume();if(process.env.NODE_MAYA_SHADOW_HOLD==='1')return;res.writeHead(418);res.end('synthetic wrong process');});
shadow.listen(0,'127.0.0.1',()=>{
 const port=shadow.address().port;const start=Date.now();
 const selected=process.env.NODE_MAYA_SHADOW_JEST_ARGS ? JSON.parse(process.env.NODE_MAYA_SHADOW_JEST_ARGS) : ['--runTestsByPath','src/auth/legacy-staff-principal.http.spec.ts'];
 const args=['node_modules/jest/bin/jest.js','--runInBand','--forceExit',...selected,'--json','--outputFile='+path.join(out,'jest.json')];
 const stdout=fs.openSync(path.join(out,'stdout.log'),'w');const stderr=fs.openSync(path.join(out,'stderr.log'),'w');
 const child=cp.spawn(process.execPath,args,{cwd:process.cwd(),env:{...process.env,NODE_MAYA_SHADOW_PORT:String(port),NODE_MAYA_DIAG_DIR:path.join(out,'trace'),NODE_OPTIONS:'--require='+path.join(__dirname,'observe.cjs')+' --require='+path.join(__dirname,'force-wildcard-port.cjs')},stdio:['ignore',stdout,stderr]});
 child.on('exit',(code,signal)=>{fs.writeFileSync(path.join(out,'shadow-receipt.json'),JSON.stringify({code,signal,seconds:(Date.now()-start)/1000,syntheticShadowAddress:shadow.address(),shadowHoldsResponse:process.env.NODE_MAYA_SHADOW_HOLD==='1',requestsMisroutedToShadow:hits,diagnosticInjection:'Only implicit wildcard listen(0) selects existing shadow IPv4 port; explicit listeners unchanged'},null,2)+'\n');shadow.close();process.exitCode=0;});
});
