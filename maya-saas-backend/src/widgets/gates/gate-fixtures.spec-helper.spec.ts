// The fixtures every function-level gate spec in this directory builds on.
//
// Named `.spec.ts` on purpose, as the repository's other spec helpers are: that keeps it out of the
// production build (`tsconfig.build.json` excludes `**/*spec.ts`). The check at the bottom makes
// sure the fixtures themselves have not quietly stopped meaning what the gate specs assume.
//
// These are function-level regression aids. They are never proof that a gate runs on the live path.

import type { AuthenticatedUser } from '../../common/authenticated-user.interface';
import { UserRole } from '../../common/domain.enums';
import type { GateContext, GateVerdict, IntentRecordRow } from '../gate.types';
import { NO_FACTS } from './facts';
import { assertPolicyTotality } from '../authority/capability-policy';
import { assertRoutingResolves } from '../routing/deterministic-router';

export const PRINCIPAL = 'a'.repeat(64);
export const OTHER = 'b'.repeat(64);

export const rec = (over: Partial<IntentRecordRow> = {}): IntentRecordRow => ({
  intentTokenHash: 'h'.repeat(64),
  tenantId: 't1',
  widgetId: 'w1',
  widgetKind: 'CHOICE',
  effect: 'REFINE',
  principalProofHash: PRINCIPAL,
  verificationFloor: 'SESSION_VERIFIED',
  singleUse: true,
  consumedAt: null,
  issuedAt: new Date('2026-01-01T00:00:00.000Z'),
  expiresAt: new Date('2099-01-01T00:00:00.000Z'),
  supersededByWidgetId: null,
  priority: 1,
  capabilitySpace: 'C9',
  capabilityKey: 'catalog.services.read',
  handoffSpace: null,
  handoffKey: null,
  targetJson: null,
  bodyHash: 'c'.repeat(64),
  selectionDomain: '',
  inputSchemaHash: null,
  confirmationOfKind: null,
  confirmationOfRef: null,
  producedByIntentTokenHash: null,
  c9Domain: null,
  deliveryChannel: 'pwa',
  emissionLifecycleState: 'MINTED',
  confirmation: null,
  confirmationIdempotencyKey: null,
  confirmationSubject: null,
  approvalDecision: null,
  frozenNounsJson: null,
  requestedScopeHash: 'e'.repeat(64),
  runId: null,
  revisionId: null,
  approvalOfIntentRef: null,
  ...over,
});

/** The JWT-validated user a function-level context carries. Its role is read by no gate (AMB-03). */
export const ACTOR: Readonly<AuthenticatedUser> = Object.freeze({
  userId: 'u1',
  sessionId: 's1',
  tenantId: 't1',
  role: UserRole.ADMINISTRATOR,
  email: 'u1@example.test',
  branchId: null,
  membershipId: 'm1',
  membershipStatus: 'active',
});

export const ctx = (
  r: IntentRecordRow,
  over: Partial<GateContext> = {},
): GateContext => ({
  intentTokenHash: r.intentTokenHash,
  tenantId: 't1',
  actor: ACTOR,
  // D-2: the runner sets null until P-PRINCIPAL resolves the live principal (I-CTX).
  principal: null,
  principalProofHash: PRINCIPAL,
  now: new Date('2026-06-01T00:00:00.000Z'),
  record: r,
  submission: { intent_token: 'tok' },
  verificationLevel: 'SESSION_VERIFIED',
  channelMaxLevel: 'SESSION_VERIFIED',
  carrier: 'pwa',
  facts: NO_FACTS,
  ...over,
});

export const code = (v: GateVerdict) => ('code' in v ? v.code : null);

/**
 * The two load-time assertions the gate specs run behind, as the undivided suite did.
 *
 * IR-U10A-2 (U10a's merge): the second was `assertAliasesResolve`, V1's name for a speech-alias table
 * V1.1 does not have. It is deleted, and the assertion it delegated to is called by its own name —
 * `assertRoutingResolves`, which is also what `WidgetsModule.onModuleInit` runs at boot (IR-U10A-1).
 */
export const guardRegistries = (): void => {
  assertPolicyTotality();
  assertRoutingResolves();
};

describe('gate spec fixtures', () => {
  it('the registries the gate specs read load, and the base fixture is a live-shaped record', () => {
    expect(guardRegistries).not.toThrow();
    const c = ctx(rec());
    expect(c.record?.principalProofHash).toBe(c.principalProofHash);
    expect(c.record?.tenantId).toBe(c.tenantId);
    expect(c.carrier).toBe('pwa');
    expect(c.actor.tenantId).toBe(c.tenantId);
    expect(c.facts).toEqual({});
  });
});
