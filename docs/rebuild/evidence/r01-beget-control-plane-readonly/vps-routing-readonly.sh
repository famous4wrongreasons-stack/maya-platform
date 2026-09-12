python3 - <<'PY'
import subprocess,re,json,hashlib,datetime
r=subprocess.run(['sudo','-n','nginx','-T'],capture_output=True,text=True,timeout=25)
s=r.stdout
out={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'command':'sudo -n nginx -T (read-only)','exitCode':r.returncode,'configurationSha256':hashlib.sha256(s.encode()).hexdigest(),'configurationTestSuccessful':'test is successful' in r.stderr,'selectedRoutingLines':[],'phpOrFastCgiMention':bool(re.search(r'(?i)php|fastcgi_pass',s))}
source=None
for i,l in enumerate(s.splitlines(),1):
 if l.startswith('# configuration file '):source=l[len('# configuration file '):].rstrip(':')
 if re.match(r'^\s*(server_name|listen|location|root|alias|rewrite|return|proxy_pass|fastcgi_pass|include)\s',l):
  safe=re.sub(r'(https?://)[^/\s:@]+:[^/\s@]+@',r'\1[redacted]@',l)
  out['selectedRoutingLines'].append({'source':source,'lineInDump':i,'text':safe})
print(json.dumps(out,indent=2))
PY
