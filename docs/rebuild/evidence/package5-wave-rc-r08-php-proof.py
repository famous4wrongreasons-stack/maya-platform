"""Pure helper/parse proof via the documented PHP runtime. No file deployment,
application entry point execution, provider calls or messages. Stdin only.
"""
import argparse
import base64
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(); parser.add_argument('--candidate', required=True); parser.add_argument('--base', required=True); parser.add_argument('--output', required=True); args = parser.parse_args()
candidate = Path(args.candidate)
base = Path(args.base)
helper = (candidate / 'package5-client-consent-proxy.php').read_text()
fixture = helper + '''
$checks=[];
foreach (['projection','response','withdraw'] as $operation) {
    $input=['operation'=>$operation];
    if($operation!=='projection'){$input['command']=['requestId'=>'canonical-request','expectedAcceptedVersion'=>1,'kind'=>$operation,'rating'=>$operation==='response'?4:null,'comment'=>null];$input['idempotencyKey']='00000000-0000-4000-8000-000000000001';}
    $server=['HTTP_X_TELEGRAM_INITDATA'=>'signed-synthetic-channel'];
    [$path,$body,$headers]=maya_client_consent_request('native_feedback',$input,$server);
    if($path!=='/api/client/feedback'||json_decode($body,true)!==$input||!in_array('X-Telegram-InitData: signed-synthetic-channel',$headers,true))throw new Exception('fixed verified-channel relay mismatch');
    $checks[]=$operation;
}
foreach (['clientId','tenantId','telegramChatId','provider','url','session_token'] as $key) {
    $rejected=false;try{maya_client_consent_request('native_feedback',['operation'=>'projection',$key=>'forged'],[]);}catch(InvalidArgumentException $error){$rejected=true;}
    if(!$rejected)throw new Exception('untrusted authority accepted');$checks[]='reject-'.$key;
}
$rejected=false;try{maya_client_consent_request('native_feedback',['operation'=>'projection'],['HTTP_AUTHORIZATION'=>"Bearer a\\r\\nInjected: true"]);}catch(InvalidArgumentException $error){$rejected=true;}
if(!$rejected)throw new Exception('header injection');$checks[]='reject-header-injection';
[$path,$body,$headers]=maya_client_consent_request('notify_prefs',[],[]);if($path!=='/api/cabinet/notify-prefs')throw new Exception('prior route changed');
echo json_encode(['result'=>'PASS','checks'=>$checks,'oldRoutePreserved'=>true,'productionEffects'=>0]);
'''
requests = [{'label': 'r08-pure-helper', 'php': '8.4', 'lint': False, 'source': base64.b64encode(fixture.encode()).decode()}]
for path in sorted(candidate.glob('*.php')):
    for version in (['8.4'] if path.name == 'package5-client-consent-proxy.php' else ['5.6', '8.4']):
        requests.append({'label': path.name + ':' + version, 'php': version, 'lint': True, 'source': base64.b64encode(path.read_bytes()).decode()})
for path in sorted(candidate.glob('api-proxy*.php')):
    requests.append({'label': 'base:' + path.name + ':5.6', 'php': '5.6', 'lint': True, 'source': base64.b64encode((base / path.name).read_bytes()).decode()})
remote = '''import base64,json,subprocess
requests=REQUESTS
out={}
for item in requests:
    result=subprocess.run(['/usr/local/bin/php'+item['php'],'-n']+(['-l'] if item['lint'] else []),input=base64.b64decode(item['source']),capture_output=True,timeout=20)
    out[item['label']]={'exit':result.returncode,'stdout':result.stdout.decode(),'stderr':result.stderr.decode()}
print(json.dumps(out))
'''.replace('REQUESTS', repr(requests))
result = subprocess.run(['ssh', '-i', '/Users/stanislavmosin/.ssh/beget_deploy', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', 'mocine3388@prime.beget.com', 'python3 -'], input=remote.encode(), capture_output=True, timeout=60)
if result.returncode:
    raise RuntimeError('Read-only PHP proof transport unavailable')
results = json.loads(result.stdout)
Path(args.output).write_text(json.dumps(results, indent=2) + '\n')
assert all(item['exit'] == 0 for key, item in results.items() if not key.endswith(':5.6')), {key: value for key, value in results.items() if value['exit'] and not key.endswith(':5.6')}
for path in candidate.glob('api-proxy*.php'):
    original, proposed = results['base:' + path.name + ':5.6'], results[path.name + ':5.6']
    assert original == proposed, 'Unexpected change in legacy parser baseline'
# These R02 API aliases already require PHP 8; the upstream PHP 5.6 repair
# applied to different native/platform aliases, which this package never edits.
assert json.loads(results['r08-pure-helper']['stdout'])['result'] == 'PASS'
print(json.dumps({'package': 'R08', 'phpAliasParses': '2/2', 'pureHelper': 'PASS', 'php84': 'PASS', 'php56BaselineUnchanged': True, 'realApplicationExecuted': False, 'productionEffects': 0}))
