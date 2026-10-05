import pathlib,subprocess,json,hashlib,re,difflib
root=pathlib.Path.cwd();repo=root/'work/maya-controlled-integration';be=repo/'maya-saas-backend';work=root/'work/final-certification-98716cd5';out=root/'outputs/final-certification-98716cd5'
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip();assert head=='98716cd5b9440d01e4272ea0778f93db26f065e6';assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
parent=be/'test/widgets-live/source-carrier.probe-spec.ts';child=be/'test/widgets-live/support/shell-approved-source-probe.mjs'
s=parent.read_text();s=re.sub(r"from '(\.[^']+)'",lambda m:"from '"+str((parent.parent/m[1]).resolve())+"'",s)
s=s.replace("'test/widgets-live/support/shell-approved-source-probe.mjs'",repr(str(work/'probes/source-return.mjs')))
s=s.replace("object(object(v).fullscreen ?? {}).phase === 'open'", "object(v).roundTripPassed === true")
s=s.replace('FBE2E approved production sources through the unchanged carrier','FBE2E complete approved sources including canonical journal parent return')
(work/'probes/source-return.probe-spec.ts').write_text(s)
s=child.read_text();s=re.sub(r"from '(\.[^']+)'",lambda m:"from '"+str((child.parent/m[1]).resolve())+"'",s)
s=s.replace('{ resultOf, markupOf }','{ resultOf, markupOf, detailMarkup }')
needle="    process.stdout.write(JSON.stringify({\n      mode:input.mode,backendDetail:true,fullscreen:runtime.shell.view().fullscreen,refs,counters:runtime.widgets.counters(),"
assert needle in s
new="""    const detail = result.next_envelope;
    const open = runtime.shell.view().fullscreen;
    assert.equal(open?.phase, 'open', 'detail must open before return can be tested');
    const back = detail.intents.find((i) => i.effect === 'NAVIGATE' && i.target?.class === 'w' && i.target.ref === envelope.widget_id);
    assert(back, 'canonical exact-parent return intent must exist');
    const backRef = `intent:${back.intent_ref}`;
    assert(open.result.readingOrder.includes(backRef), 'return control must be drawn in the actual detail');
    assert(detailMarkup(open).includes(`data-ref="${backRef}"`), 'actual React DetailSheet must render the return control');
    const beforeReturn = { fullscreen: open, timeline: runtime.conversation.view().items.map(({ id, kind }) => ({ id, kind })) };
    const returned = await activate(open.itemId, backRef);
    const afterReturn = runtime.shell.view().fullscreen;
    const roundTripPassed = returned.resolved_widget?.widget_id === envelope.widget_id && afterReturn === null;
    process.stdout.write(JSON.stringify({
      mode:input.mode,backendDetail:true,fullscreen:runtime.shell.view().fullscreen,refs,counters:runtime.widgets.counters(),
      roundTripPassed,
      parentReturn: {
        requestedParentWidgetId: envelope.widget_id,
        returnIntent: snapshot(back),
        resolvedParentWidgetId: returned.resolved_widget?.widget_id ?? null,
        before: beforeReturn,
        after: { fullscreen: afterReturn, timeline: runtime.conversation.view().items.map(({ id, kind }) => ({ id, kind })) },
      },"""
s=s.replace(needle,new)
(work/'probes/source-return.mjs').write_text(s)
config=json.loads((be/'test/jest-widgets-live.json').read_text());config['rootDir']=str(be/'test');config['roots']=[str(be/'test'),str(work/'probes')];config.pop('testRegex');config['testMatch']=[str(work/'probes/*.probe-spec.ts')];config['transform']={'^.+\\.(t|j)s$':[str(be/'node_modules/ts-jest'),{'tsconfig':str(be/'tsconfig.json')} ]};(work/'jest-return.json').write_text(json.dumps(config,indent=2)+'\n')
def h(p):return hashlib.sha256(p.read_bytes()).hexdigest()
provenance={'candidate':head,'parent':subprocess.check_output(['git','rev-parse','HEAD^'],cwd=repo,text=True).strip(),'alreadyIntegrated':True,'worktreeClean':True,'productionFilesEdited':False,'sourceHarnesses':[{'path':str(p.relative_to(repo)),'sha256':h(p)} for p in [parent,child]],'externalProbeFiles':[{'path':str(p),'sha256':h(p)} for p in sorted((work/'probes').glob('*'))]+[{'path':str(work/'jest-return.json'),'sha256':h(work/'jest-return.json')}],'scope':'Extend the existing guarded source probe with the actual drawn canonical parent-return activation. No production or candidate source edit.'};(out/'CANDIDATE.json').write_text(json.dumps(provenance,indent=2)+'\n')
(out/'HARNESS-DIFF.txt').write_text(''.join(difflib.unified_diff(child.read_text().splitlines(True),s.splitlines(True),fromfile=str(child),tofile=str(work/'probes/source-return.mjs'))))
