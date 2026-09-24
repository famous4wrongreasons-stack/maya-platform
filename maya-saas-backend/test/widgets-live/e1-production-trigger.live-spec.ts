import { createHash, randomUUID } from 'node:crypto';

import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import { E1_L_CLAUSES, E1_U_CLAUSES } from './support/e1-claims';
import { assertE1UProofDuties } from './support/e1-u-proof';
import {
  tamperCapabilitySpaceToTool,
  tamperEmissionBodyHash,
  tamperVerificationFloor,
} from './support/e1-tamper';
import { recordJestEvidence } from './support/evidence';
import { Fixtures } from './support/fixtures';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';

const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('E1 expected an object');
  return value as Record<string, unknown>;
};

const tokenHash = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const mintJournal = async (fx: Fixtures, http: HttpHarness, label: string) => {
  const tenant = await fx.tenant(label, CalendarSource.INTERNAL);
  const user = await fx.user(tenant, UserRole.TENANT_OWNER);
  await fx.grantFeature(tenant, 'booking');
  await fx.grantFeature(tenant, 'ai.owner');
  await fx.grantFeature(tenant, 'widgets.runtime');
  const accessToken = await http.login(tenant.slug, user.email, user.password);
  const trace = `e1-http-${randomUUID()}`;
  const executed = await http.executeTool(
    accessToken,
    'operations.journal.read',
    { arguments: { date: '2026-09-24' }, surface: 'web' },
    trace,
  );
  if (![200, 201].includes(executed.status))
    throw new Error(
      `E1 T-2b answered HTTP ${executed.status}: ${JSON.stringify(executed.body)}`,
    );
  const execution = record(executed.body);
  const resolution = record(execution.resolution);
  const receipt = record(resolution.receipt);
  const envelope = record(receipt.envelope);
  if (!Array.isArray(envelope.intents))
    throw new Error('E1 envelope has no intents');
  const intents = (envelope.intents as unknown[]).map(record);
  const mints = intents.map((intent) => {
    if (typeof intent.intent_token !== 'string')
      throw new Error('E1 intent has no token');
    const hash = tokenHash(intent.intent_token);
    const mint = http
      .mintProvenance()
      .find(
        (line) =>
          line.request_id === trace &&
          line.widget_id === envelope.widget_id &&
          line.intent_token_hash === hash,
      );
    if (mint?.trigger !== 'T-2b')
      throw new Error('E1 record has no matching T-2b provenance');
    return { intent, mint };
  });
  return { tenant, user, accessToken, trace, envelope, mints };
};

