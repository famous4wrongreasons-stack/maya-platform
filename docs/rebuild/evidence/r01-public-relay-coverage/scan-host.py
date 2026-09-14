import pathlib,os,json,hashlib,re,datetime
h=pathlib.Path.home(); roots=[];errors=[]
# Account-level site directories only: no entire-server or arbitrary home crawl.
for d in h.iterdir():
 if d.is_dir():
  p=d/'public_html'
  if p.exists():roots.append(p)
rows=[];rules=[];links=[]
for root in roots:
 for directory,dirs,files in os.walk(root,followlinks=False,onerror=lambda e:errors.append(str(e))):
  for name in dirs+files:
   p=pathlib.Path(directory)/name
   if p.is_symlink():links.append(dict(path=str(p),target=os.readlink(p),resolved=str(p.resolve())))
  for name in files:
   p=pathlib.Path(directory)/name
   if p.is_symlink():continue
   try:
    if p.name=='.htaccess':
     b=p.read_bytes();s=b.decode('utf-8','replace')
     safe=[]
     for n,line in enumerate(s.splitlines(),1):
      if re.match(r'^\s*(Rewrite|Alias|ScriptAlias|DirectoryIndex|Options|AddHandler|SetHandler|AddType|Action|Require|Order|Deny|Allow|AcceptPathInfo|<(?:Files|Directory|Location)|</(?:Files|Directory|Location))',line,re.I):safe.append(dict(line=n,text=line))
     rules.append(dict(path=str(p),sha256=hashlib.sha256(b).hexdigest(),rules=safe))
    # Inspect all text-sized files for PHP signature too, not only names containing API.
    st=p.stat()
    if st.st_size>4*1024*1024:
     if re.search(r'\.ph(?:p\d*|tml|ar)(?:\.|$)',name,re.I):errors.append('oversize PHP '+str(p))
     continue
    b=p.read_bytes()
    if not (re.search(r'\.ph(?:p\d*|tml|ar)(?:\.|$)',name,re.I) or b'<?php' in b or b'<?=' in b):continue
    s=b.decode('utf-8','replace')
    features={k:bool(re.search(v,s,re.I)) for k,v in dict(bookRecord=r'book_record',provider=r'yclients|YC_API|yc_request|yc_post',relay=r'curl_exec|curl_init|file_get_contents\s*\(\s*[\'\"]https?|/api/|proxy',refusal=r'verified_client_channel_required',mutation=r'yc_post\s*\(|CURLOPT_POST|CURLOPT_CUSTOMREQUEST|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM',phone=r'\$phone',fullname=r'\$fullname').items()}
    rows.append(dict(path=str(p),root=str(root),sha256=hashlib.sha256(b).hexdigest(),bytes=len(b),mtime=datetime.datetime.fromtimestamp(st.st_mtime,datetime.timezone.utc).isoformat(),features=features))
   except OSError as e:errors.append(str(e))
print(json.dumps(dict(observedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),roots=[str(p) for p in roots],files=rows,htaccess=rules,symlinks=links,errors=errors),indent=2))
