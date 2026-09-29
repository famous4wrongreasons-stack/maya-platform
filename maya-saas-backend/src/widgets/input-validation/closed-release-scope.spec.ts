import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  INTENT_TEMPLATE_REGISTRY,
  resolveIntentTemplate,
} from '../emission/intent-template.registry';
import {
  BOOKING_INTENT_TEMPLATE_REGISTRY,
  bookingTemplateAsIntentRow,
} from '../booking/booking-intent-template.registry';
import { EMPTY_INPUT_BOUNDS_REGISTRY } from './input-bounds.registry';
import { EMPTY_INPUT_NORMALIZER_REGISTRY } from './input-normalizers.registry';
import { validateSchemaInputs } from './input-validation';
import { parseInputSchema } from '../input-schema/parse-input-schema';

export function excludedSchema(kind: string) {
  const field = {
    name: 'value',
    required: true,
    kind,
    ...(['integer', 'decimal'].includes(kind)
      ? {
          bounds: {
            min: 0,
            max: 10,
            step: 1,
            unit_ref: 'unit',
            bounds_source: 'excluded',
          },
        }
      : ['date', 'time', 'datetime'].includes(kind)
        ? {
            window: {
              earliest: '2026-01-01',
              latest: '2027-01-01',
              granularity_s: 1,
              calendar_ref: 'calendar',
              bounds_source: 'excluded',
            },
          }
        : kind === 'text'
          ? { max_len: 100, normalizer_ref: 'excluded' }
          : { normalizer_ref: 'canonical_msisdn' }),
  };
  const parsed = parseInputSchema({
    fields: [field],
    max_total_bytes: 1024,
    free_input_justification: 'AUDIT_EXACT_INPUT',
  });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.defects));
  return parsed.schema;
}
const check = (
  kind: string,
  value: unknown,
  bounds = EMPTY_INPUT_BOUNDS_REGISTRY,
  normalizers = EMPTY_INPUT_NORMALIZER_REGISTRY,
) =>
  validateSchemaInputs({
    tenantId: 'synthetic',
    schema: excludedSchema(kind),
    selectionDomain: new Map(),
    inputs: { value },
    bounds,
    normalizers,
  });
describe('Owner-approved closed input release scope', () => {
  it('D8-ABSENCE all production input recipes remain closed and production owners stay unregistered', () => {
    const rows = [
      ...Object.values(INTENT_TEMPLATE_REGISTRY),
      ...Object.values(BOOKING_INTENT_TEMPLATE_REGISTRY).map((row) =>
        bookingTemplateAsIntentRow(row),
      ),
    ];
    expect(rows.length).toBeGreaterThan(10);
    for (const row of rows)
      for (const field of row.inputSchema?.fields ?? [])
        expect(['enum', 'ref', 'boolean']).toContain(field.kind);
    expect(EMPTY_INPUT_BOUNDS_REGISTRY.size).toBe(0);
    expect(EMPTY_INPUT_NORMALIZER_REGISTRY.size).toBe(0);
    const source = readFileSync(
      resolve(__dirname, '../widgets.module.ts'),
      'utf8',
    );
    expect(source).toContain('EMPTY_INPUT_BOUNDS_REGISTRY');
    expect(source).toContain('EMPTY_INPUT_NORMALIZER_REGISTRY');
  });
  it.each(['integer', 'decimal', 'date', 'time', 'datetime', 'text', 'phone'])(
    'D8-MINT caller cannot mint excluded %s input by extending a proposal',
    (kind) => {
      expect(() =>
        resolveIntentTemplate({
          widgetKind: 'METRIC',
          deliveryChannel: 'pwa',
          proposal: {
            intent_template_key: 'control.dismiss@1',
            capability: { space: 'CONTROL', key: 'control.widget.dismiss' },
            role: 'escape',
            input_schema: excludedSchema(kind),
          } as never,
        }),
      ).toThrow('proposal_not_closed');
    },
  );
  it.each(['integer', 'decimal', 'date', 'time', 'datetime'])(
    'D8-BOUNDS excluded %s refuses without calling a new owner',
    async (kind) => {
      expect(
        await check(
          kind,
          ['integer', 'decimal'].includes(kind) ? 2 : '2026-10-01',
        ),
      ).toMatchObject({ verdict: 'refuse', code: 'bound_violation' });
    },
  );
  it.each(['text', 'phone'])(
    'D8-NORMALIZER excluded %s returns DENY and exposes no input value',
    async (kind) => {
      const result = await check(kind, 'safe synthetic input');
      expect(result).toMatchObject({
        verdict: 'refuse',
        code: 'use_secure_surface',
      });
      expect(JSON.stringify(result)).not.toContain('safe synthetic input');
      expect(result).not.toHaveProperty('validatedInputs');
    },
  );
  it('D8-SAFE-TEXT DENY before and after normalization is never an accepted input', async () => {
    const normalizer = jest.fn((s: string) => s);
    expect(
      await check(
        'text',
        'secret: synthetic',
        undefined,
        new Map([['excluded', normalizer]]),
      ),
    ).toMatchObject({ verdict: 'refuse', code: 'use_secure_surface' });
    expect(normalizer).not.toHaveBeenCalled();
    expect(
      await check(
        'text',
        'safe input',
        undefined,
        new Map([['excluded', () => 'secret: synthetic']]),
      ),
    ).toMatchObject({ verdict: 'refuse', code: 'use_secure_surface' });
  });
  it('D8-MECHANISM future source semantics stay exercised without registering a production owner', async () => {
    let allowed = true;
    const source = jest.fn(() => allowed),
      normalizer = jest.fn((s: string) => s.trim());
    const bounds = new Map([['excluded', source]]);
    expect(await check('integer', 2, bounds)).toMatchObject({
      verdict: 'pass',
    });
    allowed = false;
    expect(await check('integer', 2, bounds)).toMatchObject({
      verdict: 'refuse',
      code: 'bound_violation',
    });
    expect(source).toHaveBeenCalledTimes(2);
    expect(source).toHaveBeenLastCalledWith(
      expect.objectContaining({ tenantId: 'synthetic', value: 2 }),
    );
    expect(
      await check(
        'text',
        ' hello ',
        undefined,
        new Map([['excluded', normalizer]]),
      ),
    ).toMatchObject({ verdict: 'pass' });
    expect(normalizer).toHaveBeenCalledWith(' hello ');
    expect(EMPTY_INPUT_BOUNDS_REGISTRY.size).toBe(0);
    expect(EMPTY_INPUT_NORMALIZER_REGISTRY.size).toBe(0);
  });
});
