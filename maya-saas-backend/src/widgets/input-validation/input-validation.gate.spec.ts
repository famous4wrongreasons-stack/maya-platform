// U8a — slot 8's gate: the lane, the one read, the facts, and the order of the two.
//
// [U]/[RI] never count as evidence (§0.5); the live half is `test/widgets-live/gate8-input.live-spec.ts`.
// What this file holds is the shape the live tests then observe: the read happens ONCE, only on a pass,
// and only AFTER the decision (D-2) — which is a property of the function's body, so it is read from the
// syntax tree as well as exercised.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { ctx, rec } from '../gates/gate-fixtures.spec-helper.spec';
import { mergeFacts, NO_FACTS } from '../gates/facts';
import type { GateVerdict, SubmissionShape } from '../gate.types';
import type {
  LoweringSourcePort,
  LoweringSourceRow,
} from '../stores/lowering-source.read';
import {
  InputValidationGate,
  runInputValidation,
} from './input-validation.gate';

const SOURCE = path.join(__dirname, 'input-validation.gate.ts');

const SOURCE_ROW: LoweringSourceRow = Object.freeze({
  utteranceTemplate: 'show me {{selection}}',
  erasedAt: null,
  conversationId: 'c1',
});

/** A recording port: how many times slot 8 read, and with what. Never a store. */
const port = (row: LoweringSourceRow = SOURCE_ROW) => {
  const calls: { tenantId: string; intentTokenHash: string }[] = [];
  const reader: LoweringSourcePort = {
    read: (tenantId, intentTokenHash) => {
      calls.push({ tenantId, intentTokenHash });
      return Promise.resolve(row);
    },
  };
  return { reader, calls };
};

const submission = (over: Partial<SubmissionShape> = {}): SubmissionShape => ({
  intent_token: 'tok',
  ...over,
});

const code = (v: GateVerdict) => ('code' in v ? v.code : null);

