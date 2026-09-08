import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
const root=join(process.cwd(),'..'), src=join(process.cwd(),'src');
function files(directory:string):string[]{return readdirSync(directory,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(directory,e.name)):e.name.endsWith('.ts')&&!e.name.endsWith('.spec.ts')?[join(directory,e.name)]:[]);}
function configWriters(text:string):string[] {
 const source=ts.createSourceFile('candidate.ts',text,ts.ScriptTarget.Latest,true),aliases=new Set<string>(),out:string[]=[];
 const model=(n:ts.Node)=>n.getText(source).includes('tenantBusinessConfigurationRevision') || (ts.isIdentifier(n)&&aliases.has(n.text));
 function walk(n:ts.Node){
  if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer&&model(n.initializer))aliases.add(n.name.text);
  if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&/^(create|createMany|update|updateMany|upsert|delete|deleteMany)$/.test(n.expression.name.text)&&model(n.expression.expression))out.push(n.getText(source));
  ts.forEachChild(n,walk);
 }walk(source);return out;
}
describe('R11 permanent governed settings boundary',()=>{
 it('configuration writes remain in the existing A22 executor',()=>{
  const bypass=files(src).filter(p=>relative(src,p)!=='package5-wave1/package5-wave1.service.ts').filter(p=>configWriters(readFileSync(p,'utf8')).length);
  expect(bypass).toEqual([]);
  const controller=readFileSync(join(src,'package5-wave1/governed-settings.controller.ts'),'utf8');
  for(const injection of ['await prisma.tenantBusinessConfigurationRevision.create({});','const writer=prisma.tenantBusinessConfigurationRevision; await writer.create({});'])expect(configWriters(controller+'\nasync function bad(){'+injection+'}')).toHaveLength(1);
  expect(controller).not.toMatch(/\.\$(execute|query)Raw|\.send|\.deliver|\.upsert/);
 });
 it('payload retention extends AC6 and preserves all canonical rows',()=>{
  const leaf=readFileSync(join(src,'package5-wave6/package5-wave-rc-payloads.ts'),'utf8');
  expect(leaf).not.toMatch(/\bDELETE\s+FROM\b|\.delete(Many)?\(/i);
  expect(leaf).toContain('RC_execution_set_resolved');
  expect(leaf).toContain("c.state='CLAIMED'");
  expect(leaf).toContain('t.revision');
  const owner=readFileSync(join(src,'package5-wave6/package5-wave6.service.ts'),'utf8');
  expect(owner).toContain('maintenance_lease_fenced');expect(owner).toContain('purgeRCPayload');
 });
 it('R11 guards actual Python bodies and injected aliased writers',()=>{
  const result=spawnSync('python3',['-m','unittest','test_package5_governed_settings'],{cwd:join(root,'ai администратор'),env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',timeout:20000});
  expect({status:result.status,output:result.status?result.stderr:''}).toEqual({status:0,output:''});
 },25000);
 it('PWA confirms once and preserves the same intent across lost response/restart',()=>{
  const result=spawnSync(process.execPath,[join(root,'docs/rebuild/evidence/package5-wave-rc-r11-pwa.proof.cjs')],{encoding:'utf8',timeout:10000});
  expect({status:result.status,output:result.status?result.stderr:''}).toEqual({status:0,output:''});
 });
});
