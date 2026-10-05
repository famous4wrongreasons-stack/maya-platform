// Diagnostic reduction: Supertest's per-request listen/close on the same HTTP server.
// No Maya import, database, auth, provider, or product data.
const http=require('node:http');
const request=require('../maya-controlled-integration/maya-saas-backend/node_modules/supertest');
const server=http.createServer((req,res)=>{req.resume();req.on('end',()=>{res.writeHead(400,{'content-type':'application/json'});res.end('{"error":"shape"}');});});
let iteration=0, started=Date.now();
const timer=setInterval(()=>console.log(JSON.stringify({iteration,elapsed:Date.now()-started,listening:server.listening,address:server.address()})),5000);
(async()=>{
  for(;iteration<20000;iteration++){
    const res=await request(server).post('/api/widgets/intent').send({contract:'synthetic',inputs:{a:{b:{state:'x'}}}});
    if(res.status!==400)throw Error('unexpected status');
  }
  clearInterval(timer);console.log(JSON.stringify({status:'PASS',iteration,elapsed:Date.now()-started}));
})().catch(e=>{clearInterval(timer);console.error(e);process.exitCode=1;server.closeAllConnections();server.close();});
