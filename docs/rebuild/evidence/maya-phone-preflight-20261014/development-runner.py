import pathlib,json,subprocess,os,time,datetime,hashlib
base=pathlib.Path('/private/tmp/maya-phone-preflight-20261014-02')
repo=base/'candidate';out=base/'development-target';out.mkdir(mode=0o700)
node=pathlib.Path('/private/tmp/maya-cert-node22-20261013/node-v22.23.3-darwin-arm64/bin/node')
target='https://maya-phone-proof.invalid:3443/api'
head=json.loads((base/'RESULT.json').read_text())['candidate']
env={'PATH':str(node.parent)+':/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin','HOME':str(base/'isolated-home'),'TMPDIR':str(base),'LANG':'en_US.UTF-8','TZ':'UTC','NODE_OPTIONS':'--max-old-space-size=3072'}
r={'candidate':head,'target':target,'hostContacted':False,'install':False,'status':'RUNNING','steps':[]}
def save():(out/'RESULT.json').write_text(json.dumps(r,indent=2)+'\n')
def run(name,args,extra=None,expected=0,reason=None,cwd=repo):
 t=time.monotonic()
 with (out/(name+'.log')).open('x') as f:
  p=subprocess.run([str(x) for x in args],cwd=cwd,env={**env,**(extra or {})},stdout=f,stderr=subprocess.STDOUT,timeout=900)
 r['steps'].append({'name':name,'exit':p.returncode,'expected':expected,'seconds':round(time.monotonic()-t,2),'args':[str(x) for x in args],'environment':extra or {}})
 save()
 assert p.returncode==expected,name
 if reason:assert reason in (out/(name+'.log')).read_text(),name+' exact refusal'
 print(name+': PASS',flush=True)
try:
 import shutil
 shutil.copyfile(__file__,out/'runner.py')
 cmd=[node,'maya-carrier-react/tools/release.mjs']
 run('sync-development',cmd+['sync','--development-api='+target])
 run('wrong-default-target',cmd+['verify-native','--xcode'],{'CONFIGURATION':'Debug'},expected=1,reason='RELEASE PACKAGING REFUSED')
 run('wrong-endpoint',cmd+['verify-native','--xcode'],{'CONFIGURATION':'Debug','MAYA_DEVELOPMENT_API':'https://other-phone-proof.invalid:3443/api'},expected=1,reason='RELEASE PACKAGING REFUSED')
 run('release-refuses-development',cmd+['verify-native','--xcode'],{'CONFIGURATION':'Release','MAYA_DEVELOPMENT_API':target},expected=1,reason='development API payload is forbidden outside Debug')
 run('exact-debug-target',cmd+['verify-native','--xcode'],{'CONFIGURATION':'Debug','MAYA_DEVELOPMENT_API':target})
 run('unsigned-device-development-build',['/usr/bin/xcodebuild','-project','maya-ios-carrier/ios/App/App.xcodeproj','-scheme','App','-configuration','Debug','-sdk','iphoneos','-destination','generic/platform=iOS','-derivedDataPath',base/'ios-development-build','CODE_SIGNING_ALLOWED=NO','MAYA_DEVELOPMENT_API='+target,'build'])
 app=base/'ios-development-build/Build/Products/Debug-iphoneos/App.app'
 run('development-app-verify',cmd+['verify-app',app,'--development-api='+target])
 run('mutation-declaration-dry-run',[node,'scripts/widgets-mutation-battery.mjs','--dry-run','--out',out/'mutation-declarations.json'],cwd=repo/'maya-saas-backend')
 r['payloadHashes']=[{'file':str(f.relative_to(app/'public')),'size':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in sorted((app/'public').rglob('*')) if f.is_file()]
 r['cloneUnchanged']=not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
 assert r['cloneUnchanged']
 r['status']='PASS'
except Exception as e:r['status']='FAIL';r['failure']=str(e);print(str(e),flush=True)
finally:r['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
