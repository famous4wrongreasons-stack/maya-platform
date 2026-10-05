from pathlib import Path
import subprocess,json,os
root=Path(__file__).resolve().parents[2];backend=root/'work/widget-release/maya-saas-backend';out=root/'work/postdecision/receipts/mutations';out.mkdir(exist_ok=True)
env=dict(os.environ,DATABASE_URL='[REDACTED DATABASE URL]');env.pop('WIDGETS_EVIDENCE',None);env.pop('WIDGETS_EVIDENCE_DIR',None)
for gate in ['SB1','WR','H-harness']:
 restrictions={'unit_tests':'appointments/(personal-client-context.service|client-appointment-create.service).spec.ts','unit_filter':'SB1-'} if gate=='SB1' else json.load(open(root/f'work/preintegration/receipts/mutations/{gate}.json'))['restrictions']
 args=['node','scripts/widgets-mutation-battery.mjs','--gate',gate,'--out',str(out/f'{gate}.json')]
 for k,v in restrictions.items():
  if v: args+=['--'+k.replace('_','-'),v]
 with (out/f'{gate}.log').open('w') as log: r=subprocess.run(args,cwd=backend,env=env,stdout=log,stderr=subprocess.STDOUT)
 d=json.load(open(out/f'{gate}.json')) if (out/f'{gate}.json').exists() else {}
 print(json.dumps({'gate':gate,'exit':r.returncode,'status':d.get('status'),'mismatches':d.get('mismatches'),'baseline_red':d.get('baseline_red')}),flush=True)
 if r.returncode: break
