import os,json,re,subprocess,time,pathlib,sys
root=pathlib.Path.cwd(); repo=root/'work/maya-controlled-integration'; be=repo/'maya-saas-backend'
sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
assert subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip() == '', 'certification starts only from a committed clean candidate'
out=root/'outputs/navigate-runtime-fix'/('receipts-'+sha[:8]);out.mkdir(parents=True,exist_ok=True)
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG','SHELL']};env.update(PATH=node+':/opt/homebrew/bin:/usr/bin:/bin',DATABASE_URL='[REDACTED DATABASE URL]',NODE_ENV='test')
s=(be/'test/widgets-live/support/environment.ts').read_text();env.update(dict(re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']+)'",s)))
def run(name,cwd,args,extra={}):
 t=time.time()
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(args,cwd=cwd,env={**env,**extra},stdout=log,stderr=subprocess.STDOUT)
 receipt={'candidate':sha,'name':name,'command':args,'cwd':str(cwd.relative_to(repo)),'exit':r.returncode,'seconds':round(time.time()-t,2)}
 (out/(name+'.receipt.json')).write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt),flush=True);return r.returncode
if sys.argv[1]=='surfaces':
 for name,args in [('runtime-check',['node','build.mjs','--check','--no-baseline']),('runtime-build',['npm','run','build']),('runtime-typecheck',['npm','run','typecheck']),('runtime-test',['npm','test'])]:run(name,repo/'maya-chat-shell',args)
 for name,args in [('carrier-typecheck',['npm','run','typecheck']),('carrier-build',['npm','run','build']),('carrier-test',['npm','test'])]:run(name,repo/'maya-carrier-react',args)
if sys.argv[1] in ['surfaces','probe']:
 run('source-carrier',be,['npx','jest','--config','test/jest-widgets-live.json','--runInBand','--testRegex','widgets-live/source-carrier.probe-spec.ts$'],{'GITHUB_SOURCE_PROBE_OUT':str(out/'source-carrier-observations.json')})
if sys.argv[1]=='source-tests':
 run('source-profile-live',be,['npx','jest','--config','test/jest-widgets-live.json','--runInBand','--testPathPatterns','(personal-source|navigation-source|profile-isolation)\\.live-spec','--json','--outputFile='+str(out/'source-profile-live.json')])
 run('live-typecheck',be,['npm','run','typecheck:widgets-live'])
