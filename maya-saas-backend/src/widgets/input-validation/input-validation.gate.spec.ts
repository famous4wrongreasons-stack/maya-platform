import fs from 'node:fs';
import path from 'node:path';

import type { InputSchema } from '../../widget-contract/intent';
import { ctx, rec } from '../gates/gate-fixtures.spec-helper.spec';
import { mergeFacts, NO_FACTS } from '../gates/facts';
import type { GateVerdict, SubmissionShape } from '../gate.types';
import { inputSchemaHash } from '../input-schema/input-schema-hash';
import { parseInputSchema } from '../input-schema/parse-input-schema';
import type {
  LoweringSourcePort,
  LoweringSourceRow,
} from '../stores/lowering-source.read';
import type { InputBoundsRegistry } from './input-bounds.registry';
import {
  InputValidationGate,
  type InputValidationPorts,
  runInputValidation,
} from './input-validation.gate';
import type { InputNormalizerRegistry } from './input-normalizers.registry';
import type {
  InputSchemaSourcePort,
  InputSchemaSourceResult,
} from './input-schema-source';

const SOURCE = path.join(__dirname, 'input-validation.gate.ts');

const SOURCE_ROW: LoweringSourceRow = Object.freeze({
  utteranceTemplate: 'show me {{selection}}',
  erasedAt: null,
  conversationId: 'c1',
});

const schema = (): InputSchema => {
  const parsed = parseInputSchema({
    fields: [
      {
        name: 'slot',
        required: true,
        kind: 'enum',
        domain_ref: 'slots/v1',
        selection_min: 1,
        selection_max: 1,
      },
    ],
    max_total_bytes: 512,
    free_input_justification: null,
  });
  if (!parsed.ok) throw new Error('schema');
  return parsed.schema;
};
const SCHEMA = schema();

const submission = (over: Partial<SubmissionShape> = {}): SubmissionShape => ({
  intent_token: 'tok',
  ...over,
});

const harness = (
  schemaResult: InputSchemaSourceResult = {
    status: 'available',
    schema: SCHEMA,
    selectionDomainLabelsJson: { slot: { a: '10:00' } },
  },
) => {
  const loweringCalls: unknown[][] = [];
  const schemaCalls: unknown[][] = [];
  const loweringSource: LoweringSourcePort = {
    read: (...args) => {
      loweringCalls.push(args);
      return Promise.resolve(SOURCE_ROW);
    },
  };
  const schemaSource: InputSchemaSourcePort = {
    read: (...args) => {
      schemaCalls.push(args);
      return Promise.resolve(schemaResult);
    },
  };
  const bounds: InputBoundsRegistry = new Map();
  const normalizers: InputNormalizerRegistry = new Map();
  const ports: InputValidationPorts = {
    loweringSource,
    schemaSource,
    bounds,
    normalizers,
    client: {} as InputValidationPorts['client'],
  };
  return { ports, loweringCalls, schemaCalls };
};

const code = (verdict: GateVerdict) =>
  'code' in verdict ? verdict.code : null;

