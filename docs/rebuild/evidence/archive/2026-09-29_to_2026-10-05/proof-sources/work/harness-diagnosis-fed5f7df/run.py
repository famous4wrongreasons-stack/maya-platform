from pathlib import Path
import subprocess, os, re, json, time, sys, hashlib, shutil
root=Path(__file__).resolve().parents[2]; repo=root/'work/maya-controlled-integration';be=repo/'maya-saas-backend';work=Path(__file__).resolve().parent
out=root/'outputs/harness-diagnosis-fed5f7df';out.mkdir(exist_ok=True)
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']};env['PATH']=node+':/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin'
env.update(dict(re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']+)'",(be/'test/widgets-live/support/environment.ts').read_text())))
baseurl='[REDACTED DATABASE URL]'

def run(name, mode='full', cwd=be, database=None, gate='AR'):
 d=out/name;d.mkdir();db=database or 'maya_widget_gate_proof_diag_'+name.replace('-','_')
 assert re.fullmatch(r'maya_widget_gate_proof_diag_[a-z0-9_]+',db)
 ee={**env,'DATABASE_URL':baseurl+db}
 create="const{Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();const n=process.argv[1];if(!/^maya_widget_gate_proof_diag_[a-z0-9_]+$/.test(n))throw Error('guard');await c.query('CREATE DATABASE '+n);await c.end()})().catch(e=>{console.error(e.message);process.exit(1)})"
 subprocess.run(['node','-e',create,db],cwd=be,env={**env,'DATABASE_URL':baseurl+'maya_widget_gate_proof_finalfed5_20260930'},check=True,stdout=subprocess.DEVNULL)
 with (d/'migration.log').open('w') as f:subprocess.run(['npx','prisma','migrate','deploy'],cwd=be,env=ee,check=True,stdout=f,stderr=subprocess.STDOUT)
 shutil.copyfile(work/'observe.cjs',d/'observe.cjs')
 ee.update(NODE_OPTIONS='--require='+str(d/'observe.cjs'),NODE_MAYA_DIAG_DIR=str(d/'trace'))
 if mode=='native':
  ee['NODE_MAYA_DIAG_BASELINE_ONLY']='1'
  args=['node','scripts/widgets-mutation-battery.mjs','--gate',gate,'--out',str(d/'not-a-certificate.json')]
 else:
  args=['npx','jest','--config','./test/jest-widgets-live.json','--runInBand','--forceExit','--json','--outputFile='+str(d/'jest.json')]
  if mode!='full':
   file='sb1-successor' if mode=='SV2-HTTP' else ('http-listener' if mode=='HAR-LOOPBACK' else 'f88-shape')
   args+=['--runTestsByPath','test/widgets-live/'+file+'.live-spec.ts','-t',mode+' ']
 t=time.time()
 with (d/'stdout.log').open('w') as stdout,(d/'stderr.log').open('w') as stderr:
  p=subprocess.Popen(args,cwd=cwd,env=ee,stdout=stdout,stderr=stderr,start_new_session=True)
  (d/'pid').write_text(str(p.pid))
  with (d/'process-samples.jsonl').open('w') as samples:
   while True:
    ps=subprocess.check_output(['ps','-axo','pid,ppid,pgid,%cpu,rss,etime,command'],text=True)
    lines=[];pids=set()
    for line in ps.splitlines()[1:]:
     fields=line.split(None,6)
     if len(fields)==7 and (fields[2]==str(p.pid) or str(work) in fields[6] or 'widgets-mutation-mirror' in fields[6]):
      lines.append(line);pids.add(fields[0])
    sockets=subprocess.run(['lsof','-nP','-a','-p',','.join(pids or [str(p.pid)]),'-iTCP'],text=True,capture_output=True).stdout
    pgscript="const{Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();const r=await c.query(\"SELECT pid, state, wait_event_type, wait_event, EXTRACT(EPOCH FROM (clock_timestamp()-query_start)) AS age_s, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()\");console.log(JSON.stringify(r.rows));await c.end()})().catch(e=>{console.error(e.code);process.exit(1)})"
    pg=subprocess.run(['node','-e',pgscript],cwd=be,env={**env,'DATABASE_URL':baseurl+db},text=True,capture_output=True,timeout=10)
    samples.write(json.dumps({'at':time.time(),'processes':lines,'sockets':sockets,'load':os.getloadavg(),'pg':pg.stdout.strip(),'pgExit':pg.returncode})+'\n');samples.flush()
    if p.poll() is not None:break
    time.sleep(5)
 r={'candidate':head,'name':name,'mode':mode,'command':args,'cwd':str(cwd),'exit':p.returncode,'seconds':time.time()-t,'database':db,
    'diagnosticOnly':True,'sourceChanged':False,'timeoutsChanged':False,'harnessSha256':hashlib.sha256((d/'observe.cjs').read_bytes()).hexdigest()}
 (d/'receipt.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r),flush=True);return r

if __name__=='__main__':
 mode=sys.argv[1]
 if mode=='isolated':
  for key in ['SV2-HTTP','F88-1','F88-2']:run('isolated-'+key.lower(),key)
 elif mode=='native':run(sys.argv[2],'native',Path(sys.argv[3]) if len(sys.argv)>3 else be)
 elif mode=='full':run(sys.argv[2])
