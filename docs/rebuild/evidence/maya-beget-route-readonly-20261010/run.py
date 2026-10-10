import datetime,hashlib,json,pathlib,subprocess,time
b=pathlib.Path('/private/tmp/maya-beget-route-readonly-20261010')
assert not (b/'attempt.json').exists(),'One bounded observation already recorded'
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
collector=(b/'collector.py').read_bytes()
a=['ssh','-v','-i','/Users/stanislavmosin/.ssh/beget_deploy','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UpdateHostKeys=no','-o','ConnectionAttempts=1','-o','ConnectTimeout=8','mocine3388@prime.beget.com','python3 -B -']
r={'contract':'maya.beget-route-readonly-attempt/1','startedAt':now(),'authorization':'Parent continuation: same read-only scope, existing Beget route and only known backend address/port; no scan or changes','outerDeadlineSeconds':30,'collectorSha256':hashlib.sha256(collector).hexdigest(),'networkAttemptsToBeget':1,'targetAuthenticationAttempted':False,'status':'started'}
(b/'command.json').write_text(json.dumps({'args':a,'stdinFile':'collector.py'},indent=2)+'\n')
(b/'attempt.json').write_text(json.dumps(r,indent=2)+'\n')
t=time.monotonic();stdout=b'';stderr=b''
try:
 p=subprocess.run(a,input=collector,capture_output=True,timeout=30);stdout=p.stdout;stderr=p.stderr;r['exitCode']=p.returncode
except subprocess.TimeoutExpired as e:
 stdout=e.stdout or b'';stderr=e.stderr or b'';r['localDeadlineHit']=True
r.update({'finishedAt':now(),'seconds':round(time.monotonic()-t,3),'stdoutBytes':len(stdout),'stderrBytes':len(stderr),'begetAuthenticated':b'Authenticated to prime.beget.com' in stderr,'rawSshDebugRetained':False})
r['terminalErrorClasses']=[v for marker,v in [(b'Connection timed out','connection_timeout'),(b'Connection refused','connection_refused'),(b'Host key verification failed','hostkey_refused'),(b'Permission denied','authentication_denied'),(b'No route to host','no_route')] if marker in stderr]
try:
 d=json.loads(stdout);assert d['contract']=='maya.known-backend-route-observation/1'
 (b/'route-observation.json').write_text(json.dumps(d,indent=2)+'\n');r['status']='route_metadata_observed'
except Exception:r['status']='no_route_metadata'
(b/'attempt.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps(r,indent=2))
if r['status']=='route_metadata_observed':print(json.dumps(d,indent=2))