describe('U8b — slot 8 schema lane', () => {
  it('G8-T1 null schema passes with [] labels and reads only lowering source', async () => {
    const h = harness();
    const verdict = await runInputValidation(
      ctx(rec({ inputSchemaHash: null }), {
        submission: submission({ inputs: null }),
      }),
      h.ports,
    );
    expect(verdict).toEqual({
      outcome: 'pass',
      facts: {
        validatedInputs: null,
        selectedLabels: [],
        loweringSource: SOURCE_ROW,
      },
    });
    expect(h.schemaCalls).toEqual([]);
    expect(h.loweringCalls).toEqual([['t1', 'h'.repeat(64)]]);
  });

  it('G8-T2 refusal performs no schema or lowering read', async () => {
    const h = harness();
    const verdict = await runInputValidation(
      ctx(rec({ inputSchemaHash: null }), {
        submission: submission({ inputs: {} }),
      }),
      h.ports,
    );
    expect({ outcome: verdict.outcome, code: code(verdict) }).toEqual({
      outcome: 'refuse',
      code: 'selection_out_of_domain',
    });
    expect(h.schemaCalls).toEqual([]);
    expect(h.loweringCalls).toEqual([]);
  });

  it('G8-T3 exact emitted schema validates, resolves labels, then reads lowering source', async () => {
    const h = harness();
    const record = rec({
      inputSchemaHash: inputSchemaHash(SCHEMA),
      selectionDomain: '{"slot":["a"]}',
    });
    const verdict = await runInputValidation(
      ctx(record, { submission: submission({ inputs: { slot: 'a' } }) }),
      h.ports,
    );
    expect(verdict).toEqual({
      outcome: 'pass',
      facts: {
        validatedInputs: { closed: new Map([['slot', ['a']]]) },
        selectedLabels: ['10:00'],
        loweringSource: SOURCE_ROW,
      },
    });
    expect(h.schemaCalls).toHaveLength(1);
    expect(h.loweringCalls).toHaveLength(1);
  });

  it('T-ERASED absent/erased emitted schema supersedes handle_stale with no lowering read', async () => {
    const h = harness({ status: 'unavailable' });
    const verdict = await runInputValidation(
      ctx(rec({ inputSchemaHash: inputSchemaHash(SCHEMA) }), {
        submission: submission({ inputs: { slot: 'a' } }),
      }),
      h.ports,
    );
    expect(verdict).toMatchObject({
      outcome: 'superseded',
      code: 'handle_stale',
    });
    expect(h.loweringCalls).toEqual([]);
  });

  it('T-HASH hash mismatch is an integrity fault, never a verdict', async () => {
    const h = harness();
    await expect(
      runInputValidation(
        ctx(
          rec({
            inputSchemaHash: 'f'.repeat(64),
            selectionDomain: '{"slot":["a"]}',
          }),
          {
            submission: submission({ inputs: { slot: 'a' } }),
          },
        ),
        h.ports,
      ),
    ).rejects.toThrow(/hash differs/);
    expect(h.loweringCalls).toEqual([]);
  });

  it('T-LABELS missing labels produce null, leaving Gate 9 to supersede', async () => {
    const h = harness({
      status: 'available',
      schema: SCHEMA,
      selectionDomainLabelsJson: null,
    });
    const verdict = await runInputValidation(
      ctx(
        rec({
          inputSchemaHash: inputSchemaHash(SCHEMA),
          selectionDomain: '{"slot":["a"]}',
        }),
        {
          submission: submission({ inputs: { slot: 'a' } }),
        },
      ),
      h.ports,
    );
    expect(
      verdict.outcome === 'pass' && verdict.facts?.selectedLabels,
    ).toBeNull();
  });

  it('J-1 admits the three facts only from slot 8', async () => {
    const h = harness();
    const verdict = await runInputValidation(
      ctx(rec({ inputSchemaHash: null }), {
        submission: submission({ inputs: null }),
      }),
      h.ports,
    );
    const facts = verdict.outcome === 'pass' ? (verdict.facts ?? {}) : {};
    expect(() => mergeFacts(NO_FACTS, facts, '8')).not.toThrow();
    expect(() => mergeFacts(NO_FACTS, facts, '9')).toThrow(/J-1/);
  });

  it('the class requires the request transaction and delegates through its injected ports', async () => {
    const h = harness();
    const lowering = { read: jest.fn().mockResolvedValue(SOURCE_ROW) };
    const schemaSource = { read: jest.fn() };
    const gate = new InputValidationGate(
      lowering as never,
      schemaSource,
      h.ports.bounds,
      h.ports.normalizers,
    );
    const input = ctx(rec({ inputSchemaHash: null }), {
      submission: submission({ inputs: null }),
    });
    expect(() => gate.run(input, null)).toThrow(/request transaction/);
    await expect(gate.run(input, {} as never)).resolves.toMatchObject({
      outcome: 'pass',
    });
    expect(lowering.read).toHaveBeenCalledTimes(1);
  });

  it('BUILD has no effect_not_admissible or direct Prisma/store query in the gate', () => {
    const source = fs.readFileSync(SOURCE, 'utf8');
    expect(source).not.toContain('effect_not_admissible');
    expect(source).not.toMatch(
      /PrismaService|\$transaction|findFirst|findMany/,
    );
    expect(source).toContain('schemaSource.read');
    expect(source).toContain('loweringSource.read');
  });
});
