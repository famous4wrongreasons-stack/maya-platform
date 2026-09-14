import json,re
from pathlib import Path
root=Path('/home/m/mocine3388/muzhskayaestetika.rf/public_html'); targets=['app/api-proxy.php','app/api-proxy.codex-loyalty-20260721.php','app/index.codex-loyalty-20260721.html','app/index.backup-20260731-anton-analytics.html','new.bak/index.html']
rows=[]
for name in targets:
 p=root/name;matches=[]
 for d in [root,*list(p.parent.relative_to(root).parents)]:pass
 for h in [root/'.htaccess',p.parent/'.htaccess']:
  if not h.exists():continue
  s=h.read_text()
  for m in re.finditer(r'<Files(Match)?\s+"([^"]+)">(.*?)</Files(?:Match)?>',s,re.I|re.S):
   matched=bool(re.search(m[2],p.name)) if m[1] else m[2]==p.name
   if matched:matches.append({'htaccess':str(h.relative_to(root)),'line':s[:m.start()].count('\n')+1,'deniesAll':bool(re.search(r'(?:Deny from all|Require all denied)',m[3],re.I))})
 rows.append({'path':name,'exists':p.is_file(),'matchedFilesRules':matches,'blockedByInspectedFilesRules':any(x['deniesAll'] for x in matches)})
print(json.dumps({'productionWrites':0,'httpCalls':0,'checks':rows},indent=2))
