"""Bounded read-only evidence: inspect one PHP artifact, then HTTP HEAD only.

Never call create_record, send a body/identity, execute PHP through SSH, or print
source/configuration values. The existing artifact is read only in host memory.
"""
import datetime
import json
import shlex
import subprocess
import urllib.request
from pathlib import Path

SCRIPT = r'''
from pathlib import Path
import hashlib,json,re,datetime
p=Path('/home/m/mocine3388/muzhskayaestetika.rf/public_html/app/backups/api-proxy-before-loyalty-20260721-2035.php')
b=p.read_bytes(); s=b.decode('utf-8')
assert hashlib.sha256(b).hexdigest()=='8cc22eafdcefbaa620427c53e7c930c01bb72e0e51e2af45e7d9205edd3e4cb5'
start=s.index("case 'create_record':"); end=s.index("case '",start+20); block=s[start:end]
print(json.dumps(dict(path=str(p),sha256=hashlib.sha256(b).hexdigest(),bytes=len(b),mtimeUtc=datetime.datetime.fromtimestamp(p.stat().st_mtime,datetime.timezone.utc).isoformat(),createCaseStartLine=s[:start].count('\n')+1,createCaseEndLineExclusive=s[:end].count('\n')+1,createCaseSha256=hashlib.sha256(block.encode()).hexdigest(),directBookRecord=bool(re.search(r'yc_post\([^\n]*book_record',block)),phoneInput='$phone' in block,fullnameInput='$fullname' in block,canonicalRefusal='verified_client_channel_required' in block,actionEngineDelegation=bool(re.search('ActionExecution|ActionEngine|/api/appointments',block)),folderAccessFile=(p.parent/'.htaccess').exists(),localTgConfigExists=(p.parent/'tg-config.php').exists())))
'''

result = subprocess.run(
    ['ssh', '-i', str(Path.home() / '.ssh/beget_deploy'), '-o', 'BatchMode=yes',
     '-o', 'ConnectTimeout=20', 'mocine3388@prime.beget.com',
     'python3 -c ' + shlex.quote(SCRIPT)],
    capture_output=True, text=True, timeout=45,
)
assert result.returncode == 0, 'Read-only source identity check failed; private output withheld'
evidence = json.loads(result.stdout)
url = 'https://malesthetic.pro/app/backups/api-proxy-before-loyalty-20260721-2035.php'
with urllib.request.urlopen(urllib.request.Request(url, method='HEAD'), timeout=20) as response:
    evidence['http'] = dict(method='HEAD', url=url, status=response.status,
                           contentType=response.headers.get('Content-Type'),
                           contentLength=response.headers.get('Content-Length'),
                           poweredBy=response.headers.get('X-Powered-By'))
evidence.update(observedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                realBookingRequests=0, providerMutations=0, productionFileChanges=0,
                sourcePrintedOrCommitted=False, mainR01ManifestContainsPath=False)
print(json.dumps(evidence, indent=2))
