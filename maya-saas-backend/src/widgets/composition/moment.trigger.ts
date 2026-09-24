import { Inject, Injectable } from '@nestjs/common';

import type { OperationalAlertWidgetTriggerPort } from '../../operational-alerts/operational-alert-widget-trigger.port';
import { C9_REGISTRY_HASH } from '../../orchestration/c9.registry';
import { PrismaService } from '../../prisma/prisma.service';
import type { Cell, FactUsed, Measure } from '../../widget-contract/envelope';
import type { ScheduleBody } from '../../widget-contract/kinds';
import type { ProactiveProvenance } from '../../widget-contract/lifecycle';
import { PRINCIPAL_RESOLVER, GATE6_OWNERS } from '../di-tokens';
import { stableActionJson } from '../authority/contract-bindings';
import type { PrincipalResolver } from '../authority/principal-view';
import type { Gate6Owners } from '../owner-ports/gate6.owners.provider';
import { WidgetEmitterService } from '../emission/emitter.service';
import { WidgetStoresService } from '../stores/widget-stores.service';
import { sha256Hex } from '../token.util';
import {
  assertCellsNotNewerThanArtefact,
  assertArtefactPredates,
  assertNarrativeProvenance,
  assertNoAcknowledgementAffordance,
  assertNoRunOpening,
  assertProactiveCeiling,
} from '../proactive/provenance';
import type { MomentCompositionInput } from '../proactive/moments';
import { composeOrSuppress } from '../proactive/suppression';

type ShiftInput = Parameters<
  OperationalAlertWidgetTriggerPort['afterShiftAdmitted']
>[0];

const exact = (value: object, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
};

const evidence = (hash: string) => [
  {
    ref: `h_${hash}`,
    class: 'source_receipt' as const,
    dereferenceable_until: null,
  },
];

const cell = <T>(value: T, label: string, fact: FactUsed): Cell<T> => ({
  state: 'KNOWN',
  value,
  label,
  reason_code: null,
  fact_ref: 0,
  as_of: fact.as_of,
  evidence_refs: evidence(fact.evidence_refs[0].slice(2)),
  next_intent_ref: null,
});

const startsAt = (value: string, fact: FactUsed): Measure => ({
  ...cell(value, value, fact),
  key: 'shift.starts_at',
  unit: 'datetime',
  basis_key: 'staff.schedule.read',
  basis: 'Canonical staff schedule',
  currency: null,
  formatted: value,
  comparison: null,
});

/** Exact final-body check. Composition facts never become an untyped hidden widget payload. */
export const assertShiftScheduleBody: (
  body: unknown,
) => asserts body is ScheduleBody = (body) => {
  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body) ||
    !exact(body, [
      'range',
      'timezone',
      'lanes',
      'buckets',
      'entries',
      'gaps',
      'detail_intent',
    ])
  )
    throw new Error('shift reminder final body schema violation');
  const value = body as Record<string, unknown>;
  if (
    typeof value.timezone !== 'string' ||
    value.detail_intent !== 'i1' ||
    !Array.isArray(value.lanes) ||
    value.lanes.length !== 1 ||
    !Array.isArray(value.buckets) ||
    value.buckets.length !== 1 ||
    !Array.isArray(value.entries) ||
    value.entries.length !== 1 ||
    !Array.isArray(value.gaps) ||
    value.gaps.length !== 0
  )
    throw new Error('shift reminder final body schema violation');
};

