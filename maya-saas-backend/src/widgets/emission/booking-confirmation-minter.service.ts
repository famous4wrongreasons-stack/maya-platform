import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { C9_REGISTRY_HASH } from '../../orchestration/c9.registry';
import type {
  Cell,
  Measure,
  Phrase,
  WidgetComposerInput,
} from '../../widget-contract/envelope';
import type { BookingConfirmationBody } from '../../widget-contract/kinds';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  BookingConfirmationMintInput,
  BookingConfirmationMinterPort,
} from '../booking/booking-confirmation-minter.port';
import { WidgetEmitterService } from './emitter.service';

const phrase = (rendered: string): Phrase => ({
  phrase_key: 'booking.confirmation',
  rendered,
});
const cell = (value: string, label = value): Cell<string> => ({
  state: 'KNOWN',
  value,
  label,
  reason_code: null,
  fact_ref: 0,
  as_of: null,
  evidence_refs: [],
  next_intent_ref: null,
});
const measure = (args: {
  key: string;
  value: string | number;
  unit: Measure['unit'];
  currency?: string | null;
  formatted: string;
}): Measure => ({
  state: 'KNOWN',
  value: args.value,
  label: args.formatted,
  reason_code: null,
  fact_ref: 0,
  as_of: null,
  evidence_refs: [],
  next_intent_ref: null,
  key: args.key,
  unit: args.unit,
  basis_key: null,
  basis: 'Canonical booking owner',
  currency: args.currency ?? null,
  formatted: args.formatted,
  comparison: null,
});

const unknownMoneyMeasure = (currency: string): Measure => ({
  state: 'NOT_MEASURED',
  value: null,
  label: 'Not measured',
  reason_code: 'NOT_COLLECTED',
  fact_ref: null,
  as_of: null,
  evidence_refs: [],
  next_intent_ref: null,
  key: 'booking.price',
  unit: 'RUB',
  basis_key: null,
  basis: 'Canonical booking owner',
  currency,
  formatted: 'Not measured',
  comparison: null,
});

const templateFor = (
  subject: BookingConfirmationBody['confirmation_subject'],
) => `commit.booking.${subject}@1`;
const aeFor = (subject: BookingConfirmationBody['confirmation_subject']) =>
  `crm.appointment.${subject}.v1`;

@Injectable()
export class BookingConfirmationMinterService implements BookingConfirmationMinterPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: WidgetEmitterService,
  ) {}

  async mint(
    input: BookingConfirmationMintInput,
  ): Promise<Readonly<Record<string, unknown>>> {
    const source = await this.prisma.widgetEmission.findFirst({
      where: { tenantId: input.tenantId, widgetId: input.predecessorWidgetId },
      select: { turnId: true },
    });
    if (!source) throw new Error('BOOKING_PREDECESSOR_NOT_FOUND');
    const p = input.preview;
    if ((p.subject === 'create') !== (p.draftRef !== null))
      throw new Error('BOOKING_DRAFT_LINKAGE_INVALID');
    if ((p.subject !== 'create') !== (p.appointmentRef !== null))
      throw new Error('BOOKING_RECORD_LINKAGE_INVALID');
    if ((p.subject !== 'create') !== (p.producingIntentTokenHash !== null))
      throw new Error('BOOKING_PRODUCING_RECORD_INVALID');

    const commitRef = 'i1';
    const dismissRef = 'i2';
    const body: BookingConfirmationBody = {
      confirmation_subject: p.subject,
      draft_ref: p.draftRef,
      appointment_ref: p.appointmentRef,
      lines: [
        {
          label: phrase(p.serviceLabel),
          detail: cell(p.serviceLabel),
          measures: [],
        },
      ],
      when: measure({
        key: 'booking.when',
        value: p.when,
        unit: 'datetime',
        formatted: p.when,
      }),
      when_previous:
        p.whenPrevious === null
          ? null
          : measure({
              key: 'booking.when.previous',
              value: p.whenPrevious,
              unit: 'datetime',
              formatted: p.whenPrevious,
            }),
      staff_label: cell(p.staffLabel),
      duration_total: measure({
        key: 'booking.duration',
        value: p.durationMinutes,
        unit: 'minutes',
        formatted: `${p.durationMinutes} min`,
      }),
      price_total:
        p.priceKopecks === null
          ? unknownMoneyMeasure(p.currency)
          : measure({
              key: 'booking.price',
              value: p.priceKopecks / 100,
              unit: 'RUB',
              currency: p.currency,
              formatted: `${p.priceKopecks / 100} ${p.currency}`,
            }),
      price_delta: null,
      refund_preview: null,
      loyalty_applied: null,
      policy_notices: [],
      commit_intent: commitRef,
      amend_intents: [],
      dismiss_intent: dismissRef,
    };
    const composerInput: WidgetComposerInput = {
      kind_proposal: 'BOOKING_CONFIRMATION',
      capability: p.sourceCapabilityKey,
      capability_version: C9_REGISTRY_HASH,
      source: {
        from: 'capability_envelope',
        capability: p.sourceCapabilityKey,
        capability_version: C9_REGISTRY_HASH,
        fact_index: 0,
      },
      correlation_refs: { parent_id: input.predecessorWidgetId },
      origin: {
        trigger: 'system_reply',
        emitter: 'capability_read',
        moment_key: null,
        proactive_provenance: null,
      },
      facts: [p.fact],
      facts_origin: ['copied'],
      slots: {},
      limitation_codes: [],
      intent_proposals: [
        {
          intent_template_key: templateFor(p.subject),
          capability: { space: 'AE', key: aeFor(p.subject) },
          argument_handles: p.frozenArgumentHandles,
          role: 'primary',
        },
        {
          intent_template_key: 'control.dismiss@1',
          capability: { space: 'CONTROL', key: 'control.widget.dismiss' },
          role: 'escape',
        },
      ],
      locale: 'ru-RU',
    };
    const minted = await this.emitter.emitBookingConfirmation(
      {
        tenantId: input.tenantId,
        conversationId: input.predecessorWidgetId,
        turnId: source.turnId,
        kind: 'BOOKING_CONFIRMATION',
        principalProofHash: input.principal.proofHash,
        deliveryChannel: input.deliveryChannel,
        body: body as unknown as Record<string, unknown>,
        ttlSeconds: 600,
        freshnessClass: 'live',
        composerInput,
        principal: input.principal,
      },
      {
        commitIntentIndex: 0,
        confirmationOfKind: p.subject === 'create' ? 'draft' : 'record',
        confirmationOfRef: p.draftRef ?? p.appointmentRef ?? '',
        producedByIntentTokenHash: p.producingIntentTokenHash,
        idempotencyKey: randomUUID(),
        requiresReadback: false,
        readbackRef: null,
      },
      input.now,
    );
    return minted.envelope;
  }
}
