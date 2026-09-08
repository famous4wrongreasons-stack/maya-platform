import { readFileSync,readdirSync } from 'node:fs';
import { join,relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
const root=join(process.cwd(),'..'),src=join(process.cwd(),'src');
function files(dir:string):string[]{return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(dir,entry.name)):entry.name.endsWith('.ts')&&!entry.name.endsWith('.spec.ts')?[join(dir,entry.name)]:[]);}
function writers(text:string){const source=ts.createSourceFile('candidate.ts',text,ts.ScriptTarget.Latest,true),aliases=new Set<string>(),found:string[]=[];const model=(n:ts.Node)=>n.getText(source).includes('cashDeclaration')||ts.isIdentifier(n)&&aliases.has(n.text);function visit(n:ts.Node){if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer&&model(n.initializer))aliases.add(n.name.text);if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&/^(create|createMany|update|updateMany|upsert|delete|deleteMany)$/.test(n.expression.name.text)&&model(n.expression.expression))found.push(n.getText(source));ts.forEachChild(n,visit)}visit(source);return found;}
describe('R14 permanent cash observation owner boundary',()=>{
 it('only cash executor writes new observations; routes/AI/jobs cannot use a parallel model writer',()=>{
  expect(files(src).filter(p=>relative(src,p)!=='expenses/cash-declaration.service.ts'&&writers(readFileSync(p,'utf8')).length)).toEqual([]);
  const owner=readFileSync(join(src,'expenses/cash-declaration.service.ts'),'utf8'),controller=readFileSync(join(src,'expenses/cash-declaration.controller.ts'),'utf8');
  expect(writers(owner)).toHaveLength(1);expect(owner).toContain('this.kernel.claimExecution');expect(owner).toContain('this.kernel.finalizeSuccess');expect(owner).toContain('tx.actionTargetMutation.create');
  expect(owner).not.toMatch(/\.expense(?:PeriodDeclaration)?\.(?:create|update|upsert)|sendMessage|sendDocument|\.deliver|yclients|cashbox/i);
  expect(controller).not.toMatch(/prisma|\.\$(query|execute)Raw|\.create|\.deliver/);
  for(const injection of ['await prisma.cashDeclaration.create({});','const alias=prisma.cashDeclaration; await alias.upsert({});'])expect(writers(controller+'\nasync function bad(){'+injection+'}')).toHaveLength(1);
 });
 it('legacy full producer bodies, aliased writers and false reconciliation are ratcheted',()=>{
  const result=spawnSync('python3',['-m','unittest','test_package5_cash_declaration'],{cwd:join(root,'ai администратор'),env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',timeout:20000});expect({status:result.status,output:result.status?result.stderr:''}).toEqual({status:0,output:''});
 });
 it('PWA requires explicit card and preserves confirmed intent on lost reply/restart',()=>{
  const result=spawnSync(process.execPath,[join(root,'docs/rebuild/evidence/package5-wave-rc-r14-pwa.proof.cjs')],{encoding:'utf8',timeout:10000});expect({status:result.status,output:result.status?result.stderr:''}).toEqual({status:0,output:''});
 });
});
