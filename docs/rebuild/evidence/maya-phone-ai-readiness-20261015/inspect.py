import pathlib, subprocess, json, datetime
root=pathlib.Path('/srv/maya-phone-staging')
base=['docker','compose','--env-file',str(root/'private/compose.env'),'-f',str(root/'compose.catalog-public-with-setup.json')]
q=subprocess.run(base+['ps','-q','backend'],capture_output=True,text=True,check=True,timeout=10).stdout.strip()
d=json.loads(subprocess.run(['docker','inspect',q],capture_output=True,text=True,check=True,timeout=10).stdout)[0]
env=dict(x.split('=',1) for x in d['Config']['Env'] if '=' in x)
nets=[]
for n in d['NetworkSettings']['Networks']:
 v=json.loads(subprocess.run(['docker','network','inspect',n],capture_output=True,text=True,check=True,timeout=10).stdout)[0]
 nets.append({'name':n,'internal':v['Internal']})
result={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'backendRunning':d['State']['Running'],'startedAt':d['State']['StartedAt'],'imageId':d['Image'],'release':env.get('MAYA_RELEASE'),'aiCoreProvider':env.get('AI_CORE_PROVIDER'),'deepseekKeyConfigured':bool(env.get('DEEPSEEK_API_KEY')),'openaiKeyConfigured':bool(env.get('OPENAI_API_KEY')),'publicSalonFinderEnabled':env.get('PWA_TENANT_INSTALL_ENABLED')=='true','backendNetworks':nets,'providerCallsMadeByProbe':0,'writes':0}
print(json.dumps(result))
