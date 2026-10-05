from pathlib import Path
import subprocess,time,json,hashlib
root=Path.cwd();w=root/'work/release-packaging-final-20261003';out=root/'outputs/release-packaging-final-20261003/receipts';t=time.time()
args=['bash','/Users/stanislavmosin/.codex/skills/playwright/scripts/playwright_cli.sh','--session','maya-pkg-cert','run-code',(w/'l25-browser-proof.js').read_text()]
p=subprocess.run(args,cwd=w,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
(out/'l25-browser.log').write_text(p.stdout)
assert p.returncode==0 and '### Error' not in p.stdout
result=json.loads(p.stdout.split('### Result\n',1)[1].split('\n### ',1)[0])
assert result['status']=='PASS' and result['productSourceEdited'] is False and result['realNetworkEffects'] is False
(out/'l25-browser.receipt.json').write_text(json.dumps({'candidate':(w/'HEAD').read_text().strip(),'name':'l25-browser','exit':0,'seconds':round(time.time()-t,2),'command':['playwright-cli','--session','maya-pkg-cert','run-code','l25-browser-proof.js'],'cwd':str(w),'network':'loopback only','result':result,'logSha256':hashlib.sha256(p.stdout.encode()).hexdigest()},indent=2)+'\n')
print('L25 browser PASS')
