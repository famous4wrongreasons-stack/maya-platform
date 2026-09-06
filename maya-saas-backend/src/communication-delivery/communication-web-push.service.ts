import {
  type ReminderDispatch,
  type ReminderPlan,
} from './appointment-reminder.contract';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineKernel,
  ActionEngineRuntimeService,
} from '../action-engine';
import {
  notificationOverrides,
  preferenceObject,
} from '../action-engine/client-preferences.contract';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ClientWebPushService } from '../crm/client-web-push.service';
import { CommunicationDeliveryKernel } from './communication-delivery.kernel';
import { COMMUNICATION_ENVELOPE_CONTRACT } from './communication-delivery.contract';
import { CommunicationWebPushTransport } from './communication-web-push.transport';

const ACTION = 'communication.appointment-reminders.execute.v1';
const TRANSPORT = 'communication.production.web-push.client-single';
type Input = {
  tenantId: string;
  clientId: string;
  sourceEventId: string;
  messageType: 'appointment_reminder' | 'wanted_slot_available';
  title: string;
  bodyText: string;
  expiresAt: Date;
  issuedAt: Date;
};

/** Server-internal existing communication initiators only. No HTTP send route,
 * no registration-side dispatch, and no new outreach/consent authority. */
@Injectable()
export class CommunicationWebPushService {
  private readonly kernel: CommunicationDeliveryKernel;
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly engine: ActionEngineRuntimeService,
    private readonly actionKernel: ActionEngineKernel,
    private readonly endpoints: ClientWebPushService,
    private readonly encryption: EncryptionService,
    private readonly transport: CommunicationWebPushTransport,
    config: ConfigService,
  ) {
    this.kernel = new CommunicationDeliveryKernel(prisma, {
      identitySecret:
        config.get<string>('ACTION_ENGINE_IDENTITY_SECRET') ??
        config.getOrThrow<string>('CRM_ENCRYPTION_KEY'),
      payloadEncryptionSecret:
        config.get<string>('ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET') ??
        config.getOrThrow<string>('CRM_ENCRYPTION_KEY'),
    });
  }

  /** Device notification of an already accepted canonical Client communication.
   * No raw recipient/phone resolution and no independent outreach decision. */
  async deliverFromAcceptedReceipt(tenantId: string, executionId: string) {
    const execution = await this.prisma.actionExecution.findFirst({
      where: {
        id: executionId,
        tenantId,
        state: 'SUCCEEDED',
        capability: ACTION,
        dryRun: false,
        policyDecision: 'ALLOW',
      },
    });
    if (!execution) return { status: 'NO_APPROVED_INTENT' };
    const input = await this.actionKernel.readTrustedNormalizedInput(
      tenantId,
      executionId,
    );
    if (input.reminderPlan) return { status: 'FIXED_REMINDER_PLAN_REQUIRED' };
    if (
      !['telegram', 'inbox'].includes(String(input.channel)) ||
      !['appointment_reminder', 'wanted_slot_available'].includes(
        String(input.messageType),
      ) ||
      typeof input.recipientIdentityRef !== 'string' ||
      !/^[a-f0-9]{64}$/.test(input.recipientIdentityRef)
    )
      return { status: 'NO_VERIFIED_CLIENT_RECIPIENT' };
    const links = await this.prisma.clientChannelLink.findMany({
      where: {
        tenantId,
        provider: input.channel === 'telegram' ? 'telegram' : 'maya_user',
        providerSubjectHash: input.recipientIdentityRef,
        revokedAt: null,
        verificationVersion: 1,
        subjectHashVersion: 1,
      },
      take: 2,
    });
    if (links.length !== 1) return { status: 'NO_VERIFIED_CLIENT_RECIPIENT' };
    // A later verified re-link never retargets a historical communication.
    // Fail closed on timestamp ties as well; no inferred historical ownership.
    if (
      links[0].createdAt >= execution.createdAt ||
      links[0].verifiedAt >= execution.createdAt
    )
      return { status: 'CLIENT_BINDING_POSTDATES_INTENT' };
    let expiresAt = execution.intentExpiresAt;
    if (!expiresAt) return { status: 'NO_CANONICAL_COMMUNICATION_EXPIRY' };
    if (input.messageType === 'wanted_slot_available') {
      // The existing B9 intent identity is derived from these immutable facts.
      // Resolve only within the already verified Client; never extend slot expiry
      // to the generic communication receipt retention window.
      const interests = await this.prisma.clientWantedSlotInterest.findMany({
        where: {
          tenantId,
          clientId: links[0].clientId,
          status: { in: ['MATCHED', 'NOTIFIED'] },
          expiresAt: { gt: new Date() },
          matchedSourceEventId: { not: null },
        },
      });
      const exact = interests.filter((interest) => {
        const ref = this.encryption.opaqueReference(
          'package5.client-wanted-slot.v1',
          JSON.stringify({
            interestId: interest.id,
            sourceEventId: interest.matchedSourceEventId,
          }),
        );
        return input.sourceEventId === `wanted-slot-delivery:${ref}`;
      });
      if (exact.length !== 1) return { status: 'NO_ACTIONABLE_WANTED_SLOT' };
      expiresAt = new Date(
        Math.min(expiresAt.getTime(), exact[0].expiresAt.getTime()),
      );
    }
    if (expiresAt.getTime() <= Date.now())
      return { status: 'COMMUNICATION_EXPIRED' };
    return this.deliver({
      tenantId,
      clientId: links[0].clientId,
      sourceEventId: `canonical-communication:${execution.id}`,
      messageType: input.messageType as Input['messageType'],
      title: String(input.title),
      bodyText: String(input.bodyText),
      expiresAt,
      issuedAt: execution.createdAt,
    });
  }

  async deliverReminder(dispatch: ReminderDispatch, primary: boolean) {
    const n = dispatch.request.input as Record<string, unknown>;
    const p = n.reminderPlan as ReminderPlan;
    if (!p || n.messageType !== 'appointment_reminder')
      throw new ForbiddenException('REMINDER_PLAN_REQUIRED');
    await dispatch.authorize();
    if (
      !primary &&
      !(await this.prisma.actionExecution.findFirst({
        where: {
          tenantId: dispatch.request.tenantId,
          capability: ACTION,
          sourceRef: dispatch.request.source.sourceRef,
          state: 'SUCCEEDED',
          dryRun: false,
        },
      }))
    )
      throw new ForbiddenException('REMINDER_PRIMARY_NOT_ACCEPTED');
    return this.deliver(
      {
        tenantId: dispatch.request.tenantId,
        clientId: p.clientId,
        sourceEventId: String(n.sourceEventId),
        messageType: 'appointment_reminder',
        title: String(n.title),
        bodyText: String(n.bodyText),
        expiresAt: new Date(p.expiresAt),
        issuedAt: new Date(p.issuedAt),
      },
      dispatch,
      primary,
    );
  }

  private async deliver(
    input: Input,
    reminder?: ReminderDispatch,
    primary = false,
  ) {
    if (this.context.requireTenantId() !== input.tenantId)
      throw new ForbiddenException('Tenant mismatch');
    const identity = this.hash([
      input.tenantId,
      input.clientId,
      input.messageType,
      input.sourceEventId,
    ]);
    const sourceRef = `b24.web-push:${identity}`;
    const prior = await this.prisma.actionExecution.findMany({
      where: { tenantId: input.tenantId, capability: ACTION, sourceRef },
      take: 2,
    });
    if (prior.length > 1)
      throw new ForbiddenException('Ambiguous communication identity');
    const persisted = prior[0]
      ? await this.actionKernel.readTrustedNormalizedInput(
          input.tenantId,
          prior[0].id,
        )
      : null;
    const endpointIds = reminder
      ? ((reminder.request.input as Record<string, unknown>)
          .reminderPlan as ReminderPlan)
      : null;
    const deviceIds = endpointIds
      ? endpointIds.endpointIds
      : persisted
        ? (persisted.endpointIds as string[])
        : await this.endpoints.eligibleIds(
            input.tenantId,
            input.clientId,
            input.issuedAt,
          );
    if (!deviceIds.length)
      return { status: 'NO_ELIGIBLE_ENDPOINT', actionExecutionId: null };
    const normalized = {
      channel: 'web_push',
      messageType: input.messageType,
      clientId: input.clientId,
      endpointIds: deviceIds,
      sourceEventId: input.sourceEventId,
      title: input.title,
      bodyText: input.bodyText,
      expiresAt: input.expiresAt.toISOString(),
    };
    const receipt = await this.engine.executeWithReceipt(
      primary && reminder
        ? reminder.request
        : {
            contract: ACTION_EXECUTION_REQUEST_CONTRACT,
            tenantId: input.tenantId,
            capability: ACTION,
            source: { type: 'scheduler', sourceRef, occurrenceScope: identity },
            targetRef: `client-communication:${this.hash(input.clientId)}`,
            input: normalized,
            evidenceRefs: [`source-event:${input.sourceEventId}`],
            intentExpiresAt: input.expiresAt,
            callerIdempotency: {
              scope: 'communication:web-push:client',
              key: identity,
            },
          },
      {
        prepare: async (value, ctx) => {
          await reminder?.authorize();
          const allow = await this.allowed(
            ctx.tenantId,
            String(value.clientId),
            String(value.messageType),
          );
          if (!allow)
            throw new ForbiddenException('CLIENT_COMMUNICATION_NOT_ALLOWED');
          const ids = value.endpointIds as string[];
          const envelope = await this.kernel.createEnvelope({
            contract: COMMUNICATION_ENVELOPE_CONTRACT,
            tenantId: ctx.tenantId,
            actionExecutionId: ctx.executionId,
            scope: 'SINGLE',
            channel: 'web_push',
            clientId: String(value.clientId),
            capabilityKey: TRANSPORT,
            campaignIdempotencyKey: identity,
            contentRef: `template:${input.messageType}.v1`,
            contentIdentityHash: this.hash([value.title, value.bodyText]),
            expiresAt: new Date(String(value.expiresAt)),
            recipients: ids.map((id) => ({
              recipientRef: id,
              recipientKind: 'client_web_push_endpoint',
              eligibility: {
                basis: 'canonical_client_consent_preferences',
                decision: 'ALLOW',
                policyVersion: 1,
                evidenceRef: `web-push-endpoint:${id}`,
                evidenceHash: this.hash([input.clientId, id, allow]),
                checkedAt: new Date(),
              },
            })),
          });
          return { campaignId: envelope.id };
        },
        dispatch: async (value, _transportKey, ctx) => {
          const campaign = await this.prisma.marketingCampaign.findFirstOrThrow(
            {
              where: {
                tenantId: ctx.tenantId,
                actionExecutionId: ctx.executionId,
              },
            },
          );
          for (let i = 0; i < 5; i++) {
            const claim = await this.kernel.claimNext({
              tenantId: ctx.tenantId,
              campaignId: campaign.id,
              workerId: `web-push:${ctx.executionId}`,
            });
            if (!claim) break;
            const owned = {
              tenantId: ctx.tenantId,
              campaignId: campaign.id,
              recipientId: claim.recipient.id,
              attemptId: claim.attempt.id,
              leaseToken: claim.leaseToken,
              recipientRevision: claim.recipient.revision,
            };
            const id =
              claim.recipient.eligibilityEvidenceRef?.replace(
                /^web-push-endpoint:/,
                '',
              ) ?? '';
            const material = await this.endpoints.resolveForDelivery(
              ctx.tenantId,
              String(value.clientId),
              id,
            );
            if (
              !material ||
              !this.transport.ready() ||
              !this.transport.accepts(material) ||
              !(await this.allowed(
                ctx.tenantId,
                String(value.clientId),
                String(value.messageType),
              ))
            ) {
              await this.kernel.finalizePreDispatchFailure({
                ...owned,
                outcomeCode: 'web_push_ineligible',
                errorCode: 'web_push_not_authorized_or_available',
              });
              continue;
            }
            await reminder?.authorize();
            await this.kernel.markDispatchBoundary(owned);
            const after = {
              ...owned,
              recipientRevision: owned.recipientRevision + 1,
            };
            let outcome;
            try {
              outcome = await this.transport.send(
                material,
                JSON.stringify({
                  title: value.title,
                  body: value.bodyText,
                  url: '/app/',
                  tag: identity,
                }),
                campaign.expiresAt,
              );
            } catch {
              outcome = 'UNKNOWN';
            }
            if (outcome === 'UNKNOWN') {
              await this.kernel.finalizeUnknown({
                ...after,
                outcomeCode: 'web_push_dispatch_uncertain',
                errorCode: 'web_push_unknown',
              });
              throw new Error('WEB_PUSH_OUTCOME_UNKNOWN');
            }
            if (outcome === 'SUCCEEDED')
              await this.kernel.finalizeAccepted({
                ...after,
                outcomeCode: 'web_push_provider_accepted',
              });
            else {
              const invalid = outcome === 'PERMANENT_ENDPOINT_INVALID';
              await this.kernel.finalizeDeterministicReject({
                ...after,
                outcomeCode: invalid
                  ? 'web_push_endpoint_invalid'
                  : 'web_push_provider_rejected',
                errorCode: invalid
                  ? 'web_push_endpoint_invalid'
                  : 'web_push_request_rejected',
              });
              if (invalid)
                await this.endpoints.invalidateAfterDelivery(
                  ctx.tenantId,
                  String(value.clientId),
                  id,
                  claim.attempt.id,
                );
            }
          }
          const audit = await this.kernel.audit({
            tenantId: ctx.tenantId,
            campaignId: campaign.id,
          });
          if (
            audit.recipients.some(
              (r) =>
                r.deliveryState === 'UNKNOWN' || r.deliveryState === 'NOT_SENT',
            )
          )
            throw new Error('WEB_PUSH_OUTCOME_UNKNOWN');
          const result = {
            campaignId: campaign.id,
            status: 'FINALIZED',
            accepted: audit.recipients.filter(
              (r) => r.deliveryState === 'ACCEPTED',
            ).length,
            failed: audit.recipients.filter((r) => r.deliveryState === 'FAILED')
              .length,
          };
          return { value: result, safeResult: result };
        },
        reconcile: () => Promise.resolve({ outcome: 'STILL_UNKNOWN' as const }),
        restore: (safe) => ({
          campaignId: String(safe.campaignId),
          status: String(safe.status),
          accepted: Number(safe.accepted),
          failed: Number(safe.failed),
        }),
        classifyError: (_error, phase) => ({
          kind: phase === 'prepare' ? 'definitive' : 'unknown',
          outcomeCode:
            phase === 'prepare'
              ? 'web_push_prepare_rejected'
              : 'web_push_outcome_unknown',
          errorClass: 'communication_web_push',
        }),
      },
    );
    return {
      ...receipt.value,
      actionExecutionId: receipt.execution.executionId,
    };
  }

  private hash(value: unknown) {
    return this.encryption.opaqueReference(
      'b24.communication.v1',
      JSON.stringify(value),
    );
  }
  private async allowed(tenantId: string, clientId: string, type: string) {
    if (!['appointment_reminder', 'wanted_slot_available'].includes(type))
      return false;
    const [profile, tenant] = await Promise.all([
      this.prisma.customerProfile.findUnique({
        where: { tenantId_clientId: { tenantId, clientId } },
      }),
      this.prisma.tenant.findUnique({ where: { id: tenantId } }),
    ]);
    if (!tenant || !profile?.privacyConsentAt) return false;
    try {
      const envelope = preferenceObject(
        profile.notificationPreferencesJson ?? {},
      );
      const prefs = notificationOverrides(envelope.overrides ?? {});
      if (
        prefs[type === 'wanted_slot_available' ? 'freed_slot' : 'reminder'] ===
        false
      )
        return false;
      const from = prefs.quiet_from,
        to = prefs.quiet_to;
      if (typeof from === 'number' && typeof to === 'number' && from !== to) {
        const hour = Number(
          new Intl.DateTimeFormat('en-GB', {
            timeZone: tenant.defaultTimezone,
            hour: '2-digit',
            hourCycle: 'h23',
          }).format(new Date()),
        );
        if (from < to ? hour >= from && hour < to : hour >= from || hour < to)
          return false;
      }
      return true;
    } catch {
      return false;
    }
  }
}
