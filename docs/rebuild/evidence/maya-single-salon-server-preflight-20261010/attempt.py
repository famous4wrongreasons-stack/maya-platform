import datetime,hashlib,json,os,pathlib,re,selectors,signal,subprocess,time
out=pathlib.Path('/private/tmp/maya-single-salon-preflight-20261010')
assert not (out/'attempt.json').exists(), 'One attempt already recorded; no automatic retry'
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
collector=(out/'collector.py').read_bytes()
args=['ssh','-vv','-i','/Users/stanislavmosin/.ssh/yandex_bot','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UpdateHostKeys=no','-o','ConnectTimeout=8','-o','ConnectionAttempts=1','-o','ProxyCommand=ssh -vv -i /Users/stanislavmosin/.ssh/beget_deploy -o BatchMode=yes -o StrictHostKeyChecking=yes -o UpdateHostKeys=no -o ConnectTimeout=8 -o ConnectionAttempts=1 -W %h:%p mocine3388@prime.beget.com','botadmin@api.mayaos.ru','python3 -B -']
receipt={'contract':'maya.single-salon-authorized-readonly-attempt/1','startedAt':now(),'candidateCommit':'6226282e5b1240c9ed9db082909a7eb395d51dc5','authorization':{'questionMessage':'Sentinel_70ef609ce7b081919f4ec67cdefdd5ae','questionAt':'2026-10-10T09:48:30Z','answerMessage':'Sentinel_dee4f07ef0e081919c571ebea8f4e987','answerAt':'2026-10-10T09:49:14Z','answer':'разрешаю','scope':'one existing-route SSH attempt; current tenant/branch/company binding and runtime metadata only'},'target':'botadmin@api.mayaos.ru','route':'existing Beget ProxyCommand','networkAttempts':1,'connectionAttemptsPerHop':1,'connectTimeoutPerHopSeconds':8,'outerDeadlineSeconds':45,'hostKeyChecking':'strict','updateHostKeys':False,'collectorSha256':hashlib.sha256(collector).hexdigest(),'remoteCommand':'python3 -B -','status':'started'}
save=lambda:(out/'attempt.json').write_text(json.dumps(receipt,indent=2)+'\n')
(out/'command.json').write_text(json.dumps({'args':args,'stdinFile':'collector.py'},indent=2)+'\n');save()
p=None;buffers={'out':bytearray(),'err':bytearray()};reason=None;start=time.monotonic()
try:
 p=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
 p.stdin.write(collector);p.stdin.close()
 sel=selectors.DefaultSelector()
 for name,stream in [('out',p.stdout),('err',p.stderr)]:
  os.set_blocking(stream.fileno(),False);sel.register(stream,selectors.EVENT_READ,name)
 while sel.get_map():
  if time.monotonic()-start>45:reason='outer_deadline';break
  for key,_ in sel.select(0.25):
   data=os.read(key.fileobj.fileno(),4096)
   if not data:sel.unregister(key.fileobj);continue
   buffers[key.data].extend(data)
   if len(buffers[key.data])>65536:reason='output_cap';break
  if reason:break
 if reason:
  os.killpg(p.pid,signal.SIGTERM)
  try:p.wait(timeout=2)
  except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait(timeout=2)
 else:p.wait(timeout=2)
 receipt['exitCode']=p.returncode
except Exception as e:
 reason='local_'+type(e).__name__
 if p and p.poll() is None:
  os.killpg(p.pid,signal.SIGTERM)
  try:p.wait(timeout=2)
  except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait(timeout=2)
 receipt['exitCode']=p.returncode if p else None
finally:
 err=buffers['err'].decode('utf8','replace');stdout=bytes(buffers['out'])
 phases={'proxyAuthenticated':bool(re.search(r'Authenticated to prime\.beget\.com',err)),'forwardChannelConfirmed':'channel 0: open confirm' in err,'remoteProtocolBannerCount':err.count('Remote protocol version'),'targetAuthenticated':bool(re.search(r'Authenticated to (?:api\.mayaos\.ru|89\.169\.160\.55)',err)),'timeout':bool(re.search(r'timed out|timeout',err,re.I)),'hostKeyRefused':'Host key verification failed' in err,'authenticationRefused':'Permission denied' in err,'forwardingRefused':bool(re.search(r'open failed|stdio forwarding failed|administratively prohibited',err,re.I))}
 receipt.update({'finishedAt':now(),'seconds':round(time.monotonic()-start,3),'stdoutBytes':len(stdout),'stderrBytes':len(buffers['err']),'phases':phases,'rawSshDebugRetained':False,'localStopReason':reason,'collectorOutputObserved':False,'currentMappingEstablished':False})
 try:
  data=json.loads(stdout)
  assert data.get('contract')=='maya.single-salon-server-metadata/1'
  (out/'server-metadata.json').write_text(json.dumps(data,indent=2)+'\n')
  receipt['collectorOutputObserved']=True;receipt['currentMappingEstablished']=data.get('mapping',{}).get('status')=='observed'
  receipt['status']='metadata_observed' if receipt['currentMappingEstablished'] else 'remote_collector_mapping_unavailable'
 except Exception:
  receipt['status']='no_remote_metadata'
 receipt['noFurtherAttempt']=True
 save();print(json.dumps(receipt,indent=2))
