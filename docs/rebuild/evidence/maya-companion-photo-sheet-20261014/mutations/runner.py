import pathlib, subprocess, json, hashlib, datetime
root=pathlib.Path('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-local-crm-setup-20261010')
out=pathlib.Path('/private/tmp/maya-companion-photo-mutation-final02-20261014');out.mkdir(mode=0o700)
node='/private/tmp/maya-cert-node22-20261013/node-v22.23.3-darwin-arm64/bin/node'
env={'PATH':str(pathlib.Path(node).parent)+':/usr/bin:/bin','HOME':str(out)}
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
repo=out/'candidate'
subprocess.run(['git','clone','--quiet','--shared','--no-checkout',str(root),str(repo)],env=env,check=True)
subprocess.run(['git','checkout','--quiet','--detach',head],cwd=repo,env=env,check=True)
for package in ['maya-carrier-react','maya-saas-backend']:
 subprocess.run(['/bin/cp','-cR',str((root/package/'node_modules').resolve()),str(repo/package/'node_modules')],env=env,check=True)
f=repo/'maya-carrier-react/src/chat/GoodsPhotoSheet.tsx';original=f.read_bytes()
needle=b'onCancel={event => { event.preventDefault(); event.stopPropagation(); port.abort(); }}'
assert original.count(needle)==1
results=[]
def run(stage):
 with (out/(stage+'-build.txt')).open('wb') as log:
  subprocess.run([node,'build.mjs','--target=web'],cwd=repo/'maya-carrier-react',env=env,stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
 browserout='/private/tmp/maya-companion-photo-mutation-final02-'+stage+'-20261014'
 with (out/(stage+'.txt')).open('wb') as log:
  p=subprocess.run([node,'test/goods-photo-sheet.browser.mjs',browserout],cwd=repo/'maya-carrier-react',env=env,stdout=log,stderr=subprocess.STDOUT,timeout=90)
 receipt=json.loads((pathlib.Path(browserout)/'receipt.json').read_text())
 results.append({'stage':stage,'exit':p.returncode,'status':receipt['status'],'checks':len(receipt['checks']),'failure':receipt.get('failure'),'browserReceipt':browserout+'/receipt.json'})
 print(stage,p.returncode,flush=True)
 return p.returncode,receipt
try:
 assert run('baseline')[0]==0
 f.write_bytes(original.replace(needle,b'onCancel={event => { event.preventDefault(); event.stopPropagation(); }}'))
 code,r=run('mutant');assert code==1 and r['failure']=='Escape clears ephemeral picker and returns to actual plus opener',r
finally:f.write_bytes(original)
assert run('restored')[0]==0
assert subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()==''
(out/'receipt.json').write_text(json.dumps({'candidate':head,'status':'PASS','mutation':'remove canonical abort from native dialog Escape cancellation','results':results,'sourceRestoredSha256':hashlib.sha256(original).hexdigest(),'realEffects':0,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2)+'\n')
print(json.dumps({'status':'PASS','candidate':head,'out':str(out)}))
