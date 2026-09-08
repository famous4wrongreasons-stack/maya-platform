import assert from 'node:assert/strict';
import type { Staff, DevicePushToken } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ActionEngineRuntimeService } from '../src/action-engine';
import {
  Package5Wave1ShadowService,
  Package5Wave1ExecutableService,
} from '../src/package5-wave1/package5-wave1.service';
import { Package5Wave1CanonicalCutoverService } from '../src/package5-wave1/package5-wave1-canonical-cutover.service';
import { CommunicationDeliveryService } from '../src/communication-delivery';
import { InboxService } from '../src/inbox/inbox.service';
import { CanonicalInboxProjectionService } from '../src/inbox/canonical-inbox-projection.service';
import { OwnerReportStore } from '../src/owner-reports/owner-report.store';
import type { BridgeSourceService } from '../src/tenancy/bridge-source.service';
import {
  asActor,
  config,
  context,
  db,
  engine,
  ingress,
  secret,
  staffFixture,
  tenantFixture,
} from './package5-wave-rc-proof-support';
const settings = new ConfigService({
  DATABASE_URL: config.get<string>('DATABASE_URL'),
  CRM_ENCRYPTION_KEY: secret,
  CANONICAL_INBOX_PROJECTION_CUTOVER_AT: new Date(
    Date.now() - 86400000,
  ).toISOString(),
});
const runtime = new ActionEngineRuntimeService(engine, ingress),
  delivery = new CommunicationDeliveryService(db, runtime, settings),
  bindings = new OwnerReportStore(db, context, ingress, settings),
  projection = new CanonicalInboxProjectionService(
    db,
    context,
    ingress,
    engine,
    delivery,
    bindings,
    settings,
  );
const inbox = new InboxService(
    db,
    context,
    {} as BridgeSourceService,
    undefined,
    delivery,
    projection,
  ),
  planner = new Package5Wave1ShadowService(runtime, db, context),
  executor = new Package5Wave1ExecutableService(db, ingress, engine),
  cutover = new Package5Wave1CanonicalCutoverService(
    db,
    context,
    inbox,
    planner,
    executor,
    engine,
  );
const checks: string[] = [];
import * as apns from '../src/inbox/apns-push';
const sent: string[] = [];
let unknownDevice = '';
Object.defineProperty(apns, 'prepareInboxApnsCanonical', {
  configurable: true,
  value: () => ({
    send: (input: { deviceToken: string }) => {
      sent.push(input.deviceToken);
      return Promise.resolve(
        input.deviceToken === unknownDevice
          ? { outcome: 'unknown', reason: 'synthetic lost provider reply' }
          : {
              outcome: 'accepted',
              providerReference: 'synthetic-' + input.deviceToken,
            },
      );
    },
  }),
});

