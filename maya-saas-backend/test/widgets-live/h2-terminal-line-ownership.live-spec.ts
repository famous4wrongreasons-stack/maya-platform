// H2 — the BOOKING_CONFIRMATION terminal line belongs to the intent that was adjudicated.
//
// A confirmation carries two separately tokenised intents: the AE COMMIT the primary button submits,
// and the `control.widget.dismiss` escape §4 requires on every tier
// (`emission/booking-confirmation-minter.service.ts` → `intent_proposals[1]`). Both are records on the
// SAME `widgetId`, so a terminal-line write keyed on the widget alone lets the escape's receipt
// rewrite the COMMIT's adjudicated line: CONFIRMED / «Запись подтверждена.» with the canonical
// `action_receipt_ref` became SUBMITTED / «Запрос принят. Подтверждение ожидается.» with a null ref,
// in PostgreSQL, in `/api/widgets/resolve` and in the conversation, while the appointment stayed
// `confirmed` and the Action Engine execution stayed SUCCEEDED.
//
// The whole create path below is the certified E2/FBE2E-4 one, unchanged: the real read tool mints the
// first selector over HTTP and every successor comes from the existing server transition owner. Only
// the last submission is new — the same confirmation's escape token, pressed after a successful
// COMMIT, exactly as the production renderer's Dismiss button submits it.

import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { WidgetStoresService } from '../../src/widgets/stores/widget-stores.service';

import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../../src/widgets/dto/submit-intent.dto';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import { Fixtures, type TenantFixture } from './support/fixtures';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';

type Envelope = Readonly<Record<string, unknown>>;
type Intent = Readonly<Record<string, unknown>>;

const object = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`H2 ${label} is not an object`);
  return value as Record<string, unknown>;
};

const array = (value: unknown, label: string): readonly unknown[] => {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error(`H2 ${label} is empty`);
  return value;
};

const text = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`H2 ${label} is not an opaque string`);
  return value;
};

const widgetIdOf = (envelope: Envelope): string =>
  text(envelope.widget_id, 'envelope widget id');

const intentOf = (envelope: Envelope, effect: string): Intent => {
  const found = array(envelope.intents, 'envelope intents')
    .map((value, index) => object(value, `intent ${index}`))
    .find((value) => value.effect === effect);
  if (found === undefined)
    throw new Error(`H2 envelope carries no ${effect} intent`);
  return found;
};

/** The single declared selection field of a selector intent, or null for a confirmation intent. */
const selectionFieldOf = (selected: Intent): string | null => {
  const schema = selected.input_schema;
  if (schema === null || schema === undefined) return null;
  const first = object(
    array(object(schema, 'input schema').fields, 'input schema fields')[0],
    'input schema field',
  );
  return text(first.name, 'input schema field name');
};

