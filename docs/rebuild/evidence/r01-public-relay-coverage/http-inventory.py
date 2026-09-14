import json,pathlib,urllib.request,urllib.error,concurrent.futures,datetime
w=pathlib.Path(__file__).resolve().parent;r=json.loads((w/'host-inventory.json').read_text())
origins={'mayaos.ru':'https://mayaos.ru','muzhskayaestetika.rf':'https://malesthetic.pro','mocine3388.beget.tech':'https://mocine3388.beget.tech'}
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args):return None
opener=urllib.request.build_opener(NoRedirect)
def check(row):
 root=pathlib.Path(row['root']);site=root.parent.name;rel=pathlib.Path(row['path']).relative_to(root);url=origins[site]+'/'+str(rel)
 try:
  response=opener.open(urllib.request.Request(url,method='HEAD'),timeout=20)
 except urllib.error.HTTPError as e:response=e
 except Exception as e:return {'path':row['path'],'url':url,'error':type(e).__name__}
 with response:
  return dict(path=row['path'],url=url,status=response.status,contentType=response.headers.get('Content-Type'),location=response.headers.get('Location'),method='HEAD')
rows=[x for x in r['files'] if '.php' in pathlib.Path(x['path']).name.lower() or any(x['features'][k] for k in ['relay','provider','bookRecord'])]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:out=list(pool.map(check,rows))
(w/'http-inventory.json').write_text(json.dumps(dict(observedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),requests=out,requestsWithAction=0,requestBodies=0),indent=2))
print(json.dumps({'artifacts':len(out),'statuses':{str(s):sum(x.get('status')==s for x in out) for s in sorted({x.get('status',0) for x in out})}},indent=2))
