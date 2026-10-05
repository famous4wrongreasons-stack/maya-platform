from pathlib import Path
import subprocess,shutil,json,os,time
root=Path.cwd();repo=root/'work/maya-controlled-integration';w=root/'work/ar1-single-operator-20261003';out=root/'outputs/ar1-single-operator-20261003';r=out/'receipts';head=(w/'HEAD').read_text().strip();clone=w/'clean-packaging-ci';clone.mkdir()
for p in repo.iterdir():
 if p.name in ['maya-carrier-react','maya-saas-backend','maya-ios-carrier','maya-chat-shell']:
  shutil.copytree(p,clone/p.name,ignore=shutil.ignore_patterns('node_modules','coverage','.env*','*.tsbuildinfo','public','build'))
  if p.name in ['maya-carrier-react','maya-saas-backend'] and (clone/p.name/'dist').exists():shutil.rmtree(clone/p.name/'dist')
 else:(clone/p.name).symlink_to(p,target_is_directory=p.is_dir())
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']};env['PATH']=node+':/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'
rows=[]
def run(name,cwd,args):
 t=time.time()
 with (r/(name+'.log')).open('w') as log:p=subprocess.run(args,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT)
 row={'candidate':head,'name':name,'exit':p.returncode,'command':args,'cwd':str(cwd),'seconds':round(time.time()-t,2)}
 (r/(name+'.receipt.json')).write_text(json.dumps(row,indent=2)+'\n');rows.append(row);print(json.dumps(row),flush=True);assert p.returncode==0,name
for name in ['maya-saas-backend','maya-carrier-react','maya-ios-carrier']:
 run('clean-ci-install-'+name,clone/name,['npm','ci','--ignore-scripts','--no-audit','--no-fund'])
run('clean-ci-sync',clone/'maya-ios-carrier',['npm','run','sync'])
run('clean-ci-carrier',clone/'maya-carrier-react',['npm','test'])
run('clean-ci-packaging',clone/'maya-carrier-react',['npm','run','test:release'])
be=clone/'maya-saas-backend'
run('clean-ci-trust',be,['node','--test','scripts/widget-release-operator.test.cjs'])
run('clean-ci-prisma',be,['npx','prisma','generate'])
run('clean-ci-backend-build',be,['npm','run','build'])
run('clean-ci-trust-compiled',be,['node','--test','scripts/widget-release-operator.compiled-test.cjs'])
derived=w/'ios-clean-ci'
run('clean-ci-xcode',clone,['xcodebuild','-project','maya-ios-carrier/ios/App/App.xcodeproj','-scheme','App','-configuration','Debug','-sdk','iphonesimulator','-derivedDataPath',str(derived),'CODE_SIGNING_ALLOWED=NO','build'])
run('clean-ci-actual-app',clone,['node','maya-carrier-react/tools/release.mjs','verify-app',str(derived/'Build/Products/Debug-iphonesimulator/App.app')])
(out/'CLEAN-PACKAGING-CI.json').write_text(json.dumps({'candidate':head,'status':'PASS','receipts':rows,'databaseUrlProvided':False,'freshIndependentInstalls':3,'hostedRunClaimed':False,'sourceChanged':False,'productionEffects':0},indent=2)+'\n')
