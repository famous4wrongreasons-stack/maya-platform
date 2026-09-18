// U8b-c — `parseInputSchema`. Class [U] (§0.5): a unit test is never live proof. What it holds is the
// one property both callers depend on — the minter and Gate 8 read §3.6's document the same way.

import {
  NON_CLOSED_KINDS,
  parseInputSchema,
  type InputSchemaDefect,
} from './parse-input-schema';

const at = (result: ReturnType<typeof parseInputSchema>): string[] =>
  result.ok ? [] : result.defects.map((d: InputSchemaDefect) => d.at);

const closedField = {
  name: 'slot',
  required: true,
  kind: 'enum' as const,
  domain_ref: 'sched/buckets/v1',
  selection_min: 1,
  selection_max: 1,
};

const schemaOf = (
  fields: readonly unknown[],
  justification: unknown = null,
): unknown => ({
  fields,
  max_total_bytes: 2048,
  free_input_justification: justification,
});

/** One well-formed field of every one of the ten declared kinds (C11:4428-4443). */
const FIELDS: Readonly<Record<string, unknown>> = {
  enum: closedField,
  ref: {
    name: 'staff',
    required: false,
    kind: 'ref',
    domain_ref: 'catalog/staff/v1',
    selection_min: 0,
    selection_max: 3,
  },
  boolean: { name: 'notify', required: false, kind: 'boolean' },
  integer: {
    name: 'amount',
    required: true,
    kind: 'integer',
    bounds: {
      min: 1,
      max: 100000,
      step: 1,
      unit_ref: 'money/rub',
      bounds_source: 'expense.max_rubles',
    },
  },
  decimal: {
    name: 'weight',
    required: false,
    kind: 'decimal',
    bounds: {
      min: 0.5,
      max: 9.5,
      step: null,
      unit_ref: 'mass/kg',
      bounds_source: 'stock.weight',
    },
  },
  date: {
    name: 'day',
    required: true,
    kind: 'date',
    window: {
      earliest: '2026-01-01',
      latest: '2026-12-31',
      granularity_s: 86400,
      calendar_ref: 'salon/open',
      bounds_source: 'schedule.window',
    },
  },
  time: {
    name: 'at',
    required: true,
    kind: 'time',
    window: {
      earliest: '09:00',
      latest: '21:00',
      granularity_s: 900,
      calendar_ref: 'salon/open',
      bounds_source: 'schedule.window',
    },
  },
  datetime: {
    name: 'when',
    required: true,
    kind: 'datetime',
    window: {
      earliest: '2026-01-01T09:00:00Z',
      latest: '2026-12-31T21:00:00Z',
      granularity_s: 900,
      calendar_ref: 'salon/open',
      bounds_source: 'schedule.window',
    },
  },
  text: {
    name: 'note',
    required: false,
    kind: 'text',
    max_len: 240,
    normalizer_ref: 'text.trim_collapse',
  },
  phone: {
    name: 'phone',
    required: true,
    kind: 'phone',
    normalizer_ref: 'canonical_msisdn',
  },
};

