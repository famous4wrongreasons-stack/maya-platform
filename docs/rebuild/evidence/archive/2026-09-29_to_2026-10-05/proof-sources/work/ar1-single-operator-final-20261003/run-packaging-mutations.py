from pathlib import Path
import subprocess,shutil,json,os,time,re
root=Path.cwd();repo=root/'work/maya-controlled-integration';w=root/'work/ar1-single-operator-final-20261003';out=root/'outputs/ar1-single-operator-final-20261003';rec=out/'receipts';head=(w/'HEAD').read_text().strip();clone=w/'packaging-mutation-input';clone.mkdir()
for p in repo.iterdir():
 if p.name in ['maya-carrier-react','maya-saas-backend']:
  shutil.copytree(p,clone/p.name,ignore=shutil.ignore_patterns('node_modules','coverage','.env*','*.tsbuildinfo'))
  (clone/p.name/'node_modules').symlink_to(p/'node_modules',target_is_directory=True)
 else:(clone/p.name).symlink_to(p,target_is_directory=p.is_dir())
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin/node'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG','PATH']}
groups={'packaging':('maya-carrier-react',['--test','test/release.test.mjs']),'trust':('maya-saas-backend',['--test','scripts/widget-release-operator.test.cjs']),'command':('maya-saas-backend',['--test','scripts/widget-release-operator.compiled-test.cjs'])}
def run(name,group):
 package,args=groups[group];p=subprocess.run([node,*args],cwd=clone/package,env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT);(rec/(name+'.log')).write_text(p.stdout);return p
for group in groups:
 p=run('rpk-baseline-'+group,group);assert p.returncode==0,p.stdout
mutants=[
 ('RPK-WEBDIR','packaging','maya-carrier-react/tools/release.mjs',"  assert.equal(config.webDir, WEB_DIR, 'native webDir must select the canonical React AChat payload');",''),
 ('RPK-FILESET','packaging','maya-carrier-react/tools/payload-files.mjs',"  assert.deepEqual([...actual.keys()].sort(), [...expected.keys()].sort(), 'payload file set differs from the canonical React build');",''),
 ('RPK-BYTES','packaging','maya-carrier-react/tools/payload-files.mjs','    assert.ok(actual.get(name).equals(Buffer.from(bytes)), `payload bytes differ: ${name}`);','    void bytes;'),
 ('RPK-ENDPOINT','packaging','maya-carrier-react/tools/release.mjs',"  assert.equal(w.replace(from, to), c, 'PWA/Capacitor JS differs beyond the approved endpoint');",''),
 ('RPK-BRIDGE','packaging','maya-carrier-react/tools/release.mjs',"      assert.equal(clean.get(name).length, 0, 'nonempty native bridge placeholder refused');",''),
 ('RPK-REMOTE','packaging','maya-carrier-react/tools/release.mjs',"  assert.equal(config.server, undefined, 'remote/alternate native server is forbidden');",''),
 ('RPK-VERIFY','packaging','maya-carrier-react/build.mjs',"  if (flags.has('--verify-output')) assertTree(out, expected);","  if (flags.has('--verify-output')) void expected;"),
 ('TRUST-TENANT','trust','maya-saas-backend/scripts/widget-release-operator.cjs',"  assert.deepEqual(JSON.parse(env.WIDGET_RELEASE_PRODUCTION_TENANTS_JSON || '[]'), [tenantId], 'one exact production tenant required');",''),
 ('TRUST-REVIEWER','trust','maya-saas-backend/scripts/widget-release-operator.cjs',"  assert.equal(new Set(entries.map((x) => x.principalId)).size, single ? 1 : 2, 'distinct configured identities required');",''),
 ('TRUST-KEY','trust','maya-saas-backend/scripts/widget-release-operator.cjs',"  assert.equal(new Set(entries.map((x) => x.fingerprint)).size, single ? 1 : 2, 'distinct configured keys required');",''),
 ('TRUST-PRODUCTION','trust','maya-saas-backend/scripts/widget-release-operator.cjs',"  assert.equal(env.WIDGET_RELEASE_ENVIRONMENT, 'production', 'separate production environment required');",''),
 ('TRUST-POLICY','command','maya-saas-backend/scripts/widget-release-operator.cjs',"    const parsed = policy.read(command, tenantId, operation, operatorId, new Date());","    const parsed = { a: command.authorization.payload, authorizationHash: 'unchecked' };"),
]
rows=[]
for name,group,file,before,after in mutants:
 p=clone/file;s=p.read_text();assert s.count(before)==1,name;p.write_text(s.replace(before,after))
 try:
  assert subprocess.run([node,'--check',str(p)],capture_output=True).returncode==0,name
  t=time.time();res=run('mutation-'+name,group);assert res.returncode!=0 and re.search(r'^# fail [1-9]',res.stdout,re.M),name+' SURVIVED or harness failure'
  rows.append({'id':name,'status':'KILLED','group':group,'source':file,'seconds':round(time.time()-t,2),'log':'receipts/mutation-'+name+'.log'})
 finally:p.write_text(s)
 print(name+' KILLED',flush=True)
for group in groups:
 p=run('rpk-restored-'+group,group);assert p.returncode==0,p.stdout
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()==head
assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
(out/'PACKAGING-MUTATIONS.json').write_text(json.dumps({'candidate':head,'status':'PASS','applicable':len(rows),'killed':len(rows),'rows':rows,'baselineGroups':3,'restoredGroups':3,'mainCandidateMutated':False},indent=2)+'\n')
