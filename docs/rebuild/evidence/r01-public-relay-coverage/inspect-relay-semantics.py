from pathlib import Path
import json,hashlib,re
h=Path.home();rows=[]
for site in ['mayaos.ru','mocine3388.beget.tech','muzhskayaestetika.rf']:
 root=h/site/'public_html'
 for p in sorted(root.rglob('*')):
  if not p.is_file() or not re.search(r'\.(php\d*|phtml|phar)(\.|$)',p.name,re.I):continue
  b=p.read_bytes();s=b.decode('utf8','replace')
  match=re.search(r"case\s+['\"]create_record['\"]\s*:(.*?)(?=\bcase\s+['\"]|\bdefault\s*:|$)",s,re.S)
  block=match.group(0) if match else ''
  rows.append(dict(path=str(p),sha256=hashlib.sha256(b).hexdigest(),createCase=bool(match),createCaseStart=s[:match.start()].count('\n')+1 if match else None,createCaseSha256=hashlib.sha256(block.encode()).hexdigest() if block else None,directBookRecord='book_record' in s.lower(),directRecordsWrite=bool(re.search(r'yc_post\s*\([^;]*?/records/',block,re.S)),phoneFullnameBookingAuthority=bool('$phone' in block and '$fullname' in block and re.search(r'yc_post\s*\(',block)),canonicalRefusal='verified_client_channel_required' in block))
print(json.dumps(rows,indent=2))
