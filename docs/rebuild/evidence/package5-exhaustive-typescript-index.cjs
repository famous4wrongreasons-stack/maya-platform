// Offline AST index: no application imports or business execution.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const repo = path.resolve(__dirname, '../../..');
const ts = createRequire(path.join(repo, 'maya-saas-backend/package.json'))('typescript');
const root = path.resolve(process.argv[2]);
const rows = [], functions = [], routes = [], imports = [];
function files(dir) { return fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? files(path.join(dir,e.name)) : [path.join(dir,e.name)]); }
function ref(n) {
 if (!n) return '';
 if (ts.isIdentifier(n)) return n.text;
 if (ts.isPropertyAccessExpression(n)) return ref(n.expression)+'.'+n.name.text;
 if (ts.isElementAccessExpression(n)) return ref(n.expression)+'['+(ts.isStringLiteral(n.argumentExpression)?n.argumentExpression.text:'dynamic')+']';
 if (ts.isCallExpression(n)) return ref(n.expression)+'()';
 if (n.kind===ts.SyntaxKind.ThisKeyword) return 'this';
 return '<dynamic>';
}
for (const file of files(root).filter(f=>f.endsWith('.ts')&&!f.endsWith('.spec.ts')&&!f.endsWith('.d.ts')&&!f.includes('__fixtures__'))) {
 const source=fs.readFileSync(file,'utf8'), rel=path.relative(root,file);
 const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
 const line=n=>sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1;
 rows.push({file:rel,sha256:crypto.createHash('sha256').update(source).digest('hex'),parseErrors:sf.parseDiagnostics.length});
 function visit(n,owner='',cls='') {
  if (ts.isImportDeclaration(n)) imports.push({file:rel,source:n.moduleSpecifier.text,names:n.importClause?.getText(sf)||''});
  if (ts.isClassDeclaration(n)) cls=n.name?.text||'<anonymous>';
  let current=owner;
  if ((ts.isMethodDeclaration(n)||ts.isFunctionDeclaration(n)||ts.isConstructorDeclaration(n)||ts.isArrowFunction(n)||ts.isFunctionExpression(n)) && n.body) {
   const name=n.name?.getText(sf)||(ts.isConstructorDeclaration(n)?'constructor':n.parent?.name?.getText(sf)||'<closure>');
   current=cls?cls+'.'+name:name;
   const decorators=(ts.canHaveDecorators(n)?ts.getDecorators(n)||[]:[]).map(x=>x.expression.getText(sf));
   functions.push({file:rel,owner:current,line:line(n),endLine:sf.getLineAndCharacterOfPosition(n.end).line+1,decorators});
   for(const d of decorators) if(/^(Get|Post|Put|Patch|Delete|All)\(/.test(d)) routes.push({file:rel,owner:current,line:line(n),decorator:d});
  }
  if(ts.isCallExpression(n)) {
   const call=ref(n.expression);
   const modelWrite=/\.(?:create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)$/.test(call);
   const sql=/\$executeRaw|\$queryRaw|\.query$|\.execute$/.test(call);
   const external=/\.fetch$|^fetch$|\.(?:post|put|patch|delete|request|send|sendMessage|sendMail|sendNotification|sendPushNotification|publish|charge|refund|capture|createPayment|createRecord|updateRecord|deleteRecord|createAppointment|cancelAppointment)$/.test(call);
   const identity=/phone|authIdentity|membership|session|legacy|fallback/i.test(call);
   if(modelWrite||sql||external||identity) rows.push({file:rel,line:line(n),owner:current,call,modelWrite,sql,external,identity});
  }
  ts.forEachChild(n,c=>visit(c,current,cls));
 }
 visit(sf);
}
console.log(JSON.stringify({method:'AST source inventory, no reachability or safety inferred solely from a call name',sourceFiles:rows.filter(x=>x.sha256),routes,functions,imports,sites:rows.filter(x=>x.call)},null,2));
