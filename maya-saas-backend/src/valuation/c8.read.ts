import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { C8ResultRevision, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { MeasurementReadService } from '../measurement/measurement.read.service';
import { C8Store } from './c8.store';
import { C8Sources } from './c8.sources';
import { C8Producer, C8ComputeRequest } from './c8.producer';
import { C8RankingService } from './c8.ranking';
import {
  C8Ref,
  C8Object,
  C8_KINDS,
  C8_TARGETS,
  C8_BASES,
  c8Id,
  c8Object,
} from './c8.contract';
import { c8Explanation } from './c8.explanation';
import { c8TargetReadiness } from './c8.targets';

export type C8ReadQuery = {
  kind?: string;
  subjectKind?: string;
  subjectId?: string;
  ruleKey?: string;
  limit?: string;
  cursor?: string;
  branchId?: string;
};
const STAFF = ['staff', 'provider', 'employee'];
const FINANCE_BASES: readonly string[] = C8_BASES.filter(
  (x) => x !== 'observed_attended_count',
);
/** One bounded read projection. GET and AI reads never admit derived rows or mutate a source. */
@Injectable()
export class C8ReadService {
  constructor(
    private readonly db: PrismaService,
    private readonly context: TenantContextService,
    private readonly viewer: MeasurementReadService,
    private readonly store: C8Store,
    private readonly sources: C8Sources,
    private readonly producer: C8Producer,
    private readonly ranking: C8RankingService,
  ) {}
  private system<T>(tenantId: string, fn: () => Promise<T>) {
    return this.context.runAsSystemTenant(tenantId, fn);
  }
  private base(tenantId: string, userId: string) {
    return this.viewer.viewer(
      tenantId,
      userId,
      STAFF.includes(this.context.get()?.role ?? '')
        ? 'staff_goal'
        : 'client_history',
    );
  }
  private async access(
    tenantId: string,
    userId: string,
    row: Pick<
      C8ResultRevision,
      'tenantId' | 'subjectKind' | 'subjectId' | 'kind' | 'basis' | 'scopeJson'
    >,
  ) {
    if (row.tenantId !== tenantId)
      throw new ForbiddenException('c8_tenant_scope_denied');
    const scope = row.scopeJson as C8Object,
      branches = scope.branchIds as string[];
    const financial =
      FINANCE_BASES.includes(row.basis) ||
      ['SCENARIO', 'RANKING'].includes(row.kind) ||
      ['business_revenue', 'client_expected_value'].includes(
        scope.targetKey as string,
      );
    const member = await this.viewer.viewer(
      tenantId,
      userId,
      row.subjectKind === 'staff'
        ? 'staff_goal'
        : financial
          ? 'business_period'
          : 'client_history',
    );
    if (
      member.branchId &&
      (branches.length !== 1 || branches[0] !== member.branchId)
    )
      throw new ForbiddenException('c8_branch_scope_denied');
    if (row.subjectKind === 'staff') {
      const staff = await this.db.staff.findFirst({
        where: {
          tenantId,
          id: row.subjectId,
          active: true,
          ...(member.branchId ? { branchId: member.branchId } : {}),
          ...(['staff', 'provider', 'employee', 'branch_manager'].includes(
            member.role,
          )
            ? { userId }
            : {}),
        },
        select: { id: true },
      });
      if (!staff) throw new ForbiddenException('c8_staff_scope_denied');
    }
    if (STAFF.includes(member.role) && row.subjectKind !== 'staff')
      throw new ForbiddenException('c8_staff_own_scope_only');
    return member;
  }
  private async present(
    tenantId: string,
    userId: string,
    row: C8ResultRevision,
    offset = 0,
  ) {
    await this.access(tenantId, userId, row);
    const current = await this.system(tenantId, () =>
      this.store.transaction(async (tx) => {
        const newest = await tx.c8ResultRevision.findFirst({
          where: {
            tenantId,
            kind: row.kind,
            subjectKind: row.subjectKind,
            subjectId: row.subjectId,
            ruleKey: row.ruleKey,
            scopeJson: { equals: row.scopeJson as Prisma.InputJsonValue },
          },
          orderBy: [
            { t0: 'desc' },
            { admittedAt: 'desc' },
            { revision: 'desc' },
          ],
          select: { id: true },
        });
        return newest?.id === row.id && (await this.store.refsCurrent(row, tx));
      }),
    );
    const explanation = c8Explanation(row, current);
    const rank = row.rankingJson as C8Object | null;
    const members =
      explanation.available && rank ? (rank.members as C8Object[]) : [];
    const pageMembers = [];
    for (const m of members.slice(offset, offset + 100)) {
      const refs = row.evidenceRefsJson as unknown as C8Ref[];
      const facts = await this.db.c8ResultRevision.findMany({
        where: {
          tenantId,
          subjectKind: 'client',
          subjectId: m.subjectRef as string,
          id: {
            in: refs
              .filter((r) => r.owner === 'C8ResultRevision')
              .map((r) => r.id),
          },
        },
      });
      const indicators = [];
      for (const fact of facts) {
        await this.access(tenantId, userId, fact);
        const x = c8Explanation(fact, true);
        indicators.push({
          basis: x.basis,
          currency: x.currency,
          values: x.values,
          reasons: x.reasons,
          rule: x.rule,
          asOf: x.asOf,
          period: x.period,
          completeness: x.completeness,
        });
      }
      pageMembers.push({
        subjectId: m.subjectRef,
        position: m.position,
        indicators,
      });
    }
    await this.access(tenantId, userId, row); // Revocation while resolving dependencies also denies exposure.
    return {
      contract: 'c8.valuation.read/1' as const,
      id: row.id,
      revision: row.revision,
      snapshotHash: row.snapshotHash,
      expiresAt: row.expiresAt.toISOString(),
      subject: { kind: row.subjectKind, id: row.subjectId },
      mode: 'immutable_snapshot' as const,
      current,
      ...explanation,
      horizonEnd: row.horizonEnd?.toISOString() ?? null,
      policyRevision: row.policyRevisionId,
      modelVersionId: row.modelVersionId,
      ranking: rank
        ? {
            objectiveKey: rank.objectiveKey,
            comparators: rank.comparators,
            coverage: rank.coverage,
            members: pageMembers,
            total: members.length,
            excludedCount: Array.isArray(rank.excluded)
              ? rank.excluded.length
              : 0,
            nextOffset: offset + 100 < members.length ? offset + 100 : null,
            contactPermission: false,
            actionAuthority: false,
          }
        : null,
    };
  }
  private requestObject(raw: unknown, keys: string[], required = keys) {
    try {
      return c8Object(raw, keys, required);
    } catch {
      throw new BadRequestException('c8_invalid_request');
    }
  }
  private requestId(id: string) {
    try {
      return c8Id(id);
    } catch {
      throw new BadRequestException('c8_invalid_identifier');
    }
  }
  async list(tenantId: string, userId: string, query: C8ReadQuery = {}) {
    this.requestObject(
      query,
      [
        'kind',
        'subjectKind',
        'subjectId',
        'ruleKey',
        'limit',
        'cursor',
        'branchId',
      ],
      [],
    );
    const member = await this.base(tenantId, userId);
    const limit = query.limit === undefined ? 25 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new BadRequestException('c8_page_limit');
    if (
      query.kind &&
      !C8_KINDS.includes(query.kind as (typeof C8_KINDS)[number])
    )
      throw new BadRequestException('c8_kind');
    for (const id of [
      query.subjectId,
      query.ruleKey,
      query.cursor,
      query.branchId,
    ])
      if (id) this.requestId(id);
    if (
      query.subjectKind &&
      ![
        'client',
        'appointment',
        'staff',
        'tenant',
        'branch',
        'cohort',
      ].includes(query.subjectKind)
    )
      throw new BadRequestException('c8_subject_kind');
    if (member.branchId && query.branchId && query.branchId !== member.branchId)
      throw new ForbiddenException('c8_branch_scope_denied');
    const branchId = member.branchId ?? query.branchId;
    const own = STAFF.includes(member.role)
      ? await this.db.staff.findMany({
          where: {
            tenantId,
            userId,
            active: true,
            ...(branchId ? { branchId } : {}),
          },
          select: { id: true },
          take: 101,
        })
      : null;
    if (own && own.length > 100)
      throw new ForbiddenException('c8_staff_scope_bound');
    let finance = false;
    try {
      await this.viewer.viewer(tenantId, userId, 'business_period');
      finance = true;
    } catch (e) {
      if (!(e instanceof ForbiddenException)) throw e;
    }
    if (!finance && ['RANKING', 'SCENARIO'].includes(query.kind ?? ''))
      throw new ForbiddenException('c8_finance_scope_denied');
    const safeNonfinancial: Prisma.C8ResultRevisionWhereInput = {
      OR: [
        { kind: 'POLICY_SIGNAL' },
        { kind: 'OBSERVED_VALUE', basis: 'observed_attended_count' },
        {
          kind: 'PREDICTION',
          AND: [
            { basis: { notIn: [...FINANCE_BASES] } },
            { scopeJson: { path: ['targetKey'], equals: 'attended_return' } },
          ],
        },
        {
          kind: 'PREDICTION',
          scopeJson: { path: ['targetKey'], equals: 'appointment_no_show' },
        },
        { subjectKind: 'staff' },
      ],
    };
    const where: Prisma.C8ResultRevisionWhereInput = {
      tenantId,
      expiresAt: { gt: new Date() },
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.subjectKind ? { subjectKind: query.subjectKind } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.ruleKey ? { ruleKey: query.ruleKey } : {}),
      ...(branchId
        ? { scopeJson: { path: ['branchIds'], equals: [branchId] } }
        : {}),
      ...(own
        ? { subjectKind: 'staff', subjectId: { in: own.map((x) => x.id) } }
        : {}),
      AND: [
        ...(!finance ? [safeNonfinancial] : []),
        ...(own && query.subjectId ? [{ subjectId: query.subjectId }] : []),
      ],
    };
    if (
      query.cursor &&
      !(await this.db.c8ResultRevision.findFirst({
        where: { ...where, id: query.cursor },
        select: { id: true },
      }))
    )
      throw new BadRequestException('c8_cursor_scope');
    const rows = await this.db.c8ResultRevision.findMany({
      where,
      orderBy: [{ admittedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const items = [];
    for (const row of rows.slice(0, limit))
      try {
        const p = await this.present(tenantId, userId, row);
        if (p.current || row.state === 'UNAVAILABLE') items.push(p);
      } catch (e) {
        if (!(e instanceof ForbiddenException)) throw e;
      }
    await this.base(tenantId, userId);
    return {
      contract: 'c8.valuation.list/1',
      items,
      nextCursor: rows.length > limit ? rows[limit - 1].id : null,
      numericPredictionsAvailable: false,
    };
  }
  async snapshot(
    tenantId: string,
    userId: string,
    id: string,
    offsetText = '0',
  ) {
    await this.base(tenantId, userId);
    this.requestId(id);
    const offset = Number(offsetText);
    if (!Number.isInteger(offset) || offset < 0 || offset > 5000)
      throw new BadRequestException('c8_rank_offset');
    const row = await this.db.c8ResultRevision.findFirst({
      where: { tenantId, id, expiresAt: { gt: new Date() } },
    });
    if (!row) throw new NotFoundException('c8_result_unavailable');
    return this.present(tenantId, userId, row, offset);
  }
  async readiness(tenantId: string, userId: string) {
    const member = await this.base(tenantId, userId);
    let financial = false;
    try {
      await this.viewer.viewer(tenantId, userId, 'business_period');
      financial = true;
    } catch (e) {
      if (!(e instanceof ForbiddenException)) throw e;
    }
    const policy = await this.system(tenantId, () =>
      this.store.transaction(async (tx) => {
        const head = await tx.tenantBusinessConfigurationRevision.findFirst({
          where: { tenantId, namespace: 'c8_valuation' },
          orderBy: { revision: 'desc' },
          select: { encryptedContent: true },
        });
        return head?.encryptedContent ? this.sources.policy(tx) : null;
      }),
    );
    const allowedTargets = C8_TARGETS.filter((x) =>
      STAFF.includes(member.role)
        ? x === 'staff_earnings_conditional'
        : financial || x === 'attended_return' || x === 'appointment_no_show',
    );
    const capabilities: string[] = [];
    if (policy && !STAFF.includes(member.role)) {
      for (const m of policy.content.valueMeasures as C8Object[])
        if (financial || m.basis === 'observed_attended_count')
          capabilities.push('value/' + (m.key as string));
      for (const m of policy.content.dormancyRules as C8Object[])
        capabilities.push('dormancy/' + (m.ruleKey as string));
      if (financial)
        for (const m of policy.content.rankingObjectives as C8Object[])
          capabilities.push('ranking/' + (m.key as string));
    }
    if (policy)
      for (const m of policy.content.predictionTargets as C8Object[])
        if (allowedTargets.includes(m.targetKey as (typeof C8_TARGETS)[number]))
          capabilities.push('prediction/' + (m.targetKey as string));
    await this.base(tenantId, userId);
    return {
      contract: 'c8.readiness/1',
      tenantId,
      branchId: member.branchId,
      configured: !!policy,
      policyRevision: policy?.id ?? null,
      capabilities,
      targets: allowedTargets.map((target) => c8TargetReadiness(target)),
      financialAccess: financial,
      message:
        'Числовые прогнозы пока недоступны — недостаточно проверенных данных. Подтверждённые факты и правила доступны отдельно.',
    };
  }
  async compute(tenantId: string, userId: string, raw: unknown) {
    await this.base(tenantId, userId);
    const body = this.requestObject(raw, [
      'subjectKind',
      'subjectId',
      'capability',
      'branchIds',
    ]);
    if (
      typeof body.subjectKind !== 'string' ||
      typeof body.subjectId !== 'string' ||
      typeof body.capability !== 'string' ||
      !Array.isArray(body.branchIds) ||
      body.branchIds.some((x) => typeof x !== 'string')
    )
      throw new BadRequestException('c8_compute_request');
    const request = body as unknown as C8ComputeRequest;
    if (
      !['client', 'appointment', 'staff', 'tenant', 'branch'].includes(
        request.subjectKind,
      )
    )
      throw new BadRequestException('c8_subject_kind');
    this.requestId(request.subjectId);
    if (
      request.branchIds.length > 100 ||
      new Set(request.branchIds).size !== request.branchIds.length
    )
      throw new BadRequestException('c8_branch_scope');
    for (const id of request.branchIds) this.requestId(id);
    const ready = await this.readiness(tenantId, userId);
    if (!ready.capabilities.includes(request.capability))
      throw new ForbiddenException('c8_confirmed_capability_unavailable');
    const policy = await this.system(tenantId, () =>
      this.store.transaction((tx) => this.sources.policy(tx)),
    );
    const [family, key] = request.capability.split('/');
    const rule = (
      policy.content[
        family === 'value'
          ? 'valueMeasures'
          : family === 'prediction'
            ? 'predictionTargets'
            : family === 'dormancy'
              ? 'dormancyRules'
              : 'rankingObjectives'
      ] as C8Object[]
    ).find((x) => (x.key ?? x.ruleKey ?? x.targetKey) === key)!;
    if (!rule) throw new ForbiddenException('c8_policy_changed');
    const accessRow = {
      tenantId,
      subjectKind: request.subjectKind,
      subjectId: request.subjectId,
      kind:
        family === 'ranking'
          ? 'RANKING'
          : family === 'value'
            ? 'OBSERVED_VALUE'
            : family === 'dormancy'
              ? 'POLICY_SIGNAL'
              : 'PREDICTION',
      basis: (rule.basis as string | undefined) ?? '',
      scopeJson: {
        branchIds: request.branchIds,
        targetKey: family === 'prediction' ? key : null,
      },
    };
    if (
      family === 'ranking' &&
      (request.subjectKind !== 'tenant' || request.subjectId !== tenantId)
    )
      throw new ForbiddenException('c8_ranking_tenant_scope');
    await this.access(tenantId, userId, accessRow);
    const result = await this.system(tenantId, () =>
      family === 'ranking'
        ? this.ranking.compute(key, request.branchIds)
        : this.producer.compute(request),
    );
    await this.access(tenantId, userId, accessRow);
    return this.present(tenantId, userId, result);
  }
  async forAi(tenantId: string, userId: string, query: C8ReadQuery = {}) {
    const ready = await this.readiness(tenantId, userId);
    const data = await this.list(tenantId, userId, { ...query, limit: '20' });
    return {
      contract: 'c8.valuation.ai/1',
      configured: ready.configured,
      targets: ready.targets,
      message: ready.message,
      items: data.items.map((p, i) => ({
        handle: 'result_' + (i + 1),
        kind: p.kind,
        current: p.current,
        available: p.available,
        basis: p.basis,
        currency: p.currency,
        asOf: p.asOf,
        period: p.period,
        horizonEnd: p.horizonEnd,
        completeness: p.completeness,
        qualification: p.qualification,
        values: p.values,
        reasons: p.reasons,
        rule: p.rule,
        numericPrediction: null,
        calibration: p.calibration,
        activation: p.activation,
        message: p.message,
        boundaries: p.boundaries,
        ranking: p.ranking
          ? {
              objectiveKey: p.ranking.objectiveKey,
              comparators: p.ranking.comparators,
              coverage: p.ranking.coverage,
              members: p.ranking.members.slice(0, 20).map((m, j) => ({
                handle: 'client_' + (j + 1),
                position: m.position,
                indicators: m.indicators,
              })),
              total: p.ranking.total,
              excludedCount: p.ranking.excludedCount,
            }
          : null,
      })),
      moreAvailable: !!data.nextCursor,
      numericPredictionsAvailable: false,
      canExecute: false,
      canContact: false,
    };
  }
}