describe('U8a — slot 8 [RI: the lowering source is an injected port]', () => {
  it('G8a-G1: a null schema with `inputs: null` passes, reads once, and carries the three slot-8 facts', async () => {
    const p = port();
    const verdict = await runInputValidation(
      ctx(rec({ inputSchemaHash: null }), {
        submission: submission({ inputs: null }),
      }),
      p.reader,
    );

    expect(verdict.outcome).toBe('pass');
    expect(p.calls).toEqual([
      { tenantId: 't1', intentTokenHash: 'h'.repeat(64) },
    ]);
    expect(verdict.outcome === 'pass' ? verdict.facts : null).toEqual({
      validatedInputs: null,
      selectedLabels: [],
      loweringSource: SOURCE_ROW,
    });
  });

  it('G8a-G2: an absent `inputs` passes the same way (§3.8 makes the member required, so no route sends it — a successor edge could)', async () => {
    const p = port();
    const verdict = await runInputValidation(
      ctx(rec({ inputSchemaHash: null }), { submission: submission() }),
      p.reader,
    );
    expect(verdict.outcome).toBe('pass');
    expect(p.calls).toHaveLength(1);
  });

  it('G8a-G3: the facts are exactly what J-1 admits from slot 8, and only from slot 8', async () => {
    const p = port();
    const verdict = await runInputValidation(
      ctx(rec({ inputSchemaHash: null }), {
        submission: submission({ inputs: null }),
      }),
      p.reader,
    );
    const facts = verdict.outcome === 'pass' ? (verdict.facts ?? {}) : {};

    expect(Object.keys(facts).sort()).toEqual([
      'loweringSource',
      'selectedLabels',
      'validatedInputs',
    ]);
    // The runner's merge admits them from slot 8 …
    expect(() => mergeFacts(NO_FACTS, facts, '8')).not.toThrow();
    // … and from no other slot. This is M-FACT-SLOT's killer.
    expect(() => mergeFacts(NO_FACTS, facts, '9')).toThrow(/J-1/);
    expect(() => mergeFacts(NO_FACTS, facts, '8-R')).toThrow(/J-1/);
  });

  it.each([
    ['{a:1}', { a: 1 }],
    ['{}', {}],
  ])(
    'G8a-G4 (%s): `inputs` on a null schema refuses selection_out_of_domain and reads NOTHING',
    async (_label, inputs) => {
      const p = port();
      const verdict = await runInputValidation(
        ctx(rec({ inputSchemaHash: null }), {
          submission: submission({ inputs }),
        }),
        p.reader,
      );
      expect({ outcome: verdict.outcome, code: code(verdict) }).toEqual({
        outcome: 'refuse',
        code: 'selection_out_of_domain',
      });
      expect(p.calls).toEqual([]);
    },
  );

  it('G8a-G5: a schema-bearing record refuses mechanism_absent and reads NOTHING (the held lane is dark)', async () => {
    const p = port();
    const verdict = await runInputValidation(
      ctx(rec({ inputSchemaHash: 'f'.repeat(64) }), {
        submission: submission({ inputs: null }),
      }),
      p.reader,
    );
    expect({ outcome: verdict.outcome, code: code(verdict) }).toEqual({
      outcome: 'refuse',
      code: 'mechanism_absent',
    });
    expect(p.calls).toEqual([]);
  });

  it('G8a-G6: a throwing reader is a FAULT, not a verdict (R3.9.3)', async () => {
    const reader: LoweringSourcePort = {
      read: () => Promise.reject(new Error('lowering source: gone')),
    };
    await expect(
      runInputValidation(
        ctx(rec({ inputSchemaHash: null }), {
          submission: submission({ inputs: null }),
        }),
        reader,
      ),
    ).rejects.toThrow(/lowering source/);
  });

  it('G8a-G7: the class delegates to the same function over its injected reader', async () => {
    const p = port();
    const gate = new InputValidationGate(p.reader);
    const verdict = await gate.run(
      ctx(rec({ inputSchemaHash: null }), {
        submission: submission({ inputs: { a: 1 } }),
      }),
    );
    expect(code(verdict)).toBe('selection_out_of_domain');
    expect(p.calls).toEqual([]);
  });

  it('G8a-G8: the I-CTX stub is GONE — the seam file exports no `mechanism_absent` stub and no `pendingOn` string (IR-8a-1)', () => {
    const source = fs.readFileSync(SOURCE, 'utf8');
    expect(source).not.toMatch(/export const inputValidation\b/);
    expect(source).not.toMatch(/export const INPUT_VALIDATION_PENDING_ON\b/);
    // `mechanism_absent` survives only as the HELD SCHEMA LANE's refusal (B-01), which is a decision
    // taken from the record, not a stub that answers before anything is read. U8b removes it.
    expect(source).toMatch(/refuse\('mechanism_absent'/);
  });

  describe('G8a-G9 [BUILD] — the order and the fences, read from the source', () => {
    const sf = ts.createSourceFile(
      'input-validation.gate.ts',
      fs.readFileSync(SOURCE, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );

    /** The statements of `runInputValidation`'s body, in order. */
    const bodyStatements = (): readonly ts.Statement[] => {
      let body: ts.Block | null = null;
      const visit = (n: ts.Node): void => {
        if (
          ts.isVariableDeclaration(n) &&
          n.name.getText(sf) === 'runInputValidation' &&
          n.initializer !== undefined &&
          ts.isArrowFunction(n.initializer) &&
          ts.isBlock(n.initializer.body)
        )
          body = n.initializer.body;
        ts.forEachChild(n, visit);
      };
      visit(sf);
      if (body === null)
        throw new Error('runInputValidation is not an arrow with a block body');
      return (body as ts.Block).statements;
    };

    it('G8a-G9a: every refusal returns BEFORE the one `reader.read` — order, not intention (D-2)', () => {
      const statements = bodyStatements().map((s) => s.getText(sf));
      const refusal = statements.findIndex((s) => /refuse\(/.test(s));
      const read = statements.findIndex((s) => /reader\.read\(/.test(s));
      expect(refusal).toBeGreaterThanOrEqual(0);
      expect(read).toBeGreaterThanOrEqual(0);
      expect(refusal).toBeLessThan(read);
      // and the read is written exactly once
      expect(statements.join('\n').match(/reader\.read\(/g) ?? []).toHaveLength(
        1,
      );
    });

    it('G8a-G9b: the gate file names no store client — it is a gate file, and a gate file that reached Prisma would be a GATE-FILE violation', () => {
      const source = fs.readFileSync(SOURCE, 'utf8');
      expect(source).not.toMatch(/PrismaService/);
      expect(source).not.toMatch(/from '\.\.\/\.\.\/prisma/);
      expect(source).not.toMatch(/\$transaction|findFirst|findMany/);
    });

    it('G8a-G9c: the pass carries facts and no code; the refusals are written through `refuse` with a literal code', () => {
      const source = fs.readFileSync(SOURCE, 'utf8');
      const codes = [...source.matchAll(/refuse\(\s*'([a-z_]+)'/g)].map(
        (m) => m[1],
      );
      expect([...new Set(codes)].sort()).toEqual([
        'mechanism_absent',
        'selection_out_of_domain',
      ]);
      // No object literal in the file carries a `code` (the `gates/` fence's rule, kept by hand here).
      expect(source).not.toMatch(/\bcode:\s*'/);
    });
  });
});
