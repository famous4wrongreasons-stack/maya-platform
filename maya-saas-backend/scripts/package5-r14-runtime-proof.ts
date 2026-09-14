import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EntitlementsService } from '../src/entitlements/entitlements.service';
import { EncryptionService } from '../src/encryption/encryption.service';
import { CashDeclarationService } from '../src/expenses/cash-declaration.service';
import { canonicalUtcTransaction } from '../src/prisma/canonical-utc-transaction';
import { Package5Wave6MaintenanceService } from '../src/package5-wave6/package5-wave6.service';
import { cashLocalDay } from '../src/action-engine/cash-declaration.contract';
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
let enabled = true;
const feature = {
  assertFeature: async () => {
    if (!enabled) return await Promise.reject(Error('feature_locked'));
  },
} as unknown as EntitlementsService;
const owner = () =>
  new CashDeclarationService(
    db,
    context,
    ingress,
    engine,
    new EncryptionService(config),
    feature,
  );
const checks: string[] = [];
const checkpoint = resolve(
  process.env.MAYA_RC_PROOF_DIRECTORY ?? '/tmp/maya-rc-proof-artifacts',
  'r14-restart.json',
);
async function main() {
  if (process.argv.includes('--after-restart')) {
    await db.$connect();
    const saved = JSON.parse(readFileSync(checkpoint, 'utf8')) as {
      tenantId: string;
      userId: string;
      role: string;
      command: unknown;
      key: string;
      executionId: string;
      pendingCommand: unknown;
      pendingKey: string;
      pendingId: string;
    };
    await asActor(saved.tenantId, saved.userId, saved.role, async () => {
      const before = await db.actionExecution.count({
        where: { tenantId: saved.tenantId },
      });
      const prior = await owner().submit(
        saved.tenantId,
        saved.userId,
        'declare',
        saved.command,
        saved.key,
      );
      assert.equal(prior.actionExecutionId, saved.executionId);
      assert.equal(
        (
          await db.actionExecution.findUniqueOrThrow({
            where: { id: saved.pendingId },
          })
        ).state,
        'READY',
      );
      const resumed = await owner().submit(
        saved.tenantId,
        saved.userId,
        'declare',
        saved.pendingCommand,
        saved.pendingKey,
      );
      assert.equal(resumed.actionExecutionId, saved.pendingId);
      await owner().submit(
        saved.tenantId,
        saved.userId,
        'declare',
        saved.pendingCommand,
        saved.pendingKey,
      );
      assert.equal(
        await db.cashDeclaration.count({
          where: {
            tenantId: saved.tenantId,
            actionExecutionId: saved.pendingId,
          },
        }),
        1,
      );
      assert.equal(
        await db.actionExecution.count({ where: { tenantId: saved.tenantId } }),
        before,
      );
    });
    console.log(
      JSON.stringify({
        package: 'R14',
        phase: 'after actual restart',
        result: 'PASS',
        sameConfirmedOutcome: true,
        samePendingExecution: true,
        newExecutions: 0,
        productionEffects: 0,
      }),
    );
    return;
  }
  await db.$connect();
  const tenant = await tenantFixture(),
    foreign = await tenantFixture();
  const actor = await staffFixture(tenant.id),
    accountant = await staffFixture(tenant.id, 'accountant'),
    admin = await staffFixture(tenant.id, 'administrator');
  const branch = await db.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'Synthetic branch',
        timezone: 'Europe/Moscow',
      },
    }),
    other = await db.branch.create({
      data: { tenantId: foreign.id, name: 'Other tenant' },
    });
  const countedAt = new Date(Date.now() - 60000).toISOString(),
    businessDay = cashLocalDay(countedAt, 'Europe/Moscow');
  const command = {
    confirmed: true,
    branchId: branch.id,
    timezone: 'Europe/Moscow',
    countedAt,
    businessDay,
    currency: 'RUB',
    countedCashKopecks: 123450,
    declarationKind: 'COUNT',
    expectedRevision: 0,
    previousDeclarationId: null,
    reason: null,
  };
  const run = <T>(work: () => T) =>
    asActor(tenant.id, actor.user.id, actor.member.role, work);
  let confirmedKey = '',
    confirmedExecutionId = '';
  await run(async () => {
    const count = await db.actionExecution.count({
      where: { tenantId: tenant.id },
    });
    for (const value of [
      { ...command, confirmed: false },
      { ...command, branchId: other.id },
      { ...command, countedCashKopecks: -1 },
      { ...command, countedCashKopecks: 1.1 },
      { ...command, currency: 'USD' },
      { ...command, branchId: null },
      { ...command, countedAt: new Date(Date.now() + 86400000).toISOString() },
      { ...command, businessDay: '1900-01-01' },
      { ...command, rawTelegramId: '1' },
    ])
      await assert.rejects(
        owner().submit(
          tenant.id,
          actor.user.id,
          'declare',
          value,
          randomUUID(),
        ),
      );
    enabled = false;
    try {
      await assert.rejects(
        owner().submit(
          tenant.id,
          actor.user.id,
          'declare',
          command,
          randomUUID(),
        ),
        /feature_locked/,
      );
    } finally {
      enabled = true;
    }
    assert.equal(
      await db.actionExecution.count({ where: { tenantId: tenant.id } }),
      count,
    );
    checks.push(
      'bad confirmation/branch/tenant/amount/time/currency/feature/raw authority rejected before AE',
    );
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        owner().submit(tenant.id, actor.user.id, 'declare', command, key),
      ),
    );
    confirmedKey = key;
    confirmedExecutionId = proofId(results[0].actionExecutionId);
    assert.equal(
      new Set(results.map((result) => result.actionExecutionId)).size,
      1,
    );
    const view = await owner().read(
      tenant.id,
      actor.user.id,
      branch.id,
      businessDay,
    );
    assert.equal(view.revisions.length, 1);
    assert.equal(view.state, 'DECLARED');
    assert.equal(view.reconciled, false);
    assert.equal(view.revisions[0].declaredByMembershipId, actor.member.id);
    assert.equal(view.revisions[0].countedCashKopecks, 123450);
    assert.equal(
      (await owner().submit(tenant.id, actor.user.id, 'declare', command, key))
        .actionExecutionId,
      results[0].actionExecutionId,
    );
    await assert.rejects(
      owner().submit(
        tenant.id,
        actor.user.id,
        'declare',
        { ...command, countedCashKopecks: 0 },
        key,
      ),
      /IDEMPOTENCY_CONFLICT/,
    );
    await assert.rejects(
      owner().submit(
        tenant.id,
        actor.user.id,
        'declare',
        command,
        randomUUID(),
      ),
      /STALE_REVISION/,
    );
    checks.push(
      'same-key concurrent first count one canonical outcome; changed key intent conflicts; second first-declaration denied',
    );
    const predecessor = view.revisions[0];
    const correction = {
      ...command,
      expectedRevision: 1,
      previousDeclarationId: predecessor.id,
      countedCashKopecks: 200000,
      reason: 'Повторный ручной пересчёт',
    };
    const race = await Promise.allSettled([
      owner().submit(
        tenant.id,
        actor.user.id,
        'correct',
        correction,
        randomUUID(),
      ),
      owner().submit(
        tenant.id,
        actor.user.id,
        'correct',
        { ...correction, countedCashKopecks: 210000 },
        randomUUID(),
      ),
    ]);
    assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      await db.actionExecution.count({
        where: { tenantId: tenant.id, state: 'READY' },
      }),
      0,
    );
    const after = await owner().read(
      tenant.id,
      actor.user.id,
      branch.id,
      businessDay,
    );
    assert.equal(after.revisions.length, 2);
    assert.equal(after.revisions[1].countedCashKopecks, 123450);
    const current = after.revisions[0];
    await assert.rejects(
      owner().submit(
        tenant.id,
        actor.user.id,
        'correct',
        {
          ...correction,
          expectedRevision: 2,
          previousDeclarationId: current.id,
          branchId: other.id,
        },
        randomUUID(),
      ),
    );
    await owner().submit(
      tenant.id,
      actor.user.id,
      'correct',
      {
        ...command,
        expectedRevision: 2,
        previousDeclarationId: current.id,
        declarationKind: 'WITHDRAWAL',
        countedCashKopecks: null,
        reason: 'Наблюдение ошибочно отнесено к этой кассе',
      },
      randomUUID(),
    );
    const withdrawn = await owner().read(
      tenant.id,
      actor.user.id,
      branch.id,
      businessDay,
    );
    assert.equal(withdrawn.state, 'WITHDRAWN');
    assert.equal(withdrawn.revisions[0].countedCashKopecks, null);
    assert.equal(withdrawn.revisions.length, 3);
    const counts = await Promise.all([
      db.cashDeclaration.count({ where: { tenantId: tenant.id } }),
      db.actionExecution.count({ where: { tenantId: tenant.id } }),
    ]);
    await owner().read(tenant.id, actor.user.id, branch.id, businessDay);
    assert.deepEqual(
      await Promise.all([
        db.cashDeclaration.count({ where: { tenantId: tenant.id } }),
        db.actionExecution.count({ where: { tenantId: tenant.id } }),
      ]),
      counts,
    );
    assert.equal(await db.expense.count({ where: { tenantId: tenant.id } }), 0);
    assert.equal(
      await db.expensePeriodDeclaration.count({
        where: { tenantId: tenant.id },
      }),
      0,
    );
    checks.push(
      'one successor per predecessor; withdrawal null not zero; branch move denied; history retained; read writes zero; Expense writes zero',
    );
  });
  await asActor(tenant.id, admin.user.id, admin.member.role, () =>
    assert.rejects(
      owner().submit(
        tenant.id,
        admin.user.id,
        'declare',
        command,
        randomUUID(),
      ),
      /membership/,
    ),
  );
  await asActor(tenant.id, accountant.user.id, accountant.member.role, () =>
    owner().read(tenant.id, accountant.user.id, branch.id, businessDay),
  );
  await db.membership.update({
    where: { id: accountant.member.id },
    data: { status: 'suspended' },
  });
  await asActor(tenant.id, accountant.user.id, accountant.member.role, () =>
    assert.rejects(
      owner().read(tenant.id, accountant.user.id, branch.id, businessDay),
      /membership/,
    ),
  );
  checks.push(
    'canonical accountant supported; generic admin and revoked membership denied',
  );
  const archiveTenant = await tenantFixture(),
    archiveActor = await staffFixture(archiveTenant.id),
    archiveBranch = await db.branch.create({
      data: {
        tenantId: archiveTenant.id,
        name: 'Synthetic old observation',
        timezone: 'Europe/Moscow',
      },
    });
  const oldClock = () => new Date(Date.now() - 8 * 366 * 86400000);
  const oldOwner = new CashDeclarationService(
    db,
    context,
    ingress,
    engine,
    new EncryptionService(config),
    feature,
    oldClock,
  );
  await asActor(
    archiveTenant.id,
    archiveActor.user.id,
    archiveActor.member.role,
    () =>
      oldOwner.submit(
        archiveTenant.id,
        archiveActor.user.id,
        'declare',
        {
          ...command,
          branchId: archiveBranch.id,
          countedAt: new Date(oldClock().getTime() - 60000).toISOString(),
          businessDay: cashLocalDay(
            new Date(oldClock().getTime() - 60000).toISOString(),
            'Europe/Moscow',
          ),
          reason: 'Synthetic expired retained explanation',
        },
        randomUUID(),
      ),
  );
  await context.runAsSystemTenant(archiveTenant.id, async () => {
    const ac6 = new Package5Wave6MaintenanceService(db, context),
      run = await ac6.prepare({
        actionClass: 'purge_cash_declaration_reason_payloads',
        batchSize: 10,
      });
    assert.equal((await ac6.execute(run)).deleted, 1);
    const row = await canonicalUtcTransaction(
      db,
      (tx) =>
        tx.cashDeclaration.findFirstOrThrow({
          where: { tenantId: archiveTenant.id },
        }),
      { readOnly: true },
    );
    assert.equal(row.encryptedReason, null);
    assert.equal(row.countedCashKopecks, 123450);
    assert.equal(row.revision, 1);
    assert.equal((await ac6.execute(run)).deleted, 1);
  });
  checks.push(
    'AC6 actual runtime claims erase only expired reason; cash/audit/identity/revision retained; same-run resume',
  );
  if (process.argv.includes('--before-restart')) {
    const pendingBranch = await db.branch.create({
        data: {
          tenantId: tenant.id,
          name: 'Synthetic interrupted cash admission',
          timezone: 'Europe/Moscow',
        },
      }),
      pendingCommand = { ...command, branchId: pendingBranch.id },
      pendingKey = randomUUID(),
      interrupted = owner();
    // Crash fixture stops the local executor before its transaction. Admission is
    // real and committed, with no business row or alternative execution owner.
    (interrupted as unknown as { execute: () => Promise<never> }).execute =
      async () => {
        return await Promise.reject(
          Error('Synthetic process interruption before cash local transaction'),
        );
      };
    await run(() =>
      assert.rejects(
        interrupted.submit(
          tenant.id,
          actor.user.id,
          'declare',
          pendingCommand,
          pendingKey,
        ),
        /Synthetic process interruption/,
      ),
    );
    const pending = await db.actionExecution.findFirstOrThrow({
      where: { tenantId: tenant.id, state: 'READY' },
    });
    assert.equal(
      await db.cashDeclaration.count({
        where: { tenantId: tenant.id, branchId: pendingBranch.id },
      }),
      0,
    );
    writeFileSync(
      checkpoint,
      JSON.stringify({
        tenantId: tenant.id,
        userId: actor.user.id,
        role: actor.member.role,
        command,
        key: confirmedKey,
        executionId: confirmedExecutionId,
        pendingCommand,
        pendingKey,
        pendingId: pending.id,
      }),
    );
  }
  console.log(
    JSON.stringify(
      { package: 'R14', result: 'PASS', checks, productionEffects: 0 },
      null,
      2,
    ),
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

function proofId(value: unknown): string {
  assert.equal(typeof value, 'string');
  return value as string;
}
