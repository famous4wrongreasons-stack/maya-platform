"""Pure PHP relay allowlist proof; never executes an application/provider entry."""
import base64
import hashlib
import json
from pathlib import Path
import re
import subprocess

root = Path(__file__).resolve().parents[3]
source = (root/'maya-saas-backend/deploy/platform/beget-edge/rc/r09-site-community-proxy.php').read_text()
match = re.search(r'\$payload = array_intersect_key\(\$input, array_flip\(\[(.*?)\]\)\);', source, re.S)
assert match and source.count('site-gateway-v1:') == 1
assert "$payload['visitor'] = hash_hmac" in source and "$payload['network'] = hash_hmac" in source
assert "$payload['gateway_action'] = $routes[$action];" in source
program = '''<?php
$input=['slug'=>'known','text'=>'Public text','request_key'=>'synthetic-stable-key','expected_version'=>4,'consent_policy_version'=>'public-comment-consent/1','tenantId'=>'forged','userId'=>'forged','clientId'=>'forged','visitor'=>'forged','network'=>'forged'];
''' + match.group(0) + '''
if(isset($payload['tenantId'])||isset($payload['userId'])||isset($payload['clientId'])||isset($payload['visitor'])||isset($payload['network']))exit(5);
if($payload['expected_version']!==4||$payload['request_key']!=='synthetic-stable-key'||$payload['consent_policy_version']!=='public-comment-consent/1')exit(6);
echo json_encode(['pureAllowlist'=>'PASS','callerAuthorityFields'=>0]);
'''
remote = f'''import base64,json,subprocess
php='/usr/local/bin/php8.4'
source=base64.b64decode({base64.b64encode(source.encode()).decode()!r})
lint=subprocess.run([php,'-n','-l'],input=source,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
assert lint.returncode==0, 'R09 candidate PHP syntax failed'
proof=subprocess.run([php,'-n'],input=base64.b64decode({base64.b64encode(program.encode()).decode()!r}),stdout=subprocess.PIPE,stderr=subprocess.PIPE)
assert proof.returncode==0, 'R09 pure allowlist failed'
print(json.dumps({{'package':'R09','syntax':'PASS','allowlist':json.loads(proof.stdout),'applicationEntryExecuted':False,'productionEffects':0}}))
'''
run = subprocess.run(['ssh','-i',str(Path.home()/'.ssh/beget_deploy'),'-o','BatchMode=yes','-o','ConnectTimeout=20','mocine3388@prime.beget.com','python3 -'],input=remote.encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=40)
if run.returncode:
    raise RuntimeError('R09 pure PHP proof failed: '+run.stderr.decode()[-1000:])
print(run.stdout.decode().strip())
