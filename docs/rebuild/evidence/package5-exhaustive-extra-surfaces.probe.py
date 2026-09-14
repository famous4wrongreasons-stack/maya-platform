import ast,hashlib,json,re,subprocess
from pathlib import Path
out={'productionWrites':0,'databaseConnections':0,'static':{},'operatorEntrypoints':{},'main':{},'observer':{}}
root=Path('/var/www/maya-platform')
for p in root.rglob('*'):
 if p.is_file() and p.suffix in {'.js','.html','.php'} and not any(x in p.parts for x in ['node_modules','.git']):
  s=p.read_text(errors='replace');out['static'][str(p.relative_to(root))]={'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':len(p.read_bytes()),'refs':sorted(set(re.findall(r'["\']((?:/api/|\.?/?[^"\'\s<>]*\.php)[^"\'\s<>]*)["\']',s)))[:1000]}
release=Path('/opt/maya-saas/current').resolve()
for f in ['main.js','dist/prisma.config.js','dist/prisma/seed.js']:
 p=release/f
 if p.is_file():out['main'][f]={'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
for p in list(Path('/home/botadmin/barbershop-bot').glob('*.sh'))+list(Path('/opt').glob('maya*/*.sh')):
 s=p.read_text(errors='replace');out['operatorEntrypoints'][str(p)]={'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'refs': sorted(set(re.findall(r'(?:/(?:opt|home|usr|var|tmp)/[A-Za-z0-9_./-]+|[A-Za-z0-9_.-]+\.(?:py|js|sh))',s)))}
p=Path('/opt/maya-shadow-observer/legacy_appointment_shadow_observer.py');s=p.read_text();t=ast.parse(s)
out['observer']={'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'functions':[{'name':n.name,'line':n.lineno,'calls':sorted(set(ast.unparse(c.func) for c in ast.walk(n) if isinstance(c,ast.Call)))} for n in ast.walk(t) if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))]}
print(json.dumps(out,indent=2))
