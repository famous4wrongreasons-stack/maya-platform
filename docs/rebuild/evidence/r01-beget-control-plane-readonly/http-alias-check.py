import pathlib,json,datetime,concurrent.futures,urllib.request,urllib.error
w=pathlib.Path(__file__).resolve().parent
hostPaths={
 'malesthetic.pro':['/','/app/','/app/api-proxy.php','/app/backups/api-proxy-before-loyalty-20260721-2035.php'],
 'www.malesthetic.pro':['/app/backups/api-proxy-before-loyalty-20260721-2035.php'],
 'xn--80aaocmjdk0cclbf8l3a.xn--p1ai':['/app/backups/api-proxy-before-loyalty-20260721-2035.php'],
 'www.xn--80aaocmjdk0cclbf8l3a.xn--p1ai':['/app/backups/api-proxy-before-loyalty-20260721-2035.php'],
 'mayaos.ru':['/','/app/','/api/','/maya-platform-api.php'],
 'www.mayaos.ru':['/api/'],
 'mocine3388.beget.tech':['/api-proxy.php'],
 'www.mocine3388.beget.tech':['/api-proxy.php'],
 'rt.malesthetic.pro':['/']}
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args):return None
def check(url):
 try:r=urllib.request.build_opener(NoRedirect).open(urllib.request.Request(url,method='HEAD'),timeout=15)
 except urllib.error.HTTPError as e:r=e
 except Exception as e:return {'url':url,'method':'HEAD','error':type(e).__name__,'reason':str(getattr(e,'reason',''))[:180]}
 with r:return {'url':url,'method':'HEAD','status':r.status,'headers':{k:r.headers.get(k) for k in ['Location','Server','X-Powered-By','Content-Type','Content-Length']}}
urls=[scheme+'://'+h+p for h,paths in hostPaths.items() for p in paths for scheme in ['http','https']]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:rows=list(pool.map(check,urls))
(w/'http-alias-check.json').write_text(json.dumps({'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'method':'HEAD only; redirects not followed; no action/query/body/auth','requests':rows},indent=2))
print(json.dumps({'requests':len(rows),'responses':[{'url':r['url'],'status':r.get('status'),'location':r.get('headers',{}).get('Location'),'error':r.get('error')} for r in rows]},indent=2))
