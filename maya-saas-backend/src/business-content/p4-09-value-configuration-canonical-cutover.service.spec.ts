import { ForbiddenException } from '@nestjs/common';
import { ActionApprovalDecision, ActionExecutionState } from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineKernel,
  CanonicalActionIngressService,
  P4_09_EXECUTABLE_CAPABILITIES,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { P409ValueConfigurationCanonicalCutoverService } from './p4-09-value-configuration-canonical-cutover.service';
import { P409ValueConfigurationExecutableService } from './p4-09-value-configuration-executable.service';
import { P409ValueConfigurationShadowService } from './p4-09-value-configuration-shadow.service';

function request(
  role: string,
  capability = P4_09_EXECUTABLE_CAPABILITIES.updateCertificate,
): TrustedActionExecutionRequestV1 {
  return {
    contract: ACTION_EXECUTION_REQUEST_CONTRACT,
    tenantId: 'tenant-a',
    capability,
    source: {
      type: 'authenticated_request',
      occurrenceScope: 'p4-09:test:identity',
      sourceRef: 'p4-09:test:source',
      actorUserId: 'actor-a',
    },
    targetRef: 'tenant-catalog-item:offer-a',
    input: { actorRole: role },
    evidenceRefs: ['p4-09-policy:test'],
    callerIdempotency: { scope: 'p4-09:test', key: 'identity-a' },
  };
}

function harness(role = 'tenant_owner') {
  const built = request(role);
  const buildOfferRequest = jest.fn().mockResolvedValue(built);
  const buildReferralPolicyRequest = jest
    .fn()
    .mockResolvedValue(
      request(role, P4_09_EXECUTABLE_CAPABILITIES.updateReferral),
    );
  const createExecution = jest.fn().mockResolvedValue({
    id: 'execution-a',
    state: ActionExecutionState.PENDING_APPROVAL,
  });
  const decideApproval = jest.fn().mockResolvedValue({
    id: 'execution-a',
    state: ActionExecutionState.READY,
  });
  const execute = jest.fn().mockResolvedValue({
    actionClass: 'update_gift_certificate_offer',
    actionExecutionId: 'execution-a',
    targetId: 'offer-a',
    versionId: 'version-a',
    version: 2,
    previousVersionId: 'version-old',
    configurationMutations: 1,
    customerValueMutations: 0,
    providerWrites: 0,
    unknownApplicable: false,
  });
  const service = new P409ValueConfigurationCanonicalCutoverService(
    {
      buildOfferRequest,
      buildReferralPolicyRequest,
    } as unknown as P409ValueConfigurationShadowService,
    { createExecution } as unknown as CanonicalActionIngressService,
    { decideApproval } as unknown as ActionEngineKernel,
    { execute } as unknown as P409ValueConfigurationExecutableService,
  );
  return {
    service,
    built,
    buildOfferRequest,
    buildReferralPolicyRequest,
    createExecution,
    decideApproval,
    execute,
  };
}

describe('P409ValueConfigurationCanonicalCutoverService', () => {
  it('routes an owner-approved offer update through canonical ingress and executor', async () => {
    const h = harness();
    await h.service.updateOffer(
      'tenant-a',
      'actor-a',
      'certificate',
      'offer-a',
      { name: 'Certificate', priceKopecks: 250_000 },
    );

    expect(h.buildOfferRequest).toHaveBeenCalledWith(
      'tenant-a',
      'actor-a',
      expect.objectContaining({
        sourceIntentRef: 'p4-09:http:update:certificate:offer-a',
        kind: 'certificate',
        operation: 'update',
        offerId: 'offer-a',
      }),
      'execute',
    );
    expect(h.decideApproval).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      executionId: 'execution-a',
      approverUserId: 'actor-a',
      decision: ActionApprovalDecision.APPROVED,
    });
    expect(h.execute).toHaveBeenCalledWith(h.built);
  });

  it('allows a same-tenant owner to approve referral policy but not an admin', async () => {
    const owner = harness('business_owner');
    await owner.service.updateReferralPolicy('tenant-a', 'actor-a', {
      enabled: true,
      inviterRewardKopecks: 10_000,
    });
    expect(owner.buildReferralPolicyRequest).toHaveBeenCalled();
    expect(owner.execute).toHaveBeenCalled();

    const admin = harness('tenant_admin');
    await expect(
      admin.service.updateReferralPolicy('tenant-a', 'actor-a', {
        enabled: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(admin.execute).not.toHaveBeenCalled();
  });

  it('requires a supported canonical template for replacement creation', async () => {
    const h = harness();
    await expect(
      h.service.createOffer('tenant-a', 'actor-a', 'membership', {
        name: 'Membership',
        priceKopecks: 300_000,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.buildOfferRequest).not.toHaveBeenCalled();
  });

  it('restores an already succeeded execution without a second approval', async () => {
    const h = harness();
    h.createExecution.mockResolvedValue({
      id: 'execution-a',
      state: ActionExecutionState.SUCCEEDED,
    });
    await h.service.retireOffer(
      'tenant-a',
      'actor-a',
      'certificate',
      'offer-a',
    );
    expect(h.decideApproval).not.toHaveBeenCalled();
    expect(h.execute).toHaveBeenCalled();
  });
});