async function main() {
  await db.$connect();
  const tenant = await tenantFixture(),
    owner = await staffFixture(tenant.id),
    assignee = await staffFixture(tenant.id, 'staff');
  await asActor(tenant.id, owner.user.id, owner.member.role, async () => {
    for (const type of [
      'marketing_campaign',
      'owner_alert',
      'shift_reminder',
      'review_alert',
      'maya_task',
    ] as const)
      await assert.rejects(
        inbox.publishForTenant(tenant.id, {
          type,
          sourceEventId: 'raw-source',
          title: 'arbitrary',
          bodyText: 'arbitrary',
          telegramChatIds: ['1'],
        }),
      );
    await assert.rejects(
      inbox.ingest({
        tenant_slug: 'legacy',
        type: 'owner_alert',
        source_event_id: 'raw',
        title: 'raw',
        body_text: 'raw',
      }),
    );
    assert.equal(
      await db.actionExecution.count({ where: { tenantId: tenant.id } }),
      0,
    );
    assert.equal(
      await db.inboxItem.count({ where: { tenantId: tenant.id } }),
      0,
    );
    checks.push(
      'generic bridge/raw recipient/marketing/task-without-owner rejected before AE/Inbox',
    );
    const command = {
        assigneeUserId: assignee.user.id,
        title: 'Synthetic canonical work',
        bodyText: 'Canonical work remains the only owner',
        dueAt: null,
      },
      key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        cutover.createTask(tenant.id, owner.user.id, command, key),
      ),
    );
    assert.equal(
      new Set(results.map((r) => r.result.actionExecutionId)).size,
      1,
    );
    assert.ok(results.some((r) => r.projected === 1));
    assert.equal(
      await db.operationalWorkItem.count({ where: { tenantId: tenant.id } }),
      1,
    );
    const card = await db.inboxItem.findFirstOrThrow({
      where: { tenantId: tenant.id },
    });
    assert.equal(card.type, 'maya_task');
    assert.equal(card.userId, assignee.user.id);
    assert.equal(card.operationalWorkItemId, results[0].result.targetRef);
    assert.equal(
      await db.marketingCampaign.count({ where: { tenantId: tenant.id } }),
      1,
    );
    await projection.work(tenant.id, card.operationalWorkItemId);
    assert.equal(
      await db.inboxItem.count({ where: { tenantId: tenant.id } }),
      1,
    );
    checks.push(
      'concurrent A23 task outcome preserved; confirmed owner -> same AE/CD/Inbox with exact work FK',
    );
  });
  await asActor(tenant.id, assignee.user.id, assignee.member.role, async () => {
    const card = await db.inboxItem.findFirstOrThrow({
      where: { tenantId: tenant.id },
    });
    await cutover.completeTask(
      tenant.id,
      assignee.user.id,
      card.id,
      randomUUID(),
    );
    const completed = await db.inboxItem.findUniqueOrThrow({
      where: { id: card.id },
    });
    assert.equal(
      (completed.payloadJson as Record<string, unknown>).status,
      'completed',
    );
    await projection.work(tenant.id, card.operationalWorkItemId!);
    assert.equal(
      (
        await db.inboxItem.findUniqueOrThrow({ where: { id: card.id } })
      ).archivedAt?.getTime(),
      completed.archivedAt?.getTime(),
    );
    checks.push(
      'A23 completion remains committed; old creation retry cannot reopen or rewrite the completed card',
    );
  });

  const salon = await tenantFixture();
  await db.tenant.update({
    where: { id: salon.id },
    data: { calendarSource: 'internal' },
  });
  const branch = await db.branch.create({
      data: {
        tenantId: salon.id,
        name: 'Synthetic appointment branch',
        timezone: 'UTC',
      },
    }),
    client = await db.client.create({ data: { tenantId: salon.id } });
  const primary = await staffFixture(salon.id, 'staff'),
    second = await staffFixture(salon.id, 'staff'),
    other = await staffFixture(salon.id, 'staff'),
    manager = await staffFixture(salon.id);
  const chairs: Staff[] = [];
  for (const actor of [primary, second, other]) {
    const provider = await db.internalProvider.create({
      data: {
        tenantId: salon.id,
        userId: actor.user.id,
        branchId: branch.id,
        displayName: 'Synthetic',
      },
    });
    chairs.push(
      await db.staff.create({
        data: {
          id: provider.id,
          tenantId: salon.id,
          userId: actor.user.id,
          branchId: branch.id,
          encryptedDisplayName: 'Synthetic',
        },
      }),
    );
  }
  const start = new Date(Date.now() + 86400000),
    end = new Date(start.getTime() + 3600000);
  const appointment = await db.appointment.create({
    data: {
      tenantId: salon.id,
      mayaClientId: client.id,
      branchId: branch.id,
      staffId: chairs[0].id,
      staffExternalId: chairs[0].id,
      source: 'internal',
      serviceIds: [],
      startAt: start,
      endAt: end,
      blockedStartAt: start,
      blockedEndAt: end,
    },
  });
  const event = await db.domainEvent.create({
    data: {
      tenantId: salon.id,
      type: 'appointment.created',
      entityType: 'appointment',
      entityId: appointment.id,
      entitySequence: 1,
      occurredAt: new Date(),
      source: 'internal_calendar',
      dedupFingerprint: randomUUID(),
      payload: { staff_id: chairs[0].id },
    },
  });
  const devices: DevicePushToken[] = [];
  for (const suffix of ['a', 'b'])
    devices.push(
      await db.devicePushToken.create({
        data: {
          id: 'r06-' + randomUUID() + '-' + suffix,
          tenantId: salon.id,
          userId: primary.user.id,
          platform: 'ios',
          token: randomUUID(),
        },
      }),
    );
  devices.sort((a, b) => a.id.localeCompare(b.id));
  unknownDevice = devices[0].token;
  const managerDevice = await db.devicePushToken.create({
    data: {
      tenantId: salon.id,
      userId: manager.user.id,
      platform: 'ios',
      token: randomUUID(),
    },
  });
  await context.runAsSystemTenant(salon.id, async () => {
    await projection.event(salon.id, event.id);
    const cards = await db.inboxItem.findMany({
      where: { tenantId: salon.id },
    });
    assert.deepEqual(
      cards.map((r) => r.userId).sort(),
      [primary.user.id, manager.user.id].sort(),
    );
    assert.ok(sent.includes(unknownDevice));
    assert.ok(sent.includes(managerDevice.token));
    assert.ok(!sent.includes(devices[1].token));
    assert.equal(
      await db.actionExecution.count({
        where: {
          tenantId: salon.id,
          capability:
            'communication.transactional-single.new-appointment.execute.v1',
          state: 'SUCCEEDED',
        },
      }),
      2,
    );
    const initial = await db.actionExecution.findMany({
      where: { tenantId: salon.id },
    });
    const newDevice = await db.devicePushToken.create({
        data: {
          tenantId: salon.id,
          userId: primary.user.id,
          platform: 'ios',
          token: randomUUID(),
        },
      }),
      before = sent.length;
    await new CanonicalInboxProjectionService(
      db,
      context,
      ingress,
      engine,
      delivery,
      bindings,
      settings,
    ).event(salon.id, event.id);
    assert.equal(sent.length, before);
    assert.ok(!sent.includes(newDevice.token));
    assert.equal(
      await db.inboxItem.count({ where: { tenantId: salon.id } }),
      2,
    );
    assert.equal(
      await db.actionExecution.count({ where: { tenantId: salon.id } }),
      initial.length,
    );
    const unknown = await db.actionExecution.findFirstOrThrow({
      where: { tenantId: salon.id, state: 'UNKNOWN' },
    });
    assert.equal(unknown.executionAttemptCount, 1);
    checks.push(
      'A10 canonical event owner + exact chair/pure manager; APNS UNKNOWN blocks later own devices, independent recipient continues; restart/new device no second slot',
    );
    const reassignment = await db.domainEvent.create({
      data: {
        tenantId: salon.id,
        type: 'appointment.staff_changed',
        entityType: 'appointment',
        entityId: appointment.id,
        entitySequence: 2,
        occurredAt: new Date(),
        source: 'internal_calendar',
        dedupFingerprint: randomUUID(),
        payload: { from_staff_id: chairs[0].id, to_staff_id: chairs[1].id },
      },
    });
    await projection.event(salon.id, reassignment.id);
    const changed = await db.inboxItem.findMany({
      where: { tenantId: salon.id, type: 'appointment_reassigned' },
    });
    assert.deepEqual(
      changed.map((r) => r.userId).sort(),
      [primary.user.id, second.user.id, manager.user.id].sort(),
    );
    checks.push(
      'reassignment uses proven old/new canonical Staff facts; unrelated chair excluded',
    );
  });
  console.log(
    JSON.stringify(
      {
        package: 'R06',
        scope: 'B48/B49 canonical A23 and Appointment projections',
        result: 'PASS',
        checks,
        productionEffects: 0,
      },
      null,
      2,
    ),
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
