// P-F88 — the runtime validator's own tests, and the two [BUILD] exits of the unit card.
//
// None of this is live proof of a gate (GATE MODULE EXISTS ≠ GATE ENFORCED); the live exits F88-1…5
// run over HTTP and BIN (`test/widgets-live/f88-shape.live-spec.ts`,
// `scripts/widgets-http-proof/gateP-f88.cases.ts`). What is proved here is the validator's own
// behaviour and the two properties the contract evaluates at `EP-BUILD`:
//   F88-7  no gate antecedent reads the submission's `profile_id` (R3.8.3, C11:4657-4663);
//   F88-8  one key list: the runtime union, the static checker's union and the contract agree.
// Plus F88.1's nine wire vectors and F88.2's five required negative vectors, run over VALUES (the
// static checker runs the same vectors over DECLARATIONS), and F88.2's own prohibition on an
// implementation that can express "the key `k` is allowed".

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  F88_EXEMPTIONS,
  F88_FORBIDDEN_KEYS,
  WIDGET_INTENT_ROLE,
} from '../../widget-contract/f88.generated';
import {
  F88ForbiddenKeyException,
  assertNoForbiddenKeys,
  f88Violations,
} from './f88-walk';

const BACKEND = path.resolve(__dirname, '../../..');
const read = (relative: string): string =>
  fs.readFileSync(path.join(BACKEND, relative), 'utf8');

/** Comments are prose about a fence, never a read of one; a ratchet that counts them measures nothing. */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const widgetSources = (): { file: string; text: string }[] => {
  const out: { file: string; text: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(path.join(BACKEND, dir), {
      withFileTypes: true,
    })) {
      const here = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(here);
      else if (entry.name.endsWith('.ts'))
        out.push({ file: here, text: read(here) });
    }
  };
  walk('src/widgets');
  return out;
};

