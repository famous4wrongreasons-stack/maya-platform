import { Injectable } from '@nestjs/common';
import { C8ResultRevision, MeasurementRevision } from '@prisma/client';
import { MeasurementService } from '../measurement/measurement.service';
import { MeasurementIntent } from '../measurement/measurement.contract';
import { C8Store } from './c8.store';
import { C8Sources } from './c8.sources';
import { C8Case } from './c8.evaluation.contract';
import { C8Object, C8Ref, C8Target, c8Hash } from './c8.contract';
import { c8C7Snapshot } from './c8.capture';
import { c8ReadPopulation, C8PopulationQuery } from './c8.population';

export function c8CaseFor(
  prediction: C8ResultRevision,
  state: C8Case['labelState'],
  value: string | null,
  refs: C8Ref[],
  codes: string[],
  clusterSubject?: string,
): C8Case {
  if (!prediction.snapshotHash)
    throw new Error('c8_published_capture_required');
  const clientRef = (prediction.evidenceRefsJson as unknown as C8Ref[]).find(
    (r) => r.owner === 'Client',
  );
  const subjectCluster =
    prediction.subjectKind === 'client'
      ? 'client/' + prediction.subjectId
      : clientRef
        ? 'client/' + clientRef.id
        : prediction.subjectKind + '/' + prediction.subjectId;
  return {
    caseKey: c8Hash([
      'c8.prospective.case/1',
      prediction.tenantId,
      prediction.id,
    ]),
    predictionRef: {
      tenantId: prediction.tenantId,
      id: prediction.id,
      hash: prediction.snapshotHash,
    },
    backtestInputRef: null,
    labelRefs: refs,
    labelState: state,
    labelValue: value,
    exclusionCodes: codes,
    clusterRef: c8Hash([
      'c8.cluster/1',
      prediction.tenantId,
      clusterSubject ?? subjectCluster,
    ]),
    dependencyDeadline: new Date(
      Math.min(
        prediction.expiresAt.getTime(),
        ...refs.map((r) => Date.parse(r.expiresAt!)),
      ),
    ).toISOString(),
  };
}
/** Only later exact C7 facts can qualify a label. Unknown coverage is never a negative event. */
@Injectable()
export class C8LabelCollector {
  constructor(
    private readonly store: C8Store,
    private readonly sources: C8Sources,
    private readonly measurement: MeasurementService,
  ) {}
  async collect(p: C8ResultRevision, now: Date): Promise<C8Case> {
    const tenantId = this.store.tenant();
    if (
      p.tenantId !== tenantId ||
      p.kind !== 'PREDICTION' ||
      !p.horizonEnd ||
      !p.snapshotHash ||
      p.state === 'PENDING' ||
      p.t0 >= now ||
      p.expiresAt <= now
    )
      throw new Error('c8_prospective_label_origin');
    const target = (p.scopeJson as C8Object).targetKey as C8Target;
    const refs = p.evidenceRefsJson as unknown as C8Ref[];
    const clientId =
      p.subjectKind === 'client'
        ? p.subjectId
        : refs.find((r) => r.owner === 'Client')?.id;
    const cluster = clientId ? 'client/' + clientId : undefined;
    const result = (
      state: C8Case['labelState'],
      value: string | null = null,
      labels: C8Ref[] = [],
      codes: string[] = [],
    ) => c8CaseFor(p, state, value, labels, codes, cluster);
    // Limited-data captures deliberately have INSUFFICIENT_DATA while no model is qualified.
    // That does not erase a prospective observation or turn its later exact C7 outcome into a negative.
    // Missing input features remain frozen on the capture; an unsupported source cannot qualify.
    if (p.eligibility === 'UNSUPPORTED')
      return result('EXCLUDED', null, [], ['t0_input_not_eligible']);
    if (clientId) {
      const client = await this.store.transaction((tx) =>
        tx.client.findFirst({
          where: { tenantId, id: clientId, mergedIntoClientId: null },
          select: { id: true },
        }),
      );
      if (!client)
        return result(
          'EXCLUDED',
          null,
          [],
          ['canonical_subject_no_longer_eligible'],
        );
    }
    const scope = p.scopeJson as C8Object,
      branchIds = scope.branchIds as string[],
      serviceScope = scope.serviceScope as string[];
    if (target === 'appointment_no_show') {
      const a = await this.store.transaction((tx) =>
        tx.appointment.findFirst({ where: { tenantId, id: p.subjectId } }),
      );
      const fs = (
        p.inputSnapshotJson as unknown as {
          features: Array<{ key: string; value: unknown }>;
        }
      ).features;
      const start = fs.find((f) => f.key === 'scheduled_start_at')?.value,
        end = fs.find((f) => f.key === 'scheduled_end_at')?.value;
      if (
        !a ||
        a.mayaClientId !== clientId ||
        a.startAt.toISOString() !== start ||
        a.endAt.toISOString() !== end ||
        a.status !== 'confirmed'
      )
        return result(
          'EXCLUDED',
          null,
          [],
          ['appointment_cancelled_reassigned_or_rescheduled'],
        );
      if (now < p.horizonEnd)
        return result('IMMATURE', null, [], ['outcome_not_mature']);
      if (!['arrived', 'no_show'].includes(a.attendance ?? ''))
        return result('UNKNOWN', null, [], ['attendance_not_proven']);
      const m = await this.appointment(
        p,
        a.id,
        clientId,
        (
          await this.store.transaction((tx) =>
            this.sources.subjectRef(tx, 'Appointment', a.id),
          )
        ).revisionOrStateHash,
        now,
      );
      if (!this.binaryMetric(m, a.attendance!))
        return result(
          'UNKNOWN',
          null,
          [],
          ['qualified_attendance_metric_missing'],
        );
      return result('QUALIFIED', a.attendance === 'no_show' ? '1' : '0', [
        this.sources.measurementRef(m),
      ]);
    }
    if (target === 'attended_return') {
      const query: C8PopulationQuery = {
        version: 1,
        tenantId,
        owner: 'Appointment',
        clientId: p.subjectId,
        staffId: null,
        branchIds,
        serviceScope,
        from: new Date(p.t0.getTime() + 1).toISOString(),
        to: new Date(p.horizonEnd.getTime() + 1).toISOString(),
      };
      const population = await this.store.transaction((tx) =>
        c8ReadPopulation(tx, query),
      );
      const arrived = await this.store.transaction((tx) =>
        tx.appointment.findFirst({
          where: {
            tenantId,
            id: { in: population.ids },
            mayaClientId: p.subjectId,
            status: 'confirmed',
            attendance: 'arrived',
            endAt: { lte: now },
          },
          orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
        }),
      );
      if (arrived) {
        const m = await this.appointment(
          p,
          arrived.id,
          p.subjectId,
          (
            await this.store.transaction((tx) =>
              this.sources.subjectRef(tx, 'Appointment', arrived.id),
            )
          ).revisionOrStateHash,
          now,
        );
        if (this.binaryMetric(m, 'arrived'))
          return result('QUALIFIED', '1', [this.sources.measurementRef(m)]);
      }
      if (now < p.horizonEnd)
        return result('IMMATURE', null, [], ['outcome_not_mature']);
      const m = await this.snapshot(
        p,
        { kind: 'client_history', clientId: p.subjectId },
        population.hash,
        now,
      );
      const zero = this.sources
        .metrics(m)
        .some(
          (m) =>
            m.key === 'observed_attended_visits' &&
            m.value === '0' &&
            m.state === 'COMPLETE',
        );
      const label = this.sources.measurementRef(m);
      return m.completeness === 'COMPLETE' && zero
        ? result('QUALIFIED', '0', [label])
        : result(
            'UNKNOWN',
            null,
            [label],
            ['complete_absence_coverage_unavailable'],
          );
    }
    if (now < p.horizonEnd)
      return result('IMMATURE', null, [], ['outcome_not_mature']);
    // Read the existing C7 source owners at the exact prospective window. Identity follows changed evidence, not the poll clock.
    if (['client_expected_value', 'business_revenue'].includes(target)) {
      const input: MeasurementIntent = {
        kind:
          target === 'client_expected_value'
            ? 'client_history'
            : 'business_period',
        ...(target === 'client_expected_value'
          ? { clientId: p.subjectId }
          : {}),
        ...(p.subjectKind === 'branch' ? { branchId: p.subjectId } : {}),
        periodFrom: p.t0,
        periodTo: p.horizonEnd,
        timezone: p.timezone,
        asOf: now,
        scope: {
          version: 1,
          capabilityKey: 'measurement.read',
          branchIds,
          dimensions: {},
          sourceQuery: {},
        },
      };
      const facts = await this.measurement.observe(input);
      await c8C7Snapshot(
        this.measurement,
        input,
        c8Hash([
          'c8.later-monetary-label/1',
          p.id,
          facts.sources.map((s) => [s.owner, s.id, s.stateHash]),
          facts.metrics,
        ]),
      );
    }
    // Independently published C7 labels are eligible only for the exact frozen scope/horizon.
    const candidates = await this.store.transaction((tx) =>
      tx.measurementRevision.findMany({
        where: {
          tenantId,
          state: 'PUBLISHED',
          qualification: 'VERIFIED',
          completeness: 'COMPLETE',
          publishedAt: { gt: p.t0, lte: now },
          asOf: { gte: p.horizonEnd!, lte: now },
          expiresAt: { gt: now },
          periodFrom: p.t0,
          periodTo: p.horizonEnd!,
          ...(p.subjectKind === 'client'
            ? { clientId: p.subjectId }
            : p.subjectKind === 'staff'
              ? { staffId: p.subjectId }
              : p.subjectKind === 'branch'
                ? { branchId: p.subjectId }
                : { clientId: null, appointmentId: null, staffId: null }),
        },
        orderBy: { publishedAt: 'desc' },
        take: 100,
      }),
    );
    for (const m of candidates) {
      const ms = m.scopeJson as C8Object;
      if (c8Hash(ms.branchIds) !== c8Hash(branchIds) || serviceScope.length)
        continue;
      const keys: Record<string, string[]> = {
        client_expected_value: [
          'confirmed_cash',
          'confirmed_refunds',
          'confirmed_cash_net_linked_refunds',
        ],
        business_revenue: [
          'confirmed_cash',
          'confirmed_refunds',
          'confirmed_cash_net_linked_refunds',
        ],
        staff_earnings_conditional: ['confirmed_staff_salary_accrued'],
        observed_booking_demand: ['canonical_created_booking_count'],
        scheduled_utilization: ['scheduled_utilization'],
        statistical_deviation: [],
      };
      const metric = this.sources
        .metrics(m)
        .find(
          (v) =>
            (keys[target] ?? []).includes(String(v.key)) &&
            v.basis === p.basis &&
            v.currency === p.currency &&
            v.state === 'COMPLETE' &&
            typeof v.value === 'string' &&
            /^-?(0|[1-9]\d*)(\.\d+)?$/.test(v.value),
        );
      if (!metric) continue;
      const ref = this.sources.measurementRef(m);
      const valid = await this.store.transaction(async (tx) => {
        const [r] = await tx.$queryRaw<
          { valid: boolean }[]
        >`SELECT "C8_validate_refs"(${tenantId},${JSON.stringify([ref])}::jsonb,${now}) valid`;
        return r.valid;
      });
      if (valid) return result('QUALIFIED', String(metric.value), [ref]);
    }
    return result(
      'UNKNOWN',
      null,
      [],
      ['exact_qualified_target_label_unavailable'],
    );
  }
  private binaryMetric(m: MeasurementRevision, value: string) {
    return (
      m.state === 'PUBLISHED' &&
      m.qualification === 'VERIFIED' &&
      this.sources
        .metrics(m)
        .some(
          (v) =>
            v.state === 'COMPLETE' &&
            ((v.key === 'attendance' && v.value === value) ||
              (v.key === 'current_attended_outcome' &&
                v.value === (value === 'arrived'))),
        )
    );
  }
  private appointment(
    p: C8ResultRevision,
    id: string,
    clientId: string,
    hash: string,
    now: Date,
  ) {
    return this.snapshot(
      p,
      { kind: 'appointment_outcome', appointmentId: id, clientId },
      hash,
      now,
    );
  }
  private snapshot(
    p: C8ResultRevision,
    subject: Pick<MeasurementIntent, 'kind' | 'appointmentId' | 'clientId'>,
    sourceHash: string,
    now: Date,
  ) {
    const scope = p.scopeJson as C8Object;
    return c8C7Snapshot(
      this.measurement,
      {
        ...subject,
        periodFrom: p.t0,
        periodTo: new Date(p.horizonEnd!.getTime() + 1),
        timezone: p.timezone,
        asOf: now,
        scope: {
          version: 1,
          capabilityKey: 'measurement.read',
          branchIds: scope.branchIds as string[],
          dimensions: {},
          sourceQuery: {},
        },
      },
      c8Hash(['c8.later-label/1', p.id, subject, sourceHash]),
      p.t0,
    );
  }
}
