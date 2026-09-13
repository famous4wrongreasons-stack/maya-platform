import { resultFromRevision } from '../measurement/measurement.presentation';
import { MeasurementResult } from '../measurement/measurement.contract';
import { Injectable } from '@nestjs/common';
import { MeasurementService } from '../measurement/measurement.service';
import { MeasurementIntent } from '../measurement/measurement.contract';
import { MeasurementRevision } from '@prisma/client';
import { C8Store } from './c8.store';
import { C8Sources } from './c8.sources';
import { C8Feature, C8Object, C8Ref, c8Hash } from './c8.contract';
import { C8PopulationQuery, c8ReadPopulation } from './c8.population';

/** A concurrent C7 claim is pending local computation, never an external UNKNOWN retry. */
export async function c8C7Snapshot(
  owner: MeasurementService,
  input: MeasurementIntent,
  identity: string,
  publishedAfter?: Date,
): Promise<MeasurementRevision> {
  if (input.kind === 'appointment_outcome') {
    const current = await owner.current(input);
    const row = current.revision;
    if (
      row &&
      !current.refreshPending &&
      row.publishedAt &&
      (!publishedAfter || row.publishedAt > publishedAfter) &&
      row.asOf <= input.asOf &&
      row.staffId === (input.staffId ?? null) &&
      row.branchId === (input.branchId ?? null) &&
      row.timezone === input.timezone &&
      c8Hash(
        (row.scopeJson as unknown as MeasurementIntent['scope']).branchIds,
      ) === c8Hash(input.scope.branchIds)
    ) {
      const original: MeasurementIntent = {
        kind: 'appointment_outcome',
        clientId: row.clientId,
        appointmentId: row.appointmentId,
        staffId: row.staffId,
        branchId: row.branchId,
        periodFrom: row.periodFrom,
        periodTo: row.periodTo,
        timezone: row.timezone,
        asOf: row.asOf,
        scope: row.scopeJson as unknown as MeasurementIntent['scope'],
      };
      const reobserved = await owner.observe(original),
        fresh = await owner.observe(input);
      const content = (r: MeasurementResult) => {
        const sources = r.sources.map((source) =>
          Object.fromEntries(
            Object.entries(source).filter(([key]) => key !== 'observedAt'),
          ),
        );
        const metrics = r.metrics.map((m) => ({
          ...m,
          sourceRefs: m.sourceRefs.map((n) => c8Hash(sources[n])).sort(),
        }));
        return {
          ...r,
          sources: sources.sort((a, b) => c8Hash(a).localeCompare(c8Hash(b))),
          metrics,
        };
      };
      const values = (r: MeasurementResult) =>
        r.metrics.map((metric) =>
          Object.fromEntries(
            Object.entries(metric).filter(([key]) => key !== 'sourceRefs'),
          ),
        );
      // The C7 appointment identity is the Appointment, not the caller's report window.
      // Reuse only after a full authoritative re-read at the original query and unchanged current metrics.
      if (
        c8Hash(content(reobserved)) ===
          c8Hash(content(resultFromRevision(row))) &&
        c8Hash([values(reobserved), reobserved.reasons]) ===
          c8Hash([values(fresh), fresh.reasons])
      )
        return row;
    }
  }
  for (let attempt = 0; ; attempt++)
    try {
      return await owner.reportSnapshot(input, identity);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== 'measurement_claim_busy' ||
        attempt >= 9
      )
        throw error;
      await new Promise<void>((resolve) =>
        setTimeout(resolve, 25 * (attempt + 1)),
      );
    }
}
export const C8_CAPTURE_CONTRACT = 'c8.c7-qualified-observations/1';
export type C8Capture = {
  features: C8Feature[];
  refs: C8Ref[];
  coverage: C8Object;
  query: C8PopulationQuery;
  unsupported: boolean;
};
/** C8 initiates existing C7 snapshot admission; it has no source-fact writer. */
@Injectable()
export class C8CaptureService {
  constructor(
    private readonly store: C8Store,
    private readonly sources: C8Sources,
    private readonly measurement: MeasurementService,
  ) {}
  async appointments(
    query: C8PopulationQuery,
    timezone: string,
    asOf: Date,
    currency: string | null,
  ): Promise<C8Capture> {
    const tenantId = this.store.tenant();
    if (query.tenantId !== tenantId) throw new Error('c8_capture_tenant');
    const before = await this.store.transaction((tx) =>
      c8ReadPopulation(tx, query),
    );
    const refs: C8Ref[] = [],
      snapshots: MeasurementRevision[] = [];
    const rows = await this.store.transaction((tx) =>
      tx.appointment.findMany({
        where: { tenantId, id: { in: before.ids } },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          mayaClientId: true,
          status: true,
          attendance: true,
          source: true,
          startAt: true,
          endAt: true,
          currency: true,
          serviceIds: true,
        },
      }),
    );
    let unsupported = false;
    if (query.serviceScope.length) {
      // Service/catalog ID is not itself a provider binding. Only existing internal service identity is proven here.
      unsupported = await this.store.transaction(
        async (tx) =>
          (await tx.internalService.count({
            where: { tenantId, active: true, id: { in: query.serviceScope } },
          })) !== query.serviceScope.length,
      );
    }
    for (const a of rows) {
      if (
        query.serviceScope.length &&
        (!Array.isArray(a.serviceIds) ||
          a.serviceIds.some(
            (id) => typeof id !== 'string' || !query.serviceScope.includes(id),
          ))
      )
        unsupported = true;
      if (!a.mayaClientId) {
        unsupported = true;
        continue;
      }
      const current = await this.store.transaction(async (tx) => ({
        appointment: await this.sources.subjectRef(tx, 'Appointment', a.id),
        client: await this.sources.subjectRef(tx, 'Client', a.mayaClientId!),
      }));
      const snapshot = await c8C7Snapshot(
        this.measurement,
        {
          kind: 'appointment_outcome',
          staffId: query.staffId,
          appointmentId: a.id,
          clientId: a.mayaClientId,
          periodFrom: new Date(query.from),
          periodTo: new Date(query.to),
          timezone,
          asOf,
          scope: {
            version: 1,
            capabilityKey: 'measurement.read',
            branchIds: query.branchIds,
            dimensions: {},
            sourceQuery: {},
          },
        },
        c8Hash([
          C8_CAPTURE_CONTRACT,
          query,
          asOf.toISOString(),
          a.id,
          current.appointment.revisionOrStateHash,
        ]),
      );
      if (snapshot.state !== 'PUBLISHED')
        throw new Error('c8_c7_snapshot_unavailable');
      refs.push(
        current.appointment,
        current.client,
        this.sources.measurementRef(snapshot),
      );
      snapshots.push(snapshot);
    }
    // Empty/partial history is a C7 query observation, never complete absence or confirmed zero money.
    let history: MeasurementRevision | null = null;
    if (query.clientId && !query.serviceScope.length) {
      history = await c8C7Snapshot(
        this.measurement,
        {
          kind: 'client_history',
          clientId: query.clientId,
          periodFrom: new Date(query.from),
          periodTo: new Date(query.to),
          timezone,
          asOf,
          staffId: query.staffId,
          scope: {
            version: 1,
            capabilityKey: 'measurement.read',
            branchIds: query.branchIds,
            dimensions: {},
            sourceQuery: {},
          },
        },
        c8Hash([
          C8_CAPTURE_CONTRACT,
          'history',
          query,
          asOf.toISOString(),
          before.hash,
        ]),
      );
      if (history.state !== 'PUBLISHED')
        throw new Error('c8_c7_history_unavailable');
      refs.push(this.sources.measurementRef(history));
    }
    const after = await this.store.transaction((tx) =>
      c8ReadPopulation(tx, query),
    );
    if (after.hash !== before.hash)
      throw new Error('c8_source_population_changed');
    const unique = [...new Map(refs.map((r) => [c8Hash(r), r])).values()];
    const observed = snapshots.map((s) => ({
      s,
      metrics: this.sources.metrics(s),
      a: rows.find((a) => a.id === s.appointmentId)!,
    }));
    const evidence = (ss: MeasurementRevision[]) =>
      ss.map((s) => this.sources.measurementRef(s));
    const features: C8Feature[] = [];
    const put = (
      key: string,
      value: string | null,
      unit: string,
      basis: string,
      curr: string | null,
      sourceRefs: C8Ref[],
    ) => features.push({ key, value, unit, basis, currency: curr, sourceRefs });
    const counts = (
      key: string,
      predicate: (x: (typeof observed)[number]) => boolean,
    ) => {
      const selected = observed.filter(predicate);
      const sources = selected.length
        ? evidence(selected.map((x) => x.s))
        : history
          ? [this.sources.measurementRef(history)]
          : evidence(snapshots);
      put(
        key,
        sources.length ? String(selected.length) : null,
        'count',
        key === 'observed_attended_count'
          ? key
          : 'known_canonical_visit_coverage',
        null,
        sources,
      );
    };
    const arrived = (x: (typeof observed)[number]) =>
      x.a.status === 'confirmed' &&
      x.a.attendance === 'arrived' &&
      x.a.endAt <= asOf &&
      x.a.startAt <= asOf;
    counts('observed_attended_count', arrived);
    counts('observed_frequency', arrived);
    counts('observed_cancellations', (x) => x.a.status === 'cancelled');
    counts(
      'observed_no_shows',
      (x) =>
        x.a.status === 'confirmed' &&
        x.a.attendance === 'no_show' &&
        x.a.endAt <= asOf,
    );
    const last = observed
      .filter(arrived)
      .sort((a, b) => b.a.startAt.getTime() - a.a.startAt.getTime())[0];
    put(
      'last_proven_visit_at',
      last?.a.startAt.toISOString() ?? null,
      'instant',
      'proven_attendance',
      null,
      last ? evidence([last.s]) : [],
    );
    if (currency)
      for (const key of [
        'booked_value',
        'confirmed_cash',
        'confirmed_refunds',
        'confirmed_cash_net_linked_refunds',
        'provider_reported_gross',
      ]) {
        const relevant = observed.filter(
          (x) => key !== 'booked_value' || x.a.status === 'confirmed',
        );
        const qualified = relevant.map((x) => ({
          s: x.s,
          m: x.metrics.find(
            (m) =>
              m.key === key &&
              m.currency === currency &&
              m.unit === 'money_minor' &&
              m.state === 'COMPLETE' &&
              typeof m.value === 'string' &&
              /^-?(0|[1-9]\d*)$/.test(m.value),
          ),
        }));
        const ok = qualified.length > 0 && qualified.every((x) => x.m);
        put(
          key,
          ok
            ? qualified
                .reduce((sum, x) => sum + BigInt(x.m!.value as string), 0n)
                .toString()
            : null,
          'money_minor',
          key,
          currency,
          ok ? evidence(qualified.map((x) => x.s)) : [],
        );
      }
    return {
      features,
      refs: unique,
      coverage: {
        version: 1,
        state: 'PARTIAL',
        queries: [{ query: query as unknown as C8Object, hash: before.hash }],
      },
      query,
      unsupported,
    };
  }
}
