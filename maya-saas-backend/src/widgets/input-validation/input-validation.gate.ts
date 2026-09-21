// Gate 8 — input validation inside the one request transaction.
//
// Refusal branches return before the lowering-source read. The schema lane additionally reads the
// exact emitted schema from its render receipt; erased/absent content becomes handle_stale, while a
// hash mismatch is an integrity fault and is never converted into a business verdict.

import { Inject, Injectable } from '@nestjs/common';

import type { GateContext, GateVerdict } from '../gate.types';
import { refuse } from '../gates/verdict';
import type { RequestTx } from '../authority/principal-view';
import { INPUT_BOUNDS_REGISTRY, INPUT_NORMALIZER_REGISTRY } from '../di-tokens';
import type {
  LoweringSourcePort,
  LoweringSourceRow,
} from '../stores/lowering-source.read';
import { LoweringSourceReader } from '../stores/lowering-source.read';
import type { InputBoundsRegistry } from './input-bounds.registry';
import type { InputNormalizerRegistry } from './input-normalizers.registry';
import {
  InputSchemaSourceReader,
  type InputSchemaSourceClient,
  type InputSchemaSourcePort,
} from './input-schema-source';
import {
  decideForContext,
  decodeRecordDomain,
  parseAndVerifySchema,
  validateSchemaInputs,
} from './input-validation';
import { selectedLabelsFor } from './label-mapping';

export interface InputValidationPorts {
  readonly loweringSource: LoweringSourcePort;
  readonly schemaSource: InputSchemaSourcePort;
  readonly bounds: InputBoundsRegistry;
  readonly normalizers: InputNormalizerRegistry;
  readonly client: InputSchemaSourceClient;
}

const refuseValidation = (
  code:
    | 'selection_out_of_domain'
    | 'bound_violation'
    | 'use_secure_surface'
    | 'oversize_submission',
  detail: string,
): GateVerdict => {
  switch (code) {
    case 'selection_out_of_domain':
      return refuse('selection_out_of_domain', detail);
    case 'bound_violation':
      return refuse('bound_violation', detail);
    case 'use_secure_surface':
      return refuse('use_secure_surface', detail);
    case 'oversize_submission':
      return refuse('oversize_submission', detail);
  }
};

export const runInputValidation = async (
  ctx: GateContext,
  ports: InputValidationPorts,
): Promise<GateVerdict> => {
  const decision = decideForContext(ctx);
  if (decision.verdict === 'refuse')
    return refuse('selection_out_of_domain', decision.detail);

  let validatedInputs = null;
  let selectedLabels: readonly string[] | null = selectedLabelsFor(null);
  if (decision.lane === 'schema') {
    const record = ctx.record;
    if (!record || record.inputSchemaHash === null)
      throw new Error('gate 8 schema lane requires its admitted intent record');
    const source = await ports.schemaSource.read(record, ports.client);
    if (source.status === 'unavailable')
      return {
        outcome: 'superseded',
        code: 'handle_stale',
        detail: 'the emitted input schema is absent or erased',
      };
    const schema = parseAndVerifySchema(source.schema, record.inputSchemaHash);
    const result = await validateSchemaInputs({
      tenantId: ctx.tenantId,
      schema,
      selectionDomain: decodeRecordDomain(record),
      inputs: ctx.submission.inputs,
      bounds: ports.bounds,
      normalizers: ports.normalizers,
    });
    if (result.verdict === 'refuse')
      return refuseValidation(result.code, result.detail);
    validatedInputs = result.validatedInputs;
    selectedLabels = selectedLabelsFor(
      validatedInputs,
      source.selectionDomainLabelsJson,
    );
  }

  const loweringSource: LoweringSourceRow = await ports.loweringSource.read(
    ctx.tenantId,
    ctx.intentTokenHash,
  );
  return {
    outcome: 'pass',
    facts: { validatedInputs, selectedLabels, loweringSource },
  };
};

@Injectable()
export class InputValidationGate {
  constructor(
    private readonly loweringSource: LoweringSourceReader,
    private readonly schemaSource: InputSchemaSourceReader,
    @Inject(INPUT_BOUNDS_REGISTRY)
    private readonly bounds: InputBoundsRegistry,
    @Inject(INPUT_NORMALIZER_REGISTRY)
    private readonly normalizers: InputNormalizerRegistry,
  ) {}

  run(ctx: GateContext, tx: RequestTx | null): Promise<GateVerdict> {
    if (tx === null) throw new Error('Gate 8 requires the request transaction');
    const loweringSource: LoweringSourcePort = {
      read: (tenantId, intentTokenHash) =>
        this.loweringSource.read(tenantId, intentTokenHash, tx),
    };
    return runInputValidation(ctx, {
      loweringSource,
      schemaSource: this.schemaSource,
      bounds: this.bounds,
      normalizers: this.normalizers,
      client: tx,
    });
  }
}
