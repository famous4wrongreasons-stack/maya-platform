from pathlib import Path
import subprocess,json,datetime,hashlib,plistlib,re,glob
root=Path.cwd();w=root/'work/ar1-single-operator-final-20261005';out=root/'outputs/ar1-single-operator-final-20261005';head=(w/'HEAD').read_text().strip();now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
rows=[]
for config in w.glob('jest-*.json'):
 for pattern in json.loads(config.read_text()).get('testMatch',[]):
  matches=glob.glob(pattern);assert matches,(config,pattern)
  rows.extend({'path':str(Path(p).relative_to(w)),'sha256':sha(Path(p))} for p in matches)
for folder in ['bin-cases','compiled-bin-cases','compiled-receipt-bin-cases','postcommit-bin-cases']:
 paths=list((w/folder).glob('*.cases.ts'));assert len(paths)==1
 rows.extend({'path':str(p.relative_to(w)),'sha256':sha(p)} for p in paths)
drivers=list(w.rglob('*.ts'));assert len(drivers)==7,len(drivers)
(out/'HARNESS-PROBE-ASSEMBLY-VALIDATION.json').write_text(json.dumps({'candidate':head,'status':'PASS','checkedAt':now(),'scope':'Current source assembly only; no historical execution receipt','jestAndBinarySources':rows,'typescriptDrivers':[{'path':str(p.relative_to(w)),'sha256':sha(p)} for p in sorted(drivers)],'sourceFilesPresent':True},indent=2)+'\n')
profile=Path('/Users/stanislavmosin/Library/Developer/Xcode/UserData/Provisioning Profiles/8c3f4496-8527-4c89-84be-5c9f9a15eed7.mobileprovision')
p=plistlib.loads(subprocess.check_output(['security','cms','-D','-i',str(profile)],stderr=subprocess.DEVNULL))
identities=subprocess.check_output(['security','find-identity','-v','-p','codesigning'],text=True)
valid=set(re.findall(r'\) ([A-F0-9]{40}) ',identities))
private_available=any(hashlib.sha1(c).hexdigest().upper() in valid for c in p['DeveloperCertificates'])
devfile=w/'current-devices.json'
subprocess.run(['xcrun','devicectl','list','devices','--json-output',str(devfile)],stdout=subprocess.DEVNULL,check=True)
devices=json.loads(devfile.read_text())['result']['devices']
dev=next(d for d in devices if d['identifier']=='FF6F8003-99D2-5AED-A4CA-05BAE3877929')
props=dev['deviceProperties'];hardware=dev['hardwareProperties'];conn=dev['connectionProperties'];ent=p['Entitlements']
record={'profileUuid':p['UUID'],'applicationIdentifier':ent['application-identifier'],'team':p['TeamIdentifier'],'expiresAt':p['ExpirationDate'].replace(tzinfo=datetime.timezone.utc).isoformat(),'development':ent.get('get-task-allow',False),'associatedDomains':ent.get('com.apple.developer.associated-domains'),'deviceIncluded':hardware.get('udid') in p.get('ProvisionedDevices',[]),'deviceCount':len(p.get('ProvisionedDevices',[])),'privateIdentityAvailable':private_available,'sha256':sha(profile),'path':str(profile)}
result={'candidate':head,'checkedAt':now(),'readOnly':True,'validSigningIdentities':len(valid),'profiles':[record],'provisioningChanges':0,'deviceInstalled':False,'deviceIdentifier':dev['identifier'],'developerMode':props.get('developerModeStatus'),'tunnel':conn.get('tunnelState'),'privateKeyReadOrExported':False,'productionAR1KeyGenerated':False}
(out/'IOS-SIGNING-INVENTORY.json').write_text(json.dumps(result,indent=2)+'\n')
assert record['deviceIncluded'] and private_available and record['development']
print(json.dumps({'assembly':'PASS','iosInventory':'PASS','expiry':record['expiresAt'],'candidate':head}))
