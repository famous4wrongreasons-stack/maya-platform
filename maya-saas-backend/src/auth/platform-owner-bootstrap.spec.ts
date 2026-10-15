import {
  bootstrapArgs,
  bootstrapInput,
  readBootstrapInput,
} from '../../scripts/platform-owner-bootstrap';
import {
  closeSync,
  mkdtempSync,
  openSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('offline first platform operator input boundary', () => {
  const input = { email: 'Operator@maya.test', expectedDatabase: 'maya_test' };
  const password = 'synthetic-only-owner-password';
  it('normalizes email without promoting an existing account or selecting a role', () => {
    expect(bootstrapInput(input, false)).toEqual({
      ...input,
      email: 'operator@maya.test',
      password: null,
    });
    expect(bootstrapInput({ ...input, password }, true).password).toBe(
      password,
    );
  });
  it.each([
    'role',
    'tenantId',
    'userId',
    'sessionId',
    'entitlement',
    'reviewer',
  ])('refuses caller-selected %s', (key) => {
    expect(() => bootstrapInput({ ...input, [key]: 'forged' }, false)).toThrow(
      'input_invalid',
    );
  });
  it.each([
    'short',
    'ChangeMe123456!',
    'a'.repeat(73),
    'я'.repeat(37),
    'a'.repeat(15) + '\n',
  ])('refuses unsafe/truncated passwords %#', (password) => {
    expect(() => bootstrapInput({ ...input, password }, true)).toThrow(
      'password_invalid',
    );
  });
  it('requires the exact target, no hidden defaults and no password for dry-run', () => {
    expect(() => bootstrapInput({ email: input.email }, false)).toThrow(
      'input_invalid',
    );
    expect(() => bootstrapInput({ ...input, password }, false)).toThrow(
      'input_invalid',
    );
    expect(() =>
      bootstrapInput({ ...input, expectedDatabase: '*' }, false),
    ).toThrow('input_invalid');
    expect(() => bootstrapInput(input, true)).toThrow();
  });
  it.each(
    [
      [],
      ['--execute'],
      ['--execute', '--password', 'secret'],
      ['--execute', '--input-fd', '0'],
      ['--execute', '--input-fd', '3', '--force'],
    ].map((argv) => ({ argv })),
  )('refuses ambiguous/secret-bearing arguments %#', ({ argv }) => {
    expect(() => bootstrapArgs(argv)).toThrow('arguments_invalid');
  });
  it('requires explicit execute and a separate anonymous input descriptor', () => {
    expect(bootstrapArgs(['--dry-run', '--input-fd', '10'])).toEqual({
      execute: false,
      fd: 10,
    });
    expect(bootstrapArgs(['--execute', '--input-fd', '3'])).toEqual({
      execute: true,
      fd: 3,
    });
  });
  it('refuses credential input from an on-disk file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'maya-bootstrap-fd-proof-'));
    const file = join(dir, 'artificial-input.json');
    writeFileSync(file, '{}', { mode: 0o600 });
    const fd = openSync(file, 'r');
    try {
      expect(() => readBootstrapInput(fd)).toThrow('anonymous_input_required');
    } finally {
      closeSync(fd);
      rmSync(dir, { recursive: true });
    }
  });
});
