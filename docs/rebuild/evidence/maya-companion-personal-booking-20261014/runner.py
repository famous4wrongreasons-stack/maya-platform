import concurrent.futures, datetime, hashlib, json, os, pathlib, subprocess, time
root=pathlib.Path('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-local-crm-setup-20261010')
out=pathlib.Path('/private/tmp/maya-companion-booking-final02-20261014')
out.mkdir(mode=0o700)
node='/private/tmp/maya-cert-node22-20261013/node-v22.23.3-darwin-arm64/bin/node'
env={'PATH':str(pathlib.Path(node).parent)+':/opt/homebrew/bin:/usr/bin:/bin','HOME':'/Users/stanislavmosin'}
git=lambda *a:subprocess.check_output(['/usr/bin/git',*a],cwd=root,env=env,text=True).strip()
now=lambda:datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
old=json.load(open(root/'docs/rebuild/evidence/maya-companion-settings-20261014/summary.json'))
steps=[]
for c in old['checks']:
 if c['name'] not in {'runtime','payload-build','runtime-reproducible','carrier','runtime-ratchets','carrier-ratchets','packaging-parity','packaging-tests','chat-browser','navigation-browser','voice-browser'}: continue
 c={k:c[k] for k in ('name','cwd','command')}
 if c['name']=='runtime':c['command']=[node,'--test','conformance.test.mjs']+sorted(str(p.relative_to(root/'maya-chat-shell')) for p in (root/'maya-chat-shell/test').glob('*.test.mjs'))
 if c['name'].endswith('-browser'):c['command'][-1]='/private/tmp/maya-companion-booking-final02-'+c['name']+'-20261014'
 steps.append(c)


steps.append({'name':'schedule-browser','cwd':str(root/'maya-carrier-react'),'command':[node,'test/schedule-shortcut.browser.mjs','/private/tmp/maya-companion-booking-final02-schedule-browser-20261014']})
steps.append({'name':'ns1-roundtrip','cwd':str(root/'maya-chat-shell'),'command':[node,'test/ns1-roundtrip-probe.mjs']})
summary={'contract':'maya.companion.booking.scoped-checks/1','candidate':git('rev-parse','HEAD'),'startedAt':now(),'node':subprocess.check_output([node,'--version'],text=True).strip(),'scrubbedEnvironment':True,'cleanAtStart':not git('status','--porcelain'),'fullReleaseCertification':False,'realProviders':False,'realDatabase':False,'checks':[]}
assert summary['cleanAtStart']
def run(c):
 start=time.monotonic();log=out/(c['name']+'.txt')
 with log.open('wb') as f:
  try:res=subprocess.run(c['command'],cwd=c['cwd'],env=env,stdout=f,stderr=subprocess.STDOUT,timeout=240);code=res.returncode
  except subprocess.TimeoutExpired:code=-999
 return dict(c,exitCode=code,seconds=round(time.monotonic()-start,3),log=log.name,sha256=hashlib.sha256(log.read_bytes()).hexdigest())
# Full runtime and mocked backend suites do not write shared build outputs.
parallel=[c for c in steps if c['name'] in ['runtime','source-http-contracts']]
ordered=[c for c in steps if c not in parallel]
try:
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  for res in pool.map(run,parallel):
   summary['checks'].append(res);print(res['name'],res['exitCode'],flush=True);assert res['exitCode']==0,res['name']
 for c in ordered:
  res=run(c);summary['checks'].append(res);print(res['name'],res['exitCode'],flush=True);assert res['exitCode']==0,res['name']
 summary['unchangedCandidate']=git('rev-parse','HEAD')==summary['candidate'];summary['cleanAtEnd']=not git('status','--porcelain');assert summary['unchangedCandidate'] and summary['cleanAtEnd']
 summary['status']='PASS'
except BaseException as e:summary['status']='FAIL';summary['failure']=str(e)
finally:
 summary['finishedAt']=now();(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({'status':summary['status'],'candidate':summary['candidate'],'out':str(out)}),flush=True)
raise SystemExit(0 if summary['status']=='PASS' else 1)
