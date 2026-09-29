// U ledger, explicitly RI: excluded kinds have no production widget-input carrier.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EMPTY_INPUT_BOUNDS_REGISTRY } from '../../src/widgets/input-validation/input-bounds.registry';
import { EMPTY_INPUT_NORMALIZER_REGISTRY } from '../../src/widgets/input-validation/input-normalizers.registry';
import { validateSchemaInputs } from '../../src/widgets/input-validation/input-validation';
import type { InputSchema } from '../../src/widget-contract/intent';
import { recordJestEvidence } from './support/evidence';

describe('Approved closed-input U ledger [HTTP ledger; RI]', () => {
  it('D8-U records all four duties without claiming a live open-input traversal', async () => {
    const docs = resolve(
      process.cwd(),
      '../docs/rebuild/widget-release-programme/approved-release',
    );
    const decision = readFileSync(resolve(docs, 'OWNER-DECISIONS.md'), 'utf8');
    expect(decision).toContain('G8-3 A, G8-4 A, G8-5t A, G8-DENY A');
    const map = JSON.parse(
      readFileSync(resolve(docs, 'u-proofs.json'), 'utf8'),
    ) as {
      proofs: Array<{
        clause: string;
        basis: string;
        absence: { source: string; marker: string };
        refusal: { source: string; marker: string };
        mechanism: { source: string; marker: string };
      }>;
    };
    const ids = ['G8-3', 'G8-4', 'G8-5t', 'G8-DENY'];
    for (const id of ids) {
      const p = map.proofs.find((x: { clause: string }) => x.clause === id);
      if (!p) throw new Error('U proof missing');
      expect(p.basis).toContain('FINAL OWNER DECISIONS');
      for (const key of ['absence', 'refusal', 'mechanism'] as const)
        expect(
          readFileSync(resolve(process.cwd(), p[key].source), 'utf8'),
        ).toContain(p[key].marker);
    }
    for (const kind of ['integer', 'text'] as const) {
      const field =
        kind === 'integer'
          ? {
              name: 'input',
              required: true,
              kind,
              bounds: {
                min: 0,
                max: 10,
                step: 1,
                unit_ref: 'unit',
                bounds_source: 'excluded',
              },
            }
          : {
              name: 'input',
              required: true,
              kind,
              max_len: 100,
              normalizer_ref: 'excluded',
            };
      const schema: InputSchema = {
        fields: [field],
        max_total_bytes: 1024,
        free_input_justification: 'AUDIT_EXACT_INPUT',
      };
      expect(
        await validateSchemaInputs({
          tenantId: 'synthetic',
          schema,
          selectionDomain: new Map(),
          inputs: { input: kind === 'integer' ? 2 : 'safe input' },
          bounds: EMPTY_INPUT_BOUNDS_REGISTRY,
          normalizers: EMPTY_INPUT_NORMALIZER_REGISTRY,
        }),
      ).toMatchObject({
        verdict: 'refuse',
        code: kind === 'integer' ? 'bound_violation' : 'use_secure_surface',
      });
    }
    recordJestEvidence({
      testId: 'D8-U',
      recordHash: null,
      triggerTraceId: null,
      stoppedAtGate: null,
      gatesRun: null,
      labels: ['[U-proof]'],
      clauses: ids,
      claim: 'U',
    });
  });
});