const scheduleBody = (input: ShiftInput, fact: FactUsed): ScheduleBody => {
  const bucketId = 'reminder-window';
  const label = cell('Ваша смена', 'Ваша смена', fact);
  const state = cell<'BOOKED'>('BOOKED', 'Смена запланирована', fact);
  const body: ScheduleBody = {
    range: { from: input.occurredAt, to: input.expiresAt },
    timezone: input.source.timezone,
    lanes: [{ lane_id: 'own-shift', label, staff_ref: null }],
    buckets: [
      {
        bucket_id: bucketId,
        start: input.occurredAt,
        end: input.expiresAt,
      },
    ],
    entries: [
      {
        entry_ref: input.occurrenceRef,
        lane_id: 'own-shift',
        bucket_span: [bucketId, bucketId],
        title: cell('Начало смены', 'Начало смены', fact),
        subtitle: cell(
          input.source.scheduledStartAt,
          input.source.scheduledStartAt,
          fact,
        ),
        state,
        pii_masked: false,
        detail_intent: 'i1',
        move_intent: null,
        move_targets: null,
      },
    ],
    gaps: [],
    detail_intent: 'i1',
  };
  assertShiftScheduleBody(body);
  return body;
};

@Injectable()
export class MomentTriggerService implements OperationalAlertWidgetTriggerPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: WidgetEmitterService,
    private readonly stores: WidgetStoresService,
    @Inject(GATE6_OWNERS) private readonly gate6: Gate6Owners,
    @Inject(PRINCIPAL_RESOLVER) private readonly principals: PrincipalResolver,
  ) {}

  async afterShiftAdmitted(input: ShiftInput, now = new Date()) {
    if (now.getTime() >= Date.parse(input.expiresAt)) return null;
    const principal = await this.prisma.$transaction((tx) =>
      this.principals.resolve(tx),
    );
    if (
      principal === null ||
      principal.authority.tenantId !== input.tenantId ||
      principal.authority.userId !== input.recipient.userId
    )
      return null;
    if (
      !(await this.gate6.grantsRequiredFeatures(input.tenantId, [
        'widgets.runtime',
      ]))
    )
      return null;

    const prior = await this.prisma.widgetEmission.findFirst({
      where: {
        tenantId: input.tenantId,
        deliveryChannel: 'web-push',
        turn: { conversationId: input.runId, turnIndex: 0 },
      },
      select: { widgetId: true },
    });
    if (prior) return prior;

    const completeness = {
      status: 'COMPLETE' as const,
      requestedScopeHash: sha256Hex(
        stableActionJson({
          tenantId: input.tenantId,
          occurrenceRef: input.occurrenceRef,
        }),
      ),
      returnedCount: 1,
      totalCount: 1,
      hasMore: false,
      cursorRef: null,
      truncated: false,
      reasonCodes: [],
    };
    const fact: FactUsed = {
      capability: 'staff.schedule.read',
      status: 'measured',
      as_of: input.occurredAt,
      evidence_refs: [`h_${input.source.scheduleEvidenceHash}`],
      completeness,
      basis: 'staff.schedule.read',
      currency: null,
    };
    const start = startsAt(input.source.scheduledStartAt, fact);
    const compositionInput: MomentCompositionInput = {
      contract: 'maya.moment-composition-input/1',
      moment_key: 'shift_reminder',
      moment_template_key: 'mt.shift_reminder@1',
      producer: 'canonical_owner',
      source_owner: { space: 'C9', key: 'staff.schedule.read' },
      artefact_ref: input.occurrenceRef,
      artefact_kind: 'shift',
      artefact_created_at: input.occurredAt,
      inputs: { starts_at: start },
    };
    const dedupeKey = sha256Hex(
      stableActionJson({
        tenantId: input.tenantId,
        moment: 'shift_reminder',
        occurrenceRef: input.occurrenceRef,
        recipient: input.recipient.userId,
      }),
    );
    const outcome = composeOrSuppress({
      momentKey: 'shift_reminder',
      compositionInput,
      dedupeKey,
      subjectPrincipalProofHash: principal.proofHash,
      now,
    });
    if (!outcome.emit) {
      await this.prisma.widgetSuppressedEmission.upsert({
        where: {
          tenantId_dedupeKey_moment: {
            tenantId: input.tenantId,
            dedupeKey,
            moment: outcome.row.moment,
          },
        },
        create: {
          tenantId: input.tenantId,
          moment: outcome.row.moment,
          momentTemplateKey: outcome.row.momentTemplateKey,
          dedupeKey,
          suppressedAt: new Date(outcome.row.suppressedAt),
          unresolvedCells: [...outcome.row.unresolvedCells],
          subjectPrincipalProofHash: outcome.row.subjectPrincipalProofHash,
        },
        update: {},
      });
      return null;
    }

    const provenance: ProactiveProvenance = {
      artefact_ref: input.occurrenceRef,
      artefact_kind: 'shift',
      artefact_created_at: input.occurredAt,
      narrative_source: 'stored_artefact',
      narrative_hash: sha256Hex(input.recipient.bodyText),
      moment_template_id: null,
      moment_template_version: null,
      notify_pref_key: 'notify.staff.shifts',
    };
    const canonicalArtefact = {
      artefact_ref: input.occurrenceRef,
      artefact_kind: 'shift' as const,
      created_at: input.occurredAt,
      narrative: input.recipient.bodyText,
    };
    assertArtefactPredates(provenance, canonicalArtefact, now.toISOString());
    assertCellsNotNewerThanArtefact([start], input.occurredAt);
    assertNarrativeProvenance(
      provenance,
      'shift_reminder',
      null,
      canonicalArtefact,
    );
    // PR1 caps the moment's business effect. The mandatory priority-zero
    // CONTROL dismiss is the non-RICH escape, validated separately below.
    assertProactiveCeiling(['NAVIGATE']);
    assertNoRunOpening([
      null,
      { space: 'CONTROL', key: 'control.widget.dismiss' },
    ]);
    assertNoAcknowledgementAffordance(
      'shift_reminder',
      [{ effect: 'NAVIGATE' }, { effect: 'CONTROL' }],
      [],
    );

    const body = scheduleBody(input, fact);
    const turn = await this.stores.ensureAssistantTurn(
      {
        tenantId: input.tenantId,
        conversationId: input.runId,
        turnIndex: 0,
        principalProofHash: principal.proofHash,
        channel: 'web-push',
        textContent: input.recipient.title,
        spokenTranscript: null,
      },
      now,
    );
    if (turn.principalProofHash !== principal.proofHash) return null;
    return this.emitter.emit(
      {
        tenantId: input.tenantId,
        conversationId: input.runId,
        turnId: turn.id,
        kind: 'SCHEDULE',
        principalProofHash: principal.proofHash,
        deliveryChannel: 'web-push',
        body: body as unknown as Record<string, unknown>,
        ttlSeconds: Math.max(
          1,
          Math.floor((Date.parse(input.expiresAt) - now.getTime()) / 1000),
        ),
        freshnessClass: 'proactive_once',
        piiClass: 'none',
        principal,
        composerInput: {
          kind_proposal: 'SCHEDULE',
          capability: 'staff.schedule.read',
          capability_version: C9_REGISTRY_HASH,
          source: {
            from: 'capability_envelope',
            capability: 'staff.schedule.read',
            capability_version: C9_REGISTRY_HASH,
            fact_index: 0,
          },
          correlation_refs: {},
          origin: {
            trigger: 'proactive',
            emitter: 'scheduler',
            moment_key: 'shift_reminder',
            proactive_provenance: provenance,
          },
          facts: [fact],
          facts_origin: ['copied'],
          slots: { starts_at: { from: 'fact', fact_index: 0 } },
          limitation_codes: [],
          intent_proposals: [
            {
              intent_template_key: 'navigate.schedule@1',
              role: 'primary',
            },
            {
              intent_template_key: 'control.dismiss@1',
              capability: {
                space: 'CONTROL',
                key: 'control.widget.dismiss',
              },
              role: 'escape',
            },
          ],
          locale: 'ru-RU',
        },
      },
      now,
    );
  }
}
