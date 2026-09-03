import { ForbiddenException, Injectable } from '@nestjs/common';
import { ActionApprovalDecision, ActionExecutionState } from '@prisma/client';

import {
  ActionEngineKernel,
  CanonicalActionIngressService,
  type P409OfferKind,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import type { UpsertCatalogItemDto } from './dto/catalog-item.dto';
import type { UpdateReferralProgramDto } from './dto/referral-program.dto';
import {
  P409ValueConfigurationExecutableService,
  type P409ExecutionValue,
} from './p4-09-value-configuration-executable.service';
import { P409ValueConfigurationShadowService } from './p4-09-value-configuration-shadow.service';

const OWNER_ROLES = new Set(['tenant_owner', 'business_owner']);

/**
 * Production adapter for the seven P4-09 value-configuration actions.
 *
 * It does not contain a catalog/referral writer. It derives the executable
 * request through the same server-owned planner used by Shadow, records an
 * approval only when the authenticated requester is an active owner, and
 * delegates the one local mutation to the canonical Action Engine executor.
 */
@Injectable()
export class P409ValueConfigurationCanonicalCutoverService {
  constructor(
    private readonly planner: P409ValueConfigurationShadowService,
    private readonly ingress: CanonicalActionIngressService,
    private readonly kernel: ActionEngineKernel,
    private readonly executor: P409ValueConfigurationExecutableService,
  ) {}

  async createOffer(
    tenantId: string,
    actorUserId: string,
    kind: P409OfferKind,
    dto: UpsertCatalogItemDto,
  ): Promise<P409ExecutionValue> {
    const templateKey = dto.canonicalTemplateKey?.trim();
    if (!templateKey) {
      throw new ForbiddenException(
        'A server-supported canonical offer template is required',
      );
    }
    return this.execute(
      await this.planner.buildOfferRequest(
        tenantId,
        actorUserId,
        {
          sourceIntentRef: `p4-09:http:create:${kind}:${templateKey}`,
          kind,
          operation: 'create',
          templateKey,
          ...this.offerValue(dto),
        },
        'execute',
      ),
    );
  }

  async updateOffer(
    tenantId: string,
    actorUserId: string,
    kind: P409OfferKind,
    offerId: string,
    dto: UpsertCatalogItemDto,
  ): Promise<P409ExecutionValue> {
    return this.execute(
      await this.planner.buildOfferRequest(
        tenantId,
        actorUserId,
        {
          sourceIntentRef: `p4-09:http:update:${kind}:${offerId}`,
          kind,
          operation: 'update',
          offerId,
          ...this.offerValue(dto),
        },
        'execute',
      ),
    );
  }

  async retireOffer(
    tenantId: string,
    actorUserId: string,
    kind: P409OfferKind,
    offerId: string,
  ): Promise<P409ExecutionValue> {
    return this.execute(
      await this.planner.buildOfferRequest(
        tenantId,
        actorUserId,
        {
          sourceIntentRef: `p4-09:http:delete:${kind}:${offerId}`,
          kind,
          operation: 'delete',
          offerId,
        },
        'execute',
      ),
    );
  }

  async updateReferralPolicy(
    tenantId: string,
    actorUserId: string,
    dto: UpdateReferralProgramDto,
  ): Promise<P409ExecutionValue> {
    return this.execute(
      await this.planner.buildReferralPolicyRequest(
        tenantId,
        actorUserId,
        {
          sourceIntentRef: 'p4-09:http:update:referral-policy',
          ...dto,
        },
        'execute',
      ),
    );
  }

  private offerValue(dto: UpsertCatalogItemDto) {
    return {
      name: dto.name,
      description: dto.description,
      priceKopecks: dto.priceKopecks,
      currency: dto.currency,
      active: dto.active,
      externalRef: dto.externalRef,
    };
  }

  private async execute(
    request: TrustedActionExecutionRequestV1,
  ): Promise<P409ExecutionValue> {
    let execution = await this.ingress.createExecution(request);
    if (execution.state === ActionExecutionState.PENDING_APPROVAL) {
      const actorRole =
        request.input &&
        typeof request.input === 'object' &&
        'actorRole' in request.input &&
        typeof request.input.actorRole === 'string'
          ? request.input.actorRole
          : '';
      if (!OWNER_ROLES.has(actorRole) || !request.source.actorUserId) {
        throw new ForbiddenException(
          'Owner approval is required for value configuration',
        );
      }
      try {
        await this.kernel.decideApproval({
          tenantId: request.tenantId,
          executionId: execution.id,
          approverUserId: request.source.actorUserId,
          decision: ActionApprovalDecision.APPROVED,
        });
      } catch (error) {
        execution = await this.ingress.createExecution(request);
        if (
          execution.state !== ActionExecutionState.READY &&
          execution.state !== ActionExecutionState.SUCCEEDED
        ) {
          throw error;
        }
      }
    }
    return this.executor.execute(request);
  }
}
