import type { InputSchema } from '../../widget-contract/intent';
import { rec } from '../gates/gate-fixtures.spec-helper.spec';
import { decodeSelectionDomain } from '../input-schema/codec';
import { inputSchemaHash } from '../input-schema/input-schema-hash';
import { parseInputSchema } from '../input-schema/parse-input-schema';
import type { SubmissionShape } from '../gate.types';
import type { InputBoundsRegistry } from './input-bounds.registry';
import type { InputNormalizerRegistry } from './input-normalizers.registry';
import {
  InputValidationIntegrityError,
  decideInputValidation,
  inputsPresence,
  parseAndVerifySchema,
  validateSchemaInputs,
} from './input-validation';

const sub = (over: Partial<SubmissionShape> = {}): SubmissionShape => ({
  intent_token: 'tok',
  ...over,
});

const schema = (fields: readonly unknown[], max = 512): InputSchema => {
  const parsed = parseInputSchema({
    fields,
    max_total_bytes: max,
    free_input_justification: fields.some(
      (f) =>
        typeof f === 'object' &&
        f !== null &&
        'kind' in f &&
        !['enum', 'ref', 'boolean'].includes(String(f.kind)),
    )
      ? 'AUDIT_EXACT_INPUT'
      : null,
  });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.defects));
  return parsed.schema;
};

const closedSchema = schema([
  {
    name: 'slot',
    required: true,
    kind: 'enum',
    domain_ref: 'schedule/slots/v1',
    selection_min: 1,
    selection_max: 2,
  },
  { name: 'notify', required: false, kind: 'boolean' },
]);

const domain = (wire = '{"slot":["a","b"]}') => {
  const decoded = decodeSelectionDomain(wire);
  if (!decoded.ok) throw new Error(JSON.stringify(decoded.defects));
  return decoded.value;
};

const EMPTY_BOUNDS: InputBoundsRegistry = new Map();
const EMPTY_NORMALIZERS: InputNormalizerRegistry = new Map();

const validate = (
  inputSchema: InputSchema,
  inputs: Readonly<Record<string, unknown>> | null | undefined,
  over: {
    bounds?: InputBoundsRegistry;
    normalizers?: InputNormalizerRegistry;
  } = {},
) =>
  validateSchemaInputs({
    tenantId: 't1',
    schema: inputSchema,
    selectionDomain: domain(),
    inputs,
    bounds: over.bounds ?? EMPTY_BOUNDS,
    normalizers: over.normalizers ?? EMPTY_NORMALIZERS,
  });