describe('U8b-c — parseInputSchema', () => {
  it('PS-1 [U] round-trips every one of the ten declared field kinds without losing a member', () => {
    for (const [kind, field] of Object.entries(FIELDS)) {
      const justification = NON_CLOSED_KINDS.has(kind)
        ? 'LEGAL_EXACTNESS'
        : null;
      const input = schemaOf([field], justification);
      const result = parseInputSchema(input);
      expect(`${kind}: ${JSON.stringify(at(result))}`).toBe(`${kind}: []`);
      // Lossless: what comes back is the document that went in, member for member.
      expect(result.ok && result.schema).toEqual(input);
    }
    // Non-vacuous: the table really does carry all ten kind names the union declares.
    expect(Object.keys(FIELDS).sort()).toEqual([
      'boolean',
      'date',
      'datetime',
      'decimal',
      'enum',
      'integer',
      'phone',
      'ref',
      'text',
      'time',
    ]);
  });

  it('PS-2 [U] rejects a value that is not §3.6’s object at all', () => {
    for (const value of [null, undefined, 7, 'schema', [], true]) {
      expect(parseInputSchema(value).ok).toBe(false);
    }
  });

  it('PS-3 [U] refuses an undeclared member, at the schema root and inside a field (R3.8.1/R3.8.2, R3.6.5)', () => {
    expect(
      at(
        parseInputSchema({
          ...(schemaOf([closedField]) as object),
          sensitivity: 'SECURE',
        }),
      ),
    ).toEqual(['.sensitivity']);
    // R3.6.5 (C11:4456-4463): "No `InputField` may declare a sensitivity class at all."
    expect(
      at(
        parseInputSchema(
          schemaOf([{ ...closedField, sensitivity: 'SECURE_SURFACE_ONLY' }]),
        ),
      ),
    ).toEqual(['.fields[0].sensitivity']);
  });

  it('PS-4 [U] refuses an unknown kind, and reads nothing else about that field', () => {
    const result = parseInputSchema(
      schemaOf([{ name: 'x', required: true, kind: 'money' }]),
    );
    expect(at(result)).toEqual(['.fields[0].kind']);
  });

  it('PS-5 [U] refuses a non-closed field whose bound is missing or malformed (R3.6.4)', () => {
    // "A field of kind integer, decimal, date, time or datetime without bounds/window is structurally
    // unrepresentable" (C11:4445-4454).
    expect(
      at(
        parseInputSchema(
          schemaOf(
            [{ name: 'amount', required: true, kind: 'integer' }],
            'LEGAL_EXACTNESS',
          ),
        ),
      ),
    ).toEqual(['.fields[0].bounds']);
    const noSource = {
      ...(FIELDS.integer as object),
      bounds: { min: 1, max: 9, step: null, unit_ref: 'u', bounds_source: '' },
    };
    expect(
      at(parseInputSchema(schemaOf([noSource], 'LEGAL_EXACTNESS'))),
    ).toEqual(['.fields[0].bounds.bounds_source']);
    expect(
      at(
        parseInputSchema(
          schemaOf(
            [
              {
                ...(FIELDS.date as object),
                window: {
                  ...(FIELDS.date as { window: object }).window,
                  granularity_s: 0,
                },
              },
            ],
            'LEGAL_EXACTNESS',
          ),
        ),
      ),
    ).toEqual(['.fields[0].window.granularity_s']);
  });

  it('PS-6 [U] refuses an inverted or empty selection range, and a duplicate field name (AMB-17)', () => {
    expect(
      at(
        parseInputSchema(
          schemaOf([{ ...closedField, selection_min: 2, selection_max: 1 }]),
        ),
      ),
    ).toEqual(['.fields[0]']);
    expect(
      at(
        parseInputSchema(
          schemaOf([{ ...closedField, selection_min: 0, selection_max: 0 }]),
        ),
      ),
    ).toEqual(['.fields[0].selection_max']);
    expect(
      at(
        parseInputSchema(
          schemaOf([closedField, { ...closedField, domain_ref: 'other' }]),
        ),
      ),
    ).toEqual(['.fields']);
  });

  it('PS-7 [U] holds R3.6.6 in both directions: required on a non-closed field, absent when every field is closed', () => {
    for (const kind of NON_CLOSED_KINDS) {
      const result = parseInputSchema(schemaOf([FIELDS[kind]], null));
      expect(`${kind}: ${at(result).join(',')}`).toBe(
        `${kind}: .free_input_justification`,
      );
    }
    // Non-vacuous: R3.6.6 names seven kinds, and the loop above ran over all seven.
    expect(NON_CLOSED_KINDS.size).toBe(7);
    // The declaration says `iff` (C11:4423): a justification on an all-closed schema is refused too.
    expect(
      at(parseInputSchema(schemaOf([closedField], 'LEGAL_EXACTNESS'))),
    ).toEqual(['.free_input_justification']);
    // And it must be a member of the closed union.
    expect(
      at(parseInputSchema(schemaOf([FIELDS.text], 'BECAUSE_I_SAID_SO'))),
    ).toEqual(['.free_input_justification']);
  });

  it('PS-8 [U] refuses a cap that is not a positive integer (C11:4423)', () => {
    for (const cap of [0, -1, 1.5, '2048', null, undefined]) {
      expect(
        at(
          parseInputSchema({
            fields: [closedField],
            max_total_bytes: cap,
            free_input_justification: null,
          }),
        ),
      ).toEqual(['.max_total_bytes']);
    }
  });

  it('PS-9 [U] accepts an empty field list, because §3.6 declares no rule against one', () => {
    // Gate 8 then refuses every submitted key as undeclared. That refusal is U8b’s, not the parser’s:
    // a parser that invented the rule here would move a gate decision into the shape stage.
    const result = parseInputSchema(schemaOf([]));
    expect(result.ok).toBe(true);
  });

  it('PS-10 [U] a phone field carries the declared literal and nothing else (C11:4441)', () => {
    expect(
      at(
        parseInputSchema(
          schemaOf(
            [{ ...(FIELDS.phone as object), normalizer_ref: 'msisdn' }],
            'LEGAL_EXACTNESS',
          ),
        ),
      ),
    ).toEqual(['.fields[0].normalizer_ref']);
  });

  it('PS-11 [U] a schema naming an UNREGISTERED bounds source or normalizer still parses (AMB-21d, D-10)', () => {
    // No bounds source and no normalizer is registered this cycle (§0.3). The refusal for one is Gate
    // 8’s — `bound_violation` / `use_secure_surface` — on the SUBMISSION. Refusing the schema here would
    // hide that refusal behind a shape error and put an unapproved engineering choice in the parser.
    expect(
      parseInputSchema(schemaOf([FIELDS.integer], 'AUDIT_EXACT_INPUT')).ok,
    ).toBe(true);
    expect(
      parseInputSchema(schemaOf([FIELDS.text], 'AUDIT_EXACT_INPUT')).ok,
    ).toBe(true);
  });

  it('PS-12 [U] reports every defect it found, not the first one', () => {
    const result = parseInputSchema({
      fields: [
        {
          name: '',
          required: 'yes',
          kind: 'enum',
          domain_ref: '',
          selection_min: -1,
          selection_max: 1,
        },
      ],
      max_total_bytes: 0,
      free_input_justification: null,
    });
    expect(at(result).length).toBeGreaterThanOrEqual(5);
  });
});
