from pathlib import Path
import subprocess,time,json,hashlib,sys
root=Path.cwd();w=root/'work/ar1-single-operator-final-20261004';out=root/'outputs/ar1-single-operator-final-20261004/receipts';repo=root/'work/maya-controlled-integration';t=time.time();session='maya-singleop-final2';wrapper='/Users/stanislavmosin/.codex/skills/playwright/scripts/playwright_cli.sh';artifacts=w/'output/playwright';artifacts.mkdir(parents=True,exist_ok=True)
server=subprocess.Popen([sys.executable,'-u','-c',"from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler; s=ThreadingHTTPServer(('127.0.0.1',0),SimpleHTTPRequestHandler); print(s.server_port,flush=True); s.serve_forever()"],cwd=repo/'maya-carrier-react/dev/dist',stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
try:
 port=int(server.stdout.readline().strip());url='http://127.0.0.1:'+str(port)
 def cli(*args):return subprocess.run(['bash',wrapper,'--session',session,*args],cwd=artifacts,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 opened=cli('open',url+'/l25-render.html');assert opened.returncode==0,opened.stdout
 snapshot=cli('snapshot');assert snapshot.returncode==0 and 'Mount selector' in snapshot.stdout,snapshot.stdout
 (out/'l25-browser-initial-snapshot.log').write_text(snapshot.stdout)
 source=(w/'l25-browser-proof.js').read_text().replace('http://127.0.0.1:58937',url)
 p=cli('run-code',source);(out/'l25-browser.log').write_text(p.stdout)
 assert p.returncode==0 and '### Error' not in p.stdout,p.stdout
 result=json.loads(p.stdout.split('### Result\n',1)[1].split('\n### ',1)[0]);assert result['status']=='PASS' and result['productSourceEdited'] is False and result['realNetworkEffects'] is False
 (out/'l25-browser.receipt.json').write_text(json.dumps({'candidate':(w/'HEAD').read_text().strip(),'name':'l25-browser','exit':0,'seconds':round(time.time()-t,2),'command':['playwright-cli','--session',session,'run-code','l25-browser-proof.js'],'cwd':str(w),'network':'fresh loopback-only ephemeral port','result':result,'logSha256':hashlib.sha256(p.stdout.encode()).hexdigest()},indent=2)+'\n');print('L25 browser PASS',flush=True)
finally:
 subprocess.run(['bash',wrapper,'--session',session,'close'],cwd=artifacts,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 server.terminate();server.wait(timeout=10)
