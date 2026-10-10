import datetime, errno, json, signal, socket, subprocess, time
signal.alarm(20)
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
r={'contract':'maya.known-backend-route-observation/1','startedAt':now(),'sourceHost':socket.gethostname(),'targetHost':'api.mayaos.ru','knownTargetAddress':'89.169.160.55','targetPort':22,'targetTcpAttempts':0,'filesRead':0,'filesChanged':0,'providerRequests':0}
try:
 r['resolvedIpv4']=sorted({a[4][0] for a in socket.getaddrinfo('api.mayaos.ru',22,socket.AF_INET,socket.SOCK_STREAM)})
except Exception as e:r['dnsError']=type(e).__name__
try:
 p=subprocess.run(['ip','-j','route','get','89.169.160.55'],capture_output=True,timeout=2,env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LANG':'C','LC_ALL':'C'})
 r['routeExitCode']=p.returncode
 if p.returncode==0:r['route']=[{k:v for k,v in row.items() if k in ['dst','gateway','dev','prefsrc','src','type','flags']} for row in json.loads(p.stdout)]
except Exception as e:r['routeError']=type(e).__name__
start=time.monotonic()
s=socket.socket(socket.AF_INET,socket.SOCK_STREAM);s.settimeout(8)
r['targetTcpAttempts']=1
try:
 s.connect(('89.169.160.55',22));r['tcpConnected']=True
 s.settimeout(3);banner=s.recv(128)
 r['sshBannerReceived']=banner.startswith(b'SSH-');r['receivedBytes']=len(banner)
 if banner.startswith(b'SSH-'):r['sshProtocol']=banner.split(b'-',2)[1].decode('ascii','replace')
except Exception as e:
 r['tcpConnected']=r.get('tcpConnected',False);r['socketErrorClass']=type(e).__name__;r['socketErrno']=getattr(e,'errno',None)
finally:s.close()
r['tcpSeconds']=round(time.monotonic()-start,3);r['finishedAt']=now()
print(json.dumps(r))
