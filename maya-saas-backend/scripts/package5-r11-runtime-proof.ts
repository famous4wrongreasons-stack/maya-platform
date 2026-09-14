import { Package5Wave6MaintenanceService } from '../src/package5-wave6/package5-wave6.service';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ActionEngineRuntimeService } from '../src/action-engine';
import { EncryptionService } from '../src/encryption/encryption.service';
import {
  Package5Wave1ShadowService,
  Package5Wave1ExecutableService,
} from '../src/package5-wave1/package5-wave1.service';
import { Package5Wave1CanonicalCutoverService } from '../src/package5-wave1/package5-wave1-canonical-cutover.service';
import {
  GovernedSettingsReadService,
  staffTelegramEligible,
} from '../src/package5-wave1/governed-settings.read';
import type { InboxService } from '../src/inbox/inbox.service';
import { canonicalUtcTransaction } from '../src/prisma/canonical-utc-transaction';
import {
  asActor,
  config,
  context,
  db,
  engine,
  ingress,
  staffFixture,
  tenantFixture,
} from './package5-wave-rc-proof-support';

const read = new GovernedSettingsReadService(
  db,
  context,
  new EncryptionService(config),
  config,
);
const planner = new Package5Wave1ShadowService(
  new ActionEngineRuntimeService(engine, ingress),
  db,
  context,
  read,
);
const executor = new Package5Wave1ExecutableService(
  db,
  ingress,
  engine,
  undefined,
  read,
);
const cutover = () =>
  new Package5Wave1CanonicalCutoverService(
    db,
    context,
    {} as InboxService,
    planner,
    executor,
    engine,
    read,
  );
