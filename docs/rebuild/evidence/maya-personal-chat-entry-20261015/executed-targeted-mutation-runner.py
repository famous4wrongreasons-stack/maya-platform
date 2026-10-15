import subprocess, pathlib, tempfile, tarfile, io, os, json, hashlib, datetime
repo=pathlib.Path('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-local-crm-setup-20261010')
base=pathlib.Path('/private/tmp/maya-personal-chat-entry-20261015-01/mutations')
base.mkdir(mode=0o700)
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
paths=['maya-saas-backend/src','maya-saas-backend/package.json','maya-saas-backend/tsconfig.json','maya-saas-backend/tsconfig.build.json']
archive=subprocess.check_output(['git','archive',head,*paths],cwd=repo)
root=pathlib.Path(tempfile.mkdtemp(prefix='maya-personal-entry-mutations-'))
with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
    assert all(not m.name.startswith('/') and '..' not in pathlib.PurePosixPath(m.name).parts for m in tar.getmembers())
    tar.extractall(root,filter='data')
backend=root/'maya-saas-backend'
(backend/'node_modules').symlink_to(repo/'maya-saas-backend/node_modules',target_is_directory=True)
node='/private/tmp/maya-cert-node22-20261013/node-v22.23.3-darwin-arm64/bin/node'
env={k:os.environ[k] for k in ['PATH','HOME','TMPDIR'] if k in os.environ}
env.update(NODE_ENV='test',TZ='UTC',NODE_OPTIONS='--max-old-space-size=1536')
tests=['src/conversation-intelligence/conversation-intelligence.service.spec.ts','src/ai-tools/mutation-response.spec.ts']
report={'candidate':head,'archiveSha256':hashlib.sha256(archive).hexdigest(),'isolatedArchive':str(root),'productionEffects':0,'externalCalls':0,'runs':[]}
def run(name,needle=None):
    result=base/(name+'.json')
    with (base/(name+'.log')).open('w') as log:
        p=subprocess.run([node,'node_modules/jest/bin/jest.js','--runInBand','--runTestsByPath',*tests,'--json','--outputFile='+str(result)],cwd=backend,env=env,stdout=log,stderr=log,timeout=90)
    j=json.loads(result.read_text())
    failed=[a.get('fullName','') for t in j.get('testResults',[]) for a in t.get('assertionResults',[]) if a['status']=='failed']
    row={'name':name,'exitCode':p.returncode,'passed':j['numPassedTests'],'failed':j['numFailedTests'],'failedAssertions':failed}
    report['runs'].append(row)
    (base/'RESULT.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    if needle is None: assert p.returncode==0 and j['numFailedTests']==0, row
    else: assert p.returncode==1 and any(needle in f for f in failed), row
    print(name, 'PASS' if needle is None else 'KILLED_BY_ASSERTION',flush=True)
run('baseline')
cases=[
 ('old-false-identity-message','src/ai-tools/mutation-response.ts',"Прямо этой командой оформить запись в текущем режиме нельзя. Для записи себя напишите «Открой форму личной записи». В форме я отдельно проверю клиентский доступ и попрошу подтвердить запись.","Для этого действия нужен подтверждённый клиентский доступ.",'offers a separate preparation'),
 ('owner-role-promotion','src/conversation-intelligence/conversation-taxonomy.ts','const CLIENT_ROLES = [UserRole.CLIENT, UserRole.CUSTOMER] as const;','const CLIENT_ROLES = [UserRole.CLIENT, UserRole.CUSTOMER, UserRole.TENANT_OWNER] as const;','without promoting the role'),
 ('prepare-execution-tool','src/conversation-intelligence/conversation-taxonomy.ts',"permission: 'catalog.services.read',\n        tools: ['catalog.services.read'],\n        optionalSlots:","permission: 'catalog.services.read',\n        tools: ['appointments.own.create'],\n        optionalSlots:",'initial personal booking preferences'),
 ('lost-initial-intent-hint','src/conversation-intelligence/conversation-taxonomy.ts',"          'запиши меня',\n",'', 'initial personal booking preferences'),
]
for name,file,old,new,needle in cases:
    p=backend/file; original=p.read_text(); assert original.count(old)==1,(name,original.count(old))
    try:
        p.write_text(original.replace(old,new))
        run(name,needle)
    finally: p.write_text(original)
run('restored-control')
report.update(status='PASS',mutationsKilled=len(cases),checkedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
(base/'RESULT.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
