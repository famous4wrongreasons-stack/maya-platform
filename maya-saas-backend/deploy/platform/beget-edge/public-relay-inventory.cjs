/** Read-only finite account web-root discovery. No PHP is executed.
 * Unknown roots, links and PHP-like artifacts must be reconciled, never ignored.
 * Private source is returned only for the explicitly requested existing aliases;
 * discovered artifacts carry hashes/structural flags, never source or secrets.
 */
// Single source of truth for the PHP-like predicate. The live host scanner and the
// local candidate gate interpolate these exact sources, so they cannot drift apart.
const phpNamePattern = String.raw`\.(?:php\d*|phtml?|phar)(?:\.|$)`;
const phpOpenerPattern = String.raw`<\?php(?:\s|$)|<\?=`;
const routingConfigNames = ['.htaccess', '.user.ini', 'php.ini'];
const routingConfigNamesPy = '[' + routingConfigNames.map((n) => "'" + n + "'").join(',') + ']';

const inspectScript = String.raw`
import pathlib,json,base64,hashlib,os,re
request=json.loads(input())
home=pathlib.Path('/home/m/mocine3388')
rows=[]
for item in request['entries']:
 p=pathlib.Path(item['path'])
 if not p.exists():
  rows.append(dict(path=str(p),sha256=None,missing=True));continue
 b=p.read_bytes()
 row=dict(path=str(p),sha256=hashlib.sha256(b).hexdigest(),bytes=len(b))
 if item['role'] in ['full_php','relay_php']:row['source']=base64.b64encode(b).decode()
 rows.append(row)
roots=[];discovered=[];symlinks=[];errors=[];configuration=[]
for name in request.get('hosting',{}).get('absentAncestors',[]):
 if pathlib.Path(name).exists():errors.append('Unexpected ancestor configuration: '+name)
for directory in sorted(home.iterdir()):
 if not directory.is_dir():continue
 root=directory/'public_html'
 if root.exists():
  roots.append(root)
  if directory.is_symlink():symlinks.append(dict(path=str(directory),target=str(directory.resolve())))
for root in roots:
 if root.is_symlink():symlinks.append(dict(path=str(root),target=str(root.resolve())))
 for parent,dirs,files in os.walk(root,followlinks=False,onerror=lambda e:errors.append(str(e))):
  for name in dirs+files:
   p=pathlib.Path(parent)/name
   if p.is_symlink():symlinks.append(dict(path=str(p),target=str(p.resolve())))
  for name in files:
   p=pathlib.Path(parent)/name
   if p.is_symlink():continue
   try:
    if name in ${routingConfigNamesPy}:configuration.append(str(p))
    php_name=bool(re.search(r'${phpNamePattern}',name,re.I))
    with p.open('rb') as f:
     prefix=f.read(8192)
     # Binary non-PHP assets cannot be promoted silently by this scanner. The
     # server handler/rewrite contract must separately certify executable types.
     if not php_name and b'\0' in prefix:continue
     b=prefix+f.read()
    if not php_name:
     try:s=b.decode('utf-8')
     except UnicodeDecodeError:continue
     if not re.search(r'${phpOpenerPattern}',s,re.I):continue
    else:s=b.decode('utf-8','replace')
    discovered.append(dict(path=str(p),sha256=hashlib.sha256(b).hexdigest(),bytes=len(b),
     directBookRecord='book_record' in s.lower(),
     providerWriteCandidate=bool(re.search(r'yc_post\s*\(|yc_request\s*\(\s*[\x27\x22](?:POST|PUT|PATCH|DELETE)',s,re.I)),
     canonicalRefusal='verified_client_channel_required' in s))
   except OSError as e:errors.append(str(e))
print(json.dumps(dict(rows=rows,found=sorted(r['path'] for r in discovered),configurationFound=sorted(configuration),
 discovered=discovered,roots=sorted(str(r) for r in roots),symlinks=symlinks,scanErrors=errors)))
`;
/** Read-only private-archive equality. Hash-only by construction: the script returns
 * content hashes, counts and structural flags, never archive bytes, names or paths.
 * The archive directory is operator-local; an unresolved locator returns
 * resolved=false so the caller fails the gate closed instead of skipping the class.
 */
const archiveScript = String.raw`
import pathlib,json,hashlib,os
r=json.loads(input())
home=pathlib.Path.home()
def out(**kw):
 base=dict(resolved=False,reason=None,source=None,mode=None,files=0,bytes=0,hashes=[],symlinks=0,errors=[],insidePublicRoot=None)
 base.update(kw);print(json.dumps(base));raise SystemExit(0)
target=(r.get('dir') or '').strip();source='env'
if not target:
 source='pointer';p=home/r['pointer']
 if p.is_symlink() or not p.is_file():out(reason='locator-missing',source=source)
 try:content=p.read_text(encoding='utf-8')
 except OSError:out(reason='locator-unreadable',source=source)
 lines=[l.strip() for l in content.splitlines() if l.strip() and not l.strip().startswith('#')]
 target=lines[0] if lines else ''
if not target:out(reason='locator-empty',source=source)
base=pathlib.Path(target)
if not base.is_absolute():base=home/base
if base.is_symlink() or not base.is_dir():out(reason='archive-missing',source=source)
# A private archive inside a served document root is not a private archive.
if 'public_html' in base.resolve().parts:out(reason='archive-inside-public-root',source=source,insidePublicRoot=True)
hashes=set();files=0;total=0;links=0;errors=set()
for parent,dirs,names in os.walk(base,followlinks=False,onerror=lambda e:errors.add('scan')):
 for n in dirs+names:
  if (pathlib.Path(parent)/n).is_symlink():links+=1
 for n in names:
  p=pathlib.Path(parent)/n
  if p.is_symlink():continue
  try:
   h=hashlib.sha256();size=0
   with p.open('rb') as f:
    while True:
     chunk=f.read(1048576)
     if not chunk:break
     size+=len(chunk);h.update(chunk)
   hashes.add(h.hexdigest());files+=1;total+=size
  except OSError:errors.add('unreadable')
out(resolved=True,source=source,mode=oct(base.stat().st_mode & 0o777),files=files,bytes=total,
 hashes=sorted(hashes),symlinks=links,errors=sorted(errors),insidePublicRoot=False)
`;
module.exports = {inspectScript, archiveScript, phpNamePattern, phpOpenerPattern, routingConfigNames};
