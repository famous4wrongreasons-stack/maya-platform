/** Read-only finite account web-root discovery. No PHP is executed.
 * Unknown roots, links and PHP-like artifacts must be reconciled, never ignored.
 * Private source is returned only for the explicitly requested existing aliases;
 * discovered artifacts carry hashes/structural flags, never source or secrets.
 */
const inspectScript = String.raw`
import pathlib,json,base64,hashlib,os,re
request=json.loads(input())
home=pathlib.Path('/home/m/mocine3388')
rows=[]
for item in request['entries']:
 p=pathlib.Path(item['path']); b=p.read_bytes()
 row=dict(path=str(p),sha256=hashlib.sha256(b).hexdigest(),bytes=len(b))
 if item['role'] in ['full_php','relay_php']:row['source']=base64.b64encode(b).decode()
 rows.append(row)
roots=[];discovered=[];symlinks=[];errors=[]
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
    php_name=bool(re.search(r'\.(?:php\d*|phtml|phar)(?:\.|$)',name,re.I))
    with p.open('rb') as f:
     prefix=f.read(8192)
     # Binary non-PHP assets cannot be promoted silently by this scanner. The
     # server handler/rewrite contract must separately certify executable types.
     if not php_name and b'\0' in prefix:continue
     b=prefix+f.read()
    if not php_name:
     try:s=b.decode('utf-8')
     except UnicodeDecodeError:continue
     if not re.search(r'<\?php(?:\s|$)|<\?=',s,re.I):continue
    else:s=b.decode('utf-8','replace')
    discovered.append(dict(path=str(p),sha256=hashlib.sha256(b).hexdigest(),bytes=len(b),
     directBookRecord='book_record' in s.lower(),
     providerWriteCandidate=bool(re.search(r'yc_post\s*\(|yc_request\s*\(\s*[\x27\x22](?:POST|PUT|PATCH|DELETE)',s,re.I)),
     canonicalRefusal='verified_client_channel_required' in s))
   except OSError as e:errors.append(str(e))
print(json.dumps(dict(rows=rows,found=sorted(r['path'] for r in discovered),
 discovered=discovered,roots=sorted(str(r) for r in roots),symlinks=symlinks,scanErrors=errors)))
`;
module.exports = {inspectScript};
