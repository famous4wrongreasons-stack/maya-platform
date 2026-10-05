import pathlib,subprocess,json,os,re,time,hashlib
root=pathlib.Path.cwd();repo=root/'work/maya-controlled-integration';be=repo/'maya-saas-backend';work=root/'work/ar1-single-operator-final-20261004';out=root/'outputs/ar1-single-operator-final-20261004/receipts';head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip();assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']};env['PATH']=node+':/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/wave1-closure-20260919/python-venv/bin:/opt/homebrew/bin:/usr/bin:/bin';env['DATABASE_URL']='[REDACTED DATABASE URL]';env.update(dict(re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']+)'",(be/'test/widgets-live/support/environment.ts').read_text())))
def run(name,cwd,args,extra={}):
 t=time.time()
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(args,cwd=cwd,env={**env,**extra},stdout=log,stderr=subprocess.STDOUT)
 receipt={'candidate':head,'name':name,'command':args,'cwd':str(cwd),'exit':r.returncode,'seconds':round(time.time()-t,2)};(out/(name+'.receipt.json')).write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt),flush=True);return r.returncode


import shutil
mirror=work/'runtime-l27-mutations';sh=mirror/'maya-chat-shell'
assert not mirror.exists()
mirror.mkdir()
shutil.copytree(repo/'maya-chat-shell',sh,ignore=shutil.ignore_patterns('node_modules','.env*'))
for p in repo.iterdir():
 if p.name!='maya-chat-shell':(mirror/p.name).symlink_to(p,target_is_directory=p.is_dir())
source=sh/'src/shell/intents.ts';original=source.read_text()
conv=sh/'src/shell/conversation.ts';conv_original=conv.read_text()
mutations=[
 ('L27-M01','Remove terminal identity guard','if (published.has(key)) continue;','if (false) continue;','L27: COMMIT'),
 ('L27-M02','Use text as terminal identity','const key = outcomeKey(submission.widget_id, line);','const key = line.text;','L27: identity is'),
 ('L27-M03','Scope canonical receipts per widget','`receipt:${line.action_receipt_ref}`','`receipt:${widgetId}:${line.action_receipt_ref}`','L27: a successor emission'),
 ('L27-M04','Conflate independent nonconfirmed widgets','`${line.outcome}:${widgetId}`','`${line.outcome}`','L27: identity is'),
 ('L27-M05','Trust receipt on wrong outcome class',"line.outcome === 'CONFIRMED' && typeof",'typeof','L27: a reference identifies'),
 ('L27-M06','Retain publication ledger after sign-out',"seen.clear();\n      published.clear();",'seen.clear();','L27: a cleared conversation'),
 ('L27-M07','Clear publication ledger on display cap',"for (const id of ids) release(id);","for (const id of ids) release(id);\n    published.clear();",'L27: the record survives'),
]
# The eighth counterfactual puts text deduplication into the common writer, a different forbidden site.
anchor='appendServerLine(text) {'
assert anchor in conv_original
mutations.append(('L27-M08','Deduplicate text in common timeline writer',anchor,anchor+"\n      if (items.some((item) => item.kind === 'assistant' && item.text === text)) return;",'L27: an ordinary assistant'))
program={'contract':'maya.runtime-l27-counterfactuals/1','candidate':head,'restrictions':'none: full runtime test suite per baseline and mutant','mutations':[]}
args=['node','--test','conformance.test.mjs',*[str(p.relative_to(sh)) for p in sorted((sh/'test').glob('*.test.mjs'))]]
if run('l27-mutations-baseline',sh,args):raise SystemExit('runtime mutation baseline red')
for mid,purpose,before,after,killer in mutations:
 source.write_text(original);conv.write_text(conv_original)
 target=conv if mid=='L27-M08' else source
 text=target.read_text();count=text.count(before)
 assert count==1 or (mid=='L27-M06' and count==2),(mid,count)
 target.write_text(text.replace(before,after,1))
 rc=run(mid,sh,args)
 log=(out/(mid+'.log')).read_text()
 failed=re.findall(r'^not ok \d+ - (.+)$',log,re.M)
 named=[x for x in failed if x.startswith(killer)]
 row={'id':mid,'purpose':purpose,'source':str(target.relative_to(mirror)),'before':before,'after':after,'namedKillerPrefix':killer,'actualFailedTests':failed,'namedKillers':named,'exit':rc,'status':'KILLED' if rc!=0 and named else 'UNEXPECTED','mutatedSourceSha256':hashlib.sha256(target.read_bytes()).hexdigest()}
 program['mutations'].append(row)
 (out/'l27-runtime-mutations.json').write_text(json.dumps(program,indent=2)+'\n')
 if row['status']!='KILLED':raise SystemExit('Noncanonical mutation result '+mid)
source.write_text(original);conv.write_text(conv_original)
program['status']='PASS';program['baseline']='GREEN';program['mutants']=len(mutations)
(out/'l27-runtime-mutations.json').write_text(json.dumps(program,indent=2)+'\n')
