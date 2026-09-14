/** Existing A22/R13 preference admission, real delayed resume; isolated PG only. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { EncryptionService } from '../src/encryption/encryption.service';
import { DEFAULT_ASSISTANT_CAPABILITIES } from '../src/dashboard-preferences/assistant-capabilities.constants';
import { ActionEngineRuntimeService } from '../src/action-engine';
import {
  Package5Wave1ShadowService,
  Package5Wave1ExecutableService,
} from '../src/package5-wave1/package5-wave1.service';
import { GovernedSettingsReadService } from '../src/package5-wave1/governed-settings.read';
import { governedCommand } from '../src/package5-wave1/governed-settings.contract';
import {
  db,
  context,
  config,
  engine,
  ingress,
  entitlements,
  asActor,
  tenantFixture,
  staffFixture,
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
const owner = new Package5Wave1ExecutableService(
  db,
  ingress,
  engine,
  undefined,
  read,
);
async function main() {
  await db.$connect();
  const fixtures = [];
  for (const kind of ['allow', 'deny', 'revoked', 'weekly'] as const) {
    const tenant = await tenantFixture(),
      actor = await staffFixture(tenant.id),
      key = randomUUID();
    const execution = await asActor(
      tenant.id,
      actor.user.id,
      actor.member.role,
      async () => {
        const request =
          kind === 'weekly'
            ? await planner.buildAssistant(
                tenant.id,
                actor.user.id,
                {
                  sourceIntentRef: key,
                  enabledCapabilities: [
                    ...DEFAULT_ASSISTANT_CAPABILITIES,
                    'weekly_expense_reminders',
                  ],
                },
                'execute',
              )
            : await planner.buildGoverned(
                tenant.id,
                actor.user.id,
                'tenant_business_configuration',
                key,
                key,
                governedCommand('tenant_business_configuration', {
                  confirmed: true,
                  namespace: 'business_rules',
                  expectedRevision: 0,
                  previousRevisionId: null,
                  content: {
                    rules: [{ id: null, text: 'Synthetic approved rule' }],
                  },
                }),
              );
        return ingress.createExecution(request);
      },
    );
    fixtures.push({ kind, tenant, actor, execution });
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 65000));
  const current = entitlements.resolveFeatureRequirements.bind(entitlements),
    denied = fixtures.find((f) => f.kind === 'deny')!.tenant.id;
  entitlements.resolveFeatureRequirements = async (...args) => {
    const r = await current(...args);
    return args[0] === denied
      ? {
          ...r,
          allowed: false,
          requiredFeatures: r.requiredFeatures.map((f) => ({
            ...f,
            enabled: false,
          })),
        }
      : r;
  };
  for (const f of fixtures) {
    assert.ok(f.execution.policyValidUntil! < new Date());
    if (f.kind === 'revoked')
      await db.membership.update({
        where: { id: f.actor.member.id },
        data: { status: 'suspended' },
      });
    await asActor(
      f.tenant.id,
      f.actor.user.id,
      f.actor.member.role,
      async () => {
        const resume = () => owner.resume(f.tenant.id, f.execution.id);
        if (['deny', 'revoked'].includes(f.kind)) {
          await assert.rejects(resume);
          assert.equal(
            await db.actionAttempt.count({
              where: { actionExecutionId: f.execution.id },
            }),
            0,
          );
          assert.equal(
            await db.tenantBusinessConfigurationRevision.count({
              where: { tenantId: f.tenant.id },
            }),
            0,
          );
        } else {
          const r = await resume();
          assert.equal(r.actionExecutionId, f.execution.id);
          await resume();
          assert.equal(
            await db.actionAttempt.count({
              where: { actionExecutionId: f.execution.id },
            }),
            1,
          );
          assert.equal(
            await db.auditLog.count({
              where: {
                entityId: f.execution.id,
                action: 'action.rc_claim_policy',
              },
            }),
            1,
          );
        }
        const e = await db.actionExecution.findUniqueOrThrow({
          where: { id: f.execution.id },
        });
        assert.equal(
          e.policyValidUntil?.getTime(),
          f.execution.policyValidUntil?.getTime(),
        );
        assert.equal(e.approvalBindingHash, f.execution.approvalBindingHash);
      },
    );
  }
  console.log(
    JSON.stringify({
      result: 'PASS',
      packages: ['R11', 'R13'],
      delayMs: 65000,
      sameExecution: true,
      originalAdmissionPreserved: true,
      currentDenyNoEffect: true,
      revokedMemberNoEffect: true,
      weeklyOptInSamePolicy: true,
      productionEffects: 0,
    }),
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
