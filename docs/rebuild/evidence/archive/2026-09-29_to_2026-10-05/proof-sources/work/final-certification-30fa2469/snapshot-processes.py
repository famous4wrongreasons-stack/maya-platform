from pathlib import Path
import subprocess, json, datetime

root=Path.cwd(); work=root/'work/final-certification-30fa2469'; out=root/'outputs/final-certification-30fa2469/receipts/resources'
out.mkdir(exist_ok=True)
rows=[]
for line in subprocess.check_output(['ps','-axo','pid=,ppid=,pgid=,%cpu=,rss=,etime=,command='],text=True).splitlines():
    a=line.strip().split(None,6)
    if len(a)==7:
        rows.append(dict(pid=int(a[0]),ppid=int(a[1]),pgid=int(a[2]),cpu=float(a[3]),rssKiB=int(a[4]),elapsed=a[5],command=a[6]))
owners=[]
for p in sorted(work.glob('worker-*-pid')):
    pid=int(p.read_text()); row=next((r for r in rows if r['pid']==pid),None)
    if row and 'scripts/widgets-mutation-battery.mjs' in row['command'] and 'final-certification-30fa2469/receipts/mutation-parts/' in row['command']:
        owners.append(row)
groups={r['pgid'] for r in owners}; owned=[r for r in rows if r['pgid'] in groups]
pids=','.join(str(r['pid']) for r in owned)
sockets=subprocess.run(['/usr/sbin/lsof','-nP','-a','-p',pids,'-iTCP'],capture_output=True,text=True) if pids else None
utc=datetime.datetime.now(datetime.timezone.utc)
data={'candidate':'30fa24698f3ae277c22209e8edfd448c29e4f872','utc':utc.isoformat(),'ownedGroups':len(groups),'ownedProcessCount':len(owned),'ownedCpuPercent':round(sum(r['cpu'] for r in owned),1),'ownedRssGiB':round(sum(r['rssKiB'] for r in owned)/1024**2,2),'processes':owned,'sockets':sockets.stdout if sockets else '', 'socketCommandExit':sockets.returncode if sockets else None}
(out/(utc.strftime('%Y%m%dT%H%M%SZ')+'.json')).write_text(json.dumps(data,indent=2)+'\n')
print(json.dumps({k:data[k] for k in ['utc','ownedGroups','ownedProcessCount','ownedCpuPercent','ownedRssGiB']}))
