import { mountRuntimeDrawer } from './mounted-runtime-drawer.mjs';
// FBE2E-4 — the real shell process. It consumes a server-minted selector, activates only controls
// drawn by the production renderer, and reaches the production HTTP gateway through the typed
// widget transport projection. The bearer and intent tokens remain process-local and are never
// printed; stdout contains only the observable shell result used by the live PostgreSQL proof.

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
let lastIntentBody = null;
const transport = {
  async widgetIntent(request) {
    const response = await post(
      input.baseUrl,
      input.accessToken,
      '/api/widgets/intent',
      request,
    );
    lastIntentBody = response.body;
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
    resolveWidgets: transport.resolveWidgets,
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

const unmountDrawer = mountRuntimeDrawer(runtime);
try {
  const ingested = runtime.widgets.ingest(input.envelope);
  if (ingested.ingested === 'duplicate')
    throw new Error('first selector was duplicate');
  let itemId = ingested.itemId;
  const current = (label) => {
    const active = runtime.widgets.lockSources();
    if (active.length !== 1)
      throw new Error(
        `${label}: expected one live widget, received ${active.length}`,
      );
    return object(active[0], label);
  };
  const activate = async (ref) => {
    const outcome = await runtime.widgets.activate(itemId, ref);
    if (outcome.outcome !== 'dismissed')
      throw new Error(`shell activation refused: ${JSON.stringify(outcome)}`);
  };

  if (input.envelope.kind === 'SERVICE_SELECTOR') {
    const service = first(
      object(input.envelope.body, 'service body').options,
      'service options',
    );
    await activate(`option:${opaque(service.option_id, 'service option')}`);
    const staffEnvelope = current('staff selector');
    if (staffEnvelope.kind !== 'STAFF_SELECTOR')
      throw new Error('staff successor kind mismatch');
    const staff = first(
      object(staffEnvelope.body, 'staff body').options,
      'staff options',
    );
    await activate(`option:${opaque(staff.option_id, 'staff option')}`);
    const pending = object(lastIntentBody, 'staff reply');
    const decision = object(pending.owner_decision, 'staff owner decision');
    if (
      pending.receipt_outcome !== 'ACCEPTED' ||
      pending.next_envelope != null ||
      decision.kind !== 'booking_selection_pending' ||
      decision.next !== 'date' ||
      decision.reply !==
        'На какую дату проверить время у выбранного мастера?' ||
      runtime.widgets.lockSources().length !== 0
    )
      throw new Error(
        'Staff selection must ask for an explicit date without a slot',
      );
    // A new explicit test-driver READ, not an automatic day chosen by the shell.
    const availability = await post(
      input.baseUrl,
      input.accessToken,
      '/api/ai/tools/booking.availability.read/execute',
      {
        surface: 'web',
        arguments: object(
          input.availabilityRequest,
          'explicit availability request',
        ),
      },
    );
    if (![200, 201].includes(availability.status))
      throw new Error('Explicit availability READ failed');
    const next = object(
      object(
        object(
          object(availability.body, 'availability reply').resolution,
          'availability resolution',
        ).receipt,
        'availability receipt',
      ).envelope,
      'availability envelope',
    );
    if (
      next.kind !== 'TIME_SLOT_SELECTOR' ||
      object(next.provenance, 'availability provenance').source_capability !==
        'booking.availability.read'
    )
      throw new Error('Expected current registered availability selector');
    const resumed = runtime.widgets.ingest(next);
    if (resumed.ingested === 'duplicate')
      throw new Error('Explicit availability selector was duplicate');
    itemId = resumed.itemId;
  }
  const slotEnvelope = current('slot selector');
  if (slotEnvelope.kind !== 'TIME_SLOT_SELECTOR')
    throw new Error('slot successor kind mismatch');
  const group = first(
    object(slotEnvelope.body, 'slot body').groups,
    'slot groups',
  );
  const slot = input.selectedStart
    ? group.slots.find(
        (candidate) =>
          Date.parse(candidate.start.value) === Date.parse(input.selectedStart),
      )
    : first(group.slots, 'slot options');
  if (!slot) throw new Error('requested slot is absent');
  await activate(`slot:${opaque(slot.slot_ref, 'slot option')}`);
  const confirmation = current('booking confirmation');
  if (confirmation.kind !== 'BOOKING_CONFIRMATION')
    throw new Error('confirmation successor kind mismatch');
  if (input.expectedStaffLabel) {
    const staffLabel = object(
      object(confirmation.body, 'confirmation body').staff_label,
      'staff label',
    );
    if (
      staffLabel.state !== 'KNOWN' ||
      staffLabel.value !== input.expectedStaffLabel
    )
      throw new Error(
        'Confirmation must show the current selected public staff name before COMMIT',
      );
  }
  const commit = confirmation.intents.find(
    (candidate) => candidate.effect === 'COMMIT',
  );
  await activate(`intent:${opaque(commit?.intent_ref, 'commit intent')}`);

  const assistantLines = runtime.conversation
    .view()
    .items.filter((item) => item.kind === 'assistant')
    .map((item) => item.text);
  process.stdout.write(
    JSON.stringify({
      confirmationWidgetId: confirmation.widget_id,
      selectedStart: slot.start.value,
      assistantLines,
      counters: runtime.widgets.counters(),
    }),
  );
} finally {
  unmountDrawer();
  runtime.dispose();
}