describe('H2 — the confirmation terminal line survives the same widget escape [HTTP] [PostgreSQL]', () => {
  let db: FixtureContext;
  let http: HttpHarness;
  let fx: Fixtures;

  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
  });

  afterEach(async () => {
    await fx.teardown();
    http.recorder.clear();
  });

  afterAll(async () => {
    await http?.close();
    await db?.close();
  });

  const submit = async (
    accessToken: string,
    envelope: Envelope,
    selected: Intent,
    label: string,
    inputs: Record<string, string> | null = null,
  ): Promise<Record<string, unknown>> => {
    const response = await http.postIntent(accessToken, {
      contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
      widget_id: widgetIdOf(envelope),
      intent_token: text(selected.intent_token, `${label} intent token`),
      inputs,
      client_nonce: `h2-${label}-${randomUUID().slice(0, 8)}`,
      profile_id: 'pwa.default',
    });
    const body = object(response.body, `${label} response`);
    if (response.status !== 200 && response.status !== 201)
      throw new Error(`H2 ${label} HTTP ${response.status}`);
    if (body.outcome !== 'terminate')
      throw new Error(
        `H2 ${label} was not routed: ${JSON.stringify({
          outcome: body.outcome,
          refusal_code: body.refusal_code ?? null,
          stopped_at_gate: body.stopped_at_gate ?? null,
        })}`,
      );
    return body;
  };

  /** One selector step: press the first option the server drew and return the successor envelope. */
  const step = async (args: {
    accessToken: string;
    envelope: Envelope;
    effect: 'REFINE' | 'DRAFT';
    option: string;
    label: string;
  }): Promise<Envelope> => {
    const selected = intentOf(args.envelope, args.effect);
    const field = selectionFieldOf(selected);
    if (field === null)
      throw new Error(`H2 ${args.label} declares no selection field`);
    const routed = await submit(
      args.accessToken,
      args.envelope,
      selected,
      args.label,
      { [field]: args.option },
    );
    return object(routed.next_envelope, `${args.label} successor`);
  };

  const firstOption = (envelope: Envelope, label: string): string =>
    text(
      object(
        array(
          object(envelope.body, `${label} body`).options,
          `${label} options`,
        )[0],
        `${label} option`,
      ).option_id,
      `${label} option id`,
    );

  const firstSlot = (envelope: Envelope): string =>
    text(
      object(
        array(
          object(
            array(object(envelope.body, 'slot body').groups, 'slot groups')[0],
            'slot group',
          ).slots,
          'slot options',
        )[0],
        'slot option',
      ).slot_ref,
      'slot ref',
    );

  const storedTerminalLines = async (
    tenantId: string,
    widgetId: string,
  ): Promise<unknown> =>
    (
      await db.prisma.widgetEmission.findFirstOrThrow({
        where: { tenantId, widgetId },
        select: { terminalLinesJson: true },
      })
    ).terminalLinesJson;

  const pageTerminalLines = async (
    accessToken: string,
    widgetId: string,
  ): Promise<unknown> => {
    const page = await http.resolveWidgets(accessToken, {
      thread_page: { limit: 20 },
    });
    expect(page.status).toBe(200);
    const resolved = object(page.body, 'resolve body');
    const found = array(resolved.widgets, 'resolved widgets')
      .map((value, index) => object(value, `resolved widget ${index}`))
      .find(
        (value) =>
          object(value.envelope, 'resolved envelope').widget_id === widgetId,
      );
    if (found === undefined)
      throw new Error('H2 the confirmation is not on the thread page');
    return found.terminal_lines;
  };

  it.each([true, false])(
    'WR-H2 escape preserves the receipt boundary (committed=%s)',
    async (shouldCommit) => {
      const tenant: TenantFixture = await fx.tenant(
        'H2 terminal line',
        CalendarSource.INTERNAL,
      );
      const user = await fx.user(tenant, UserRole.CLIENT);
      await db.prisma.user.update({
        where: { id: user.id },
        data: {
          encryptedName: db.encryption.encrypt('H2 Client'),
          phone: `+7999${String(Date.now()).slice(-7)}`,
        },
      });
      const client = await fx.client(tenant, user);
      await fx.grantFeature(tenant, 'widgets.runtime');
      await fx.grantFeature(tenant, 'ai.consultant');
      await fx.grantFeature(tenant, 'booking');
      await fx.grantFeature(tenant, 'booking.customer_app');
      await fx.grantFeature(tenant, 'crm.integration');
      const service = await db.prisma.internalService.create({
        data: {
          tenantId: tenant.id,
          name: 'H2 Service',
          price: 1500,
          durationMinutes: 30,
        },
      });
      const provider = await db.prisma.internalProvider.create({
        data: {
          tenantId: tenant.id,
          displayName: 'H2 Provider',
          active: true,
          slotIntervalMinutes: 30,
        },
      });
      await db.prisma.internalProviderService.create({
        data: {
          tenantId: tenant.id,
          providerId: provider.id,
          serviceId: service.id,
        },
      });
      // 10:00–13:00 local on every weekday: six bookable slots. The selector owner reads availability
      // for tomorrow, so a midday window always clears the industry preset's minimum notice whatever
      // the hour of the run — a window at midnight (E2's 00:00–02:00 fixture) does not, and a whole-day
      // window mints an oversize envelope. This defect has nothing to do with either.
      await db.prisma.internalAvailabilityRule.createMany({
        data: Array.from({ length: 7 }, (_, weekday) => ({
          tenantId: tenant.id,
          providerId: provider.id,
          weekday,
          startMinute: 600,
          endMinute: 780,
        })),
      });
      const accessToken = await http.login(
        tenant.slug,
        user.email,
        user.password,
      );

      // The production read tool mints the first selector; the shell may send only a drawn option id.
      const catalog = await http.executeTool(
        accessToken,
        'catalog.services.read',
        { arguments: {}, surface: 'web' },
        `h2-${randomUUID()}`,
      );
      expect([200, 201]).toContain(catalog.status);
      const selector = object(
        object(
          object(
            object(catalog.body, 'catalog execution').resolution,
            'catalog resolution',
          ).receipt,
          'catalog receipt',
        ).envelope,
        'service selector envelope',
      ) as Envelope;
      expect(selector).toMatchObject({ kind: 'SERVICE_SELECTOR' });

      const staffSelector = await step({
        accessToken,
        envelope: selector,
        effect: 'REFINE',
        option: firstOption(selector, 'service'),
        label: 'service',
      });
      expect(staffSelector).toMatchObject({ kind: 'STAFF_SELECTOR' });
      const slotSelector = await step({
        accessToken,
        envelope: staffSelector,
        effect: 'REFINE',
        option: firstOption(staffSelector, 'staff'),
        label: 'staff',
      });
      expect(slotSelector).toMatchObject({ kind: 'TIME_SLOT_SELECTOR' });
      const confirmation = await step({
        accessToken,
        envelope: slotSelector,
        effect: 'DRAFT',
        option: firstSlot(slotSelector),
        label: 'slot',
      });
      expect(confirmation).toMatchObject({ kind: 'BOOKING_CONFIRMATION' });
      const confirmationId = widgetIdOf(confirmation);

      // The two buttons the production renderer draws on this one confirmation.
      const commit = intentOf(confirmation, 'COMMIT');
      const escape = intentOf(confirmation, 'CONTROL');
      expect(escape).toMatchObject({ role: 'escape' });
      expect(text(commit.intent_token, 'commit token')).not.toBe(
        text(escape.intent_token, 'escape token'),
      );

      if (!shouldCommit) {
        const dismissed = await submit(
          accessToken,
          confirmation,
          escape,
          'uncommitted-escape',
        );
        expect(dismissed.resolved_widget).toMatchObject({
          control: 'dismissed',
        });
        expect(await storedTerminalLines(tenant.id, confirmationId)).toEqual(
          null,
        );
        expect(await pageTerminalLines(accessToken, confirmationId)).toEqual(
          [],
        );
        expect(
          await db.prisma.actionExecution.count({
            where: { tenantId: tenant.id },
          }),
        ).toBe(0);
        return;
      }

      const committed = await submit(
        accessToken,
        confirmation,
        commit,
        'commit',
      );
      expect(committed).toMatchObject({
        receipt_outcome: 'ACCEPTED',
        gates_run: 14,
        stopped_at_gate: '13',
      });
      expect(committed.owner_decision).toMatchObject({ state: 'SUCCEEDED' });

      const adjudicated = await db.prisma.widgetIntentReceipt.findFirstOrThrow({
        where: {
          tenantId: tenant.id,
          widgetId: confirmationId,
          outcome: 'ACCEPTED',
          actionReceiptRef: { not: null },
        },
        select: { actionReceiptRef: true },
      });
      const confirmedLine = [
        {
          outcome: 'CONFIRMED',
          text: 'Запись подтверждена.',
          action_receipt_ref: adjudicated.actionReceiptRef,
        },
      ];
      expect(await storedTerminalLines(tenant.id, confirmationId)).toEqual(
        confirmedLine,
      );
      expect(await pageTerminalLines(accessToken, confirmationId)).toEqual(
        confirmedLine,
      );

      // The escape §4 requires on every tier, on the SAME widget, after the COMMIT settled.
      const dismissed = await submit(
        accessToken,
        confirmation,
        escape,
        'escape',
      );
      // The escape's own effect is unchanged: it is still admitted and still resolves the control.
      expect(dismissed).toMatchObject({ receipt_outcome: 'ACCEPTED' });
      expect(dismissed.resolved_widget).toMatchObject({ control: 'dismissed' });

      // ...and it adjudicated only itself. The COMMIT's line is the COMMIT's.
      expect(await storedTerminalLines(tenant.id, confirmationId)).toEqual(
        confirmedLine,
      );
      expect(await pageTerminalLines(accessToken, confirmationId)).toEqual(
        confirmedLine,
      );

      // Both adjudications are durable and unchanged; the business fact never moved.
      const receipts = await db.prisma.widgetIntentReceipt.findMany({
        where: { tenantId: tenant.id, widgetId: confirmationId },
        orderBy: { submittedAt: 'asc' },
        select: { outcome: true, actionReceiptRef: true },
      });
      expect(receipts).toEqual([
        { outcome: 'ACCEPTED', actionReceiptRef: adjudicated.actionReceiptRef },
        { outcome: 'ACCEPTED', actionReceiptRef: null },
      ]);
      // [RI] Persistence boundary only: a deliberately injected second COMMIT.
      // This record is never submitted to HTTP and is not a production-mint claim.
      const stores = http.app.get(WidgetStoresService);
      const controlRecord = await db.prisma.widgetIntentRecord.findFirstOrThrow(
        {
          where: {
            tenantId: tenant.id,
            widgetId: confirmationId,
            effect: 'CONTROL',
          },
        },
      );
      expect(
        await stores.reconcileAcceptedReceipt({
          tenantId: tenant.id,
          intentTokenHash: controlRecord.intentTokenHash,
          actionReceiptRef: 'injected-control-reference',
        }),
      ).toBe(false);
      const first = await db.prisma.widgetIntentRecord.findFirstOrThrow({
        where: {
          tenantId: tenant.id,
          widgetId: confirmationId,
          effect: 'COMMIT',
        },
      });
      const secondHash = createHash('sha256')
        .update(randomUUID())
        .digest('hex');
      await db.prisma.widgetIntentRecord.create({
        data: {
          ...first,
          id: randomUUID(),
          intentTokenHash: secondHash,
          targetJson: first.targetJson ?? Prisma.DbNull,
          confirmationJson: first.confirmationJson ?? Prisma.DbNull,
          frozenNounsJson: first.frozenNounsJson ?? Prisma.DbNull,
          selectionDomainLabelsJson:
            first.selectionDomainLabelsJson ?? Prisma.DbNull,
        },
      });
      await stores.writeReceipt({
        tenantId: tenant.id,
        widgetId: confirmationId,
        intentTokenHash: secondHash,
        outcome: 'ACCEPTED',
        answeringChannel: 'pwa',
        actionReceiptRef: 'injected-second-reference',
      });
      expect(await storedTerminalLines(tenant.id, confirmationId)).toEqual(
        confirmedLine,
      );
      expect(await pageTerminalLines(accessToken, confirmationId)).toEqual(
        confirmedLine,
      );

      await expect(
        db.prisma.appointment.findFirstOrThrow({
          where: { tenantId: tenant.id, mayaClientId: client.clientId },
          select: { status: true },
        }),
      ).resolves.toEqual({ status: 'confirmed' });
      expect(
        await db.prisma.actionExecution.findMany({
          where: { tenantId: tenant.id },
          select: { capability: true, state: true },
        }),
      ).toEqual([
        { capability: 'crm.appointment.create.v1', state: 'SUCCEEDED' },
      ]);
    },
    300_000,
  );
});
