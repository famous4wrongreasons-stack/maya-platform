import ast,base64,hashlib,json,re
from pathlib import Path
root=Path('/home/botadmin/barbershop-bot');out={}
for p in sorted(root.glob('*.py')):
 if p.name.startswith(('config','test_')):continue
 raw=p.read_text();tree=ast.parse(raw);lines=raw.splitlines(keepends=True);offset=[0]
 for line in lines:offset.append(offset[-1]+len(line))
 spans=[]
 for n in ast.walk(tree):
  if isinstance(n,(ast.Assign,ast.AnnAssign)):
   names=' '.join(ast.unparse(x) for x in (n.targets if isinstance(n,ast.Assign) else [n.target]))
   if re.search(r'(secret|password|token|api_key)',names,re.I):
    for v in ast.walk(n.value) if n.value else []:
     if isinstance(v,ast.Constant) and isinstance(v.value,str) and len(v.value)>=20 and '\n' not in v.value and not re.fullmatch('[A-Z_0-9]+',v.value):
      start=offset[v.lineno-1]+len(lines[v.lineno-1].encode()[:v.col_offset].decode());end=offset[v.end_lineno-1]+len(lines[v.end_lineno-1].encode()[:v.end_col_offset].decode());spans.append((start,end,repr('[REDACTED]')))
  if isinstance(n,ast.Constant) and isinstance(n.value,int) and not isinstance(n.value,bool) and n.value>100000000:
   start=offset[n.lineno-1]+len(lines[n.lineno-1].encode()[:n.col_offset].decode());end=offset[n.end_lineno-1]+len(lines[n.end_lineno-1].encode()[:n.end_col_offset].decode());spans.append((start,end,'0'))
 text=raw
 for a,b,v in sorted(set(spans),reverse=True):text=text[:a]+v+text[b:]
 ast.parse(text)
 out[p.name]={'sourceSha256':hashlib.sha256(raw.encode()).hexdigest(),'redactions':len(set(spans)),'sourceBase64':base64.b64encode(text.encode()).decode()}
print(json.dumps(out))
