import os,pathlib,json,hashlib,datetime
h=pathlib.Path('/home/m/mocine3388'); out={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sites':[],'ancestors':[],'serverConfig':[],'localConfiguration':[]}
for n in ['mayaos.ru','mocine3388.beget.tech','muzhskayaestetik.rf','muzhskayaestetika.rf']:
 p=h/n; root=p/'public_html'
 out['sites'].append({'site':n,'siteExists':p.exists(),'siteSymlink':p.is_symlink(),'siteEntries':sorted(x.name for x in p.iterdir()),'rootExists':root.exists(),'rootSymlink':root.is_symlink(),'resolvedRoot':str(root.resolve())})
for p in [h]+[h/n for n in ['mayaos.ru','mocine3388.beget.tech','muzhskayaestetik.rf','muzhskayaestetika.rf']]:
 for name in ['.htaccess','.user.ini','php.ini']:
  f=p/name; out['ancestors'].append({'path':str(f),'exists':f.exists(),'sha256':hashlib.sha256(f.read_bytes()).hexdigest() if f.is_file() else None})
for path in ['/etc/nginx','/etc/apache2/virtdom','/etc/apache2/conf-available','/etc/apache2/apache2.conf','/etc/apache2/sites-enabled','/etc/apache2/mods-enabled']:
 p=pathlib.Path(path)
 try:
  if p.is_dir():
   # Test access only; no enumeration of other hosting customers.
   with os.scandir(p) as scan: next(scan,None)
  else:
   with p.open('rb') as f: f.read(1)
  out['serverConfig'].append({'path':path,'readable':True})
 except OSError as e:out['serverConfig'].append({'path':path,'readable':False,'error':type(e).__name__})
# Check only app-root config directives relevant to alternative execution paths.
for site in out['sites']:
 root=pathlib.Path(site['resolvedRoot'])
 if not root.exists():continue
 for d,dirs,files in os.walk(root,followlinks=False):
  for name in files:
   if name not in ['.htaccess','.user.ini','php.ini','.php.ini']:continue
   p=pathlib.Path(d)/name;b=p.read_bytes();ls=b.decode('utf8','replace').splitlines()
   relevant=[]
   for i,l in enumerate(ls,1):
    import re
    if re.search(r'(?i)^\s*(?:Include|Alias|ScriptAlias|Rewrite\w*|Proxy\w*|AddHandler|SetHandler|AddType|RemoveHandler|RemoveType|Options|DirectoryIndex|FallbackResource|ErrorDocument|AccessFileName|auto_prepend_file|auto_append_file|Passenger\w*|Action|php_value|php_flag)\b',l) and not l.lstrip().startswith('#'):relevant.append({'line':i,'text':l})
   out['localConfiguration'].append({'path':str(p),'sha256':hashlib.sha256(b).hexdigest(),'routingOrExecutionDirectives':relevant})
print(json.dumps(out,ensure_ascii=False,indent=2))
