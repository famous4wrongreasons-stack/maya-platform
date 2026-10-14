import pathlib,subprocess,os,json,time,hashlib,shutil,datetime
source=pathlib.Path('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-local-crm-setup-20261010')
base=pathlib.Path('/private/tmp/maya-phone-preflight-20261014-02')
node=pathlib.Path('/private/tmp/maya-cert-node22-20261013/node-v22.23.3-darwin-arm64/bin/node')
def git(*args,cwd=source):return subprocess.check_output(['git',*args],cwd=cwd,text=True).strip()
head=git('rev-parse','HEAD')
assert head=='1df1079a1d210cc4d176894c75b67585fb138348' and not git('status','--porcelain')
base.mkdir(mode=0o700)
repo=base/'candidate'
home=base/'isolated-home';home.mkdir(mode=0o700)
env={'PATH':str(node.parent)+':/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin','HOME':str(home),'TMPDIR':str(base),'LANG':'en_US.UTF-8','TZ':'UTC','npm_config_userconfig':'/dev/null','npm_config_cache':str(base/'npm-cache'),'NODE_OPTIONS':'--max-old-space-size=3072'}
report={'candidate':head,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'kind':'unsigned iOS packaging preflight, no runtime execution','steps':[],'realProviderEffects':0,'databaseAccess':False,'keychainSecretsRead':False,'install':False,'certificate':'NOT_ISSUED','status':'RUNNING'}
def save():(base/'RESULT.json').write_text(json.dumps(report,indent=2)+'\n')
def run(name,args,cwd=repo,expected=0,timeout=900):
 t=time.monotonic()
 with (base/(name+'.log')).open('x') as out:
  p=subprocess.run([str(x) for x in args],cwd=cwd,env=env,stdout=out,stderr=subprocess.STDOUT,timeout=timeout)
 item={'name':name,'args':[str(x) for x in args],'exit':p.returncode,'expected':expected,'seconds':round(time.monotonic()-t,2),'log':name+'.log'}
 report['steps'].append(item);save()
 print(name+': '+('PASS' if p.returncode==expected else 'FAIL')+' '+str(item['seconds'])+'s',flush=True)
 assert p.returncode==expected, name
try:
 shutil.copyfile(__file__,base/'runner.py')
 run('clone',['git','clone','--shared','--no-checkout',source,repo],cwd=base)
 run('checkout',['git','checkout','--detach',head])
 for name in ['maya-saas-backend','maya-carrier-react']:
  target=(source/name/'node_modules').resolve()
  assert target.is_dir()
  (repo/name/'node_modules').symlink_to(target,target_is_directory=True)
 (repo/'.git/info/exclude').open('a').write('\n/maya-carrier-react/node_modules\n/maya-saas-backend/node_modules\n')
 run('ios-dependencies',[node.parent/'npm','ci','--ignore-scripts','--no-audit','--no-fund'],cwd=repo/'maya-ios-carrier')
 run('canonical-sync',[node,'maya-carrier-react/tools/release.mjs','sync'])
 run('packaging-tests',[node,'--test','test/release.test.mjs'],cwd=repo/'maya-carrier-react')
 run('simulator-build',['/usr/bin/xcodebuild','-project','maya-ios-carrier/ios/App/App.xcodeproj','-scheme','App','-configuration','Debug','-sdk','iphonesimulator','-destination','generic/platform=iOS Simulator','-derivedDataPath',base/'ios-build','CODE_SIGNING_ALLOWED=NO','build'],timeout=1200)
 run('simulator-app-verify',[node,'maya-carrier-react/tools/release.mjs','verify-app',base/'ios-build/Build/Products/Debug-iphonesimulator/App.app'])
 run('device-architecture-build',['/usr/bin/xcodebuild','-project','maya-ios-carrier/ios/App/App.xcodeproj','-scheme','App','-configuration','Debug','-sdk','iphoneos','-destination','generic/platform=iOS','-derivedDataPath',base/'ios-build','CODE_SIGNING_ALLOWED=NO','build'],timeout=1200)
 app=base/'ios-build/Build/Products/Debug-iphoneos/App.app'
 run('device-app-verify',[node,'maya-carrier-react/tools/release.mjs','verify-app',app])
 report['payloadHashes']=[]
 for surface,root in [('web',repo/'maya-carrier-react/dist/web'),('capacitor',repo/'maya-carrier-react/dist/capacitor'),('device-app',app/'public')]:
  for f in sorted(root.rglob('*')):
   if f.is_file():report['payloadHashes'].append({'surface':surface,'file':str(f.relative_to(root)),'size':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
 report['sourceUnchanged']=git('rev-parse','HEAD')==head and not git('status','--porcelain')
 report['cloneUnchanged']=not git('status','--porcelain',cwd=repo)
 assert report['sourceUnchanged'] and report['cloneUnchanged']
 report['status']='PASS'
except Exception as e:
 report['status']='FAIL';report['failure']=str(e);print(str(e),flush=True)
finally:
 report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
