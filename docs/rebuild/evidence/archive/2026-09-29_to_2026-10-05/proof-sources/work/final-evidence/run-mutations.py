from pathlib import Path
import os,subprocess,json
root=Path(__file__).resolve().parents[2]; backend=root/'work/widget-release/maya-saas-backend'; out=root/'work/final-evidence/receipts/mutations'
env=dict(os.environ,DATABASE_URL='[REDACTED DATABASE URL]')
env['PATH']='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin:/opt/homebrew/bin:/usr/bin:/bin'
env.pop('WIDGETS_EVIDENCE',None); env.pop('WIDGETS_EVIDENCE_DIR',None)
out.mkdir(exist_ok=True)
for gate in ['7','WR','H-harness','AB']:
 if gate=='WF': restrictions={'unit_tests':'release-evidence.spec.ts','unit_filter':'WF-','live_tests':'wr-release.live-spec.ts','live_filter':'WR-CREATE'}
 elif gate=='P-pairing': restrictions={'unit_tests':'propose-pairing.spec.ts','unit_filter':'PAIR-'}
 elif gate=='8r': restrictions={'unit_tests':'(gate8r|gate-8r).*spec.ts','live_tests':'gate8r-readback.live-spec.ts'}
 elif gate=='7': restrictions={'unit_tests':'(gate7|propose-pairing|commit-guard|gate-context.source|gate-antecedents.inv30|r353-readers.source).*spec.ts','live_tests':'gate7-effect.live-spec.ts'}
 elif gate=='SV2': restrictions={'unit_tests':'(crm/client-link-successor.service|action-engine/client-link-successor.architecture).spec.ts','unit_filter':'SV2-','live_tests':'sb1-successor.live-spec.ts','live_filter':'SV2-'}
 elif gate=='SBV': restrictions={'unit_tests':'(auth/client-verification-delivery|crm/client-reverification-candidate.service).spec.ts','unit_filter':'RV-'}
 else: restrictions=json.load(open(root/f'work/postdecision/receipts/mutations/{gate}.json'))['restrictions']
 args=['node','scripts/widgets-mutation-battery.mjs','--gate',gate,'--out',str(out/f'{gate}.json')]
 for key,val in restrictions.items():
  if val: args+=['--'+key.replace('_','-'),val]
 with (out/f'{gate}.log').open('w') as f: p=subprocess.run(args,cwd=backend,env=env,stdout=f,stderr=subprocess.STDOUT)
 d=json.load(open(out/f'{gate}.json'))
 print(json.dumps({'gate':gate,'exit':p.returncode,'status':d['status'],'mismatches':d['mismatches'],'baseline_red':d['baseline_red']}),flush=True)
 if p.returncode:raise SystemExit(p.returncode)
