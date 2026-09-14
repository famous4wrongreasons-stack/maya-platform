// Offline TypeScript/public-script timer index. No app or browser evaluation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ts=require(path.join(process.argv[2],'maya-saas-backend/node_modules/typescript'));
const out={method:'AST only; mechanical candidates require reachability/owner disposition',files:[],sites:[]};
function walk(p){return fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]);}
function ref(n){
 if(!n)return '';
 if(ts.isIdentifier(n))return n.text;
 if(n.kind===ts.SyntaxKind.ThisKeyword)return 'this';
 if(ts.isPropertyAccessExpression(n))return ref(n.expression)+'.'+n.name.text;
 if(ts.isCallExpression(n))return ref(n.expression)+'()';
 return '<dynamic>';
}
function parse(file,source,kind,offset=0){
 const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,kind);
 function visit(n,owner='<module>',cls=''){
  if(ts.isClassDeclaration(n))cls=n.name?.text||'<class>';
  if(ts.isMethodDeclaration(n)||ts.isFunctionDeclaration(n)||ts.isFunctionExpression(n)||ts.isArrowFunction(n)){
   const name=n.name?.getText(sf)||n.parent?.name?.getText(sf);
   if(name)owner=(cls?cls+'.':'')+name;
  }
  const location={file,line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1+offset,owner};
  if((ts.isMethodDeclaration(n)||ts.isFunctionDeclaration(n))&&/^(onModuleInit|onApplicationBootstrap)$/.test(n.name?.getText(sf)||''))out.sites.push({...location,kind:'startup',call:n.name.getText(sf)});
  if(ts.isCallExpression(n)||ts.isNewExpression(n)){
   const call=ref(n.expression);
   if(/(^|\.)(setInterval|setTimeout|setImmediate|queueMicrotask|requestAnimationFrame|scheduleJob|Cron|Interval|Timeout|Queue|Worker|fork|spawn|exec|execFile|registerPeriodicTask|runPending)$|\.(addRepeatable|upsertJobScheduler|registerCronJobs)$/.test(call)){
    const cb=n.arguments?.[0],nested=new Set();
    function calls(x){if(ts.isCallExpression(x))nested.add(ref(x.expression));ts.forEachChild(x,calls);}
    if(cb)calls(cb);
    const delay=n.arguments?.[1];
    out.sites.push({...location,kind:'call',call,callback:cb&&!(ts.isArrowFunction(cb)||ts.isFunctionExpression(cb))?ref(cb):'<closure>',delay:delay?delay.getText(sf).slice(0,140):null,callbackCalls:[...nested].sort().slice(0,200)});
   }
  }
  if(ts.isPropertyAssignment(n)&&/^(repeat|repeatEvery|cron|pattern)$/.test(n.name.getText(sf)))out.sites.push({...location,kind:'schedule-property-candidate',property:n.name.getText(sf),value:n.initializer.getText(sf).slice(0,100)});
  ts.forEachChild(n,c=>visit(c,owner,cls));
 }
 visit(sf);
 return sf.parseDiagnostics.length;
}
const sourceRoot=process.argv[3];
for(const file of walk(sourceRoot).filter(f=>f.endsWith('.ts')&&!f.endsWith('.spec.ts')&&!f.endsWith('.d.ts')&&!f.includes('__fixtures__'))){
 const source=fs.readFileSync(file,'utf8'),rel='TS:'+path.relative(sourceRoot,file);
 out.files.push({file:rel,sha256:crypto.createHash('sha256').update(source).digest('hex'),parseErrors:parse(rel,source,ts.ScriptKind.TS)});
}
for(const input of process.argv.slice(4))for(const [file,entry] of Object.entries(JSON.parse(fs.readFileSync(input,'utf8')))){
 const source=Buffer.from(entry.content,'base64').toString('utf8');
 const blocks=file.endsWith('.html')?[...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].filter(m=>!/(?:ld\+json|application\/json|importmap)/.test(m[1])).map(m=>({source:m[2],line:source.slice(0,m.index+m[0].indexOf('>')+1).split('\n').length-1})): [{source,line:0}];
 let errors=0;for(const b of blocks)errors+=parse('PUBLIC:'+file,b.source,ts.ScriptKind.TSX,b.line);
 out.files.push({file:'PUBLIC:'+file,sha256:entry.sha256,parseErrors:errors});
}
process.stdout.write(JSON.stringify(out,null,2)+'\n');
