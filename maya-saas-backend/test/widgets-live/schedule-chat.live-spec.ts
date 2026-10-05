import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../src/common/domain.enums';
import { CrmAdapterFactory } from '../../src/crm/crm-adapter.factory';
import { MockCRMAdapter } from '../../src/crm/adapters/mock-crm.adapter';
import { staffScheduleRevision } from '../../src/crm/staff-schedule.utils';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';

describe('schedule conversation bridge [HTTP] [PostgreSQL] [synthetic provider]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  let hold: Promise<void> | null = null;
  let conflict = false;
  let drift = false;
  let slots = [{ from: '10:00', to: '20:00' }];
  const day = (staffId: string, date: string) => ({
    staff_id: staffId,
    date,
    slots: [...slots],
    is_working: slots.length > 0,
    revision: staffScheduleRevision(staffId, date, slots),
  });
  const writes = jest.fn(
    async (p: { staffId: string; date: string; slots: typeof slots }) => {
      slots = drift ? [{ from: '12:00', to: '18:00' }] : p.slots;
      if (hold) await hold;
      return {
        ...day(p.staffId, p.date),
        verified: true,
        existing_appointments_preserved: true,
      };
    },
  );
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation(() => {
        throw new Error('No paid model: fixture refuses unexpected model call');
      });
    jest
      .spyOn(http.app.get(CrmAdapterFactory), 'create')
      .mockImplementation((provider, config) => {
        if (provider !== CrmProvider.MOCK)
          throw new Error('external provider forbidden');
        return Object.assign(new MockCRMAdapter(config), {
          getStaff: async () => [{ id: '7', name: 'Антон Соколов' }],
          getStaffScheduleDay: async (p: { staffId: string; date: string }) =>
            day(p.staffId, p.date),
          previewStaffScheduleDayChange: async (p: {
            staffId: string;
            date: string;
            slots: typeof slots;
          }) => ({
            current: day(p.staffId, p.date),
            proposed: {
              ...day(p.staffId, p.date),
              slots: p.slots,
              is_working: p.slots.length > 0,
            },
            conflict_times: conflict ? ['15:00'] : [],
          }),
          applyStaffScheduleDayChange: writes,
        });
      });
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    await http?.close();
    await db?.close();
  });
  async function salon(role = UserRole.TENANT_OWNER) {
    const tenant = await fx.tenant(
      'Schedule conversation',
      CalendarSource.EXTERNAL,
    );
    const user = await fx.user(tenant, role);
    for (const feature of [
      'crm.integration',
      'ai.consultant',
      'widgets.runtime',
      'booking',
      'ai.owner',
    ] as const)
      await fx.grantFeature(tenant, feature);
    const branch = await db.prisma.branch.create({
      data: { tenantId: tenant.id, name: 'Synthetic branch' },
    });
    const staff = await fx.staff(tenant, user, 'Антон Соколов');
    await db.prisma.staff.update({
      where: { id: staff.id },
      data: { branchId: branch.id },
    });
    await db.prisma.staffProviderLink.create({
      data: {
        tenantId: tenant.id,
        staffId: staff.id,
        provider: CrmProvider.MOCK,
        externalId: '7',
      },
    });
    await db.prisma.crmIntegration.create({
      data: {
        tenantId: tenant.id,
        provider: CrmProvider.MOCK,
        encryptedApiToken: db.encryption.encrypt('synthetic-only'),
        status: 'active',
      },
    });
    const token = await http.login(tenant.slug, user.email, user.password);
    return { tenant, user, token };
  }
  async function carrier(
    token: string,
    submission: Record<string, unknown>,
    chatResponse?: unknown,
  ): Promise<any> {
    const baseUrl = await http.listenLoopback();
    return new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [path.resolve('test/widgets-live/support/schedule-carrier-proof.mjs')],
        { stdio: ['pipe', 'pipe', 'pipe'], env: process.env },
      );
      let out = '',
        err = '';
      child.stdout.on('data', (c) => (out += String(c)));
      child.stderr.on('data', (c) => (err += String(c)));
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0 ? resolve(JSON.parse(out)) : reject(new Error(err)),
      );
      child.stdin.end(
        JSON.stringify({ baseUrl, token, submission, chatResponse }),
      );
    });
  }
  beforeEach(() => {
    hold = null;
    conflict = false;
    drift = false;
    slots = [{ from: '10:00', to: '20:00' }];
    writes.mockClear();
  });
  it('web chat previews, carrier confirms once and observes canonical success', async () => {
    const { token } = await salon();
    const preview = await request(http.app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        surface: 'web',
        audience: 'owner',
        requestId: randomUUID(),
        messages: [
          { role: 'user', content: 'Сделай Антону Соколову выходной завтра' },
        ],
      });
    if (preview.status !== 201) throw new Error(JSON.stringify(preview.body));
    expect(writes).not.toHaveBeenCalled();
    const page = await http.resolveWidgets(token, {
      thread_page: { limit: 20 },
    });
    const widgets = (page.body as any).widgets;
    if (!widgets?.length)
      throw new Error(
        JSON.stringify({ preview: preview.body, page: page.body }),
      );
    const envelope = widgets[0].envelope;
    const intent = envelope.intents.find((i: any) => i.effect === 'COMMIT');
    const submit = {
      contract: 'maya.widget.intent.submission/1',
      widget_id: envelope.widget_id,
      intent_token: intent.intent_token,
      inputs: null,
      client_nonce: randomUUID(),
      profile_id: 'pwa.default',
    };
    const outcome = await carrier(token, submit, preview.body);
    const result = { body: outcome };
    expect(outcome).toMatchObject({
      status: 'settled',
      lines: [{ outcome: 'CONFIRMED', text: 'График обновлён.' }],
    });
    if (writes.mock.calls.length !== 1)
      throw new Error(JSON.stringify({ result: result.body, envelope }));
    expect(writes).toHaveBeenCalledTimes(1);
    expect(slots).toEqual([]);
    await http.postIntent(token, { ...submit, client_nonce: randomUUID() });
    expect(writes).toHaveBeenCalledTimes(1);
    const observed = await http.resolveWidgets(token, {
      thread_page: { limit: 20 },
    });
    expect(JSON.stringify(observed.body)).toContain('График обновлён.');
  });
  async function chat(
    token: string,
    content: string,
    surface = 'web',
    messages?: Array<{ role: string; content: string }>,
    conversationId?: string,
  ) {
    const r = await request(http.app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        surface,
        audience: 'owner',
        requestId: randomUUID(),
        conversationId,
        messages: messages ?? [{ role: 'user', content }],
      });
    if (r.status !== 201) throw new Error(JSON.stringify(r.body));
    return r.body;
  }
  async function prepare(
    token: string,
    content = 'Сделай Антону Соколову выходной завтра',
    surface = 'web',
  ) {
    const response = await chat(token, content, surface);
    expect(response.action).toBeNull();
    expect(response.resolution?.receipt?.widget_id).toBeDefined();
    const page = await http.resolveWidgets(token, {
      thread_page: { limit: 20 },
    });
    const envelope = (page.body as any).widgets?.[0]?.envelope;
    if (!envelope)
      throw new Error(JSON.stringify({ response, page: page.body }));
    const intent = envelope.intents.find((i: any) => i.effect === 'COMMIT');
    return {
      response,
      envelope,
      submit: {
        contract: 'maya.widget.intent.submission/1',
        widget_id: envelope.widget_id,
        intent_token: intent.intent_token,
        inputs: null,
        client_nonce: randomUUID(),
        profile_id: 'pwa.default',
      },
    };
  }
  it.each([
    [
      'web',
      'Поставь Антону завтра перерыв с 14 до 15',
      [
        { from: '10:00', to: '14:00' },
        { from: '15:00', to: '20:00' },
      ],
    ],
    [
      'native',
      'Измени Антону завтра часы с 11 до 18',
      [{ from: '11:00', to: '18:00' }],
    ],
  ])(
    'supports %s free schedule wording through carrier',
    async (surface, text, expected) => {
      const f = await salon();
      const p = await prepare(f.token, text as string, surface as string);
      expect(writes).not.toHaveBeenCalled();
      const outcome = await carrier(f.token, p.submit);
      expect(outcome).toMatchObject({
        status: 'settled',
        lines: [{ outcome: 'CONFIRMED' }],
      });
      expect(slots).toEqual(expected);
      expect(writes).toHaveBeenCalledTimes(1);
    },
  );
  it('clarifies missing material and uses multi-turn date and real staff parameters', async () => {
    const f = await salon();
    const first = await chat(f.token, 'Сделай выходной');
    expect(first.reply).toContain('дату');
    expect(writes).not.toHaveBeenCalled();
    const second = await chat(
      f.token,
      'завтра',
      'web',
      [
        { role: 'user', content: 'Сделай выходной' },
        { role: 'assistant', content: first.reply },
        { role: 'user', content: 'завтра' },
      ],
      first.user_turn.conversationId,
    );
    expect(second.reply).toContain('мастер');
    const third = await chat(
      f.token,
      'Антону',
      'web',
      [
        { role: 'user', content: 'Сделай выходной' },
        { role: 'assistant', content: first.reply },
        { role: 'user', content: 'завтра' },
        { role: 'assistant', content: second.reply },
        { role: 'user', content: 'Антону' },
      ],
      first.user_turn.conversationId,
    );
    expect(third.reply).toContain('Антон');
    expect(writes).not.toHaveBeenCalled();
    expect(
      await db.prisma.aiApprovalRequest.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(1);
  });
  it('denies foreign tenant token and client role before any provider write', async () => {
    const f = await salon(),
      other = await salon(),
      client = await salon(UserRole.CLIENT);
    const p = await prepare(f.token);
    const denied = await http.postIntent(other.token, p.submit);
    expect((denied.body as any).receipt_outcome).not.toBe('ACCEPTED');
    const reply = await chat(client.token, 'Сделай Антону завтра выходной');
    expect(reply.reply).toContain('владелец');
    expect(writes).not.toHaveBeenCalled();
  });
  it('preserves confirmed appointment conflict facts and never mints a confirmation', async () => {
    const f = await salon();
    conflict = true;
    const reply = await chat(f.token, 'Сделай Антону завтра выходной');
    expect(reply.reply).toContain('15:00');
    expect(writes).not.toHaveBeenCalled();
    expect(
      await db.prisma.aiApprovalRequest.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(0);
  });
  it('stale revision is terminal NOT_CONFIRMED on actual click and remains failed on repeated observation', async () => {
    const f = await salon();
    const p = await prepare(f.token);
    slots = [{ from: '12:00', to: '20:00' }];
    const outcome = await carrier(f.token, p.submit);
    expect(outcome).toMatchObject({
      status: 'settled',
      lines: [{ outcome: 'NOT_CONFIRMED' }],
    });
    for (let i = 0; i < 2; i++) {
      const page = await http.resolveWidgets(f.token, {
        thread_page: { limit: 20 },
      });
      expect(JSON.stringify(page.body)).toContain('NOT_CONFIRMED');
    }
    const approval = await db.prisma.aiApprovalRequest.findFirstOrThrow({
      where: { tenantId: f.tenant.id },
    });
    expect(approval.status).toBe('failed');
    expect(writes).not.toHaveBeenCalled();
    expect(slots).toEqual([{ from: '12:00', to: '20:00' }]);
  });
  it('timeout stays unconfirmed then late canonical success is observed without repeating the provider write', async () => {
    const f = await salon();
    const p = await prepare(f.token);
    let release!: () => void;
    hold = new Promise<void>((r) => (release = r));
    const outcome = await carrier(f.token, p.submit);
    expect(outcome).toMatchObject({
      status: 'settled',
      lines: [{ outcome: 'SUBMITTED', action_receipt_ref: null }],
    });
    expect(writes).toHaveBeenCalledTimes(1);
    release();
    hold = null;
    let observed = '';
    for (let i = 0; i < 40; i++) {
      observed = JSON.stringify(
        (await http.resolveWidgets(f.token, { thread_page: { limit: 20 } }))
          .body,
      );
      if (observed.includes('CONFIRMED')) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(observed).toContain('График обновлён.');
    await http.postIntent(f.token, { ...p.submit, client_nonce: randomUUID() });
    expect(writes).toHaveBeenCalledTimes(1);
  });

  it('missing exact provider staff link is refused before provider execution', async () => {
    const f = await salon();
    const p = await prepare(f.token);
    await db.prisma.staffProviderLink.updateMany({
      where: { tenantId: f.tenant.id },
      data: { unlinkedAt: new Date() },
    });
    expect(await carrier(f.token, p.submit)).toMatchObject({
      status: 'settled',
      lines: [{ outcome: 'NOT_CONFIRMED' }],
    });
    expect(writes).not.toHaveBeenCalled();
  });
  it('divergent provider readback remains UNKNOWN and preserves actual provider hours', async () => {
    const f = await salon();
    const p = await prepare(f.token);
    drift = true;
    const result = await carrier(f.token, p.submit);
    expect(result).toMatchObject({
      status: 'settled',
      lines: [{ outcome: 'SUBMITTED', action_receipt_ref: null }],
    });
    expect(writes).toHaveBeenCalledTimes(1);
    expect(slots).toEqual([{ from: '12:00', to: '18:00' }]);
    const observed = JSON.stringify(
      (await http.resolveWidgets(f.token, { thread_page: { limit: 20 } })).body,
    );
    expect(observed).not.toContain('График обновлён.');
    expect(writes).toHaveBeenCalledTimes(1);
  });

  it('concurrent confirmations dispatch only once', async () => {
    const f = await salon();
    const p = await prepare(f.token);
    await Promise.all([
      http.postIntent(f.token, p.submit),
      http.postIntent(f.token, { ...p.submit, client_nonce: randomUUID() }),
    ]);
    expect(writes).toHaveBeenCalledTimes(1);
  });
  it('expired approval cannot dispatch from an otherwise valid widget', async () => {
    const f = await salon();
    const p = await prepare(f.token);
    await db.prisma.aiApprovalRequest.updateMany({
      where: { tenantId: f.tenant.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await http.postIntent(f.token, p.submit);
    expect(writes).not.toHaveBeenCalled();
    expect(
      JSON.stringify(
        (await http.resolveWidgets(f.token, { thread_page: { limit: 20 } }))
          .body,
      ),
    ).toContain('EXPIRED_UNUSED');
  });
  it('owner client audience cannot create a schedule approval', async () => {
    const f = await salon();
    const reply = await request(http.app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${f.token}`)
      .send({
        surface: 'web',
        audience: 'client',
        requestId: randomUUID(),
        messages: [{ role: 'user', content: 'Сделай Антону завтра выходной' }],
      });
    expect(reply.status).toBe(201);
    expect(
      await db.prisma.aiApprovalRequest.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(0);
    expect(writes).not.toHaveBeenCalled();
  });
  it('role downgrade after preview denies confirmation', async () => {
    const f = await salon();
    const p = await prepare(f.token);
    await db.prisma.membership.updateMany({
      where: { tenantId: f.tenant.id, userId: f.user.id },
      data: { role: UserRole.CLIENT },
    });
    await http.postIntent(f.token, p.submit);
    expect(writes).not.toHaveBeenCalled();
  });
  it.each(['web', 'native'])(
    '%s typed confirmation uses the same owner and outcome',
    async (surface) => {
      const f = await salon();
      const p = await prepare(f.token, undefined, surface);
      const result = await chat(
        f.token,
        'Подтвердить изменение графика',
        surface,
        undefined,
        p.response.user_turn.conversationId,
      );
      expect(result.reply).toBe('График обновлён.');
      expect(writes).toHaveBeenCalledTimes(1);
    },
  );
});
