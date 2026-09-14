// Offline public-code AST inventory. No browser, fetch or application evaluation.
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const ts=createRequire(path.resolve(__dirname, '../../../maya-saas-backend/package.json'))('typescript');
const files=[],calls=[],links=[];
for(const input of process.argv.slice(2)) for(const [file,entry] of Object.entries(JSON.parse(fs.readFileSync(input,'utf8')))) {
 const source=Buffer.from(entry.content,'base64').toString('utf8');
 const scripts=file.endsWith('.html')?[...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].filter(m=>!/(?:ld\+json|application\/json|importmap)/.test(m[1])).map(m=>({s:m[2],line:source.slice(0,m.index+m[0].indexOf('>')+1).split('\n').length-1})): [{s:source,line:0}];
 let errors=0;
 for(const block of scripts){const sf=ts.createSourceFile(file+'.tsx',block.s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);errors+=sf.parseDiagnostics.length;
 function visit(n){if(ts.isCallExpression(n)||ts.isNewExpression(n)) {
 const expr=n.expression.getText(sf);if(/(?:fetch|Request|XMLHttpRequest|WebSocket|EventSource|sendBeacon|\.open$|\.send$|\.post$|\.put$|\.delete$|\.patch$|\.request$|localStorage|indexedDB|\.clear$|\.removeItem$)/.test(expr)){
 const arg=n.arguments?.[0];let a=arg&&ts.isStringLiteral(arg)?arg.text:arg?.kind===ts.SyntaxKind.NoSubstitutionTemplateLiteral?arg.text:null;
 if(a&&(/token|secret|password/i.test(a)&&a.length>80))a='[REDACTED]';
 calls.push({file,line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1+block.line,call:expr.slice(0,160),literal:a,argumentKind:arg?ts.SyntaxKind[arg.kind]:null});}
 }ts.forEachChild(n,visit)}visit(sf)}
 files.push({file,sha256:entry.sha256,bytes:Buffer.byteLength(source),scripts:scripts.length,parseErrors:errors});
 for(const m of source.matchAll(/(?:src|href|action)=["']([^"']+)["']/g))if(!m[1].startsWith('data:'))links.push({file,ref:m[1].split('?')[0].slice(0,300)});
}
process.stdout.write(JSON.stringify({method:'source AST only',files,calls,links},null,2)+'\n');
