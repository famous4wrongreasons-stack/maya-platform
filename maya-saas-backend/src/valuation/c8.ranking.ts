import { Injectable } from '@nestjs/common';
import { C8Store } from './c8.store';
import { C8Sources } from './c8.sources';
import { C8Producer } from './c8.producer';
import { C8Object, C8Ref, c8Hash, c8Object } from './c8.contract';
import { C8RankCandidate, c8RankCohort, c8Reason } from './c8.deterministic';
import {
  C8PopulationQuery,
  c8ReadPopulation,
  c8PopulationQuery,
} from './c8.population';
/** A rank is a frozen result manifest, never a contact audience or permission to execute. */
@Injectable()
export class C8RankingService {
  constructor(
    private readonly store: C8Store,
    private readonly sources: C8Sources,
    private readonly producer: C8Producer,
  ) {}
  async compute(objectiveKey: string, branchIds: string[]) {
    const tenantId = this.store.tenant();
    const policy = await this.store.transaction((tx) =>
      this.sources.policy(tx),
    );
    const objective = (policy.content.rankingObjectives as C8Object[]).find(
      (o) => o.key === objectiveKey,
    );
    if (!objective) throw new Error('c8_confirmed_ranking_objective_required');
    const cutoff = new Date();
    const query: C8PopulationQuery = {
      version: 1,
      tenantId,
      owner: 'Client',
      clientId: null,
      staffId: null,
      branchIds: [...branchIds].sort(),
      serviceScope: [],
      from: new Date(cutoff.getTime() - 1).toISOString(),
      to: cutoff.toISOString(),
    };
    const before = await this.store.transaction((tx) =>
      c8ReadPopulation(tx, query),
    );
    const candidates: C8RankCandidate[] = [];
    const predictive = (objective.comparators as C8Object[]).some((c) =>
      (policy.content.predictionTargets as C8Object[]).some(
        (t) => t.targetKey === c.measureKey,
      ),
    );
    for (const id of before.ids) {
      const candidate: C8RankCandidate = {
        subjectRef: id,
        results: [],
        unavailableReasons: [],
      };
      if (predictive)
        candidate.unavailableReasons.push('predictive_comparator_unavailable');
      else
        for (const comparator of objective.comparators as C8Object[]) {
          const family = (policy.content.valueMeasures as C8Object[]).some(
            (m) => m.key === comparator.measureKey,
          )
            ? 'value'
            : 'dormancy';
          const result = await this.producer.compute(
            {
              subjectKind: 'client',
              subjectId: id,
              capability: family + '/' + (comparator.measureKey as string),
              branchIds,
            },
            cutoff,
          );
          candidate.results.push(result);
          if (result.state !== 'PUBLISHED')
            candidate.unavailableReasons.push('comparator_result_unavailable');
        }
      candidates.push(candidate);
    }
    const refs: C8Ref[] = [];
    for (const c of candidates)
      for (const r of c.results)
        if (r.state === 'PUBLISHED' && r.snapshotHash && r.publishedAt)
          refs.push({
            owner: 'C8ResultRevision',
            tenantId,
            id: r.id,
            revisionOrStateHash: r.snapshotHash,
            observedAt: r.publishedAt.toISOString(),
            asOf: r.t0.toISOString(),
            qualification: r.qualification as C8Ref['qualification'],
            coverage: r.completeness as C8Ref['coverage'],
            expiresAt: r.expiresAt.toISOString(),
          });
    // A changed query never silently adds a member or drops an exclusion from the admitted run.
    const after = await this.store.transaction((tx) =>
      c8ReadPopulation(tx, query),
    );
    if (after.hash !== before.hash)
      throw new Error('c8_cohort_changed_before_admission');
    const t0 = new Date(),
      queryHash = c8Hash([query, before.hash, objective]);
    const scope = await this.sources.scope(tenantId);
    const timezone = await this.store.transaction(
      async (tx) =>
        (
          await tx.tenant.findUniqueOrThrow({
            where: { id: tenantId },
            select: { defaultTimezone: true },
          })
        ).defaultTimezone,
    );
    // Capture every comparator ref, not only the first ref carried in each compact member entry.
    const row = await this.store.admitResult({
      kind: 'RANKING',
      subjectKind: 'cohort',
      subjectId: queryHash,
      ruleKey: 'c8.ranking/' + objectiveKey,
      ruleVersion: 1,
      t0,
      horizonEnd: null,
      periodFrom: new Date(query.from),
      periodTo: cutoff,
      timezone,
      policyRevisionId: policy.id,
      policyContentHash: policy.hash,
      scopeJson: {
        version: 1,
        capabilityKey: 'c8.ranking',
        branchIds,
        serviceScope: [],
        staffScope: [],
        providerCapability: scope.providerCapability,
        featureContractHash: c8Hash(['c8.ranking/1']),
        targetKey: null,
        targetContractHash: null,
        cohortDefinitionHash: queryHash,
      },
      basis: 'named_policy_comparators',
      currency: null,
      inputSnapshotJson: {
        version: 1,
        features: [],
        missingness: predictive ? ['predictive_comparator_unavailable'] : [],
        coverage: {
          version: 1,
          state: 'PARTIAL',
          queries: [{ query: query as unknown as C8Object, hash: before.hash }],
        },
        dependencies: refs.map((r) => ({
          owner: r.owner,
          tenantId: r.tenantId,
          id: r.id,
          hash: r.revisionOrStateHash,
          asOf: r.asOf,
          expiresAt: r.expiresAt!,
        })),
      },
      evidenceRefsJson: refs,
      completeness: 'PARTIAL',
      qualification: 'VERIFIED',
      eligibility: predictive ? 'INSUFFICIENT_DATA' : 'ELIGIBLE',
    });
    return this.resume(row.id);
  }
  async resume(id: string) {
    const row = await this.store.result(id);
    if (!row) throw new Error('c8_rank_not_found');
    if (row.kind !== 'RANKING') throw new Error('c8_rank_kind');
    if (row.state !== 'PENDING') return row;
    const lease = await this.store.claim('C8ResultRevision', id);
    if (!lease) return (await this.store.result(id))!;
    if (row.eligibility !== 'ELIGIBLE')
      await this.store.publishUnavailable(lease, [
        'predictive_comparator_unavailable',
      ]);
    else
      await this.store.publishResult(lease, async (current, tx) => {
        const input = c8Object(current.inputSnapshotJson, [
          'version',
          'features',
          'missingness',
          'coverage',
          'dependencies',
        ]);
        // Query hash revalidation in C8Store guarantees the same cohort after restart.
        const coverage = c8Object(input.coverage, [
          'version',
          'state',
          'queries',
        ]);
        const qentry = (coverage.queries as C8Object[])[0];
        const query = c8PopulationQuery(qentry.query, current.tenantId);
        const population = await c8ReadPopulation(tx, query);
        if (population.hash !== qentry.hash)
          throw new Error('c8_rank_population_changed');
        const references = current.evidenceRefsJson as unknown as C8Ref[];
        const results = await tx.c8ResultRevision.findMany({
          where: {
            tenantId: current.tenantId,
            id: { in: references.map((r) => r.id) },
          },
        });
        const candidates: C8RankCandidate[] = population.ids.map(
          (subjectRef) => ({
            subjectRef,
            results: results.filter((r) => r.subjectId === subjectRef),
            unavailableReasons: [],
          }),
        );
        const policy = await this.sources.policy(tx);
        const ranking = c8RankCohort({
          tenantId: current.tenantId,
          policy: policy.content,
          objectiveKey: current.ruleKey.slice('c8.ranking/'.length),
          candidates,
          queryHash: current.subjectId,
          coverage: 'PARTIAL',
          dependencyDeadline: current.expiresAt.toISOString(),
        });
        return {
          valuesJson: {
            version: 1,
            values: [],
            limitations: [
              'ranking_not_consent_contact_or_action_authority',
              'known_cohort_coverage_partial',
            ],
          },
          reasonsJson: [c8Reason('explicit_comparator_order')],
          rankingJson: ranking,
        };
      });
    return (await this.store.result(id))!;
  }
}
