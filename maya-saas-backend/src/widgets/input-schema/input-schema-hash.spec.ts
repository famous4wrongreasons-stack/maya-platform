// U8b-c — `inputSchemaHash`. Class [U] (§0.5).

import { createHash } from 'node:crypto';

import { inputSchemaHash } from './input-schema-hash';
import { parseInputSchema } from './parse-input-schema';
import type { InputSchema } from '../../widget-contract/intent';

const parse = (value: unknown): InputSchema => {
  const result = parseInputSchema(value);
  if (!result.ok)
    throw new Error(`not a schema: ${JSON.stringify(result.defects)}`);
  return result.schema;
};

const field = {
  name: 'slot',
  required: true,
  kind: 'enum',
  domain_ref: 'sched/buckets/v1',
  selection_min: 1,
  selection_max: 1,
};

describe('U8b-c — inputSchemaHash', () => {
  it('HS-1 [U] is 64 hex characters, the width the store declares (Char(64))', () => {
    expect(
      inputSchemaHash(
        parse({
          fields: [field],
          max_total_bytes: 512,
          free_input_justification: null,
        }),
      ),
    ).toMatch(/^[0-9a-f]{64}$/);
  });

  it('HS-2 [U] is stable under key order, at every depth', () => {
    const a = parse({
      fields: [field],
      max_total_bytes: 512,
      free_input_justification: null,
    });
    const b = parse({
      free_input_justification: null,
      max_total_bytes: 512,
      fields: [
        {
          selection_max: 1,
          selection_min: 1,
          domain_ref: 'sched/buckets/v1',
          kind: 'enum',
          required: true,
          name: 'slot',
        },
      ],
    });
    expect(inputSchemaHash(a)).toBe(inputSchemaHash(b));
    // And deeper: the members of `bounds` are an object too.
    const bounds = (order: readonly string[]): InputSchema =>
      parse({
        fields: [
          {
            name: 'amount',
            required: true,
            kind: 'integer',
            bounds: Object.fromEntries(
              order.map((k) => [
                k,
                {
                  min: 1,
                  max: 9,
                  step: null,
                  unit_ref: 'money/rub',
                  bounds_source: 'expense.max',
                }[k],
              ]),
            ),
          },
        ],
        max_total_bytes: 512,
        free_input_justification: 'AUDIT_EXACT_INPUT',
      });
    expect(
      inputSchemaHash(
        bounds(['min', 'max', 'step', 'unit_ref', 'bounds_source']),
      ),
    ).toBe(
      inputSchemaHash(
        bounds(['bounds_source', 'unit_ref', 'step', 'max', 'min']),
      ),
    );
  });

  it('HS-3 [U] is NOT stable under field order: the array is the order the surface drew', () => {
    const other = { ...field, name: 'staff', domain_ref: 'catalog/staff/v1' };
    const one = parse({
      fields: [field, other],
      max_total_bytes: 512,
      free_input_justification: null,
    });
    const two = parse({
      fields: [other, field],
      max_total_bytes: 512,
      free_input_justification: null,
    });
    expect(inputSchemaHash(one)).not.toBe(inputSchemaHash(two));
  });

  it('HS-4 [U] changes when any declared member changes', () => {
    const base = parse({
      fields: [field],
      max_total_bytes: 512,
      free_input_justification: null,
    });
    const variants: readonly unknown[] = [
      { fields: [field], max_total_bytes: 513, free_input_justification: null },
      {
        fields: [{ ...field, selection_max: 2 }],
        max_total_bytes: 512,
        free_input_justification: null,
      },
      {
        fields: [{ ...field, domain_ref: 'sched/buckets/v2' }],
        max_total_bytes: 512,
        free_input_justification: null,
      },
      {
        fields: [{ ...field, required: false }],
        max_total_bytes: 512,
        free_input_justification: null,
      },
    ];
    const hashes = new Set([
      inputSchemaHash(base),
      ...variants.map((v) => inputSchemaHash(parse(v))),
    ]);
    expect(hashes.size).toBe(variants.length + 1);
  });

  it('HS-5 [U] is exactly SHA-256 over the one canonicaliser, which is what H6 permits (C11:2627)', () => {
    // Recomputed here from the primitive, so the test cannot be satisfied by whatever the file happens
    // to do. `stableActionJson` sorts object keys at every depth; the digest is plain sha-256 hex.
    const schema = parse({
      fields: [field],
      max_total_bytes: 512,
      free_input_justification: null,
    });
    const canonical =
      '{"fields":[{"domain_ref":"sched/buckets/v1","kind":"enum","name":"slot","required":true,"selection_max":1,"selection_min":1}],"free_input_justification":null,"max_total_bytes":512}';
    expect(inputSchemaHash(schema)).toBe(
      createHash('sha256').update(canonical, 'utf8').digest('hex'),
    );
  });
});
