// Bounded, offline continuation of the synthetic HTTP/PG proof. This consumes intact envelopes
// and gateway responses exported by service-price.live-spec.ts; it never mints or edits one.
//
// Build the existing small test harness first: node test/build-harness.mjs
// Then: MAYA_SERVICE_PRICE_HTTP_FIXTURE=/absolute/path/service-price-carrier.json \
//       node --test test/service-price-http-fixture.test.mjs
// Without an exported fixture this is SKIPPED, not qualification. No browser is exercised here.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { projectWidgetIntent, projectWidgetResolve } from '../../maya-chat-shell/src/net/project.ts';
import { createLiveSubmission } from '../../maya-chat-shell/src/shell/intents.ts';
import { createShellRuntime } from '../../maya-chat-shell/src/shell/shell.ts';
import { findAll, parse, textOf } from './html.mjs';

const fixturePath = process.env.MAYA_SERVICE_PRICE_HTTP_FIXTURE;
const A11Y = { reduced_motion: false, forced_colors: false, text_scale: 1, pointer: 'fine', keyboard_only_hint: false, caption_preference: false };
const expected = {
  confirmed: ['service_price_confirmed', 'Цена подтверждена в YCLIENTS'],
  rejected: ['service_price_rejected', 'Изменение отклонено'],
  unknown: ['service_price_unconfirmed', 'Результат пока не подтверждён. Не отправляйте повторно'],
};

