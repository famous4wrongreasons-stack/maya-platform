import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { AiScheduleWidgetPort } from '../../ai-tools/ai-schedule-widget.port';
import { PrismaService } from '../../prisma/prisma.service';
import type { Cell, WidgetComposerInput } from '../../widget-contract/envelope';
import type { SettingsDraftBody } from '../../widget-contract/kinds';
import { C9_REGISTRY_HASH } from '../../orchestration/c9.registry';
import { PRINCIPAL_RESOLVER, SCHEDULE_APPROVAL_OWNER } from '../di-tokens';
import type { PrincipalResolver } from '../authority/principal-view';
import type { ScheduleApprovalAdapter } from '../owner-ports/schedule-approval.adapter';
import { WidgetEmitterService } from './emitter.service';
import { SealService } from './seal.service';
import { TimelineStore } from '../stores/timeline.store';
import { SCHEDULE_AE, SCHEDULE_TEMPLATE } from './schedule-intent-template';

const cell = <T extends string | boolean>(value: T): Cell<T> => ({
  state: 'KNOWN',
  value,
  label: String(value),
  reason_code: null,
  fact_ref: 0,
  as_of: null,
  evidence_refs: [],
  next_intent_ref: null,
});
const phrase = (rendered: string) => ({
  phrase_key: 'schedule.confirmation',
  rendered,
});

@Injectable()
export class ScheduleConfirmationMinterService implements AiScheduleWidgetPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: WidgetEmitterService,
    private readonly seals: SealService,
    @Inject(PRINCIPAL_RESOLVER) private readonly principals: PrincipalResolver,
    @Inject(SCHEDULE_APPROVAL_OWNER)
    private readonly owner: ScheduleApprovalAdapter,
  ) {}
  async mint(input: Parameters<AiScheduleWidgetPort['mint']>[0]) {
    const tenantId = input.actor.tenantId;
    if (!tenantId || !['native', 'web'].includes(input.surface)) return null;
    const preview = await this.owner.preview(
      input.actor,
      input.approvalId,
      input.payloadHash,
    );
    if (preview.surface !== input.surface) return null;
    const principal = await this.prisma.$transaction((tx) =>
      this.principals.resolve(tx),
    );
    if (
      !principal ||
      principal.authority.tenantId !== tenantId ||
      principal.authority.userId !== input.actor.userId ||
      principal.role !== input.actor.role
    )
      return null;
    const turn = await this.prisma.$transaction((tx) =>
      TimelineStore.ensureAssistantExecutionTurn(tx, {
        tenantId,
        conversationId: input.userTurn.conversationId,
        parentUserTurnId: input.userTurn.turnId,
        principalProofHash: principal.proofHash,
        channel: 'pwa',
        executionId: preview.id,
      }),
    );
    if (!turn) return null;
    const handles = this.seals.mintNounHandles([
      {
        tenantId,
        noun: 'approval',
        ownerKind: 'schedule_approval',
        ownerRef: preview.id,
      },
      {
        tenantId,
        noun: 'payload',
        ownerKind: 'schedule_approval',
        ownerRef: preview.payload_hash,
      },
    ]);
    const p = preview.payload_preview as Record<string, unknown>;
    const slots = (value: unknown) =>
      Array.isArray(value) && value.length > 0
        ? value
            .map(
              (v) =>
                `${(v as { from: string }).from}–${(v as { to: string }).to}`,
            )
            .join(', ')
        : 'Выходной';
    const body: SettingsDraftBody = {
      draft_ref: preview.id,
      draft_class: 'schedule_rule',
      scope_label: cell(input.reply),
      diff: [
        {
          path: 'schedule.day',
          label: phrase(String(p.date)),
          from: cell(slots(p.current_slots)),
          to: cell(slots(p.proposed_slots)),
          effect_text: phrase(
            'Существующие записи сохраняются; конфликты блокируют изменение.',
          ),
          reversible: cell(false),
          bound_ref: null,
        },
      ],
      apply_intent: 'i1',
      discard_intent: 'i2',
      editor_handoff_intent: 'i3',
    };
    const composerInput: WidgetComposerInput = {
      kind_proposal: 'SETTINGS_DRAFT',
      capability: 'staff.schedule.update',
      capability_version: C9_REGISTRY_HASH,
      source: {
        from: 'capability_envelope',
        capability: 'staff.schedule.update',
        capability_version: C9_REGISTRY_HASH,
        fact_index: 0,
      },
      correlation_refs: {},
      origin: {
        trigger: 'system_reply',
        emitter: 'capability_read',
        moment_key: null,
        proactive_provenance: null,
      },
      facts: [
        {
          capability: 'staff.schedule.update',
          status: 'measured',
          as_of: new Date().toISOString(),
          evidence_refs: [`h_${preview.payload_hash}`],
          completeness: {
            status: 'PARTIAL',
            requestedScopeHash: preview.payload_hash,
            returnedCount: 1,
            totalCount: null,
            hasMore: false,
            cursorRef: null,
            truncated: false,
            reasonCodes: ['NOT_COLLECTED'],
          },
        },
      ],
      facts_origin: ['copied'],
      slots: {},
      limitation_codes: [],
      locale: 'ru-RU',
      intent_proposals: [
        {
          intent_template_key: SCHEDULE_TEMPLATE,
          capability: { space: 'AE', key: SCHEDULE_AE },
          argument_handles: handles,
          role: 'primary',
        },
        {
          intent_template_key: 'control.dismiss@1',
          capability: { space: 'CONTROL', key: 'control.widget.dismiss' },
          role: 'escape',
        },
        {
          intent_template_key: 'handoff.settings@1',
          handoff_capability_ref: { space: 'C9', key: 'settings.read' },
          role: 'handoff',
        },
      ],
    };
    const ttlSeconds = Math.min(
      600,
      Math.floor((preview.expires_at.getTime() - Date.now()) / 1000),
    );
    if (ttlSeconds <= 0) return null;
    const minted = await this.emitter
      .emitScheduleConfirmation(
        {
          tenantId,
          conversationId: input.userTurn.conversationId,
          turnId: turn.id,
          kind: 'SETTINGS_DRAFT',
          principalProofHash: principal.proofHash,
          deliveryChannel: 'pwa',
          body: body as unknown as Record<string, unknown>,
          ttlSeconds,
          freshnessClass: 'live',
          composerInput,
          principal,
        },
        {
          commitIntentIndex: 0,
          confirmationOfKind: 'draft',
          confirmationOfRef: preview.id,
          producedByIntentTokenHash: null,
          idempotencyKey: preview.id,
          requiresReadback: false,
          readbackRef: null,
        },
      )
      .catch((error: unknown) => {
        if (
          error instanceof ForbiddenException &&
          [
            'widget_release_admission',
            'widget_release_profile_unavailable',
          ].includes(error.message)
        )
          return null;
        throw error;
      });
    if (!minted) return null;
    return {
      matched: true,
      receipt: {
        widget_id: minted.widgetId,
        envelope_seal: minted.envelopeSeal,
        envelope: minted.envelope,
      },
      dismiss_widget_id: null,
    };
  }
}
