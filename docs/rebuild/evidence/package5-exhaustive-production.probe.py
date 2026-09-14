"""Read-only launch/source inventory; no app import, database or HTTP call."""
import ast, datetime, hashlib, json, re, subprocess
from pathlib import Path

ROOT = Path('/home/botadmin/barbershop-bot')
RELEASE = Path('/opt/maya-saas/current').resolve()
def sha(data): return hashlib.sha256(data).hexdigest()
def callname(node):
    if isinstance(node,ast.Name): return node.id
    if isinstance(node,ast.Attribute): return callname(node.value)+'.'+node.attr
    if isinstance(node,ast.Call): return callname(node.func)+'()'
    if isinstance(node,ast.Subscript): return callname(node.value)+'[]'
    return '<dynamic>'
def command(args):
    p = subprocess.run(args, capture_output=True, text=True)
    return p.returncode, p.stdout
def refs(text):
    return sorted(set(re.findall(r'(?:/(?:opt|home|usr|bin|sbin|etc|var|tmp|root|srv)/[A-Za-z0-9_.@+/-]+|(?<![A-Za-z0-9_.])[A-Za-z0-9_.-]+\.(?:py|js|sh))', text)))
out = {'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
       'release': str(RELEASE), 'productionWrites': 0, 'databaseConnections': 0,
       'services': [], 'timers': [], 'cron': [], 'python': {}, 'compiled': {},
       'processes': [], 'nginx': []}
_, units = command(['systemctl', 'list-units', '--all', '--type=service', '--no-legend', '--plain'])
for line in units.splitlines():
    name = line.split()[0] if line.split() else ''
    if not re.search(r'maya|barber|telegram|realtime|voice|cron', name, re.I): continue
    _, raw = command(['systemctl', 'show', name, '-p', 'ActiveState', '-p', 'MainPID', '-p', 'FragmentPath', '-p', 'ExecStart', '-p', 'WorkingDirectory'])
    values = dict(x.split('=', 1) for x in raw.splitlines() if '=' in x)
    entry = {k:v for k,v in values.items() if k != 'ExecStart'}
    entry.update(unit=name, execRefs=refs(values.get('ExecStart','')), execHash=sha(values.get('ExecStart','').encode()))
    out['services'].append(entry)
_, timers = command(['systemctl', 'list-timers', '--all', '--no-legend', '--plain'])
out['timers'] = sorted(set(re.findall(r'[A-Za-z0-9_.@-]+\.(?:timer|service)',timers)))
for p in [Path('/etc/crontab'), *Path('/etc/cron.d').glob('*')]:
    if not p.is_file(): continue
    code, raw = command(['sudo','-n','cat',str(p)])
    lines = [x for x in raw.splitlines() if x.strip() and not x.lstrip().startswith('#')]
    out['cron'].append({'file':str(p),'readExit':code,'sha256':sha(raw.encode()),'entries':[{'line':i+1,'refs':refs(s),'sha256':sha(s.encode())} for i,s in enumerate(lines)]})
for user in ['botadmin','root']:
    code, raw = command(['sudo','-n','crontab','-u',user,'-l'])
    out['cron'].append({'user':user,'readExit':code,'sha256':sha(raw.encode()),'entries':[{'line':i+1,'refs':refs(s),'sha256':sha(s.encode())} for i,s in enumerate(raw.splitlines()) if s.strip() and not s.lstrip().startswith('#')]})
_, procs = command(['ps','-eo','pid,ppid,comm,args'])
for line in procs.splitlines()[1:]:
    bits=line.split(None,3)
    if len(bits)<4: continue
    pid,ppid,exe,args=bits
    if re.search(r'python|node|maya|barber|telegram',exe+' '+args,re.I):
        out['processes'].append({'pid':pid,'ppid':ppid,'exe':exe,'refs':refs(args)})
for p in sorted(Path('/etc/nginx').rglob('*')):
    if not p.is_file() or p.suffix not in ('.conf',''): continue
    code,raw=command(['sudo','-n','cat',str(p)])
    if code or not re.search(r'maya|barber|3107|8080|8765|8766',raw,re.I): continue
    # Configuration secrets/headers are excluded; routing directives only.
    directives=[]
    for i,line in enumerate(raw.splitlines(),1):
        if re.match(r'\s*(server_name|listen|root|location|proxy_pass)\b',line):
            safe=re.sub(r'\?.*?(?=[;\s]|$)','',line.strip())
            if 'proxy_pass' in safe: safe=re.sub(r'://[^/\s]+@','://[redacted]@',safe)
            directives.append({'line':i,'directive':safe})
    out['nginx'].append({'file':str(p),'sha256':sha(raw.encode()),'routing':directives})

for p in sorted(ROOT.rglob('*.py')):
    rel=p.relative_to(ROOT)
    if any(x in {'__pycache__','node_modules','.git','backups','backup','site-packages'} or 'venv' in x.lower() for x in rel.parts) or p.name=='config.py' or p.name.startswith('test_'): continue
    source=p.read_text(); lines=source.splitlines(keepends=True); entry={'sha256':sha(p.read_bytes()),'bytes':len(p.read_bytes()),'functions':[],'registrations':[],'imports':[]}
    try: tree=ast.parse(source)
    except SyntaxError: entry['parseError']=True;out['python'][str(rel)]=entry;continue
    for n in ast.walk(tree):
        if isinstance(n,(ast.Import,ast.ImportFrom)):
            entry['imports'].append(n.module if isinstance(n,ast.ImportFrom) else ','.join(a.name for a in n.names))
        if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)):
            seg=''.join(lines[n.lineno-1:n.end_lineno])
            calls=sorted({callname(x.func) for x in ast.walk(n) if isinstance(x,ast.Call)})
            sql=sorted(set(re.findall(r'\b(INSERT(?: OR \w+)? INTO|UPDATE|DELETE FROM|REPLACE INTO)\s+["`]?([A-Za-z_][A-Za-z0-9_]*)',seg,re.I)))
            entry['functions'].append({'name':n.name,'line':n.lineno,'endLine':n.end_lineno,'sha256':sha(seg.encode()),'calls':calls,'sql':sql})
        if isinstance(n,ast.Call):
            fn=callname(n.func)
            if fn.endswith(('add_job','add_get','add_post','add_put','add_delete','add_patch','add_route','add_handler')) or fn in {'CommandHandler','CallbackQueryHandler','MessageHandler'}:
                args=[]
                for a in n.args[:3]:
                    if isinstance(a,ast.Constant) and isinstance(a.value,str):
                        if re.fullmatch(r'[A-Za-z0-9_/{}.*:^$|?<>!=+()\\ -]{1,240}',a.value):args.append(a.value)
                    elif isinstance(a,(ast.Name,ast.Attribute)): args.append(ast.unparse(a))
                entry['registrations'].append({'line':n.lineno,'call':fn,'args':args})
    entry['imports']=sorted(set(filter(None,entry['imports'])))
    out['python'][str(rel)]=entry
for directory in ['dist/src','dist/scripts']:
    for p in sorted((RELEASE/directory).rglob('*.js')):
        out['compiled'][str(p.relative_to(RELEASE))]=sha(p.read_bytes())
print(json.dumps(out,indent=2))
