import json,subprocess
from pathlib import Path
stage=Path('/tmp/maya-wave-rc-8bc03454-python');plan=json.loads((stage/'config-plan.json').read_text());state=json.loads(Path('/opt/maya-saas/release-evidence/wave-rc-8bc03454/cutover-state.json').read_text());result={}
for unit,kind in [('maya-saas','nest'),('barbershop-bot','python')]:
 pid=subprocess.check_output(['systemctl','show',unit,'-p','MainPID','--value'],text=True).strip();assert pid.isdigit()and int(pid)>0
 env=dict(i.split('=',1)for i in Path('/proc/'+pid+'/environ').read_bytes().decode().split('\0')if'='in i)
 for key,value in plan[kind].items():assert env.get(key)==(state['canonicalCutoverAt']if value=='@CUTOVER@'else value),(unit,key)
 result[unit]={'liveProcessConfigured':True,'keys':list(plan[kind]),'pid':int(pid)}
print(json.dumps({'status':'PASS','units':result,'businessWrites':0,'messages':0}))
