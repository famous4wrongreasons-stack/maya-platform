from pathlib import Path
import hashlib, json, os, re, shutil, subprocess, time

root=Path.cwd(); repo=root/'work/maya-controlled-integration'; source=repo/'maya-saas-backend'
work=root/'work/m13-admission-diagnosis'; out=root/'outputs/harness-diagnosis-fed5f7df/m13-followup'
out.mkdir(parents=True, exist_ok=True); work.mkdir(exist_ok=True)
candidate=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
assert candidate=='dc3a26806b273631e8c6150acfa3e9cacdde91a1'
assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']}
env['PATH']=node+':/opt/homebrew/bin:/usr/bin:/bin'
env.update(dict(re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']+)'",(source/'test/widgets-live/support/environment.ts').read_text())))
spec=Path('src/widgets/owner-ports/commit-booking.adapter.spec.ts')
adapter=Path('src/widgets/owner-ports/commit-booking.adapter.ts')
old=(source/spec).read_text()
guard=json.loads((source/'test/widgets-live/mutations/gate13.json').read_text())
guard=next(m for m in guard if m['id']=='M13-U13C-11')
addition='''
it('N11-HARNESS a canonical invocation without an existing transaction reaches persistence', async () => {
  const built = fixture();
  const persist = jest.fn().mockResolvedValue(execution);
  built.create.forAccount.mockImplementation(() =>
    admitWithInvocationReceipt(
      {
        source: { type: 'authenticated_request' },
        callerIdempotency: {
          scope: 'maya.widgets.booking.commit.v1',
          key: 'server-confirmation-key',
        },
      } as never,
      persist,
    ),
  );
  await expect(built.adapter.commit(input())).resolves.toMatchObject({
    receiptOutcome: 'ACCEPTED',
    actionReceiptRef: 'execution-1',
  });
  expect(persist).toHaveBeenCalledTimes(1);
});
'''
stub="        assertWidgetRuntimeAdmission: jest.fn().mockResolvedValue(undefined),"
replacement=stub+'''
        withWidgetRuntimeAdmission: jest.fn(
          (_tenantId: string, admit: (transaction: never) => Promise<unknown>) =>
            admit({} as never),
        ),'''
assert old.count(stub)==1
# Instrument only the diagnostic copy of N11; retain the original rejection.
start=old.index("  it('N11 refuses")
end=old.index("  it.each([",start)
segment=old[start:end]
needle='''        () => Promise.resolve(execution),
      ),'''
assert segment.count(needle)==1
instrumented=segment.replace(needle,'''        () => Promise.resolve(execution),
      ).catch((error: unknown) => {
        console.log('N11_OBSERVED_REJECTION', error instanceof Error ? error.message : String(error));
        throw error;
      }),''')
instrumented_old=old[:start]+instrumented+old[end:]
cases=[
 ('old-fixture-original-guard',instrumented_old,False,0),
 ('old-fixture-removed-guard',instrumented_old,True,0),
 ('healthy-regression-before',old+addition,False,1),
 ('healthy-regression-after',old.replace(stub,replacement)+addition,False,0),
 ('fixed-fixture-removed-guard',old.replace(stub,replacement)+addition,True,1),
]
receipts=[]
for name,content,mutate,want in cases:
 dest=work/name
 assert not dest.exists()
 shutil.copytree(source,dest,ignore=shutil.ignore_patterns('node_modules','dist','coverage','.git','.env*','*.tsbuildinfo'))
 (dest/'node_modules').symlink_to(source/'node_modules',target_is_directory=True)
 (dest/spec).write_text(content)
 if mutate:
  text=(dest/adapter).read_text();assert text.count(guard['find'])==1
  (dest/adapter).write_text(text.replace(guard['find'],guard['replace']))
 args=['node',str(source/'node_modules/jest/bin/jest.js'),'--runInBand','--runTestsByPath',str(spec),'--json','--outputFile='+str(out/(name+'.json'))]
 started=time.time()
 with (out/(name+'.log')).open('w') as log:
  result=subprocess.run(args,cwd=dest,env=env,stdout=log,stderr=subprocess.STDOUT)
 report=json.loads((out/(name+'.json')).read_text())
 record={'name':name,'sourceCandidate':candidate,'diagnosticOnly':True,'isolatedProductMutation':guard['id'] if mutate else None,
         'exit':result.returncode,'expectedExit':want,'seconds':round(time.time()-started,3),
         'passed':report['numPassedTests'],'failed':report['numFailedTests'],
         'failures':[a['fullName'] for t in report['testResults'] for a in t['assertionResults'] if a['status']=='failed'],
         'specSha256':hashlib.sha256((dest/spec).read_bytes()).hexdigest(),
         'adapterSha256':hashlib.sha256((dest/adapter).read_bytes()).hexdigest(),
         'reportSha256':hashlib.sha256((out/(name+'.json')).read_bytes()).hexdigest()}
 receipts.append(record);(out/(name+'.receipt.json')).write_text(json.dumps(record,indent=2)+'\n')
 print(json.dumps(record),flush=True)
 assert result.returncode==want,(name,result.returncode,want)
(out/'DIAGNOSIS.json').write_text(json.dumps({'sourceCandidate':candidate,'cases':receipts,
 'productSourceChangedInCanonicalWorktree':False,'testTimeoutChanged':False,
 'scope':'Diagnostic copies only; never a complete mutation or certification receipt.'},indent=2)+'\n')
