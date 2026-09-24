import { HttpException, Injectable } from '@nestjs/common';

import { AiToolRuntimeService } from '../../ai-tools/ai-tool-runtime.service';
import { C9Store } from '../../orchestration/c9.store';
import type { FactUsed } from '../../widget-contract/envelope';
import type {
  CanonicalReadPort,
  CanonicalReadRequest,
  CanonicalReadResult,
} from '../projection/canonical-read.port';

const TOOL_READS = new Set([
  'catalog.services.read',
  'catalog.staff.read',
  'booking.availability.read',
  'company.business-hours.read',
  'operations.journal.read',
]);

/**
 * U12b's one owner edge.  The adapter is deliberately a closed dispatcher: a
 * registry row cannot turn this into an arbitrary AI-tool call merely by
 * spelling another C9 key.
 */
@Injectable()
export class CanonicalReadAdapter implements CanonicalReadPort {
  constructor(
    private readonly runtime: AiToolRuntimeService,
    private readonly c9Store: C9Store,
  ) {}

  async read(request: CanonicalReadRequest): Promise<CanonicalReadResult> {
    const { plan, row } = request;
    const capability = row.subject_key.slice(3);
    try {
      const value =
        row.source_kind === 'orchestrator_state'
          ? await this.readOrchestrator(capability, plan.runId)
          : await this.readTool(request, capability);
      return Object.freeze({
        kind: 'value' as const,
        value,
        fact: this.fact(request, capability, 'measured'),
      });
    } catch (error) {
      if (!(error instanceof HttpException)) throw error;
      const denialCode = denialCodeOf(error);
      return Object.freeze({
        kind: 'owner_exception' as const,
        exception: error,
        denial_code: denialCode,
        fact: this.fact(request, capability, 'unavailable', denialCode),
      });
    }
  }

  private async readTool(
    request: CanonicalReadRequest,
    capability: string,
  ): Promise<unknown> {
    if (!TOOL_READS.has(capability))
      throw new HttpException('c9_owner_not_registered', 400);
    const { plan, ownerArguments } = request;
    if (plan.actor === null || plan.aiToolSurface === null)
      throw new HttpException('c9_use_secure_surface', 403);
    const execution = await this.runtime.execute(plan.actor, capability, {
      arguments: { ...ownerArguments },
      surface: plan.aiToolSurface,
    });
    const envelope: unknown = execution;
    if (
      !isRecord(envelope) ||
      envelope.status !== 'completed' ||
      !Object.prototype.hasOwnProperty.call(envelope, 'result')
    )
      throw new HttpException('c9_owner_result_unavailable', 502);
    return envelope.result;
  }

  private async readOrchestrator(
    capability: string,
    runId: string | null,
  ): Promise<unknown> {
    if (capability !== 'c9.no_action' || runId === null)
      throw new HttpException('c9_source_unlinked', 400);
    return this.c9Store.snapshot(runId);
  }

  private fact(
    request: CanonicalReadRequest,
    capability: string,
    status: FactUsed['status'],
    reasonCode?: string,
  ): FactUsed {
    const completeness: FactUsed['completeness'] = {
      status: status === 'measured' ? 'PARTIAL' : 'UNAVAILABLE',
      requestedScopeHash: request.plan.requestedScopeHash,
      returnedCount: status === 'measured' ? 1 : 0,
      totalCount: null,
      hasMore: true,
      cursorRef: null,
      truncated: false,
      reasonCodes: reasonCode === undefined ? ['NOT_COLLECTED'] : [reasonCode],
    };
    return Object.freeze({
      capability,
      status,
      as_of: new Date().toISOString(),
      evidence_refs: [],
      completeness,
    });
  }
}

const denialCodeOf = (error: HttpException): string => {
  const response = error.getResponse();
  if (typeof response === 'string') return canonicalDenialCode(response);
  if (typeof response === 'object' && response !== null) {
    const message = (response as Readonly<Record<string, unknown>>).message;
    if (typeof message === 'string') return canonicalDenialCode(message);
  }
  return 'provider_silent';
};

const canonicalDenialCode = (value: string): string =>
  value.startsWith('c9_') ? value.slice(3) : value;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
