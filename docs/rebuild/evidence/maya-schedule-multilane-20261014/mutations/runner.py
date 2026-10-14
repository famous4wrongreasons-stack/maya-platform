import json,pathlib,subprocess,hashlib,os
root=pathlib.Path('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-local-crm-setup-20261010')
out=pathlib.Path('/private/tmp/maya-companion-multilane-mutation-final01-20261014');out.mkdir(mode=0o700)
node='/private/tmp/maya-cert-node22-20261013/node-v22.23.3-darwin-arm64/bin/node'
env={'PATH':str(pathlib.Path(node).parent)+':/usr/bin:/bin','HOME':str(out)}
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
repo=out/'candidate'
subprocess.run(['git','clone','--quiet','--shared','--no-checkout',str(root),str(repo)],env=env,check=True)
subprocess.run(['git','checkout','--quiet','--detach',head],cwd=repo,env=env,check=True)
f=repo/'maya-chat-shell/src/renderer/render.ts';original=f.read_bytes()
old=subprocess.check_output(['git','show','2588b9e6:maya-chat-shell/src/renderer/render.ts'],cwd=repo)
def schedule(b):
 start=b.index(b"    case 'SCHEDULE': {");end=b.index(b"    case 'CLIENT_LIST': {",start);return b[start:end]
needle=schedule(original)
results=[]
def run(stage):
 with (out/(stage+'.log')).open('wb') as log:
  p=subprocess.run([node,'--test','--test-name-pattern=SCHEDULE (interleav|lane declarations|keeps declared)','test/renderer.conformance.test.mjs'],cwd=repo/'maya-chat-shell',env=env,stdout=log,stderr=subprocess.STDOUT,timeout=30)
 results.append({'stage':stage,'exit':p.returncode,'log':stage+'.log'})
 return p.returncode
try:
 assert run('baseline')==0
 f.write_bytes(original.replace(needle,schedule(old)))
 assert run('mutant')==1
 assert "actual: 'prose'" in (out/'mutant.log').read_text()
finally:f.write_bytes(original)
assert run('restored')==0
assert subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()==''
(out/'receipt.json').write_text(json.dumps({'candidate':head,'status':'PASS','mutation':'restore grouping all appointments of each master before next master','results':results,'sourceRestoredSha256':hashlib.sha256(original).hexdigest(),'realEffects':0},indent=2)+'\n')
print(json.dumps({'candidate':head,'status':'PASS','out':str(out)}))