describe('E1 — production-triggered evidence records', () => {
  let ctx: FixtureContext;
  let http: HttpHarness;
  let fx: Fixtures;

  beforeAll(async () => {
    ctx = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(ctx, http);
  });

  afterEach(async () => {
    await fx.teardown();
    http.recorder.clear();
  });

  afterAll(async () => {
    await http?.close();
    await ctx?.close();
  });

  it('E1-T2B-CLEAN [HTTP] [E-MINT] mints through the journal owner and traverses the real gate pipeline', async () => {
    const tenant = await fx.tenant('E1 clean T-2b', CalendarSource.INTERNAL);
    const user = await fx.user(tenant, UserRole.TENANT_OWNER);
    await fx.grantFeature(tenant, 'booking');
    await fx.grantFeature(tenant, 'ai.owner');
    await fx.grantFeature(tenant, 'widgets.runtime');
    const accessToken = await http.login(
      tenant.slug,
      user.email,
      user.password,
    );
    const trace = `e1-http-${randomUUID()}`;
    const executed = await http.executeTool(
      accessToken,
      'operations.journal.read',
      { arguments: { date: '2026-09-24' }, surface: 'web' },
      trace,
    );
    if (![200, 201].includes(executed.status))
      throw new Error(
        `E1 T-2b answered HTTP ${executed.status}: ${JSON.stringify(executed.body)}`,
      );
    const execution = record(executed.body);
    const resolution = record(execution.resolution);
    const receipt = record(resolution.receipt);
    const envelope = record(receipt.envelope);
    const intents = envelope.intents;
    expect(Array.isArray(intents)).toBe(true);
    const first = record((intents as unknown[])[0]);
    expect(first.effect).toBe('REFINE');
    expect(typeof first.intent_token).toBe('string');
    const mint = http
      .mintProvenance()
      .find(
        (line) =>
          line.request_id === trace && line.widget_id === envelope.widget_id,
      );
    expect(mint).toEqual(
      expect.objectContaining({ trigger: 'T-2b', request_id: trace }),
    );

    const body = {
      widget_id: envelope.widget_id,
      intent_token: first.intent_token,
      inputs: null,
    };

    http.recorder.clear();
    const noSession = await http.postIntentUnauthenticated(body);
    expect(noSession.status).toBe(401);
    expect(http.recorder.writes()).toEqual([]);

    http.recorder.clear();
    const hostile = await http.postIntent(accessToken, {
      ...body,
      credentials: { bearer: 'client-controlled' },
    });
    expect(hostile.status).toBe(400);
    expect(http.recorder.writes()).toEqual([]);

    http.recorder.clear();
    const forged = await http.postIntent(accessToken, {
      ...body,
      intent_token: `${String(first.intent_token)}forged`,
    });
    expect(forged).toMatchObject({
      status: 200,
      body: { outcome: 'expired', stopped_at_gate: '1' },
    });
    expect(http.recorder.writes()).toEqual([]);

    http.recorder.clear();
    const wrongWidget = await http.postIntent(accessToken, {
      ...body,
      widget_id: randomUUID(),
    });
    expect(wrongWidget).toMatchObject({
      status: 200,
      body: { outcome: 'expired', stopped_at_gate: '1' },
    });
    expect(http.recorder.writes()).toEqual([]);

    const otherUser = await fx.user(tenant, UserRole.TENANT_OWNER, 'other');
    const otherBearer = await http.login(
      tenant.slug,
      otherUser.email,
      otherUser.password,
    );
    http.recorder.clear();
    const otherPrincipal = await http.postIntent(otherBearer, body);
    expect(otherPrincipal).toMatchObject({
      status: 200,
      body: {
        outcome: 'refuse',
        code: 'widget_principal_mismatch',
        stopped_at_gate: '3',
      },
    });
    expect(http.recorder.writes()).toEqual([]);

    const otherTenant = await fx.tenant(
      'E1 foreign tenant',
      CalendarSource.INTERNAL,
    );
    const otherTenantUser = await fx.user(otherTenant, UserRole.TENANT_OWNER);
    await fx.grantFeature(otherTenant, 'widgets.runtime');
    const otherTenantBearer = await http.login(
      otherTenant.slug,
      otherTenantUser.email,
      otherTenantUser.password,
    );
    http.recorder.clear();
    const foreignTenant = await http.postIntent(otherTenantBearer, body);
    expect(foreignTenant).toMatchObject({
      status: 200,
      body: { outcome: 'expired', stopped_at_gate: '1' },
    });
    expect(http.recorder.writes()).toEqual([]);

    const submitted = await http.postIntent(accessToken, {
      ...body,
    });
    expect(submitted.status).toBe(200);
    const answer = record(submitted.body);
    if (answer.gates_run !== 14)
      throw new Error(`E1 gate traversal stopped: ${JSON.stringify(answer)}`);
    expect(answer.gates_run).toBe(14);
    expect(answer.stopped_at_gate).toBe('13');
    expect(answer.outcome).toBe('terminate');
    expect(answer.receipt_outcome).toBe('REFUSED');

    recordJestEvidence({
      testId: 'E1-T2B-CLEAN',
      triggerTraceId: trace,
      recordHash: mint?.intent_token_hash ?? null,
      stoppedAtGate: '13',
      gatesRun: 14,
      labels: ['[E-MINT]'],
      clauses: E1_L_CLAUSES,
      claim: 'L',
    });
  }, 120_000);

  it('E1-G1-SEAL [HTTP] [E-TAMPER:WidgetEmission.bodyHash] rejects a production record whose sealed body is altered', async () => {
    const x = await mintJournal(fx, http, 'E1 Gate 1 seal tamper');
    const refine = x.mints.find((item) => item.intent.effect === 'REFINE');
    expect(refine).toBeDefined();
    await tamperEmissionBodyHash(
      ctx,
      x.tenant.id,
      String(x.envelope.widget_id),
    );
    http.recorder.clear();
    const answer = await http.postIntent(x.accessToken, {
      widget_id: x.envelope.widget_id,
      intent_token: refine?.intent.intent_token,
      inputs: null,
    });
    expect(answer).toMatchObject({
      status: 200,
      body: { outcome: 'expired', stopped_at_gate: '1' },
    });
    expect(http.recorder.writes()).toEqual([]);
    recordJestEvidence({
      testId: 'E1-G1-SEAL',
      triggerTraceId: x.trace,
      recordHash: refine?.mint.intent_token_hash ?? null,
      stoppedAtGate: '1',
      gatesRun: 1,
      labels: ['[E-TAMPER:WidgetEmission.bodyHash]'],
      clauses: ['G1-a'],
      claim: 'L-T',
    });
  }, 120_000);

  it('E1-G5-FLOOR [HTTP] [E-TAMPER:WidgetIntentRecord.verificationFloor] rejects policy-floor drift without writes', async () => {
    const x = await mintJournal(fx, http, 'E1 Gate 5 floor tamper');
    const refine = x.mints.find((item) => item.intent.effect === 'REFINE');
    expect(refine).toBeDefined();
    await tamperVerificationFloor(
      ctx,
      x.tenant.id,
      String(refine?.mint.intent_token_hash),
    );
    http.recorder.clear();
    const answer = await http.postIntent(x.accessToken, {
      widget_id: x.envelope.widget_id,
      intent_token: refine?.intent.intent_token,
      inputs: null,
    });
    expect(answer).toMatchObject({
      status: 200,
      body: {
        outcome: 'superseded',
        code: 'policy_floor_changed',
        stopped_at_gate: '5',
      },
    });
    recordJestEvidence({
      testId: 'E1-G5-FLOOR',
      triggerTraceId: x.trace,
      recordHash: refine?.mint.intent_token_hash ?? null,
      stoppedAtGate: '5',
      gatesRun: 5,
      labels: ['[E-TAMPER:WidgetIntentRecord.verificationFloor]'],
      clauses: ['G5-e'],
      claim: 'L-T',
    });
  }, 120_000);

  it('E1-G6-TOOL [HTTP] [E-TAMPER:capabilitySpace=TOOL] stays fail-closed while N6-FLOOR exposes the independent Gate 6 refusal', async () => {
    const x = await mintJournal(fx, http, 'E1 Gate 6 TOOL tamper');
    const control = x.mints.find((item) => item.intent.effect === 'CONTROL');
    expect(control).toBeDefined();
    await tamperCapabilitySpaceToTool(
      ctx,
      x.tenant.id,
      String(control?.mint.intent_token_hash),
    );
    http.recorder.clear();
    const answer = await http.postIntent(x.accessToken, {
      widget_id: x.envelope.widget_id,
      intent_token: control?.intent.intent_token,
      inputs: null,
    });
    expect(answer).toMatchObject({
      status: 200,
      body: {
        outcome: 'refuse',
        code: 'needs_second_channel',
        stopped_at_gate: '5',
      },
    });
    expect(http.recorder.writes()).toEqual([]);
    recordJestEvidence({
      testId: 'E1-G6-TOOL',
      triggerTraceId: x.trace,
      recordHash: control?.mint.intent_token_hash ?? null,
      stoppedAtGate: '5',
      gatesRun: 5,
      labels: ['[E-TAMPER:capabilitySpace=TOOL]'],
      clauses: ['G6-19'],
      claim: 'L-T',
    });
  }, 120_000);

  it('E1-G4-INDEP [HTTP] [E-INDEP] keeps a foreign tenant outside the record while the N4 battery exposes Gate 4', async () => {
    const x = await mintJournal(fx, http, 'E1 Gate 4 source tenant');
    const refine = x.mints.find((item) => item.intent.effect === 'REFINE');
    expect(refine).toBeDefined();
    const foreignTenant = await fx.tenant(
      'E1 Gate 4 foreign tenant',
      CalendarSource.INTERNAL,
    );
    const foreignUser = await fx.user(foreignTenant, UserRole.TENANT_OWNER);
    await fx.grantFeature(foreignTenant, 'widgets.runtime');
    const foreignBearer = await http.login(
      foreignTenant.slug,
      foreignUser.email,
      foreignUser.password,
    );
    http.recorder.clear();
    const answer = await http.postIntent(foreignBearer, {
      widget_id: x.envelope.widget_id,
      intent_token: refine?.intent.intent_token,
      inputs: null,
    });
    expect(answer).toMatchObject({
      status: 200,
      body: { outcome: 'expired', stopped_at_gate: '1' },
    });
    expect(http.recorder.writes()).toEqual([]);
    recordJestEvidence({
      testId: 'E1-G4-INDEP',
      triggerTraceId: x.trace,
      recordHash: refine?.mint.intent_token_hash ?? null,
      stoppedAtGate: '1',
      gatesRun: 1,
      labels: ['[E-INDEP]'],
      clauses: ['G4-b'],
      claim: 'L-T',
    });
  }, 120_000);

  it('E1-U [HTTP] [U-proof] records the frozen unreachable-class duties without treating them as live evidence', () => {
    assertE1UProofDuties();
    recordJestEvidence({
      testId: 'E1-U-CLASS',
      triggerTraceId: null,
      recordHash: null,
      stoppedAtGate: null,
      gatesRun: null,
      labels: ['[U-proof]'],
      clauses: E1_U_CLAUSES,
      claim: 'U',
    });
  });
});