describe('U8b — Gate 8 input validation', () => {
  it('T1/T2 keeps absent, null and values distinct and preserves the null-schema lane', () => {
    expect(inputsPresence(sub())).toBe('absent');
    expect(inputsPresence(sub({ inputs: null }))).toBe('null');
    expect(inputsPresence(sub({ inputs: {} }))).toBe('values');
    expect(
      decideInputValidation(rec({ inputSchemaHash: null }), sub()),
    ).toEqual({
      lane: 'null-schema',
      verdict: 'pass',
      presence: 'absent',
    });
    expect(
      decideInputValidation(
        rec({ inputSchemaHash: null }),
        sub({ inputs: {} }),
      ),
    ).toMatchObject({ verdict: 'refuse', code: 'selection_out_of_domain' });
  });

  it('T3 schema-bearing records enter the built schema lane; no record fails closed into it', () => {
    expect(
      decideInputValidation(
        rec({ inputSchemaHash: inputSchemaHash(closedSchema) }),
        sub({ inputs: { slot: 'a' } }),
      ),
    ).toMatchObject({ lane: 'schema', verdict: 'evaluate' });
    expect(decideInputValidation(null, sub())).toMatchObject({
      lane: 'schema',
      verdict: 'evaluate',
    });
  });

  it('T4/T5 accepts exact closed selections and produces only validated option ids', async () => {
    await expect(
      validate(closedSchema, { slot: ['b', 'a'], notify: true }),
    ).resolves.toEqual({
      verdict: 'pass',
      validatedInputs: { closed: new Map([['slot', ['b', 'a']]]) },
    });
  });

  it.each([
    ['undeclared key', { slot: 'a', injected: 1 }],
    ['missing required field', { notify: true }],
    ['wrong enum shape', { slot: 3 }],
    ['outside domain', { slot: 'z' }],
    ['duplicate set member', { slot: ['a', 'a'] }],
    ['too few selections', { slot: [] }],
    ['too many selections', { slot: ['a', 'b', 'z'] }],
    ['wrong boolean shape', { slot: 'a', notify: 'yes' }],
  ])('T6–T13 refuses %s', async (_name, inputs) => {
    await expect(validate(closedSchema, inputs)).resolves.toMatchObject({
      verdict: 'refuse',
      code: 'selection_out_of_domain',
    });
  });

  it('T-DUP/T-CROSS-FIELD checks set membership per field', async () => {
    const multi = schema([
      {
        name: 'slot',
        required: true,
        kind: 'enum',
        domain_ref: 'slot/v1',
        selection_min: 1,
        selection_max: 1,
      },
      {
        name: 'staff',
        required: true,
        kind: 'ref',
        domain_ref: 'staff/v1',
        selection_min: 1,
        selection_max: 1,
      },
    ]);
    const decoded = decodeSelectionDomain(
      '{"slot":["same"],"staff":["staff-1"]}',
    );
    if (!decoded.ok) throw new Error('domain');
    await expect(
      validateSchemaInputs({
        tenantId: 't1',
        schema: multi,
        selectionDomain: decoded.value,
        inputs: { slot: 'same', staff: 'same' },
        bounds: EMPTY_BOUNDS,
        normalizers: EMPTY_NORMALIZERS,
      }),
    ).resolves.toMatchObject({
      verdict: 'refuse',
      code: 'selection_out_of_domain',
    });
  });

  it('T14 enforces the canonical UTF-8 byte cap', async () => {
    const tiny = schema(
      [{ name: 'notify', required: false, kind: 'boolean' }],
      2,
    );
    await expect(validate(tiny, { notify: true })).resolves.toMatchObject({
      verdict: 'refuse',
      code: 'oversize_submission',
    });
  });

  it('T15/T-REG-EMPTY refuses unregistered numeric and temporal bounds sources', async () => {
    const integer = schema([
      {
        name: 'amount',
        required: true,
        kind: 'integer',
        bounds: {
          min: 1,
          max: 9,
          step: 1,
          unit_ref: 'unit',
          bounds_source: 'amount.live',
        },
      },
    ]);
    await expect(validate(integer, { amount: 2 })).resolves.toMatchObject({
      verdict: 'refuse',
      code: 'bound_violation',
    });
  });

  it('T16/T-BOUND-ECHO uses the fresh registered bound, not echoed static numbers', async () => {
    const integer = schema([
      {
        name: 'amount',
        required: true,
        kind: 'integer',
        bounds: {
          min: -999,
          max: 999,
          step: 1,
          unit_ref: 'unit',
          bounds_source: 'amount.live',
        },
      },
    ]);
    const bounds: InputBoundsRegistry = new Map([
      ['amount.live', ({ value }) => typeof value === 'number' && value <= 5],
    ]);
    await expect(
      validate(integer, { amount: 6 }, { bounds }),
    ).resolves.toMatchObject({
      verdict: 'refuse',
      code: 'bound_violation',
    });
    await expect(
      validate(integer, { amount: 5 }, { bounds }),
    ).resolves.toMatchObject({ verdict: 'pass' });
  });

  it('T17/T-MAXLEN applies max_len before the registered text normalizer', async () => {
    const text = schema([
      {
        name: 'note',
        required: true,
        kind: 'text',
        max_len: 3,
        normalizer_ref: 'trim',
      },
    ]);
    const normalizer = jest.fn((value: string) => value.trim());
    await expect(
      validate(
        text,
        { note: 'abcd' },
        { normalizers: new Map([['trim', normalizer]]) },
      ),
    ).resolves.toMatchObject({ verdict: 'refuse', code: 'bound_violation' });
    expect(normalizer).not.toHaveBeenCalled();
  });

  it('T18 text and phone fail closed when their normalizer is not registered', async () => {
    const fields = [
      {
        name: 'note',
        required: true,
        kind: 'text',
        max_len: 20,
        normalizer_ref: 'missing',
      },
    ];
    await expect(
      validate(schema(fields), { note: 'hello' }),
    ).resolves.toMatchObject({
      verdict: 'refuse',
      code: 'use_secure_surface',
    });
    const phoneOnly = schema([
      {
        name: 'phone',
        required: true,
        kind: 'phone',
        normalizer_ref: 'canonical_msisdn',
      },
    ]);
    await expect(
      validate(phoneOnly, { phone: '+79990000000' }),
    ).resolves.toMatchObject({
      verdict: 'refuse',
      code: 'use_secure_surface',
    });
  });

  it('T19 registered text/phone normalizers remain RI-only positive mechanisms', async () => {
    const normalizers: InputNormalizerRegistry = new Map([
      ['trim', (value) => value.trim()],
      ['canonical_msisdn', () => 'redacted'],
    ]);
    const open = schema([
      {
        name: 'note',
        required: true,
        kind: 'text',
        max_len: 20,
        normalizer_ref: 'trim',
      },
      {
        name: 'phone',
        required: true,
        kind: 'phone',
        normalizer_ref: 'canonical_msisdn',
      },
    ]);
    await expect(
      validate(
        open,
        { note: ' hello ', phone: 'secure-alias' },
        { normalizers },
      ),
    ).resolves.toMatchObject({ verdict: 'pass' });
  });

  it('T-HASH accepts the exact parsed schema and faults on parse/hash drift', () => {
    const hash = inputSchemaHash(closedSchema);
    expect(parseAndVerifySchema(closedSchema, hash)).toEqual(closedSchema);
    expect(() => parseAndVerifySchema(closedSchema, 'f'.repeat(64))).toThrow(
      InputValidationIntegrityError,
    );
    expect(() => parseAndVerifySchema({ fields: [] }, hash)).toThrow(
      InputValidationIntegrityError,
    );
  });
});
