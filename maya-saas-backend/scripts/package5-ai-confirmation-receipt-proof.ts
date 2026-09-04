import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { createStandaloneCanonicalActionEngine } from '../src/action-engine';
import { EncryptionService } from '../src/encryption/encryption.service';
import { FEATURE_REQUIREMENT_DECISION_CONTRACT } from '../src/entitlements/entitlements.service';
import {
  AiConfirmationReceiptService,
  type AiConfirmationClaims,
  type AiConfirmationMaterial,
} from '../src/onboarding/ai-confirmation-receipt.service';
import {
  Package5Wave2ExecutableService,
  Package5Wave2ShadowService,
} from '../src/package5-wave2/package5-wave2.service';
import { TrialActivationBootstrapService } from '../src/package5-wave2/trial-activation-bootstrap.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '55487' ||
  !url.pathname.startsWith('/maya_c06_ai_confirm_v1_')
)
  throw new Error('Owned isolated AI confirmation proof database required');
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
});
const encryption = new EncryptionService(
  new ConfigService({
    CRM_ENCRYPTION_KEY: 'synthetic-ai-confirmation-proof-only',
  }),
);
const service = () => new AiConfirmationReceiptService(db, encryption);
const hash = (x: string) => createHash('sha256').update(x).digest('hex');
const cases: string[] = [];
async function rejects(label: string, action: () => Promise<unknown>) {
  await assert.rejects(action);
  cases.push(label);
}
async function fixture() {
  const draftToken = randomBytes(32).toString('base64url'),
    activationToken = randomBytes(32).toString('base64url');
  const activation = await db.trialActivation.create({
    data: {
      activationTokenHash: hash(activationToken),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  const blueprint = {
    businessName: 'Synthetic business',
    crmProvider: 'yclients',
    crmCompanyId: 'synthetic-company',
    crmImported: true,
    calendarSource: 'external',
  };
  const draft = await db.aiOnboardingDraft.create({
    data: {
      draftTokenHash: hash(draftToken),
      templateId: 'barbershop',
      blueprintJson: blueprint,
      missingFieldsJson: [],
      trialActivationId: activation.id,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  const ids = service().reservedIds(hash(activationToken));
  const material: AiConfirmationMaterial = {
    approvedInput: { owner: 'synthetic-owner', blueprint },
    bootstrap: {
      tenant: {
        name: 'Synthetic business',
        slug: `proof-${randomUUID()}`,
        defaultTimezone: 'UTC',
        defaultLocale: 'en',
        defaultCurrency: 'RUB',
        trialEndsAt: new Date(Date.now() + 864_000_000).toISOString(),
      },
      owner: {
        email: `${randomUUID()}@example.invalid`,
        passwordHash: 'synthetic-hash-never-used-for-login',
      },
      branch: { name: 'Main' },
    },
    children: [
      {
        key: 'branding-name',
        actionClass: 'update_tenant_branding',
        targetRef: ids.tenantId,
        dependsOn: [],
        input: { changes: { appName: 'Approved name' } },
      },
      {
        key: 'branding-color',
        actionClass: 'update_tenant_branding',
        targetRef: ids.tenantId,
        dependsOn: ['branding-name'],
        input: { changes: { primaryColor: '#123456' } },
      },
    ],
  };
  return {
    draftId: draft.id,
    draftToken,
    activationToken,
    expectedDraftRevision: 0,
    blueprint,
    material,
    ids,
  };
}
function restartRead(input: AiConfirmationClaims) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        'node_modules/ts-node/dist/bin.js',
        '--project',
        'tsconfig.scripts.json',
        '--transpile-only',
        __filename,
        '--restart-read',
      ],
      {
        input: JSON.stringify(input),
        encoding: 'utf8',
        env: process.env,
        timeout: 30_000,
      },
    ),
  ) as { confirmationId: string; states: string[]; materialPresent: boolean };
}
async function run() {
  if (process.argv.includes('--restart-read')) {
    const input = JSON.parse(readFileSync(0, 'utf8')) as AiConfirmationClaims;
    const stored = await service().readWithClaims(input);
    const outcomes = await service().childOutcomes(stored.receipt);
    console.log(
      JSON.stringify({
        confirmationId: stored.receipt.confirmationId,
        states: outcomes.map((x) => x.execution?.state ?? 'NOT_CREATED'),
        materialPresent: stored.material.children.length === 2,
      }),
    );
    return;
  }
  assert.equal(await db.aiOnboardingDraft.count(), 0);
  const initialTenants = await db.tenant.count();
  if (process.argv.includes('--replay-only')) {
    console.log(
      JSON.stringify({
        cleanReplay: 'PASS',
        confirmationReceiptsBackfilled: 0,
      }),
    );
    return;
  }
  const f = await fixture();
  await rejects('stale draft revision rejected', () =>
    service().claim({ ...f, expectedDraftRevision: 1 }),
  );
  await rejects('forged draft claim rejected', () =>
    service().claim({ ...f, draftToken: 'z'.repeat(43) }),
  );
  await rejects('forged activation rejected', () =>
    service().claim({ ...f, activationToken: 'z'.repeat(43) }),
  );
  const other = await fixture();
  await rejects('cross-draft activation rejected', () =>
    service().claim({ ...f, activationToken: other.activationToken }),
  );
  await rejects('raw secret material rejected', () =>
    service().claim({
      ...f,
      material: {
        ...f.material,
        approvedInput: { password: 'raw-not-allowed' },
      },
    }),
  );
  await rejects('unknown child class rejected', () =>
    service().claim({
      ...f,
      material: {
        ...f.material,
        children: [
          { ...f.material.children[0], actionClass: 'direct_tenant_create' },
        ],
      },
    }),
  );
  await rejects('forward child dependency rejected', () =>
    service().claim({
      ...f,
      material: {
        ...f.material,
        children: [{ ...f.material.children[0], dependsOn: ['future'] }],
      },
    }),
  );
  const claimed = await service().claim(f);
  assert.equal(claimed.resumed, false);
  assert.equal(await db.tenant.count(), initialTenants);
  cases.push('receipt and entire plan precede first business effect');
  assert.deepEqual(restartRead(f).states, ['NOT_CREATED', 'NOT_CREATED']);
  cases.push('fresh process restores before first child');
  const again = await service().claim(f);
  assert.equal(again.receipt.confirmationId, claimed.receipt.confirmationId);
  cases.push('duplicate confirmation reuses immutable identity');
  const retryMaterial = structuredClone(f.material);
  retryMaterial.bootstrap.owner.passwordHash =
    'another-server-generated-bcrypt-salt';
  retryMaterial.bootstrap.tenant.trialEndsAt = new Date(
    Date.now() + 900_000_000,
  ).toISOString();
  const sameIntent = await service().claim({ ...f, material: retryMaterial });
  assert.equal(
    sameIntent.receipt.confirmationId,
    claimed.receipt.confirmationId,
  );
  assert.deepEqual(sameIntent.material.bootstrap, f.material.bootstrap);
  cases.push(
    'retry randomness and server clock cannot replace frozen bootstrap material',
  );
  await rejects('changed approved input rejected', () =>
    service().claim({
      ...f,
      material: { ...f.material, approvedInput: { changed: true } },
    }),
  );
  await rejects('changed child plan rejected', () =>
    service().claim({
      ...f,
      material: { ...f.material, children: f.material.children.slice(0, 1) },
    }),
  );
  await rejects('changed blueprint rejected', () =>
    service().claim({ ...f, blueprint: { changed: true } }),
  );
  const storedJson = JSON.stringify(claimed.draft);
  assert(!storedJson.includes(f.material.bootstrap.owner.email));
  assert(!storedJson.includes(f.draftToken));
  assert(!storedJson.includes(f.activationToken));
  cases.push('private material encrypted and raw bearer absent');
  for (const [label, data] of [
    [
      'receipt immutable',
      {
        confirmationReceiptJson: {
          ...claimed.receipt,
          authorityHash: '0'.repeat(64),
        },
      },
    ],
    ['blueprint immutable', { blueprintJson: { changed: true } }],
    [
      'encrypted material immutable',
      { confirmationMaterialEncrypted: encryption.encrypt('changed') },
    ],
    ['activation binding immutable', { trialActivationId: other.draftId }],
    ['revision immutable after claim', { revision: 1 }],
    ['reset to draft forbidden', { status: 'draft' }],
  ] as const)
    await rejects(label, () =>
      db.aiOnboardingDraft.update({
        where: { id: f.draftId },
        data: data as Prisma.AiOnboardingDraftUncheckedUpdateInput,
      }),
    );
  await rejects('receipt deletion forbidden', () =>
    db.aiOnboardingDraft.delete({ where: { id: f.draftId } }),
  );
  await rejects('premature completion rejected', () =>
    db.aiOnboardingDraft.update({
      where: { id: f.draftId },
      data: { status: 'confirmed', confirmedTenantId: f.ids.tenantId },
    }),
  );
  await rejects('activation deletion forbidden', () =>
    db.trialActivation.delete({
      where: { id: claimed.receipt.trialActivationId },
    }),
  );
  const c = await fixture();
  const concurrency = await Promise.allSettled([
    service().claim(c),
    service().claim(c),
    service().claim(c),
  ]);
  const winners = concurrency
    .filter((x) => x.status === 'fulfilled')
    .map((x) => x.value);
  assert.equal(winners.filter((x) => !x.resumed).length, 1);
  assert.equal(new Set(winners.map((x) => x.receipt.confirmationId)).size, 1);
  cases.push('concurrent confirmations have one logical claim');
  const edit = await fixture();
  const revised = await db.aiOnboardingDraft.update({
    where: { id: edit.draftId },
    data: { blueprintJson: { edited: true } },
  });
  assert.equal(revised.revision, 1);
  await rejects('in-flight old revision cannot claim after edit', () =>
    service().claim(edit),
  );
  const expired = await fixture();
  await db.aiOnboardingDraft.update({
    where: { id: expired.draftId },
    data: { expiresAt: new Date(Date.now() - 10_000) },
  });
  await rejects('expired claim rejected', () =>
    service().claim({ ...expired, expectedDraftRevision: 1 }),
  );
  const bootstrap = new TrialActivationBootstrapService(db);
  await service().bootstrap(f, bootstrap);
  assert.equal(await db.tenant.count({ where: { id: f.ids.tenantId } }), 1);
  await service().bootstrap(f, new TrialActivationBootstrapService(db));
  assert.equal(await db.tenant.count({ where: { id: f.ids.tenantId } }), 1);
  cases.push('canonical bootstrap retries one tenant');
  await rejects('partial tenant cannot be physically deleted', () =>
    db.tenant.delete({ where: { id: f.ids.tenantId } }),
  );
  await rejects('completed activation cannot reset', () =>
    db.trialActivation.update({
      where: { id: claimed.receipt.trialActivationId },
      data: { status: 'pending', tenantId: null, completedAt: null },
    }),
  );
  await rejects('receipt cannot finish with missing children', () =>
    service().finish(f.draftId, f.ids.tenantId, f.ids.ownerUserId),
  );
  await rejects('raw SQL cannot mark missing children complete', () =>
    db.$executeRaw(
      Prisma.sql`UPDATE "AiOnboardingDraft" SET status='confirmed', "confirmedTenantId"=${f.ids.tenantId} WHERE id=${f.draftId}`,
    ),
  );
  await rejects('wrong tenant owner resume rejected', () =>
    service().readWithOwner(f.draftId, other.ids.tenantId, f.ids.ownerUserId),
  );
  await rejects('wrong actor owner resume rejected', () =>
    service().readWithOwner(f.draftId, f.ids.tenantId, other.ids.ownerUserId),
  );
  const context = new TenantContextService();
  const engine = createStandaloneCanonicalActionEngine(
    db as unknown as PrismaService,
    {
      resolveFeatureRequirements: (
        tenantId,
        features,
        evaluatedAt = new Date(),
      ) =>
        Promise.resolve({
          contract: FEATURE_REQUIREMENT_DECISION_CONTRACT,
          tenantId,
          planId: null,
          requiredFeatures: features.map((featureKey) => ({
            featureKey,
            enabled: true,
          })),
          allowed: true,
          evaluatedAt,
          validUntil: null,
        }),
    },
    {
      identitySecret: 'synthetic-ai-receipt-identity'.repeat(3),
      payloadEncryptionSecret: 'synthetic-ai-receipt-payload'.repeat(3),
      policyAttestationSecret: 'synthetic-ai-receipt-policy'.repeat(3),
    },
  );
  const planner = new Package5Wave2ShadowService(
    engine.runtime,
    db as unknown as PrismaService,
    context,
    engine.kernel,
  );
  const executor = new Package5Wave2ExecutableService(
    db,
    engine.ingress,
    engine.kernel,
    engine.runtime,
    planner,
  );
  const executeChild = async (index: number, invalid = false) =>
    context.runAsSystemTenant(f.ids.tenantId, async () => {
      const child = claimed.receipt.children[index];
      const changes = invalid
        ? { unapprovedField: true }
        : (
            f.material.children[index].input as {
              changes: Record<string, unknown>;
            }
          ).changes;
      const prepared = await planner.build(
        f.ids.tenantId,
        { userId: f.ids.ownerUserId },
        {
          operation: 'update_tenant_branding',
          changes,
          sourceIntentRef: child.sourceIntentRef,
        },
        'execute',
      );
      return executor.execute(prepared);
    });
  await executeChild(0);
  const first = (await service().childOutcomes(claimed.receipt))[0].execution;
  assert(first);
  const firstSnapshot = JSON.stringify(first);
  assert.deepEqual(restartRead(f).states, ['SUCCEEDED', 'NOT_CREATED']);
  cases.push('fresh process restores partial canonical child outcome');
  await rejects('failed next child preserves first success', () =>
    executeChild(1, true),
  );
  assert.equal(
    JSON.stringify(
      (await service().childOutcomes(claimed.receipt))[0].execution,
    ),
    firstSnapshot,
  );
  const restored = await service().readWithOwner(
    f.draftId,
    f.ids.tenantId,
    f.ids.ownerUserId,
  );
  let skipped = 0;
  for (const [index, outcome] of (
    await service().childOutcomes(restored.receipt)
  ).entries()) {
    if (outcome.execution?.state === 'SUCCEEDED') {
      skipped++;
      continue;
    }
    await executeChild(index);
  }
  assert.equal(skipped, 1);
  assert.equal(
    await db.actionTargetMutation.count({
      where: { tenantId: f.ids.tenantId },
    }),
    2,
  );
  cases.push('resume skips SUCCEEDED child and executes missing child once');
  const complete = await service().finish(
    f.draftId,
    f.ids.tenantId,
    f.ids.ownerUserId,
  );
  assert.equal(complete.status, 'confirmed');
  cases.push('completion joins exact durable child outcomes');
  assert.equal(
    JSON.stringify(complete.confirmationReceiptJson),
    JSON.stringify(claimed.draft.confirmationReceiptJson),
  );
  cases.push('completion does not rewrite receipt');
  await rejects('completed tenant cannot be physically deleted', () =>
    db.tenant.delete({ where: { id: f.ids.tenantId } }),
  );
  await rejects('completed receipt cannot reset', () =>
    db.aiOnboardingDraft.update({
      where: { id: f.draftId },
      data: { status: 'confirming' },
    }),
  );
  const legacy = await fixture();
  await db.aiOnboardingDraft.update({
    where: { id: legacy.draftId },
    data: { status: 'confirmed' },
  });
  await rejects('legacy row cannot fabricate historical receipt', () =>
    service().claim({ ...legacy, expectedDraftRevision: 1 }),
  );
  assert.equal(
    await db.aiOnboardingDraft.count({
      where: { confirmationReceiptJson: { not: Prisma.DbNull } },
    }),
    2,
  );
  console.log(
    JSON.stringify(
      {
        verdict: 'PASS',
        cases: cases.length,
        results: cases,
        existingCanonicalChildMutations: 2,
        historicalReceiptsBackfilled: 0,
        realProductionMutations: 0,
      },
      null,
      2,
    ),
  );
}
run()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Proof failed');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
