from pathlib import Path
import os,json,subprocess,time,hashlib
root=Path.cwd();repo=root/'work/maya-controlled-integration';w=root/'work/ar1-single-operator-final-20261005';out=root/'outputs/ar1-single-operator-final-20261005';logs=out/'ios-signing-rehearsal';logs.mkdir(exist_ok=True)
profile=json.loads((out/'IOS-SIGNING-INVENTORY.json').read_text())['profiles'][0];assert profile['development'] and profile['deviceIncluded'] and profile['privateIdentityAvailable']
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin';env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']};env['PATH']=node+':/opt/homebrew/bin:/usr/bin:/bin'
rows=[]
def run(name,args,cwd=repo):
 t=time.time()
 with (logs/(name+'.log')).open('w') as f:p=subprocess.run(args,cwd=cwd,env=env,stdout=f,stderr=subprocess.STDOUT)
 rows.append({'name':name,'exit':p.returncode,'seconds':round(time.time()-t,2)});print(json.dumps(rows[-1]),flush=True);return p.returncode
assert run('ios-canonical-sync',['npm','run','sync'],repo/'maya-ios-carrier')==0
args=['xcodebuild','-project','maya-ios-carrier/ios/App/App.xcodeproj','-scheme','App','-configuration','Debug','-sdk','iphoneos','-destination','generic/platform=iOS','-derivedDataPath',str(w/'ios-signed-rehearsal'),'DEVELOPMENT_TEAM='+profile['team'][0],'CODE_SIGN_STYLE=Automatic','CODE_SIGN_IDENTITY=Apple Development','build']
code=run('ios-development-signing',args)
app=w/'ios-signed-rehearsal/Build/Products/Debug-iphoneos/App.app'
if code==0:
 assert run('ios-signature-verify',['codesign','--verify','--deep','--strict',str(app)])==0
 assert run('ios-signed-payload-verify',['node','maya-carrier-react/tools/release.mjs','verify-app',str(app)])==0
result={'status':'PASS' if code==0 else 'BLOCKED','buildConfiguration':'Debug development (previously approved first launch); not App Store/Release','provisioningUuid':profile['profileUuid'],'provisioningExpiry':profile['expiresAt'],'provisioningChanges':0,'deviceInstalled':False,'actualApp':str(app) if code==0 else None,'receipts':rows,'networkProvisioningUpdates':False,'sourceChanges':subprocess.check_output(['git','diff','--name-only','--','maya-carrier-react','maya-chat-shell','maya-ios-carrier'],cwd=repo,text=True).splitlines()}
assert result['sourceChanges']==[]
(out/'IOS-SIGNING-REHEARSAL.json').write_text(json.dumps(result,indent=2)+'\n')
