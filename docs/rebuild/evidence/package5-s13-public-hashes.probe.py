"""Read-only public source/routing hashes. No PHP evaluation or HTTP/job/DB calls."""
import datetime
import hashlib
import json
from pathlib import Path

vps=Path('/var/www/maya-platform').exists()
roots={'vps':Path('/var/www/maya-platform')} if vps else {
    'muzhskayaestetika.rf':Path('/home/m/mocine3388/muzhskayaestetika.rf/public_html'),
    'mayaos.ru':Path('/home/m/mocine3388/mayaos.ru/public_html'),
}
out={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
     'host':'vps' if vps else 'beget', 'productionWrites':0,'databaseConnections':0,
     'jobTriggers':0,'sites':{},'routing':{}}
for name,root in roots.items():
    entries={};routing={}
    for p in sorted(root.rglob('*')):
        rel=p.relative_to(root)
        if not p.is_file() or any(x in {'node_modules','.git','vendor','uploads','cache','backups','backup'} for x in rel.parts):
            continue
        if p.suffix.lower() in {'.php','.html','.js'}:
            b=p.read_bytes();entries[str(rel)]={'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
        elif p.name=='.htaccess':
            routing[str(rel)]=hashlib.sha256(p.read_bytes()).hexdigest()
    out['sites'][name]=entries;out['routing'][name]=routing
print(json.dumps(out,indent=2))
