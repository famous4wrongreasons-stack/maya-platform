// FBE2E-4 — the real shell process. It consumes a server-minted selector, activates only controls
// drawn by the production renderer, and reaches the production HTTP gateway through the typed
// widget transport projection. The bearer and intent tokens remain process-local and are never
// printed; stdout contains only the observable shell result used by the live PostgreSQL proof.

import assert from 'node:assert/strict';
import { resultOf, markupOf } from '../../../../maya-carrier-react/test/.bundle.mjs';
import { render } from '../../../../maya-chat-shell/src/renderer/render.ts';
import {
  projectWidgetIntent,
  projectWidgetResolve,
} from '../../../../maya-chat-shell/src/net/project.ts';
import { createLiveSubmission } from '../../../../maya-chat-shell/src/shell/intents.ts';
import { createShellRuntime } from '../../../../maya-chat-shell/src/shell/shell.ts';

const readInput = async () => {
  let value = '';
  for await (const chunk of process.stdin) value += chunk;
  return JSON.parse(value);
};

const object = (value, label) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${label} is not an object`);
  return value;
};

const first = (value, label) => {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error(`${label} is empty`);
  return object(value[0], `${label}[0]`);
};

const opaque = (value, label) => {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`${label} is not opaque`);
  return value;
};

const post = async (baseUrl, accessToken, pathname, body) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

const failure = (status) =>
  status === 401
    ? {
        ok: false,
        failure: { reason: 'signed_out', signedOut: 'session_expired' },
      }
    : status === 403
      ? { ok: false, failure: { reason: 'forbidden' } }
      : status >= 500
        ? { ok: false, failure: { reason: 'server_error' } }
        : { ok: false, failure: { reason: 'unexpected_response' } };

const input = await readInput();
const responses = [];
const transport = {
  async widgetIntent(request) {
    const response = await post(
      input.baseUrl,
      input.accessToken,
      '/api/widgets/intent',
      request,
    );
    responses.push(response.body);
    const value = projectWidgetIntent(response.body);
    return (response.status === 200 || response.status === 201) &&
      value !== null
      ? { ok: true, value }
      : failure(response.status);
  },
  async resolveWidgets(request) {
    const response = await post(
      input.baseUrl,
      input.accessToken,
      '/api/widgets/resolve',
      request,
    );
    const value = projectWidgetResolve(response.body);
    return response.status === 200 && value !== null
      ? { ok: true, value }
      : failure(response.status);
  },
};

const runtime = createShellRuntime({
  transport: {
    chat: async () => ({ ok: false, failure: { reason: 'no_connection' } }),
  },
  session: {
    view: () => ({
      signedIn: true,
      display: { userName: 'E2 Client', tenantName: input.tenantName },
    }),
    subscribe: () => () => undefined,
  },
  render,
  environment: {
    a11y: () => ({
      reduced_motion: false,
      forced_colors: false,
      text_scale: 1,
      pointer: 'fine',
      keyboard_only_hint: false,
      caption_preference: false,
    }),
    onA11yChange: () => () => undefined,
    fragment: () => '',
  },
  scheduler: {
    now: () => Date.now(),
    after: (ms, run) => {
      const timer = setTimeout(run, ms);
      return () => clearTimeout(timer);
    },
  },
  history: {
    push: () => undefined,
    back: () => undefined,
    onBack: () => () => undefined,
  },
  newAbort: () => new AbortController(),
  submission: createLiveSubmission(transport),
  newId: () => crypto.randomUUID(),
});

try {
  const refs = [];
  const load = (envelope) => {
    const r = runtime.widgets.ingest(envelope);
    assert.notEqual(r.ingested, 'duplicate');
    const result = resultOf(envelope, new Date().toISOString());
    const markup = markupOf({id:r.itemId,result,display:'live',pending:null,sentence:null});
    for (const ref of result.readingOrder) assert(markup.includes(`data-ref="${ref}"`));
    refs.push({kind:envelope.kind,refCount:result.readingOrder.length});
    return r.itemId;
  };
  const activate = async (itemId, ref) => {
    const outcome = await runtime.widgets.activate(itemId,ref);
    assert.equal(outcome.outcome,'dismissed',JSON.stringify(outcome));
    return responses.at(-1);
  };
  const intent = (e,effect) => e.intents.find(i=>i.effect===effect);
  let envelope = input.envelope;
  let itemId = load(envelope);
  if (input.mode === 'journal') {
    const result = await activate(itemId, `intent:${envelope.body.detail_intent}`);
    assert.equal(result.next_envelope.kind,'SCHEDULE');
    assert.equal(result.next_envelope.body.range.from.slice(0,10),'2026-09-24');
    process.stdout.write(JSON.stringify({mode:input.mode,backendDetail:true,fullscreen:runtime.shell.view().fullscreen,refs,counters:runtime.widgets.counters()}));
  } else {
    for (const kind of ['service','staff','slot','commit']) {
      const ref = kind==='commit' ? `intent:${intent(envelope,'COMMIT').intent_ref}`
        : kind==='slot' ? `slot:${envelope.body.groups[0].slots[0].slot_ref}`
        : `option:${envelope.body.options[0].option_id}`;
      const result = await activate(itemId,ref);
      if (kind!=='commit') { envelope=result.next_envelope; }
      else assert.equal(result.owner_decision.state,'SUCCEEDED');
    }
    for (const operation of ['reschedule','cancel']) {
      const response = await post(input.baseUrl,input.accessToken,'/api/ai/tools/appointments.own.list/execute',{surface:'web',arguments:{}});
      assert.equal(response.status,201);
      envelope=response.body.resolution.receipt.envelope;
      itemId=load(envelope);
      const ref = operation==='reschedule' ? `intent:${envelope.body.detail_intent}` : `entry:${envelope.body.entries[0].entry_ref}`;
      const proposal=await activate(itemId,ref);
      assert.equal(proposal.next_envelope.body.confirmation_subject,operation);
      const confirmation=proposal.next_envelope;
      itemId=runtime.conversation.view().items.filter(i=>i.kind==='widget').at(-1).id;
      const committed=await activate(itemId,`intent:${intent(confirmation,'COMMIT').intent_ref}`);
      assert.equal(committed.owner_decision.state,'SUCCEEDED');
    }
    process.stdout.write(JSON.stringify({mode:input.mode,createRescheduleCancel:true,refs,counters:runtime.widgets.counters()}));
  }
} catch (error) {
  process.stdout.write(JSON.stringify({mode:input.mode,pass:false,error:String(error),counters:runtime.widgets.counters()}));
} finally { runtime.dispose(); }
