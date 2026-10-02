import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { CalendarSource, UserRole } from '../../../src/common/domain.enums';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../../../src/widgets/dto/submit-intent.dto';
import type { Fixtures } from './fixtures';
import type { HttpHarness } from './http-bootstrap';

export const object = (v: unknown): Record<string, unknown> => {
  assert(v && typeof v === 'object' && !Array.isArray(v));
  return v as Record<string, unknown>;
};
export const list = (v: unknown): unknown[] => {
  assert(Array.isArray(v));
  return v;
};
export const evidence = (e: Record<string, unknown>) => ({
  widget_id: e.widget_id,
  body_hash: object(e.integrity).body_hash,
  envelope_seal: object(e.integrity).envelope_seal,
});
export const firstOption = (e: Record<string, unknown>) =>
  object(list(object(e.body).options)[0]).option_id;
export const firstSlot = (e: Record<string, unknown>) =>
  object(list(object(list(object(e.body).groups)[0]).slots)[0]);
export const intent = (e: Record<string, unknown>, effect: string) =>
  object(list(e.intents).find((i) => object(i).effect === effect));
export async function observe(
  http: HttpHarness,
  token: string,
  e: Record<string, unknown>,
) {
  const response = await http.resolveWidgets(token, {
    thread_page: { limit: 1 },
    rendered: evidence(e),
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
}
export async function submit(
  http: HttpHarness,
  token: string,
  e: Record<string, unknown>,
  effect: string,
  option?: unknown,
) {
  const i = intent(e, effect);
  const field = i.input_schema
    ? object(list(object(i.input_schema).fields)[0]).name
    : null;
  const response = await http.postIntent(token, {
    contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
    widget_id: e.widget_id,
    intent_token: i.intent_token,
    inputs: field ? { [String(field)]: option } : null,
    client_nonce: randomUUID(),
    profile_id: 'pwa.default',
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return object(response.body);
}
export async function startBooking(fx: Fixtures, http: HttpHarness) {
  const tenant = await fx.tenant(
    'FBE2E owner decisions',
    CalendarSource.INTERNAL,
  );
  const user = await fx.user(tenant, UserRole.CLIENT);
  const source = await fx.binView().bookingSource(tenant, user);
  for (const f of [
    'widgets.runtime',
    'ai.consultant',
    'booking',
    'booking.customer_app',
    'crm.integration',
  ] as const)
    await fx.grantFeature(tenant, f);
  const token = await http.login(tenant.slug, user.email, user.password);
  const catalog = await http.executeTool(
    token,
    'catalog.services.read',
    { arguments: {}, surface: 'web' },
    randomUUID(),
  );
  assert.equal(catalog.status, 201, JSON.stringify(catalog.body));
  const envelope = object(
    object(object(object(catalog.body).resolution).receipt).envelope,
  );
  assert.equal(envelope.kind, 'SERVICE_SELECTOR');
  return { tenant, user, source, token, envelope };
}
