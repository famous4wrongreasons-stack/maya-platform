// Shared retained-owner scope checks. Read-only; never Client authority.
import assert from 'node:assert/strict';

const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const opaque = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function assertOwnerChatScope(scope) {
  assert.ok(exact(scope, ['stateDirectory', 'initialManifestSha256', 'privateStateSha256',
    'restartReceiptPath', 'restartReceiptSha256', 'tenantId', 'userId', 'branchId', 'tenantSlug', 'companyId']), 'owner_chat_scope_shape');
  assert.ok(typeof scope.stateDirectory === 'string' && /^\/private\/tmp\/[a-zA-Z0-9_-]+$/.test(scope.stateDirectory), 'owner_chat_state');
  assert.ok(typeof scope.restartReceiptPath === 'string' && /^\/private\/tmp\/[a-zA-Z0-9_-]+\/restart.json$/.test(scope.restartReceiptPath), 'owner_chat_restart');
  for (const key of ['initialManifestSha256', 'privateStateSha256', 'restartReceiptSha256']) assert.ok(hash(scope[key]), 'owner_chat_state_pin');
  for (const key of ['tenantId', 'userId', 'branchId']) assert.ok(opaque(scope[key]), 'owner_chat_identity');
  assert.ok(typeof scope.tenantSlug === 'string' && /^[a-z0-9-]{1,80}$/.test(scope.tenantSlug), 'owner_chat_slug');
  assert.ok(typeof scope.companyId === 'string' && /^[1-9][0-9]{0,14}$/.test(scope.companyId), 'owner_chat_company');
}

export function assertOwnerChatActor(user, scope) {
  assertOwnerChatScope(scope);
  assert.ok(user?.userId === scope.userId && user?.tenantId === scope.tenantId
    && user.role === 'tenant_owner' && user.membershipStatus === 'active', 'owner_chat_actor_refused');
}

export async function verifyOwnerChatDatabase(prisma, scope) {
  const [tenant, user, membership, branch, integration] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: scope.tenantId }, select: { slug: true, status: true } }),
    prisma.user.findUnique({ where: { id: scope.userId }, select: { tenantId: true, role: true, status: true } }),
    prisma.membership.findFirst({ where: { tenantId: scope.tenantId, userId: scope.userId, role: 'tenant_owner', status: 'active' }, select: { id: true } }),
    prisma.branch.findUnique({ where: { id: scope.branchId }, select: { tenantId: true } }),
    prisma.crmIntegration.findUnique({ where: { tenantId: scope.tenantId }, select: { status: true, provider: true, baseUrl: true, verifiedAt: true, settingsJson: true } }),
  ]);
  assert.ok(tenant?.slug === scope.tenantSlug && ['active', 'trial'].includes(tenant.status)
    && user?.tenantId === scope.tenantId && user.role === 'tenant_owner' && user.status === 'active'
    && membership && branch?.tenantId === scope.tenantId, 'owner_chat_current_membership_refused');
  const settings = integration?.settingsJson;
  assert.ok(integration?.status === 'active' && integration.provider === 'yclients' && !integration.baseUrl && integration.verifiedAt
    && String(settings?.companyId) === scope.companyId && settings?.branchBinding?.branchId === scope.branchId
    && String(settings?.branchBinding?.companyId) === scope.companyId
    && settings?.branchBinding?.contract === 'maya.crm-branch-binding/1'
    && /^[a-f0-9]{64}$/.test(settings?.acceptedImportSnapshotHash ?? ''), 'owner_chat_current_crm_refused');
  return scope.companyId;
}

