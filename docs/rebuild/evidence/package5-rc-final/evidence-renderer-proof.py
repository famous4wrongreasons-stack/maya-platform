import subprocess,json,base64,hashlib
root='/opt/maya-saas/report-renderer/20260908-p5-rc-8bc03454';proof=[]
for mode in ['--render-stdin','--static-help']:
 body=json.dumps({'periodLocalDate':'2000-01-01','timezone':'UTC','content':{'title':'Синтетический тест форматирования','bodyText':'Synthetic text only. No business data or command.'}})
 result=subprocess.run(['runuser','-u','maya-saas','--','env','-i','PATH=/usr/local/bin:/usr/bin:/bin','LANG=C.UTF-8','PYTHONDONTWRITEBYTECODE=1',root+'/venv/bin/python','-B',root+'/canonical_report_download.py',mode],input=body,text=True,capture_output=True,timeout=10,check=True)
 x=json.loads(result.stdout);pdf=base64.b64decode(x['data_base64']);assert x['ok']and x['business_mutations']==0 and x['messages']==0 and pdf.startswith(b'%PDF-')
 proof.append({'mode':mode,'pdfValid':True,'bytes':len(pdf),'sha256':hashlib.sha256(pdf).hexdigest()})
print(json.dumps({'status':'PASS','serviceUser':'maya-saas','syntheticFormatting':proof,'businessDataUsed':False,'businessWrites':0,'messages':0}))
