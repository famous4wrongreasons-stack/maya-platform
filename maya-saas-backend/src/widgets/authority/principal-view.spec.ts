// PR-6 and PR-7, unit half — the two mappings of `principal-view.ts`, over every input they admit.
//
// These are `[U]` tests and evidence of nothing (§0.5): they pin the TABLE, and `principal.live-spec.ts`
// runs the same table over real memberships resolved by `C9Authority.current` inside `T`. A unit test
// that agreed with a wrong table would agree with it on the live path too, which is why both exist.

import type { C9Principal } from '../../orchestration/c9.contract';
import {
  PRESENTATION_CLIENT_ROLES,
  PRESENTATION_OWNER_ROLES,
  presentationModeFor,
  principalView,
  verificationLevelFor,
} from './principal-view';

/** A resolved principal, as `C9Authority.current` returns one. Never built inside `src/widgets` (K5). */
const authority = (
  over: Partial<C9Principal> & Pick<C9Principal, 'kind'>,
): C9Principal => ({
  tenantId: 'tenant-1',
  userId: over.kind === 'USER' ? 'user-1' : null,
  membershipId: over.kind === 'USER' ? 'membership-1' : null,
  clientId: over.kind === 'CLIENT_CHANNEL' ? 'client-1' : null,
  channelLinkId: over.kind === 'CLIENT_CHANNEL' ? 'link-1' : null,
  branchRefs: [],
  staffRef: null,
  proofHash: 'a'.repeat(64),
  ...over,
});

describe('PR-6 [U] — B-02 presentation_mode (C11:7189-7191)', () => {
  it('PR-6U-1 [U]: CLIENT_CHANNEL is client, whatever role is passed with it', () => {
    for (const role of [null, 'client', 'tenant_owner', 'administrator'])
      expect(presentationModeFor('CLIENT_CHANNEL', role)).toBe('client');
  });

  it('PR-6U-2 [U]: client and customer are client; tenant_owner and business_owner are owner; every other role is staff', () => {
    expect([...PRESENTATION_CLIENT_ROLES].sort()).toEqual([
      'client',
      'customer',
    ]);
    expect([...PRESENTATION_OWNER_ROLES].sort()).toEqual([
      'business_owner',
      'tenant_owner',
    ]);
    const table: Record<string, 'client' | 'owner' | 'staff'> = {
      client: 'client',
      customer: 'client',
      tenant_owner: 'owner',
      business_owner: 'owner',
      administrator: 'staff',
      manager: 'staff',
      provider: 'staff',
      employee: 'staff',
      accountant: 'staff',
      staff: 'staff',
      tenant_admin: 'staff',
      branch_manager: 'staff',
      platform_owner: 'staff',
      platform_admin: 'staff',
      integration_service: 'staff',
    };
    for (const [role, mode] of Object.entries(table))
      expect([role, presentationModeFor('USER', role)]).toEqual([role, mode]);
  });

  it('PR-6U-3 [U]: a USER principal with no role presents as staff — B-02 has no fourth mode, and the adapter refuses such a principal before this is reached', () => {
    expect(presentationModeFor('USER', null)).toBe('staff');
    // F18 has three modes (C11:292-296). A `'system'` mode is not one of them (P-K4K8).
    expect(['client', 'owner', 'staff']).toContain(
      presentationModeFor('USER', 'anything-unknown'),
    );
  });
});

describe('PR-7 [U] — K1 verification levels (C11:2536-2539)', () => {
  it('PR-7U-1 [U]: USER is SESSION_VERIFIED and CLIENT_CHANNEL is BOUND_CLIENT', () => {
    expect(verificationLevelFor('USER')).toBe('SESSION_VERIFIED');
    expect(verificationLevelFor('CLIENT_CHANNEL')).toBe('BOUND_CLIENT');
  });

  it('PR-7U-2 [U]: no principal kind reaches STEP_UP_VERIFIED (K6, C11:2550): it stays unreachable', () => {
    for (const kind of ['USER', 'CLIENT_CHANNEL'] as const)
      expect(verificationLevelFor(kind)).not.toBe('STEP_UP_VERIFIED');
  });
});

describe('principalView [U] — the assembled view', () => {
  it('PR-VIEW-1 [U]: carries the resolver’s answer, the read role, the mapped mode and level, and the owner’s hash', () => {
    const a = authority({ kind: 'USER' });
    const view = principalView({
      authority: a,
      role: 'tenant_owner',
      proofHash: 'b'.repeat(64),
    });
    expect(view).toEqual({
      authority: a,
      role: 'tenant_owner',
      presentationMode: 'owner',
      verificationLevel: 'SESSION_VERIFIED',
      proofHash: 'b'.repeat(64),
    });
    // The view is the gates' base member: a slot that could mutate it could change a later slot's input.
    expect(Object.isFrozen(view)).toBe(true);
  });

  it('PR-VIEW-2 [U]: a CLIENT_CHANNEL principal has no role, presents as client and is BOUND_CLIENT', () => {
    const view = principalView({
      authority: authority({ kind: 'CLIENT_CHANNEL' }),
      role: null,
      proofHash: 'c'.repeat(64),
    });
    expect(view).toMatchObject({
      role: null,
      presentationMode: 'client',
      verificationLevel: 'BOUND_CLIENT',
    });
  });

  it('PR-VIEW-3 [U]: the proof hash is the one it is given: the view computes no digest of its own (K3)', () => {
    const a = authority({ kind: 'USER' });
    expect(
      principalView({
        authority: a,
        role: 'manager',
        proofHash: 'd'.repeat(64),
      }).proofHash,
    ).toBe('d'.repeat(64));
    // Not the principal's own `proofHash` (the membership digest) — `c9PrincipalHash` covers nine terms,
    // of which that is one (C11:2544).
    expect(
      principalView({
        authority: a,
        role: 'manager',
        proofHash: 'd'.repeat(64),
      }).proofHash,
    ).not.toBe(a.proofHash);
  });
});