const checks: string[] = [];
async function main() {
  await db.$connect();
  const tenant = await tenantFixture(),
    other = await tenantFixture();
  const owner = await staffFixture(tenant.id),
    staff = await staffFixture(tenant.id, 'staff'),
    founder = await staffFixture(tenant.id, 'platform_owner');
  const scope = <T>(work: () => T) =>
    asActor(tenant.id, owner.user.id, owner.member.role, work);
  const rules = {
    confirmed: true,
    namespace: 'business_rules',
    expectedRevision: 0,
    previousRevisionId: null,
    content: {
      rules: [{ id: null, text: '  Встречать   гостя спокойно и вежливо.  ' }],
    },
  };
  const key = randomUUID();
  await scope(async () => {
    const values = await Promise.all(
      Array.from({ length: 4 }, () =>
        cutover().updateGoverned(
          tenant.id,
          owner.user.id,
          'tenant_business_configuration',
          rules,
          key,
        ),
      ),
    );
    assert.equal(new Set(values.map((v) => v.actionExecutionId)).size, 1);
    const rows = await canonicalUtcTransaction(
      db,
      (tx) =>
        tx.tenantBusinessConfigurationRevision.findMany({
          where: { tenantId: tenant.id },
        }),
      { readOnly: true },
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].actorMembershipId, owner.member.id);
    assert.ok(!rows[0].encryptedContent!.includes('гостя'));
    assert.equal(
      await db.actionTargetMutation.count({ where: { tenantId: tenant.id } }),
      1,
    );
    const normalized = await engine.readTrustedNormalizedInput(
      tenant.id,
      values[0].actionExecutionId,
    );
    const current = await read.read(tenant.id, owner.user.id, 'business_rules');
    assert.equal(current.revision, 1);
    assert.ok(
      String(JSON.stringify(current.content)).includes('Встречать гостя'),
    );
    assert.deepEqual(
      (
        await cutover().updateGoverned(
          tenant.id,
          owner.user.id,
          'tenant_business_configuration',
          rules,
          key,
        )
      ).actionExecutionId,
      values[0].actionExecutionId,
    );
    await assert.rejects(
      cutover().updateGoverned(
        tenant.id,
        owner.user.id,
        'tenant_business_configuration',
        { ...rules, content: { rules: [] } },
        key,
      ),
      /IDEMPOTENCY_CONFLICT/,
    );
    const encryptedReader = engine.readTrustedNormalizedInput.bind(engine);
    engine.readTrustedNormalizedInput = () =>
      Promise.reject(new Error('synthetic payload retention boundary'));
    try {
      assert.equal(
        (
          await cutover().updateGoverned(
            tenant.id,
            owner.user.id,
            'tenant_business_configuration',
            rules,
            key,
          )
        ).actionExecutionId,
        values[0].actionExecutionId,
      );
    } finally {
      engine.readTrustedNormalizedInput = encryptedReader;
    }
    assert.equal(normalized.callerId, key);
    checks.push(
      'same-key concurrent A22 admission, immutable normalized rule IDs, encrypted revision and exact replay',
    );
    const successor = {
      ...rules,
      expectedRevision: 1,
      previousRevisionId: current.previousRevisionId,
      content: { rules: [] },
    };
    const race = await Promise.allSettled([
      cutover().updateGoverned(
        tenant.id,
        owner.user.id,
        'tenant_business_configuration',
        successor,
        randomUUID(),
      ),
      cutover().updateGoverned(
        tenant.id,
        owner.user.id,
        'tenant_business_configuration',
        successor,
        randomUUID(),
      ),
    ]);
    assert.equal(race.filter((v) => v.status === 'fulfilled').length, 1);
    assert.equal(
      (await read.read(tenant.id, owner.user.id, 'business_rules')).revision,
      2,
    );
    checks.push('different keys against one predecessor have one successor');
  });
  const count = await db.actionExecution.count({
    where: { tenantId: tenant.id },
  });
  await asActor(tenant.id, staff.user.id, staff.member.role, () =>
    assert.rejects(
      cutover().updateGoverned(
        tenant.id,
        staff.user.id,
        'tenant_business_configuration',
        rules,
        randomUUID(),
      ),
      /owner/,
    ),
  );
  await asActor(tenant.id, founder.user.id, founder.member.role, () =>
    assert.rejects(
      cutover().updateGoverned(
        tenant.id,
        founder.user.id,
        'tenant_business_configuration',
        rules,
        randomUUID(),
      ),
      /staff/,
    ),
  );
  await scope(() =>
    assert.rejects(read.read(other.id, owner.user.id, 'business_rules')),
  );
  await scope(async () => {
    for (const command of [
      { ...rules, confirmed: false },
      { ...rules, namespace: 'api_keys' },
      {
        ...rules,
        content: {
          rules: [{ id: null, text: 'Связаться по test@example.invalid' }],
        },
      },
      {
        confirmed: true,
        namespace: 'client_capabilities',
        expectedRevision: 0,
        previousRevisionId: null,
        content: { client_self_visit_history: true, all_clients: true },
      },
      {
        confirmed: true,
        namespace: 'staff_ai_provider',
        expectedRevision: 0,
        previousRevisionId: null,
        content: { provider: 'openai', apiKey: 'fake' },
      },
    ])
      await assert.rejects(
        cutover().updateGoverned(
          tenant.id,
          owner.user.id,
          'tenant_business_configuration',
          command,
          randomUUID(),
        ),
      );
    assert.equal(
      await db.actionExecution.count({ where: { tenantId: tenant.id } }),
      count,
    );
  });
  checks.push(
    'foreign tenant, nonowner/founder, PII/secrets/unlisted authority rejected before ActionExecution',
  );
  await asActor(tenant.id, staff.user.id, staff.member.role, async () => {
    const command = {
        confirmed: true,
        durationMinutes: 120,
        expectedGeneration: 0,
      },
      caller = randomUUID();
    const values = await Promise.all(
      Array.from({ length: 4 }, () =>
        cutover().updateGoverned(
          tenant.id,
          staff.user.id,
          'staff_notification_preferences',
          command,
          caller,
        ),
      ),
    );
    assert.equal(new Set(values.map((v) => v.actionExecutionId)).size, 1);
    const first = await read.readPersonal(tenant.id, staff.user.id);
    assert.equal(first.config.membershipId, staff.member.id);
    assert.equal(first.expectedGeneration, 1);
    assert.equal(
      await staffTelegramEligible(
        db,
        tenant.id,
        staff.user.id,
        staff.member.id,
      ),
      false,
    );
    const restarted = cutover();
    await restarted.updateGoverned(
      tenant.id,
      staff.user.id,
      'staff_notification_preferences',
      command,
      caller,
    );
    assert.deepEqual(await read.readPersonal(tenant.id, staff.user.id), first);
    await assert.rejects(
      restarted.updateGoverned(
        tenant.id,
        staff.user.id,
        'staff_notification_preferences',
        { ...command, durationMinutes: 60 },
        caller,
      ),
      /IDEMPOTENCY_CONFLICT/,
    );
    assert.equal(
      await staffTelegramEligible(
        db,
        tenant.id,
        staff.user.id,
        staff.member.id,
        new Date(Date.now() + 121 * 60000),
      ),
      true,
    );
    const disabled = {
      confirmed: true,
      durationMinutes: null,
      expectedGeneration: 1,
    };
    await restarted.updateGoverned(
      tenant.id,
      staff.user.id,
      'staff_notification_preferences',
      disabled,
      randomUUID(),
    );
    assert.equal(
      await staffTelegramEligible(
        db,
        tenant.id,
        staff.user.id,
        staff.member.id,
      ),
      true,
    );
    checks.push(
      'personal mute concurrent winner, retry/restart never extends UTC instant, expiry is read only, explicit off',
    );
  });
  await db.membership.update({
    where: { id: staff.member.id },
    data: { status: 'suspended' },
  });
  assert.equal(
    await staffTelegramEligible(db, tenant.id, staff.user.id, staff.member.id),
    false,
  );
  checks.push('revoked member cannot authorize a pending Telegram slot');
  const oldTenant = await tenantFixture(),
    oldOwner = await staffFixture(oldTenant.id);
  const oldExecutor = new Package5Wave1ExecutableService(
    db,
    ingress,
    engine,
    () => new Date(Date.now() - 366 * 86400000),
    read,
  );
  const oldCutover = new Package5Wave1CanonicalCutoverService(
    db,
    context,
    {} as InboxService,
    planner,
    oldExecutor,
    engine,
    read,
  );
  await asActor(
    oldTenant.id,
    oldOwner.user.id,
    oldOwner.member.role,
    async () => {
      await oldCutover.updateGoverned(
        oldTenant.id,
        oldOwner.user.id,
        'tenant_business_configuration',
        rules,
        randomUUID(),
      );
      const first = await read.read(
        oldTenant.id,
        oldOwner.user.id,
        'business_rules',
      );
      await cutover().updateGoverned(
        oldTenant.id,
        oldOwner.user.id,
        'tenant_business_configuration',
        {
          ...rules,
          expectedRevision: 1,
          previousRevisionId: first.previousRevisionId,
          content: { rules: [] },
        },
        randomUUID(),
      );
    },
  );
  await context.runAsSystemTenant(oldTenant.id, async () => {
    const ac6 = new Package5Wave6MaintenanceService(db, context);
    const run = await ac6.prepare({
      actionClass: 'purge_superseded_business_configuration_payloads',
      batchSize: 10,
    });
    const result = await ac6.execute(run);
    assert.equal(result.deleted, 1);
    const rows = await canonicalUtcTransaction(
      db,
      (tx) =>
        tx.tenantBusinessConfigurationRevision.findMany({
          where: { tenantId: oldTenant.id },
          orderBy: { revision: 'asc' },
        }),
      { readOnly: true },
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0].encryptedContent, null);
    assert.ok(rows[1].encryptedContent);
    assert.equal((await ac6.execute(run)).deleted, 1);
    assert.equal(
      await db.maintenanceItemClaim.count({
        where: { maintenanceRunId: run, state: 'SUCCEEDED' },
      }),
      1,
    );
    checks.push(
      'AC6 exact expired superseded payload claim; current revision/hash/audit tombstones retained; restart replay',
    );
  });
  console.log(
    JSON.stringify(
      {
        package: 'R11',
        proof: 'A22 PostgreSQL runtime',
        checks,
        result: 'PASS',
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