describe('F88 — the one structural validator, at runtime', () => {
  describe('F88.1 — the nine wire vectors, over values', () => {
    // The table at C11:1663-1674. A submission is the ingress root, and no F88.2 row names it, so
    // every occurrence fails there; the presentation role passes only at its own declared location.
    it('F88-U1 [U] refuses an authority, persona or identity role on the wire, at any depth and on any shape', () => {
      const wire = [
        { shape: 'WidgetIntentSubmission', body: { role: 'owner' } },
        { shape: 'WidgetIntentSubmission', body: { role: 'staff' } },
        { shape: 'ChannelProfile', body: { role: 'client' } },
        { shape: 'WidgetIntentSubmission', body: { __meRole: 'OWNER' } },
        { shape: 'WidgetIntentSubmission', body: { is_owner: true } },
        { shape: 'WidgetIntentSubmission', body: { is_staff: false } },
        { shape: 'WidgetEnvelope', body: { a: { b: { role: 'primary' } } } },
        { shape: 'RenderReceipt', body: { role: 'primary' } },
      ];
      for (const { shape, body } of wire)
        expect({
          shape,
          violations: f88Violations(shape, body).length,
        }).toEqual({ shape, violations: 1 });
    });

    it('F88-U2 [U] admits `WidgetIntent.role` at its declared location for all eight declared members, and refuses a ninth', () => {
      expect(WIDGET_INTENT_ROLE).toHaveLength(8);
      for (const role of WIDGET_INTENT_ROLE)
        expect(f88Violations('WidgetIntent', { role })).toEqual([]);
      // "The type is half of the permission": a ninth value is not the declared type.
      expect(f88Violations('WidgetIntent', { role: 'owner' })).toHaveLength(1);
      expect(f88Violations('WidgetIntent', { role: 42 })).toHaveLength(1);
      // Location is the other half: the same value one level down is not row 5.
      expect(
        f88Violations('WidgetIntent', { meta: { role: 'primary' } }),
      ).toHaveLength(1);
    });
  });

  describe('F88.2 — the five required negative vectors, over values', () => {
    it('F88-U3 [U] refuses a nested arbitrary role at any depth, a nested role carrying an owner value, a nested tenant_id below a root, and a role on RenderReceipt outside intents_withheld[]', () => {
      const nestedRole = { a: { b: { c: { role: 'primary' } } } };
      expect(f88Violations('WidgetEnvelope', nestedRole)).toEqual([
        {
          shape: 'WidgetEnvelope',
          key: 'role',
          path: 'a.b.c.role',
          depth: 3,
        },
      ]);
      expect(
        f88Violations('WidgetEnvelope', { a: { role: 'owner' } }),
      ).toHaveLength(1);
      // Row 3 admits `tenant_id` at the envelope ROOT only; row 4 does the same for `IntentRecord`.
      expect(f88Violations('WidgetEnvelope', { tenant_id: 'T' })).toEqual([]);
      expect(f88Violations('IntentRecord', { tenant_id: 'T' })).toEqual([]);
      expect(
        f88Violations('WidgetEnvelope', { body: { tenant_id: 'T' } }),
      ).toHaveLength(1);
      expect(
        f88Violations('IntentRecord', { provenance: { tenant_id: 'T' } }),
      ).toHaveLength(1);
      // Row 6 is `intents_withheld[].role` and nothing else on the receipt.
      expect(
        f88Violations('RenderReceipt', {
          intents_withheld: [{ role: 'primary' }, { role: 'escape' }],
        }),
      ).toEqual([]);
      expect(
        f88Violations('RenderReceipt', {
          intents_withheld: [{ role: 'owner' }],
        }),
      ).toHaveLength(1);
      expect(
        f88Violations('RenderReceipt', { withheld: [{ role: 'primary' }] }),
      ).toHaveLength(1);
    });

    it('F88-U4 [U] binds rows 1 and 2 to their declared enums and to depth 0', () => {
      expect(f88Violations('Cell', { state: 'KNOWN' })).toEqual([]);
      expect(f88Violations('Cell', { state: 'MINTED' })).toHaveLength(1);
      expect(f88Violations('Lifecycle', { state: 'MINTED' })).toEqual([]);
      expect(f88Violations('Lifecycle', { state: 'KNOWN' })).toHaveLength(1);
      // A row is a location: the same key one shape over, or one level down, is not exempt.
      expect(f88Violations('Lifecycle', { state: 'KNOWN' })).toHaveLength(1);
      expect(f88Violations('Cell', { inner: { state: 'KNOWN' } })).toHaveLength(
        1,
      );
      expect(
        f88Violations('WidgetIntentSubmission', { state: 'KNOWN' }),
      ).toHaveLength(1);
    });

    it('F88-U5 [U] is a TOTAL walk: every one of the 28 keys is refused on a submission at depth 0 and at depth 3, and an array step adds no depth', () => {
      expect(F88_FORBIDDEN_KEYS).toHaveLength(28);
      for (const key of F88_FORBIDDEN_KEYS) {
        expect(f88Violations('WidgetIntentSubmission', { [key]: 'x' })).toEqual(
          [
            {
              shape: 'WidgetIntentSubmission',
              key,
              path: key,
              depth: 0,
            },
          ],
        );
        expect(
          f88Violations('WidgetIntentSubmission', {
            inputs: { a: { b: { [key]: 'x' } } },
          }),
        ).toEqual([
          {
            shape: 'WidgetIntentSubmission',
            key,
            path: `inputs.a.b.${key}`,
            depth: 3,
          },
        ]);
      }
      // Depth counts object levels; an array contributes a `[]` step and no depth, which is what makes
      // F88.2 row 6's "depth 1" match `intents_withheld[].role`.
      expect(
        f88Violations('WidgetIntentSubmission', {
          inputs: [[{ url: 'x' }]],
        }),
      ).toEqual([
        {
          shape: 'WidgetIntentSubmission',
          key: 'url',
          path: 'inputs[][].url',
          depth: 1,
        },
      ]);
      // No depth cap: a key ten levels down is still found.
      let deep: Record<string, unknown> = { endpoint: '/x' };
      for (let i = 0; i < 10; i += 1) deep = { n: deep };
      expect(f88Violations('WidgetIntentSubmission', deep)).toHaveLength(1);
    });

    it('F88-U6 [U] holds no key-name allowlist and cannot be given one (F88.2 prohibition)', () => {
      // (1) The table's shape: no row carries anything that names a key on its own, and every row
      //     carries all four terms of the tuple.
      for (const e of F88_EXEMPTIONS) {
        expect(Object.keys(e).sort()).toEqual([
          'accepts',
          'declaredType',
          'depth',
          'note',
          'path',
          'row',
          'shape',
        ]);
        expect(typeof e.accepts).toBe('function');
      }
      expect(F88_EXEMPTIONS).toHaveLength(6);
      // (2) The matcher's source: it compares shape, path, depth and the type predicate, and there is
      //     no `key` term it could compare instead. Only the matcher's own region is read, so this
      //     assertion cannot be satisfied by its own text.
      const source = read('src/widgets/validation/f88-walk.ts');
      const matcher = withoutComments(
        source.slice(
          source.indexOf('const admitted ='),
          source.indexOf('export const f88Violations'),
        ),
      );
      expect(matcher).toContain('e.shape === shape');
      expect(matcher).toContain('e.path === path');
      expect(matcher).toContain('e.depth === depth');
      expect(matcher).toContain('e.accepts(value)');
      expect(matcher).not.toMatch(/\bkey\b/);
    });
  });

  describe('the ingress refusal', () => {
    it('F88-U7 [U] throws a 400 whose detail names the location, not only the key', () => {
      let thrown: F88ForbiddenKeyException | null = null;
      try {
        assertNoForbiddenKeys('WidgetIntentSubmission', {
          inputs: { a: { checkout_url: 'https://pay.example' } },
        });
      } catch (error) {
        thrown = error as F88ForbiddenKeyException;
      }
      expect(thrown).toBeInstanceOf(F88ForbiddenKeyException);
      expect(thrown?.getStatus()).toBe(400);
      const body = thrown?.getResponse() as {
        error: { code: string; details: { field: string; message: string }[] };
      };
      expect(body.error.code).toBe('validation');
      expect(body.error.details).toEqual([
        {
          field: 'inputs.a.checkout_url',
          message:
            "F88: forbidden key `checkout_url` at WidgetIntentSubmission.inputs.a.checkout_url (depth 2); F88.2's closed table admits it at no location",
        },
      ]);
    });

    it('F88-U8 [U] passes a conformant submission and a shared reference, and terminates on a cycle', () => {
      const shared = { choice: 'a' };
      expect(
        f88Violations('WidgetIntentSubmission', {
          contract: 'maya.widget.intent.submission/1',
          widget_id: '11111111-1111-4111-8111-111111111111',
          intent_token: 'x'.repeat(24),
          inputs: { one: shared, two: shared },
          client_nonce: 'nonce-0001',
          profile_id: 'pwa.default',
        }),
      ).toEqual([]);
      const cyclic: Record<string, unknown> = { url: 'x' };
      cyclic.self = cyclic;
      expect(f88Violations('WidgetIntentSubmission', cyclic)).toHaveLength(1);
    });

    it('F88-U9 [U] restarts path and depth where a caller declares a nested shape (the EP-MINT seam)', () => {
      const envelope = {
        tenant_id: 'T',
        intents: [{ role: 'primary' }, { role: 'escape' }],
      };
      expect(f88Violations('WidgetEnvelope', envelope)).toHaveLength(2);
      expect(
        f88Violations('WidgetEnvelope', envelope, [
          { at: 'intents', shape: 'WidgetIntent' },
        ]),
      ).toEqual([]);
      expect(
        f88Violations(
          'WidgetEnvelope',
          { tenant_id: 'T', intents: [{ role: 'owner' }] },
          [{ at: 'intents', shape: 'WidgetIntent' }],
        ),
      ).toHaveLength(1);
    });
  });

  describe('F88-7 [BUILD] — no gate antecedent reads the submission `profile_id` (R3.8.3)', () => {
    it('F88-7 [BUILD] finds no read of it anywhere under src/widgets outside the DTO that declares it', () => {
      // A READ, not a mention: the ratchet matches `.profile_id`, `['profile_id']` and a destructuring
      // of it, after comments are stripped. The record's own column is `profileId` and is a different
      // name — R3.8.3 itself says Gate 8-R keys on the record, not on the submission.
      const reads = widgetSources()
        .filter(
          ({ file }) =>
            !file.startsWith('src/widgets/dto/') &&
            !file.startsWith('src/widgets/validation/'),
        )
        .filter(({ text }) => {
          const code = withoutComments(text);
          return (
            /\.\s*profile_id\b/.test(code) ||
            /\[\s*['"]profile_id['"]\s*\]/.test(code) ||
            /\{[^}\n]*\bprofile_id\b[^}\n]*\}\s*(?::[^=\n]+)?=/.test(code)
          );
        })
        .map(({ file }) => file);
      expect(reads).toEqual([]);
    });

    it('F88-7b [BUILD] the ratchet can go red', () => {
      const code = withoutComments(
        'const p = ctx.submission.profile_id; // a gate keying on the advisory member\n',
      );
      expect(/\.\s*profile_id\b/.test(code)).toBe(true);
      expect(
        /\.\s*profile_id\b/.test(withoutComments('// ctx.profile_id\n')),
      ).toBe(false);
    });
  });

  describe('F88-8 [BUILD] — one key list', () => {
    it('F88-8 [BUILD] the generated union equals the static checker’s union', () => {
      const checker = read('scripts/widget-contract-check.mjs');
      const block = checker.slice(
        checker.indexOf('const FORBIDDEN = ['),
        checker.indexOf('];', checker.indexOf('const FORBIDDEN = [')),
      );
      const staticKeys = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
      expect(staticKeys).toHaveLength(28);
      expect([...staticKeys].sort()).toEqual([...F88_FORBIDDEN_KEYS].sort());
    });

    it('F88-8b [BUILD] the generated union and exemption table are what the contract says (emit-f88 --check)', () => {
      const result = spawnSync(
        process.execPath,
        ['scripts/widget-contract/emit-f88.mjs', '--check'],
        { cwd: BACKEND, encoding: 'utf8' },
      );
      expect(`${result.stdout}${result.stderr}`).toContain(
        '28 keys, 6 exemptions',
      );
      expect(result.status).toBe(0);
    });

    it('F88-8c [BUILD] the generated exemption table equals the static checker’s six locations', () => {
      const checker = read('scripts/widget-contract-check.mjs');
      const block = checker.slice(
        checker.indexOf('const F88_EXEMPTIONS = ['),
        checker.indexOf('const EXEMPT ='),
      );
      const rows = [
        ...block.matchAll(
          /shape: '([^']+)',\s*\n\s*path: '([^']+)',\s*\n\s*depth: (\d+)/g,
        ),
      ].map((m) => `${m[1]}.${m[2]}@${m[3]}`);
      expect(rows).toEqual(
        F88_EXEMPTIONS.map((e) => `${e.shape}.${e.path}@${e.depth}`),
      );
    });
  });
});
