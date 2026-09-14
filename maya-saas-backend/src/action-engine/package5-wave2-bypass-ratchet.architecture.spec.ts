import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PACKAGE5_WAVE2_REGISTRATIONS } from './package5-wave2-executable.contract';

const SRC = join(process.cwd(), 'src');

function source(path: string) {
  return readFileSync(join(SRC, path), 'utf8');
}

function method(text: string, start: string, end: string) {
  const startAt = text.indexOf(start);
  const endAt = text.indexOf(end, startAt + start.length);
  if (startAt < 0 || endAt < 0)
    throw new Error(`Method boundary missing: ${start}`);
  return text.slice(startAt, endAt);
}

describe('Package 5 Wave 2 ownership/bypass ratchet', () => {
  const canonical = source('package5-wave2/package5-wave2.service.ts');
  const cutover = source(
    'package5-wave2/package5-wave2-canonical-cutover.service.ts',
  );
  const bootstrap = source(
    'package5-wave2/trial-activation-bootstrap.service.ts',
  );
  const objectStore = source(
    'package5-wave2/package5-wave2-object-store.service.ts',
  );
  const policyResolver = source(
    'action-engine/action-engine.policy-resolver.ts',
  );
  const policyRegistry = source(
    'action-engine/action-engine.policy-registry.ts',
  );
  const users = source('users/users.service.ts');
  const crm = source('crm/crm.service.ts');
  const sessions = source('auth/auth-session.service.ts');
  const social = source('auth/social-auth.service.ts');
  const admin = source('admin/admin.service.ts');
  const branches = source('branches/branches.service.ts');
  const branding = source('branding/branding.service.ts');
  const usersModule = source('users/users.module.ts');
  const authModule = source('auth/auth.module.ts');
  const adminModule = source('admin/admin.module.ts');
  const branchesModule = source('branches/branches.module.ts');

  it('locks the exact A16/A25/A26 action inventory and authority classes', () => {
    expect(PACKAGE5_WAVE2_REGISTRATIONS).toHaveLength(13);
    expect(
      PACKAGE5_WAVE2_REGISTRATIONS.filter(
        (registration) => registration.authorityClass === 'AC2',
      ).map((registration) => registration.operation),
    ).toEqual(['upload_tenant_logo']);
    expect(
      PACKAGE5_WAVE2_REGISTRATIONS.filter(
        (registration) => registration.family === 'A16',
      ),
    ).toHaveLength(2);
    expect(
      PACKAGE5_WAVE2_REGISTRATIONS.filter(
        (registration) => registration.family === 'A25',
      ),
    ).toHaveLength(3);
    expect(
      PACKAGE5_WAVE2_REGISTRATIONS.filter(
        (registration) => registration.family === 'A26',
      ),
    ).toHaveLength(8);
  });

  it('keeps canonical mutations execution-bound and transient material out of input', () => {
    expect(canonical).toContain('CanonicalActionIngressService');
    expect(canonical).toContain('ActionEngineRuntimeService');
    expect(canonical).toContain('actionTargetMutation.create');
    expect(canonical).toContain('readTrustedNormalizedInput');
    const requestBlock = method(
      canonical,
      'input: {\n        operation: command.operation',
      'evidenceRefs:',
    );
    expect(requestBlock).not.toMatch(
      /passwordHash|providerUserId|email:|phone:|bytes:|profileJson/,
    );
    expect(requestBlock).toContain('desiredStateHash');
    expect(requestBlock).toContain('requestMaterialHash');
    expect(requestBlock).toContain('actorIdentityHash');
  });

  it('keeps logo dispatch content-addressed and reconciliation-owned', () => {
    expect(objectStore).toContain('requestIdentityHash');
    expect(objectStore).toContain("flag: 'wx'");
    expect(objectStore).not.toContain('randomUUID');
    expect(canonical).toContain("outcome: 'STILL_UNKNOWN'");
    expect(canonical).toContain("outcome: 'PROVEN_SUCCEEDED'");
    expect(canonical).toContain("outcome: 'PROVEN_NOT_EXECUTED'");
  });

  it('allows only the exact platform recovery capability on a suspended tenant', () => {
    expect(policyResolver).toContain(
      "'package5.wave2.reactivate-tenant.shadow.v1'",
    );
    expect(policyResolver).toContain(
      "'package5.wave2.reactivate-tenant.execute.v1'",
    );
    expect(policyResolver).toContain("tenant.status === 'suspended'");
    expect(policyResolver).toContain("request.sourceType === 'legacy_bridge'");
    expect(policyResolver).toContain('request.actorUserId === undefined');
    expect(policyRegistry).toContain("? 'tenant.recoverable'");
  });

  it('keeps TrialActivation as the exact atomic pre-tenant protocol claim', () => {
    expect(bootstrap).toContain('TrialActivationBootstrapService');
    expect(bootstrap).toContain('FOR UPDATE');
    expect(bootstrap).toContain('trialActivation.update');
    expect(bootstrap).toContain('tenant.create');
    expect(bootstrap).toContain('membership');
    expect(bootstrap).not.toMatch(/actionExecution\.|ActionEngine/);
    expect(bootstrap).not.toMatch(/tenant\.(delete|deleteMany)\(/);
  });

  it('classifies only exact auth protocols and CRM projection as non-actions', () => {
    expect(sessions).toContain('async logout(user: AuthenticatedUser)');
    expect(social).toContain('claimAuthFlowStateOrThrow');
    expect(crm).toContain('private async reconcileCrmTeamAccess');
    expect(canonical).toContain("operation: 'revoke_other_session'");
    expect(canonical).toContain("operation: 'revoke_all_sessions'");
    expect(canonical).toContain("operation: 'link_social_identity'");
    expect(canonical).not.toMatch(/auth\/\*|onboarding\/\*|crm\/\*/);
  });

  it('keeps every legacy Wave 2 surface as an initiator, not a mutation owner', () => {
    const userAccess = method(
      users,
      'async updateCrmTeamAccess',
      'async claimCrmTeamOwner',
    );
    const ownerClaim = method(
      users,
      'async claimCrmTeamOwner',
      'async createPhoneFirstClientUser',
    );
    const revokeOther = method(
      sessions,
      'async revokeSession',
      'async revokeAllSessions',
    );
    const revokeAll = method(
      sessions,
      'async revokeAllSessions',
      'private async buildSessionTokens',
    );
    const identityLink = method(
      social,
      'private async completeIdentityLink',
      'private async exchangeYandexCode',
    );
    const tenantUpdate = method(
      admin,
      'async updateTenant',
      'async updateBranding',
    );
    const brandingUpdate = method(
      admin,
      'async updateBranding',
      'async uploadTenantLogo',
    );
    const logoUpload = method(
      admin,
      'async uploadTenantLogo',
      'async upsertCrm',
    );
    const tenantUser = method(
      admin,
      'async createTenantUser',
      'async createProviderUser',
    );
    const providerUser = method(
      admin,
      'async createProviderUser',
      'async setTenantStatus',
    );
    const lifecycle = method(
      admin,
      'async setTenantStatus',
      'private definedChanges',
    );
    const branchCreate = method(branches, 'async createForTenant', '\n}');

    for (const block of [
      userAccess,
      ownerClaim,
      revokeOther,
      revokeAll,
      identityLink,
      tenantUpdate,
      brandingUpdate,
      logoUpload,
      tenantUser,
      providerUser,
      lifecycle,
      branchCreate,
    ]) {
      expect(block).toContain('canonicalWave2');
    }
    expect(`${userAccess}\n${ownerClaim}`).not.toMatch(
      /(crmStaffAccess|user|membership|authSession|authIdentity)\.(create|update|updateMany|upsert|delete|deleteMany)\(/,
    );
    expect(`${revokeOther}\n${revokeAll}`).not.toMatch(
      /repository\.revoke(All)?Session/,
    );
    expect(identityLink).not.toMatch(
      /authRepository\.(reassignIdentity|createIdentity)|updateIdentityRecord/,
    );
    expect(
      `${tenantUpdate}\n${brandingUpdate}\n${logoUpload}\n${tenantUser}\n${providerUser}\n${lifecycle}`,
    ).not.toMatch(
      /(tenantsService\.(updateTenant|setTenantStatus)|brandingService\.(upsertBranding|uploadTenantLogo)|usersService\.(createUser|createStaffUserForInternalProvider))/,
    );
    expect(branchCreate).not.toMatch(/branch\.create\(/);
    expect(branding).not.toContain('async uploadTenantLogo');
  });

  it('wires all four production initiator modules to the narrow cutover adapter', () => {
    expect(cutover).toContain('Package5Wave2ExecutableService');
    expect(cutover).toContain("'execute'");
    for (const module of [
      usersModule,
      authModule,
      adminModule,
      branchesModule,
    ]) {
      expect(module).toContain('Package5Wave2Module');
    }
  });
});
