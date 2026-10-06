import subprocess,os,re,json,sys,pathlib
case=sys.argv[1]; session='pricing-'+case
cli=['node','/Users/stanislavmosin/.npm/_npx/31e32ef8478fbf80/node_modules/@playwright/cli/playwright-cli.js','--session='+session]
env={**os.environ,'NO_UPDATE_NOTIFIER':'1'}
def call(*args):
 p=subprocess.run(cli+list(args),text=True,capture_output=True,env=env)
 with open('driver-'+case+'.log','a') as f:f.write(p.stdout+p.stderr)
 if p.returncode:raise RuntimeError('CLI '+args[0]+' failed; see driver log')
 return p.stdout

def ref(role,name):
 snap=call('snapshot')
 found=re.findall(r'^\s*- '+role+' "'+re.escape(name)+r'"[^\n]*\[ref=((?:f\d+)?e\d+)\]',snap,re.M)
 if len(found)!=1:raise RuntimeError('Expected one visible '+role+' '+name)
 return found[0]
ready=json.load(open('ready.json'));item=next(c for c in ready['cases'] if c['name']==case)
call('fill',ref('textbox','Email'),item['email']);call('click',ref('button','Получить код'))
mail=json.load(open('mailbox.json'));delivery=next(d for d in reversed(mail['deliveries']) if d['email']==item['email'])
call('fill',ref('textbox','Код из письма'),delivery['code']);call('click',ref('button','Войти'))
if len(sys.argv)>2 and sys.argv[2]=='restore':
 call('screenshot','--filename=unknown-after-relogin.png');pathlib.Path('unknown-after-relogin.yml').write_text(call('snapshot'));pathlib.Path('SNAPSHOT').touch();print('UNKNOWN history restored through actual new UI login; no new proposal');sys.exit(0)
call('fill',ref('textbox','Сообщение для MAYA'),item['prompt']);call('click',ref('button','Отправить'))
call('screenshot','--filename='+case+'-preview.png')
pathlib.Path(case+'-preview.yml').write_text(call('snapshot'))
pathlib.Path('SNAPSHOT').touch()
print(case+': actual email UI login and chat proposal captured; no decision clicked')
