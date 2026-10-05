from pathlib import Path
import collections, datetime, hashlib, json, re, subprocess

root=Path.cwd(); repo=root/'work/maya-controlled-integration'
out=root/'outputs/release-packaging-final-20261003'; receipts=out/'receipts'
candidate='77ecb3f5696583389e75592141f46fd0664d33d8'
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()==candidate
assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
sha=lambda data:hashlib.sha256(data).hexdigest()
for name in ['backend-build','runtime-build','carrier-build','carrier-capacitor-build','evidence-verifier']:
    record=json.loads((receipts/(name+'.receipt.json')).read_text())
    assert record['candidate']==candidate and record['exit']==0,name

carrier=repo/'maya-carrier-react/dist'
web_js=list((carrier/'web/m').rglob('*.js')); cap_js=list((carrier/'capacitor/m').rglob('*.js'))
assert len(web_js)==len(cap_js)==1
web=web_js[0].read_text(); cap=cap_js[0].read_text()
start=0
while start<min(len(web),len(cap)) and web[start]==cap[start]:start+=1
end=0
while end<min(len(web),len(cap))-start and web[-end-1]==cap[-end-1]:end+=1
assert web[start:len(web)-end]==''
assert cap[start:len(cap)-end]=='https://mayaos.ru'
assert (carrier/'web/styles.css').read_bytes()==(carrier/'capacitor/styles.css').read_bytes()
web_html=(carrier/'web/index.html').read_text();cap_html=(carrier/'capacitor/index.html').read_text()
normal=lambda text:re.sub(r'\./m/[A-Za-z0-9]+/main\.js','./m/CONTENT_ADDRESS/main.js',text)
assert normal(web_html)==normal(cap_html).replace("connect-src 'self' https://mayaos.ru;","connect-src 'self';")
assert 'capacitor proof: PASS' in (receipts/'carrier-capacitor-build.log').read_text()
manifest=repo/'maya-chat-shell/dist/manifest.json'
assert manifest.read_bytes()==subprocess.check_output(['git','show',candidate+':maya-chat-shell/dist/manifest.json'],cwd=repo)
trees=[]
for base in ['maya-saas-backend/dist','maya-chat-shell/dist','maya-carrier-react/dist/web','maya-carrier-react/dist/capacitor']:
    entries=[{'path':str(p.relative_to(repo)),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())}
             for p in sorted((repo/base).rglob('*')) if p.is_file()]
    trees.append({'root':base,'files':len(entries),'inventorySha256':sha(json.dumps(entries,sort_keys=True,separators=(',',':')).encode()),'entries':entries})
parity={'candidate':candidate,'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'parity':'PASS','jsDifference':'exactly one approved API endpoint string','css':'byte identical',
        'htmlDifference':'content address and approved connect-src only','originCheck':'canonical carrier build targetProof PASS',
        'runtimeManifestMatchesGit':True,'inventoryEncoding':'JSON sorted keys, compact separators, UTF-8',
        'trees':trees,'productionDeployment':False,'iphoneInstalled':False}
(out/'ARTIFACT-HASH-PARITY.json').write_text(json.dumps(parity,indent=2)+'\n')

matrix_file=root/'outputs/source-certification/MATRIX-REVIEW.json'
matrix=json.loads(matrix_file.read_text()); rows=matrix['rows']
assert len(rows)==165 and len({r['id'] for r in rows})==165
manifest_file=receipts/'evidence/evidence-manifest.jsonl'
manifest_bytes=manifest_file.read_bytes()
lines=[json.loads(line) for line in manifest_bytes.splitlines() if line.strip()]
verified=json.loads((receipts/'evidence-verifier.log').read_text().splitlines()[0])
assert verified['violations']==[] and verified['manifest_sha256']==sha(manifest_bytes)
profile_source=repo/'maya-saas-backend/src/entitlements/widget-release-profile.contract.ts'
profile_text=profile_source.read_text()
digest='21ffeb2426d9629e8e9110bbecdbdc7b45c0869e70f9395024e0fa728418a49a'
assert digest in profile_text and "Object.freeze(['G6-6', 'G13-R8'])" in profile_text
stops=['G6-6','G13-R8']
fresh=[]
for row in rows:
    claims=[line for line in lines if row['id'] in line['clauses'] and line.get('claim') in ['L','L-T','U']]
    matching=[line for line in claims if line['claim']==row['state']]
    if row['state']=='false':
        assert row['id'] in stops and not claims,row['id']
    else:
        assert matching,row['id']
        if row['state']=='L':assert {line['entry'] for line in matching}=={'HTTP','BIN'},row['id']
    fresh.append({**row,'freshEvidence':claims,'dispositionSource':str(matrix_file.relative_to(root)),
                  'certificationAdmitted':False})
result={'candidate':candidate,'profile':'closed-input.no-handoff@1','registryDigest':digest,
        'profileContractSha256':sha(profile_source.read_bytes()),'matrixSource':str(matrix_file.relative_to(root)),
        'matrixSourceSha256':sha(matrix_file.read_bytes()),'manifestSha256':sha(manifest_bytes),
        'counts':dict(collections.Counter(row['state'] for row in rows)),
        'profileApplicableFalse':0,'globalFalse':2,'globalStops':stops,'rows':fresh,
        'countMeaning':'Source/contract disposition revalidated with fresh verified HTTP/BIN/U evidence. Whole native mutation admission remains mandatory and pending.',
        'completeMutationCertification':'PENDING','certifiedForProfile':False,'fullContractCertified':False}
(out/'FRESH-CLAUSE-EVIDENCE.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'candidate':candidate,'artifactParity':'PASS','freshClauseCounts':result['counts'],
                  'profileApplicableFalse':0,'globalFalse':2,'certificateIssued':False}))
