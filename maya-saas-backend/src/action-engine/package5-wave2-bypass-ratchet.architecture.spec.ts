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
      'const requestMaterialHash',
      'async safeDesired',
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

  it('pins the exact pre-cutover legacy owners without treating them as exemptions', () => {
    expect(users).toContain('async updateCrmTeamAccess');
    expect(users).toContain('async claimCrmTeamOwner');
    expect(sessions).toContain('async revokeSession');
    expect(sessions).toContain('async revokeAllSessions');
    expect(social).toContain('private async completeIdentityLink');
    expect(admin).toContain('async updateTenant');
    expect(admin).toContain('async updateBranding');
    expect(admin).toContain('async uploadTenantLogo');
    expect(admin).toContain('async createTenantUser');
    expect(admin).toContain('async createProviderUser');
    expect(admin).toContain('async setTenantStatus');
    expect(branches).toContain('async createForTenant');
    expect(branding).toContain('async uploadTenantLogo');
  });
});
