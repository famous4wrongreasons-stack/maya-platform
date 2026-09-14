import { Injectable, Logger } from '@nestjs/common';
import { C8ModelVersion, C8EvaluationRevision } from '@prisma/client';
import { C8Store } from './c8.store';
import { C8Object, C8Target, c8Hash } from './c8.contract';
import { C8LabelCollector, c8CaseFor } from './c8.labels';
import { C8Case } from './c8.evaluation.contract';
import { C8_TARGET_DEFINITIONS } from './c8.targets';

/** Prospective evidence accumulation only. No fitting, guessed quality budget, numeric metrics or promotion. */
@Injectable()
export class C8EvaluationService {
  private readonly logger = new Logger(C8EvaluationService.name);
  constructor(
    private readonly store: C8Store,
    private readonly labels: C8LabelCollector,
  ) {}
  async evaluate(modelId: string): Promise<C8EvaluationRevision | null> {
    const tenantId = this.store.tenant(),
      now = new Date();
    const model = await this.store.transaction((tx) =>
      tx.c8ModelVersion.findFirstOrThrow({
        where: { tenantId, id: modelId, expiresAt: { gt: now } },
      }),
    );
    const captures = await this.store.transaction((tx) =>
      tx.c8ResultRevision.findMany({
        where: {
          tenantId,
          modelVersionId: model.id,
          modelManifestHash: model.manifestHash,
          kind: 'PREDICTION',
          state: { in: ['PUBLISHED', 'UNAVAILABLE'] },
          expiresAt: { gt: now },
          t0: { lt: now },
        },
        orderBy: [{ t0: 'asc' }, { id: 'asc' }],
        take: 5001,
      }),
    );
    if (!captures.length) return null;
    if (captures.length > 5000)
      throw new Error('c8_evaluation_scope_exceeds_bound');
    const cases: C8Case[] = [];
    for (const capture of captures) {
      try {
        cases.push(await this.labels.collect(capture, now));
      } catch {
        cases.push(
          c8CaseFor(
            capture,
            'UNKNOWN',
            null,
            [],
            ['canonical_label_currently_unavailable'],
          ),
        );
      }
    }
    const scope = model.scopeJson as C8Object;
    const admitted = await this.store.admitEvaluation({
      modelVersionId: model.id,
      modelManifestHash: model.manifestHash,
      evaluationContractHash: model.evaluationContractHash,
      targetKey: model.targetKey,
      scopeJson: {
        version: 1,
        targetContractHash: c8Hash(model.targetJson),
        tenantId,
        providerCapability: scope.providerCapability,
        verticalDomain: scope.verticalDomain,
        cohortDefinitionHash: scope.cohortDefinitionHash,
        splitHash: c8Hash([
          'prospective_capture_only_no_fit_or_holdout_claim',
          model.id,
        ]),
        baselineKey:
          C8_TARGET_DEFINITIONS[model.targetKey as C8Target].baseline,
        featureContractHash: model.featureContractHash,
      },
      t0From: captures[0].t0,
      t0To: captures.at(-1)!.t0,
      labelsAsOf: new Date(),
      casesJson: cases,
    });
    return this.resume(admitted.id);
  }
  async resume(id: string): Promise<C8EvaluationRevision> {
    const tenantId = this.store.tenant();
    let row = await this.store.transaction((tx) =>
      tx.c8EvaluationRevision.findFirstOrThrow({ where: { tenantId, id } }),
    );
    if (row.state !== 'PENDING') return row;
    const lease = await this.store.claim('C8EvaluationRevision', id);
    if (lease) {
      const counts = row.countsJson as C8Object;
      await this.store.publishUnavailable(
        lease,
        [
          'numeric_activation_contract_unavailable',
          'real_world_calibration_unavailable',
          'prospective_cases_not_independent_quality_pass',
        ],
        Number(counts.qualified) > 0 ? 'INSUFFICIENT_DATA' : 'NOT_YET_OBSERVED',
      );
    }
    row = await this.store.transaction((tx) =>
      tx.c8EvaluationRevision.findFirstOrThrow({ where: { tenantId, id } }),
    );
    return row;
  }
  async tickTenant() {
    const tenantId = this.store.tenant();
    const pending = await this.store.transaction((tx) =>
      tx.c8EvaluationRevision.findMany({
        where: { tenantId, state: 'PENDING', expiresAt: { gt: new Date() } },
        orderBy: { admittedAt: 'asc' },
        take: 50,
        select: { id: true },
      }),
    );
    for (const row of pending) await this.resume(row.id);
    let cursor: string | undefined,
      evaluated = 0;
    for (;;) {
      const models: C8ModelVersion[] = await this.store.transaction((tx) =>
        tx.c8ModelVersion.findMany({
          where: { tenantId, expiresAt: { gt: new Date() } },
          orderBy: { id: 'asc' },
          take: 50,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
      );
      if (!models.length) break;
      for (const model of models)
        try {
          if (await this.evaluate(model.id)) evaluated++;
        } catch {
          this.logger.warn(
            'C8 evaluation unavailable; no label or quality result invented',
          );
        }
      cursor = models.at(-1)!.id;
    }
    return { evaluated };
  }
}