test('actual synthetic HTTP approvals and outcomes survive the current shell and React drawer', {
  skip: fixturePath ? false : 'MAYA_SERVICE_PRICE_HTTP_FIXTURE is absent; actual HTTP evidence has not been supplied',
}, async t => {
  const evidence = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  assert.equal(evidence.contract, 'maya.service-price-carrier-evidence/1');
  assert.equal(evidence.synthetic, true, 'only local synthetic evidence is admissible here');
  assert.ok(Array.isArray(evidence.cases));
  const { markupOf, detailMarkup, verify, render } = await import('./.bundle.mjs');

  for (const name of [...Object.keys(expected), 'detail']) {
    const matches = evidence.cases.filter(c => c.name === name);
    assert.equal(matches.length, 1, `one actual ${name} HTTP case is required`);
    const captured = matches[0];
    await t.test(name, async caseTest => {
      const envelope = captured.envelope;
      const beforeBytes = JSON.stringify(envelope);
      const responseBytes = JSON.stringify(captured.response);
      assert.equal(envelope.kind, 'APPROVAL');
      assert.equal(envelope.source.from, 'capability_envelope');
      assert.equal(envelope.source.capability, 'catalog.service.price.update');
      assert.ok(Number.isFinite(Date.parse(captured.now_iso)), 'use the captured HTTP proof clock');
      assert.equal(verify(envelope, captured.now_iso), 'valid');
      const ref = name === 'detail' ? envelope.body.detail_intent
        : name === 'rejected' ? envelope.body.reject_intent : envelope.body.approve_intent;
      assert.equal(captured.intent_ref, ref, 'activate exactly the control submitted in the HTTP proof');
      const projected = projectWidgetIntent(captured.response);
      assert.notEqual(projected, null, 'actual gateway response passes the current wire projection');
      assert.equal(projected.receipt_outcome, 'ACCEPTED');
      assert.equal(projected.code, null);
      if (name === 'detail') {
        const intent = envelope.intents.find(value => value.intent_ref === ref);
        assert.equal(intent.effect, 'NAVIGATE');
        assert.deepEqual(intent.target, { class: 'detail', ref: 'fs.catalogue' });
        assert.equal(envelope.presentation.fullscreen_detail.route_key, 'fs.catalogue');
        const child = projected.next_envelope;
        assert.equal(child, captured.response.next_envelope, 'use the actual sealed gateway child intact');
        assert.ok(child && child.widget_id !== envelope.widget_id, 'detail is a newly minted widget');
        assert.equal(child.kind, envelope.kind);
        assert.equal(child.correlation.turn_id, envelope.correlation.turn_id);
        assert.equal(child.correlation.parent_widget_id, envelope.widget_id);
        assert.equal(child.presentation.density, 'SHEET');
        assert.equal(child.presentation.fullscreen_detail.route_key, 'fs.catalogue');
        assert.equal(verify(child, captured.now_iso), 'valid');
      }

      const submissions = [];
      const rereads = [];
      const transport = {
        async widgetIntent(submission) {
          submissions.push(submission);
          return { ok: true, value: projected };
        },
        async resolveWidgets(request) {
          rereads.push(request);
          // An optional read failure cannot erase the authoritative owner decision already returned
          // by the gateway. This fallback creates no envelope and claims no HTTP reread coverage.
          if (captured.resolve_response === undefined) return { ok: false, failure: { reason: 'no_connection' } };
          const value = projectWidgetResolve(captured.resolve_response);
          assert.notEqual(value, null, 'captured reread response passes the current wire projection');
          return { ok: true, value };
        },
        async chat() { assert.fail('a standard approval button sends no chat/direct approve request'); },
      };
      let serial = 0;
      const runtime = createShellRuntime({
        transport, submission: createLiveSubmission(transport), render,
        session: { view: () => ({ signedIn: true, display: { userName: 'Synthetic owner', tenantName: null } }), subscribe: () => () => undefined },
        environment: { a11y: () => A11Y, onA11yChange: () => () => undefined, fragment: () => '' },
        scheduler: { now: () => Date.parse(captured.now_iso), after: () => () => undefined },
        history: { push() {}, back() {}, onBack: () => () => undefined },
        newAbort: () => new AbortController(), newId: () => `http-carrier-${name}-${++serial}`,
      });
      caseTest.after(runtime.dispose);
      const ingested = runtime.widgets.ingest(envelope);
      assert.equal(ingested.verdict, 'valid');
      assert.equal(runtime.widgets.hasPresentedApproval(envelope), true);
      const card = () => runtime.conversation.view().items.find(item => item.id === ingested.itemId);
      assert.equal(card().result.mode, 'structured');
      const tree = parse(markupOf(card()));
      const drawn = findAll(tree, el => 'data-ref' in el.attrs);
      assert.deepEqual(drawn.map(el => el.attrs['data-ref']), [...card().result.readingOrder]);
      for (const control of [envelope.body.approve_intent, envelope.body.reject_intent]) {
        const button = drawn.find(el => el.attrs['data-ref'] === `intent:${control}`);
        assert.equal(button?.tag, 'button', 'the current generic APPROVAL drawer provides the control');
        const sealedName = card().result.accessibleNames[`intent:${control}`];
        assert.ok(button.attrs['aria-label'] === sealedName || textOf(button) === sealedName);
      }
      const previewText = textOf(tree);
      for (const key of ['approval.service', 'approval.current_price', 'approval.proposed_price', 'approval.provider']) {
        const row = envelope.body.effect_preview.find(value => value.label.phrase_key === key);
        assert.ok(row, `the actual ${key} diff row exists`);
        assert.ok(previewText.includes(row.label.rendered), `the ${key} label is drawn verbatim`);
        assert.ok(previewText.includes(row.value.formatted ?? row.value.label), `the ${key} fact is drawn verbatim`);
      }
      assert.equal(findAll(tree, el => ['href', 'src', 'srcset'].some(key => key in el.attrs)).length, 0);

      const activation = runtime.widgets.activate(ingested.itemId, `intent:${ref}`);
      if (name === 'detail') assert.equal(runtime.shell.view().fullscreen?.phase, 'progress');
      await activation;
      assert.equal(submissions.length, 1, 'exactly one widget gateway submission');
      assert.deepEqual(submissions[0], { contract: 'maya.widget.intent.submission/1', widget_id: envelope.widget_id,
        intent_token: envelope.intents.find(intent => intent.intent_ref === ref).intent_token,
        inputs: null, client_nonce: `http-carrier-${name}-1`, profile_id: envelope.render.profile_id });
      if (name === 'detail') {
        assert.deepEqual(rereads, [], 'the accepted child opens directly without a terminal reread');
        const open = runtime.shell.view().fullscreen;
        assert.equal(open?.phase, 'open', 'standard activate opens the bound detail through the shell');
        assert.notEqual(open.itemId, ingested.itemId);
        assert.equal(open.result.kind, projected.next_envelope.kind);
        assert.equal(open.result.mode, 'structured');
        assert.equal(open.result.density, 'SHEET');
        assert.deepEqual(open.result.textEquivalent, projected.next_envelope.presentation.text_equivalent);
        assert.equal(card().display, 'live');
        assert.equal(card().sentence, null);
        assert.equal(runtime.conversation.view().items.filter(item => item.kind === 'widget').length, 1,
          'detail adds no duplicate timeline card');
        const markup = detailMarkup(open);
        const detail = parse(markup);
        const dialogs = findAll(detail, el => el.tag === 'dialog');
        assert.equal(dialogs.length, 1, 'the generic DetailSheet supplies the dialog');
        assert.equal(dialogs[0].attrs['aria-modal'], 'true');
        const title = findAll(detail, el => (el.attrs.class ?? '').split(' ').includes('fullscreen-title'))[0];
        assert.ok(title);
        assert.equal(dialogs[0].attrs['aria-labelledby'], title.attrs.id);
        assert.equal(textOf(title), open.result.label || open.result.textEquivalent.headline);
        const close = findAll(detail, el => (el.attrs.class ?? '').split(' ').includes('fullscreen-close'))[0];
        assert.equal(close?.tag, 'button');
        assert.equal(textOf(close), 'Закрыть окно');
        assert.deepEqual(findAll(detail, el => 'data-ref' in el.attrs).map(el => el.attrs['data-ref']),
          [...open.result.readingOrder], 'the generic sheet draws the complete sealed child');
        assert.equal(findAll(detail, el => ['href', 'src', 'srcset'].some(key => key in el.attrs)).length, 0);
        const exposed = JSON.stringify(runtime.shell.view()) + markup;
        for (const intent of [...envelope.intents, ...projected.next_envelope.intents]) {
          if (intent.intent_token) assert.equal(exposed.includes(intent.intent_token), false);
        }
        assert.equal(JSON.stringify(envelope), beforeBytes, 'the captured root was not modified');
        assert.equal(JSON.stringify(captured.response), responseBytes, 'the captured child was not modified');
        caseTest.diagnostic('Actual chat root + gateway child through standard fs.catalogue and generic DetailSheet markup; no browser proof');
        return;
      }
      assert.deepEqual(rereads, [{ thread_page: { limit: 20 } }]);
      assert.equal(card().sentence, expected[name][0]);
      assert.equal(card().display, 'terminal');
      const afterMarkup = markupOf(card());
      const afterText = textOf(parse(afterMarkup));
      assert.ok(afterText.includes(expected[name][1]), 'the current React drawer shows the honest outcome');
      if (name !== 'confirmed') assert.equal(afterText.includes(expected.confirmed[1]), false);
      const exposed = JSON.stringify(runtime.conversation.view()) + afterMarkup;
      for (const intent of envelope.intents) {
        if (intent.intent_token) assert.equal(exposed.includes(intent.intent_token), false, 'authority tokens stay in the vault');
      }
      assert.equal(JSON.stringify(envelope), beforeBytes, 'the captured envelope was not modified');
      caseTest.diagnostic(captured.resolve_response === undefined
        ? 'Actual chat envelope + gateway response; optional reread modeled unavailable'
        : 'Actual chat envelope + gateway response + bounded resolve response');
    });
  }
});
