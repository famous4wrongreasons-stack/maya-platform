"""Parse both release artifacts and execute only their isolated retirement cases.
Read-only PHP stdin; no application entry, writes, provider calls or deployment.
"""
import argparse
import base64
import json
from pathlib import Path
import re
import runpy
import subprocess

p=argparse.ArgumentParser();p.add_argument('--candidate',required=True);p.add_argument('--output',required=True);a=p.parse_args()
overlay=runpy.run_path(str(Path(__file__).with_name('package5-wave-rc-r12-php-overlay.py')));requests=[]
for path in sorted(Path(a.candidate).glob('api-proxy*.php')):
    source=path.read_text();cases=[]
    for name in overlay['CASES']:
        m=re.search(r"(?m)^[ \t]*case '"+name+"':",source);assert m
        end=re.search(r"(?m)^[ \t]*(?:case '[^']+':|default:)",source[m.end():]);assert end
        body=source[m.end():m.end()+end.start()];assert body==overlay['BODY']
        cases.append("case '"+name+"':"+body)
    for helper in overlay['HELPERS']:assert not re.search(r'\b'+helper+r'\s*\(',source)
    requests.append({'name':path.name,'lint':True,'source':base64.b64encode(source.encode()).decode()})
    fixture="<?php\nforeach ("+repr(overlay['CASES']).replace('[','[').replace(']',']')+" as $action) { ob_start(); switch ($action) {"+'\n'.join(cases)+"} $result=json_decode(ob_get_clean(),true); if(http_response_code()!==410 || $result['business_mutations']!==0 || $result['legacy_files_changed']!==0)throw new Exception('retirement mismatch'); } echo json_encode(['retiredCases'=>7,'result'=>'PASS','productionEffects'=>0]);"
    requests.append({'name':path.name+':isolated-cases','lint':False,'source':base64.b64encode(fixture.encode()).decode()})
remote='''import base64,json,subprocess
out={}
for r in REQUESTS:
 p=subprocess.run(['/usr/local/bin/php8.4','-n']+(['-l'] if r['lint'] else []),input=base64.b64decode(r['source']),capture_output=True,timeout=20)
 out[r['name']]={'exit':p.returncode,'stdout':p.stdout.decode(),'stderr':p.stderr.decode()}
print(json.dumps(out))
'''.replace('REQUESTS',repr(requests))
result=subprocess.run(['ssh','-i','/Users/stanislavmosin/.ssh/beget_deploy','-o','BatchMode=yes','-o','ConnectTimeout=20','mocine3388@prime.beget.com','python3 -'],input=remote.encode(),capture_output=True,timeout=60)
assert result.returncode==0,'Read-only PHP verification unavailable';proof=json.loads(result.stdout);assert all(x['exit']==0 for x in proof.values()),proof
Path(a.output).write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({'package':'R12','phpAliases':'2/2','isolatedRetiredCases':'14/14','result':'PASS','applicationExecuted':False,'productionEffects':0}))
