const http=require('node:http');
const request=require('../maya-controlled-integration/maya-saas-backend/node_modules/supertest');
const listen=(server,...args)=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(...args,()=>{server.removeListener('error',reject);resolve();});});
const close=server=>new Promise(resolve=>server.close(resolve));
(async()=>{
  const shadow=http.createServer((q,r)=>r.end('OTHER_LOCAL_PROCESS'));
  const old=http.createServer((q,r)=>r.end('INTENDED_HARNESS'));
  const fixed=http.createServer((q,r)=>r.end('INTENDED_HARNESS'));
  try {
    await listen(shadow,0,'127.0.0.1');
    const port=shadow.address().port;
    // Deterministic replay of the captured collision: the two actual listeners
    // had this same address-family/port relationship. No VPN process is touched.
    await listen(old,{port,host:'::',ipv6Only:false});
    const wrong=await request(old).post('/synthetic');
    await listen(fixed,0,'127.0.0.1');
    const right=await request(fixed).post('/synthetic');
    const result={platform:process.platform,shadow:shadow.address(),old:old.address(),fixed:fixed.address(),
      oldResponse:wrong.text,fixedResponse:right.text,
      beforeFails:wrong.text!=='INTENDED_HARNESS',afterPasses:right.text==='INTENDED_HARNESS'};
    console.log(JSON.stringify(result,null,2));
    if(!result.beforeFails||!result.afterPasses)process.exitCode=1;
  }finally{await close(old);await close(fixed);await close(shadow);}
})().catch(e=>{console.error(e);process.exitCode=1;});
