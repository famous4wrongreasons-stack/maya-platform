from pathlib import Path
p=Path('scripts/widgets-http-proof/gateE1-production.cases.ts');s=p.read_text().replace("const intent = object((envelope.intents as unknown[])[0], 'first intent');", "const intent = object((envelope.intents as unknown[]).find(v => object(v, 'intent').effect === 'REFINE'), 'journal REFINE intent');").replace("'first intent is not REFINE'", "'preserved journal REFINE intent missing'").replace("'first intent has no token'", "'journal REFINE intent has no token'");p.write_text(s)
p=Path('scripts/widgets-http-proof/gate12.cases.ts');s=p.read_text().replace('exactly the seven contract-approved rows','exactly the eight contract-approved rows').replace('finite seven-row set','finite eight-row set').replace("            'TIME_SLOT_SELECTOR|C9:booking.availability.read',", "            'TIME_SLOT_SELECTOR|C9:booking.availability.read',\n            'SCHEDULE|C9:appointments.own.list',");p.write_text(s)
p=Path('scripts/widgets-http-proof/gateBS.cases.ts');s=p.read_text();needle="    assert.equal(object(executed.owner_decision).state, 'SUCCEEDED');\n    if (operation === 'reschedule') {";replacement="""    assert.equal(object(executed.owner_decision).state, 'SUCCEEDED');
    const committedState = await ctx.fixtures.bookingProofState(tenant);
    const producer = committedState.records.find(r => r.intentTokenHash === tokenHash);
    const commitHash = createHash('sha256').update(commit.intent_token as string).digest('hex');
    const committed = committedState.records.find(r => r.intentTokenHash === commitHash);
    assert(producer && committed);
    assert.notEqual(producer.consumedAt, null);
    assert.notEqual(committed.consumedAt, null);
    assert.equal(committed.producedByIntentTokenHash, producer.intentTokenHash);
    assert.notEqual(committed.confirmationOfKind, 'draft');
    assert.equal(committed.confirmationOfRef, before.appointments[0].id);
    assert.equal(committed.capabilityKey, `crm.appointment.${operation}.v1`);
    const replay = await post('/widgets/intent', {
      contract: 'maya.widget.intent.submission/1', widget_id: confirmation.widget_id,
      intent_token: commit.intent_token, inputs: null, client_nonce: randomUUID(), profile_id: 'pwa.v1',
    });
    assert.equal(replay.status, 200);
    assert.notEqual(object(replay.body).receipt_outcome, 'ACCEPTED');
    assert.equal((await ctx.fixtures.bookingProofState(tenant)).executions.length, committedState.executions.length);
    if (operation === 'reschedule') {"""
assert s.count(needle)==1;s=s.replace(needle,replacement);p.write_text(s)
