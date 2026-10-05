import os,subprocess,json,pathlib,time
be=pathlib.Path.cwd();out=be.parents[2]/'outputs/source-certification/receipts';env=os.environ.copy();env['PATH']='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin:/opt/homebrew/bin:/usr/bin:/bin';env['DATABASE_URL']='[REDACTED DATABASE URL]'
for gate,args in [('BS',['--unit-tests','src/widgets/owner-ports/personal-schedule.adapter.spec.ts','--live-tests','personal-source.live-spec.ts']),('NS',['--live-tests','navigation-source'])]:
 cmd=['node','scripts/widgets-mutation-battery.mjs','--gate',gate,*args,'--out',str(out/(gate+'-mutations-focused.json'))]
 with (out/(gate+'-mutations-focused.log')).open('w') as f:r=subprocess.run(cmd,cwd=be,env=env,stdout=f,stderr=subprocess.STDOUT)
 print(gate,r.returncode,flush=True)
