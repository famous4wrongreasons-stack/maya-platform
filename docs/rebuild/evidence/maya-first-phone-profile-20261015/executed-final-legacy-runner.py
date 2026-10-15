import pathlib, subprocess, json, os, time, signal, shutil

root=pathlib.Path('/private/tmp/maya-ci-packaging-cfea53a8-20261015')
repo=root/'candidate'
out=root/'legacy';out.mkdir(mode=0o700)
shutil.copyfile(__file__,out/'executed-runner.py')
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
assert head=='cfea53a8fc745bb43e025d2556d37bdf9d5d0781'
app=repo/'ai администратор';assert not (app/'.env').exists();assert not (app/'config.py').exists()
env={'PATH':'/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin','HOME':str(root/'home'),'TMPDIR':str(root),'LANG':'en_US.UTF-8','TZ':'UTC','PIP_CONFIG_FILE':'/dev/null','PIP_DISABLE_PIP_VERSION_CHECK':'1'}
manifest={'sourceHead':head,'kind':'local legacy Python CI equivalent','status':'running','steps':[],'network':'unittest and compileall sandbox: loopback only','certificate':'NOT_ISSUED'}
def save(): (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
def run(name,cmd,timeout=1800):
    print(name,flush=True);s={'name':name,'command':cmd,'started':time.time()};manifest['steps'].append(s);save()
    with (out/(name+'.log')).open('x') as f:
        p=subprocess.Popen(cmd,cwd=repo,env=env,stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
        try:s['exit']=p.wait(timeout)
        except BaseException:
            os.killpg(p.pid,signal.SIGTERM)
            try:p.wait(5)
            except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
            raise
        finally:s['finished']=time.time();save()
    if s['exit']:raise RuntimeError(name+' failed: '+str(s['exit']))
save()
try:
    run('venv',['/opt/homebrew/opt/python@3.11/bin/python3.11','-m','venv',str(out/'venv')])
    py=str(out/'venv/bin/python')
    run('dependencies',[py,'-m','pip','install','--disable-pip-version-check','-r',str(app/'requirements.txt')])
    shutil.copyfile(app/'config.example.py',app/'config.py')
    env.update({'OPENAI_API_KEY':'test-openai-key','PII_ENCRYPTION_KEY':'V6E8Gf1x_oHlgm4mt8d37r4LexILQr1eFN1sq430xV4=','TELEGRAM_TOKEN':'test-telegram-token','WEBHOOK_SECRET':'test-webhook-secret','YCLIENTS_PARTNER_TOKEN':'test-partner-token','YCLIENTS_USER_TOKEN':'test-user-token'})
    guard=['/usr/bin/sandbox-exec','-p','(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))']
    # Executable network negative and loopback positive before test discovery.
    probe='import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); s.listen(); c=socket.socket(); c.connect(s.getsockname()); c.close(); s.close(); s=socket.socket(); s.settimeout(1);\ntry: s.connect(("192.0.2.1",443)); raise AssertionError("external network admitted")\nexcept PermissionError: print("loopback PASS; external REFUSED")\nfinally: s.close()'
    run('network-isolation',guard+[py,'-c',probe],20)
    run('compileall',guard+[py,'-m','compileall','-q',str(app)])
    run('unittest',guard+[py,'-u','-m','unittest','discover','-v','-s',str(app),'-p','test_*.py'])
    manifest['status']='passed'
except BaseException as e:
    manifest['status']='failed';manifest['failure']=str(e);raise
finally:save()
