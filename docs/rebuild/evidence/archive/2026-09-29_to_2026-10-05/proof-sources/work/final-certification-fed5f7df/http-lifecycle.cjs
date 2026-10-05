const fs=require('node:fs');const http=require('node:http');
const dir=process.env.MAYA_HTTP_DIAGNOSTIC_DIR;if(!dir)throw Error('diagnostic output required');
const dest=dir+'/http-lifecycle-'+process.pid+'.jsonl';let n=0;const ids=new WeakMap();const pending=new Map();
const log=(event,data={})=>fs.appendFileSync(dest,JSON.stringify({at:new Date().toISOString(),pid:process.pid,event,...data})+'\n');
const id=(s)=>{if(!ids.has(s))ids.set(s,++n);return ids.get(s)};
const emit=http.Server.prototype.emit;
http.Server.prototype.emit=function(event,...args){
 if(event==='request'){const [req,res]=args;const sid=id(this);const key='server:'+sid+':'+(++n);const start=Date.now();const route=req.url.split('?')[0];pending.set(key,{start,route});log('server-request',{key,route});res.once('finish',()=>{pending.delete(key);log('server-finish',{key,status:res.statusCode,ms:Date.now()-start})})}
 return emit.call(this,event,...args);
};
const close=http.Server.prototype.close;
http.Server.prototype.close=function(cb){const sid=id(this);const key='close:'+sid;const start=Date.now();pending.set(key,{start});log('server-close-start',{key,listening:this.listening});this.getConnections((err,count)=>log('server-close-connections',{key,count,error:err?.code}));return close.call(this,(...args)=>{pending.delete(key);log('server-close-end',{key,ms:Date.now()-start,error:args[0]?.code});if(cb)cb(...args)})};
const request=http.request;
http.request=function(...args){const req=request.apply(this,args);const key='client:'+(++n);const start=Date.now();const route=req.path?.split('?')[0];pending.set(key,{start,route});log('client-request',{key,route,host:req.host});req.once('socket',s=>{log('client-socket',{key,connecting:s.connecting});s.once('connect',()=>log('client-connect',{key}));s.once('close',()=>log('client-socket-close',{key}))});req.once('response',res=>{log('client-response',{key,status:res.statusCode,ms:Date.now()-start});res.once('end',()=>{pending.delete(key);log('client-end',{key,ms:Date.now()-start})})});req.once('error',e=>{pending.delete(key);log('client-error',{key,error:e.code||e.message,ms:Date.now()-start})});return req};
setInterval(()=>{for(const [key,p]of pending)if(Date.now()-p.start>10000)log('pending-over-10s',{key,...p,ms:Date.now()-p.start})},10000).unref();
log('instrumented');
