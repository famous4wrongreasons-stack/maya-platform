from pathlib import Path
import os,re,subprocess,sys
root=Path(__file__).resolve().parents[2]; be=root/'work/maya-controlled-integration/maya-saas-backend'
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']}
env['PATH']=node+':/opt/homebrew/bin:/usr/bin:/bin'
env.update(dict(re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']+)'",(be/'test/widgets-live/support/environment.ts').read_text())))
env['DATABASE_URL']='[REDACTED DATABASE URL]'
if sys.argv[1]=='prepare':
 admin={**env,'DATABASE_URL':'[REDACTED DATABASE URL]'}
 code="const{Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();const n='maya_widget_gate_proof_decisions_20261002';if(!(await c.query('select 1 from pg_database where datname=$1',[n])).rowCount)await c.query('CREATE DATABASE '+n);await c.end()})().catch(e=>{console.error(e);process.exit(1)})"
 subprocess.run(['node','-e',code],cwd=be,env=admin,check=True)
 raise SystemExit(subprocess.run(['npx','prisma','migrate','deploy'],cwd=be,env=env).returncode)
raise SystemExit(subprocess.run(sys.argv[1:],cwd=be,env=env).returncode)
