import { BadRequestException, Injectable } from '@nestjs/common';

import type { Package5Wave2Operation } from '../action-engine';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  Package5Wave2ExecutableService,
  Package5Wave2ShadowService,
  wave2Hash,
  type Package5Wave2Actor,
  type Package5Wave2Command,
  type Package5Wave2ExecutionValue,
} from './package5-wave2.service';

type CommandWithoutSource = Package5Wave2Command extends infer Command
  ? Command extends Package5Wave2Command
    ? Omit<Command, 'sourceIntentRef'>
    : never
  : never;

const SAFE_OCCURRENCE_ID = /^[A-Za-z0-9._:-]{8,240}$/;

/**
 * Production adapter for the thirteen approved Wave 2 commands. Legacy HTTP,
 * auth and CRM surfaces remain initiators only; this adapter always crosses
 * Canonical Action Ingress before the domain executor can mutate anything.
 */
@Injectable()
export class Package5Wave2CanonicalCutoverService {
  constructor(
    private readonly planner: Package5Wave2ShadowService,
    private readonly executor: Package5Wave2ExecutableService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    tenantId: string,
    actor: Package5Wave2Actor,
    command: CommandWithoutSource,
    idempotencyKey?: string,
  ): Promise<Package5Wave2ExecutionValue> {
    const sourceIntentRef = this.intentRef(idempotencyKey);
    const prepared = await this.planner.build(
      tenantId,
      actor,
      { ...command, sourceIntentRef },
      'execute',
    );
    return prepared.existingExecution
      ? this.executor.resume(prepared)
      : this.executor.execute(prepared);
  }

  intentRef(value?: string): string {
    const normalized =
      value?.trim() || this.tenantContext.get()?.requestId?.trim() || '';
    if (!SAFE_OCCURRENCE_ID.test(normalized)) {
      throw new BadRequestException(
        'A bounded idempotency identity is required',
      );
    }
    return normalized;
  }

  deterministicTargetId(
    operation: Package5Wave2Operation,
    tenantId: string,
    sourceIntentRef: string,
  ): string {
    const prefix = operation === 'create_tenant_branch' ? 'p5b' : 'p5u';
    return `${prefix}_${wave2Hash({
      contract: 'package5.wave2.production-target/1',
      operation,
      tenantId,
      sourceIntentRef: this.intentRef(sourceIntentRef),
    }).slice(0, 28)}`;
  }
}
