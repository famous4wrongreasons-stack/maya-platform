from pathlib import Path
import subprocess,json,os,time,hashlib
root=Path.cwd();repo=root/'work/maya-controlled-integration';w=root/'work/ar1-single-operator-20261003';out=root/'outputs/ar1-single-operator-20261003';r=out/'receipts';head=(w/'HEAD').read_text().strip()
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']};env['PATH']=node+':/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'
rows=[]
def run(name,cwd,args,extra={}):
 t=time.time()
 with (r/(name+'.log')).open('w') as f:p=subprocess.run(args,cwd=cwd,env={**env,**extra},stdout=f,stderr=subprocess.STDOUT)
 d={'candidate':head,'name':name,'exit':p.returncode,'seconds':round(time.time()-t,2),'command':args,'cwd':str(cwd)}
 (r/(name+'.receipt.json')).write_text(json.dumps(d,indent=2)+'\n');rows.append(d);print(json.dumps(d),flush=True);assert p.returncode==0,name
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()==head
assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
run('packaging-sync',repo/'maya-ios-carrier',['npm','run','sync'])
run('packaging-tests',repo/'maya-carrier-react',['npm','run','test:release'])
run('operator-tests',repo/'maya-saas-backend',['node','--test','scripts/widget-release-operator.test.cjs'])
run('operator-compiled-tests',repo/'maya-saas-backend',['node','--test','scripts/widget-release-operator.compiled-test.cjs'])
run('r01-live-readonly',repo/'maya-saas-backend',['node','deploy/platform/beget-edge/relay-release.cjs','verify'],{'MAYA_R01_ARCHIVE_DIR':'legacy-bundle-archive'})
derived=w/'ios-final'
run('ios-unsigned-build',repo,['xcodebuild','-project','maya-ios-carrier/ios/App/App.xcodeproj','-scheme','App','-configuration','Debug','-sdk','iphonesimulator','-derivedDataPath',str(derived),'CODE_SIGNING_ALLOWED=NO','build'])
app=derived/'Build/Products/Debug-iphonesimulator/App.app'
run('ios-actual-bundle',repo,['node','maya-carrier-react/tools/release.mjs','verify-app',str(app)])
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
old=json.loads((root/'outputs/ar1-production-unlock-final-20261002/ARTIFACT-HASH-PARITY.json').read_text())
unchanged=[]
for tree in old['trees']:
 if tree['root'].startswith('maya-carrier-react/'):
  for e in tree['entries']:
   if e['path'].endswith(('.js','.css')):
    p=repo/e['path'];assert p.is_file() and sha(p)==e['sha256'];unchanged.append({'path':e['path'],'sha256':sha(p)})
aasa=[]
for f in ['.htaccess','apple-app-site-association']:
 name='maya-saas-backend/deploy/platform/beget-edge/well-known/'+f;p=repo/name
 assert p.read_bytes()==subprocess.check_output(['git','show','76df1766:'+name],cwd=repo)
 aasa.append({'path':name,'sha256':sha(p)})
native=[{'path':str(p.relative_to(app)),'sha256':sha(p)} for p in sorted((app/'public').rglob('*')) if p.is_file()]
gate=json.loads((r/'r01-live-readonly.log').read_text());assert gate['status']=='PASS' and gate['entries']==44 and gate['committedRoutingFiles']==4
assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
d={'candidate':head,'status':'PASS','receipts':rows,'webOwner':'React AChat','nativeOwner':'React AChat','oldShell':'REFUSED','aasaUnchanged':aasa,'reactBehaviourBytesUnchanged':unchanged,'historicalReceiptsAdmitted':0,'historicalComparisonOnly':'AASA and JS/CSS content equality; all admission executions are fresh','actualUnsignedAppPublicInventory':native,'publicTrustTests':21,'compiledCommandTests':8,'packagingTests':16,'externalPrerequisites':{'realCustodianKeys':True,'independentReviewerSignature':False,'independentHumanReview':False,'platformOwnerSession':True,'newExecutionAuthorization':True},'effects':{'production':0,'realOtp':0,'realYclients':0,'iphoneInstall':0}}
(out/'PACKAGING-TRUST-PROOF.json').write_text(json.dumps(d,indent=2)+'\n');print('PACKAGING/TRUST PASS',flush=True)
