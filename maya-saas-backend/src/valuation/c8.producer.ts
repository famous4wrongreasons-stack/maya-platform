import { Injectable } from '@nestjs/common';
import { C8ResultRevision } from '@prisma/client';
import { MeasurementService } from '../measurement/measurement.service';
import { C8Store, C8PreparedResult } from './c8.store';
import { C8Sources } from './c8.sources';
import { C8CaptureService, c8C7Snapshot } from './c8.capture';
import {
  C8Object,
  C8Ref,
  C8Feature,
  C8Target,
  c8Hash,
  c8Id,
  C8_BASES,
} from './c8.contract';
import { c8Eligibility } from './c8.eligibility';
import { c8ShiftWindow } from './c8.time';
import { c8ComputeDeterministic } from './c8.deterministic';
import { C8_TARGET_DEFINITIONS } from './c8.targets';
import { C8PopulationQuery } from './c8.population';
export type C8ComputeRequest = {
  subjectKind: 'client' | 'appointment' | 'staff' | 'tenant' | 'branch';
  subjectId: string;
  capability: string;
  branchIds: string[];
};
/** Server-selected C7 facts, policy and clock. No consumer can upload a feature, score or past T0. */
@Injectable()
export class C8Producer {
  constructor(
    private readonly store: C8Store,
    private readonly sources: C8Sources,
    private readonly capture: C8CaptureService,
    private readonly measurement: MeasurementService,
  ) {}
  async compute(
    request: C8ComputeRequest,
    serverCutoff?: Date,
    reuseOpenTarget = false,
  ): Promise<C8ResultRevision> {
    const tenantId = this.store.tenant();
    c8Id(request.subjectId);
    const policy = await this.store.transaction((tx) =>
      this.sources.policy(tx),
    );
    const scope = await this.sources.scope(tenantId);
    const tenant = await this.store.transaction((tx) =>
      tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { defaultTimezone: true, calendarSource: true },
      }),
    );
    const timezone = tenant.defaultTimezone;
    if (!timezone) throw new Error('c8_exact_timezone_required');
    const requestedBranches =
      request.subjectKind === 'branch'
        ? [request.subjectId]
        : request.branchIds;
    const branchIds = [...new Set(requestedBranches)].sort();
    if (branchIds.length > 100 || branchIds.length !== requestedBranches.length)
      throw new Error('c8_exact_branch_scope');
    for (const id of branchIds)
      if (
        !(await this.store.transaction((tx) =>
          tx.branch.findFirst({
            where: { id, tenantId },
            select: { id: true },
          }),
        ))
      )
        throw new Error('c8_wrong_branch');
    if (request.subjectKind === 'tenant' && request.subjectId !== tenantId)
      throw new Error('c8_wrong_tenant');
    const subjectOwner =
      request.subjectKind === 'client'
        ? 'Client'
        : request.subjectKind === 'appointment'
          ? 'Appointment'
          : request.subjectKind === 'staff'
            ? 'Staff'
            : request.subjectKind === 'branch'
              ? 'Branch'
              : null;
    const refs: C8Ref[] = subjectOwner
      ? [
          await this.store.transaction((tx) =>
            this.sources.subjectRef(tx, subjectOwner, request.subjectId),
          ),
        ]
      : [];
    const [family, key] = request.capability.split('/');
    if (!key || request.capability.split('/').length !== 2)
      throw new Error('c8_capability_required');
    const list =
      family === 'value'
        ? 'valueMeasures'
        : family === 'dormancy'
          ? 'dormancyRules'
          : family === 'prediction'
            ? 'predictionTargets'
            : null;
    const rule = list
      ? (policy.content[list] as C8Object[]).find(
          (r) => (r.key ?? r.ruleKey ?? r.targetKey) === key,
        )
      : null;
    if (!rule && request.capability !== 'scenario/booked_appointment')
      throw new Error('c8_confirmed_rule_unavailable');
    if (
      ['value', 'dormancy'].includes(family) &&
      request.subjectKind !== 'client'
    )
      throw new Error('c8_client_capability_scope');
    if (family === 'scenario' && request.subjectKind !== 'appointment')
      throw new Error('c8_scenario_scope_required');
    const target = family === 'prediction' ? (key as C8Target) : null;
    if (target) {
      const expected = ['attended_return', 'client_expected_value'].includes(
        target,
      )
        ? 'client'
        : target === 'appointment_no_show'
          ? 'appointment'
          : target === 'staff_earnings_conditional'
            ? 'staff'
            : null;
      if (
        (expected && request.subjectKind !== expected) ||
        (!expected && !['tenant', 'branch'].includes(request.subjectKind))
      )
        throw new Error('c8_target_subject_mismatch');
      if (!C8_TARGET_DEFINITIONS[target])
        throw new Error('c8_target_unsupported');
    }
    const services = (rule?.serviceScope as string[] | undefined) ?? [];
    const exclusions = policy.content.exclusions as C8Object;
    if (
      (!branchIds.length && (exclusions.branchIds as string[]).length) ||
      (!services.length && (exclusions.serviceScope as string[]).length)
    )
      throw new Error('c8_explicit_nonexcluded_scope_required');
    if (
      branchIds.some((id) => (exclusions.branchIds as string[]).includes(id)) ||
      services.some((id) => (exclusions.serviceScope as string[]).includes(id))
    )
      throw new Error('c8_policy_scope_excluded');
    const cutoff = serverCutoff ?? new Date();
    if (cutoff > new Date())
      throw new Error('c8_current_server_cutoff_required');
    let from: Date;
    if (rule?.window) from = c8ShiftWindow(cutoff, rule.window, timezone, -1);
    else {
      // Known stored coverage starts at its actual earliest observation, never a made-up model feature window.
      const first = await this.store.transaction((tx) =>
        tx.appointment.aggregate({
          where: {
            tenantId,
            ...(request.subjectKind === 'client'
              ? { mayaClientId: request.subjectId }
              : {}),
            ...(request.subjectKind === 'staff'
              ? { staffId: request.subjectId }
              : {}),
            ...(branchIds.length ? { branchId: { in: branchIds } } : {}),
            startAt: { lt: cutoff },
          },
          _min: { startAt: true },
        }),
      );
      from = first._min.startAt ?? new Date(cutoff.getTime() - 1); // empty query interval, explicitly unknown coverage
    }
    const basis =
      family === 'dormancy'
        ? 'proven_attendance_policy'
        : typeof rule?.basis === 'string'
          ? rule.basis
          : 'booked_value';
    let currency = (rule?.currency ?? null) as string | null;
    let features: C8Feature[] = [],
      coverage: C8Object = { version: 1, state: 'PARTIAL', queries: [] };
    let unsupported =
      services.length > 0 && tenant.calendarSource !== 'internal';
    let horizonEnd: Date | null = null;
    let modelVersionId: string | null = null,
      modelManifestHash: string | null = null;
    let appointment: Awaited<ReturnType<C8Producer['appointment']>> | null =
      null;
    if (request.subjectKind === 'appointment') {
      appointment = await this.appointment(
        request.subjectId,
        from,
        cutoff,
        timezone,
        branchIds,
      );
      if (
        services.length &&
        (appointment.source !== 'internal' ||
          !Array.isArray(appointment.serviceIds) ||
          !services.some((id) =>
            (appointment!.serviceIds as string[]).includes(id),
          ))
      )
        unsupported = true;
      refs.push(...appointment.refs);
      features = appointment.features;
      horizonEnd = appointment.endAt;
      if (
        appointment.startAt <= cutoff ||
        horizonEnd <= cutoff ||
        appointment.status !== 'confirmed'
      )
        throw new Error('c8_existing_future_appointment_required');
      if (family === 'scenario') currency = appointment.currency;
    } else {
      const query: C8PopulationQuery = {
        version: 1,
        tenantId,
        owner: 'Appointment',
        clientId: request.subjectKind === 'client' ? request.subjectId : null,
        staffId: request.subjectKind === 'staff' ? request.subjectId : null,
        branchIds:
          request.subjectKind === 'branch' ? [request.subjectId] : branchIds,
        serviceScope: services,
        from: from.toISOString(),
        to: cutoff.toISOString(),
      };
      const captured = await this.capture.appointments(
        query,
        timezone,
        cutoff,
        currency,
      );
      refs.push(...captured.refs);
      features = captured.features;
      coverage = captured.coverage;
      unsupported ||= captured.unsupported;
    }
    if (target) {
      const definition = C8_TARGET_DEFINITIONS[target];
      if (
        ['client_expected_value', 'business_revenue'].includes(target) &&
        (!C8_BASES.includes(basis as (typeof C8_BASES)[number]) || !currency)
      )
        throw new Error('c8_target_monetary_basis_required');
      if (
        target === 'appointment_no_show' &&
        (!appointment ||
          (rule!.horizon as C8Object).unit !== 'appointment_outcome')
      )
        throw new Error('c8_exact_appointment_horizon');
      if (target !== 'appointment_no_show')
        horizonEnd = c8ShiftWindow(cutoff, rule!.horizon, timezone, 1);
      if (horizonEnd!.getTime() - cutoff.getTime() > 365 * 86400000)
        throw new Error('c8_horizon_outside_retained_evidence');
      if (target === 'staff_earnings_conditional') unsupported = true; // No canonical compensation-terms source: no .5 fallback.
      if (
        target === 'scheduled_utilization' &&
        !features.some((f) => f.key === 'available_minutes' && f.value !== null)
      )
        unsupported = true;
      if (
        target === 'observed_booking_demand' &&
        !features.some((f) => f.key === 'observed_booking_created_count')
      )
        unsupported = true;
      const model = await this.store.admitDefinition(
        {
          version: 1,
          targetKey: target,
          eventDefinition: definition.event,
          horizon: rule!.horizon,
          basis,
          currency,
          unit: definition.label,
          labelMaturity: definition.maturity,
          requiredCoverage: 'COMPLETE',
          conditioning:
            target === 'staff_earnings_conditional'
              ? 'independently_known_compensation_terms'
              : null,
        },
        { ...scope, branchIds, serviceScope: services },
      );
      modelVersionId = model.id;
      modelManifestHash = model.manifestHash;
    }
    const t0 = new Date();
    if (target && target !== 'appointment_no_show')
      horizonEnd = c8ShiftWindow(t0, rule!.horizon, timezone, 1);
    if (horizonEnd && horizonEnd <= t0)
      throw new Error('c8_horizon_already_passed');
    const required =
      family === 'value'
        ? [basis]
        : family === 'dormancy'
          ? ['last_proven_visit_at']
          : family === 'scenario'
            ? ['booked_value']
            : [];
    const eligibility = c8Eligibility({
      tenantId,
      t0,
      features,
      policy: policy.content,
      requiredFeatures: [
        ...required,
        ...(exclusions.requiredFeatures as string[]),
      ],
      providerSupported: !unsupported,
      coverage: 'PARTIAL',
      timezone,
      ...(target ? { target } : {}),
    });
    if (
      family === 'dormancy' &&
      rule?.minimumCoverage === 'COMPLETE' &&
      features
        .find((f) => f.key === 'last_proven_visit_at')
        ?.sourceRefs.some((r) => r.coverage !== 'COMPLETE')
    ) {
      eligibility.eligibility = 'INSUFFICIENT_DATA';
      eligibility.missingness.push('complete_absence_coverage_unavailable');
    }
    const allRefs = [...new Map(refs.map((r) => [c8Hash(r), r])).values()];
    const prepared: C8PreparedResult = {
      kind:
        family === 'value'
          ? 'OBSERVED_VALUE'
          : family === 'dormancy'
            ? 'POLICY_SIGNAL'
            : family === 'prediction'
              ? 'PREDICTION'
              : 'SCENARIO',
      subjectKind: request.subjectKind,
      subjectId: request.subjectId,
      ruleKey: 'c8.' + request.capability,
      ruleVersion: 1,
      t0,
      periodFrom: from,
      periodTo: cutoff,
      timezone,
      horizonEnd,
      policyRevisionId: policy.id,
      policyContentHash: policy.hash,
      scopeJson: {
        version: 1,
        capabilityKey: 'c8.' + family,
        branchIds,
        serviceScope: services,
        staffScope: request.subjectKind === 'staff' ? [request.subjectId] : [],
        providerCapability: scope.providerCapability,
        featureContractHash: c8Hash(['c8.c7-qualified-observations/1']),
        targetKey: target,
        targetContractHash: target
          ? c8Hash(C8_TARGET_DEFINITIONS[target])
          : null,
        cohortDefinitionHash: null,
      },
      basis,
      currency,
      inputSnapshotJson: {
        version: 1,
        features: features,
        missingness: eligibility.missingness,
        coverage,
        dependencies: [],
      },
      evidenceRefsJson: allRefs,
      completeness: 'PARTIAL',
      qualification:
        basis === 'provider_reported_gross' ? 'SOURCE_LABELLED' : 'VERIFIED',
      eligibility: eligibility.eligibility,
      modelVersionId,
      modelManifestHash,
    };
    const result = await this.store.admitResult(prepared, reuseOpenTarget);
    return this.resume(result.id);
  }
  private async appointment(
    id: string,
    from: Date,
    to: Date,
    timezone: string,
    branchIds: string[],
  ) {
    const tenantId = this.store.tenant();
    const a = await this.store.transaction((tx) =>
      tx.appointment.findFirstOrThrow({
        where: { id, tenantId },
        select: {
          id: true,
          mayaClientId: true,
          startAt: true,
          endAt: true,
          status: true,
          currency: true,
          branchId: true,
          serviceIds: true,
          source: true,
        },
      }),
    );
    if (
      !a.mayaClientId ||
      (branchIds.length && (!a.branchId || !branchIds.includes(a.branchId)))
    )
      throw new Error('c8_appointment_client_branch');
    const refs = await this.store.transaction(async (tx) => [
      await this.sources.subjectRef(tx, 'Appointment', id),
      await this.sources.subjectRef(tx, 'Client', a.mayaClientId!),
    ]);
    const s = await c8C7Snapshot(
      this.measurement,
      {
        kind: 'appointment_outcome',
        clientId: a.mayaClientId,
        appointmentId: id,
        periodFrom: from,
        periodTo: to,
        asOf: to,
        timezone,
        scope: {
          version: 1,
          capabilityKey: 'measurement.read',
          branchIds,
          dimensions: {},
          sourceQuery: {},
        },
      },
      c8Hash(['c8.future-appointment/1', id, refs, to.toISOString()]),
    );
    const ref = this.sources.measurementRef(s);
    refs.push(ref);
    const booked = this.sources
      .metrics(s)
      .find(
        (m) =>
          m.key === 'booked_value' &&
          m.state === 'COMPLETE' &&
          m.currency === a.currency &&
          typeof m.value === 'string',
      );
    const features: C8Feature[] = [
      {
        key: 'scheduled_start_at',
        value: a.startAt.toISOString(),
        unit: 'instant',
        basis: 'canonical_schedule',
        currency: null,
        sourceRefs: [refs[0]],
      },
      {
        key: 'scheduled_end_at',
        value: a.endAt.toISOString(),
        unit: 'instant',
        basis: 'canonical_schedule',
        currency: null,
        sourceRefs: [refs[0]],
      },
      {
        key: 'booked_value',
        value: booked ? String(booked.value) : null,
        unit: 'money_minor',
        basis: 'booked_value',
        currency: a.currency,
        sourceRefs: booked ? [ref] : [],
      },
    ];
    return { ...a, refs, features };
  }
  async resume(id: string): Promise<C8ResultRevision> {
    const row = await this.store.result(id);
    if (!row) throw new Error('c8_result_not_found');
    if (row.state !== 'PENDING') return row;
    const lease = await this.store.claim('C8ResultRevision', id);
    if (!lease) return (await this.store.result(id))!;
    if (row.kind === 'PREDICTION' || row.eligibility !== 'ELIGIBLE')
      await this.store.publishUnavailable(lease, [
        row.kind === 'PREDICTION'
          ? 'qualified_model_unavailable'
          : 'required_evidence_unavailable',
      ]);
    else
      await this.store.publishResult(lease, async (current, tx) =>
        c8ComputeDeterministic(
          current,
          (await this.sources.policy(tx)).content,
        ),
      );
    return (await this.store.result(id))!;
  }
}
