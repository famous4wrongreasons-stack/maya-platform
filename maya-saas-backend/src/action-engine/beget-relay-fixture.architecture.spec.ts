import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const fixturePath =
  'maya-saas-backend/test/fixtures/beget/api-proxy.sanitized.php';
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('certified, secret-free Beget release-gate input', () => {
  const source = read(fixturePath);

  it('pins complete sanitized bytes to the certified production source', () => {
    const manifest = JSON.parse(
      read('maya-saas-backend/test/fixtures/beget/api-proxy.provenance.json'),
    ) as {
      sha256: string;
      fixtureSha256: string;
      allOtherBytesIdentical: boolean;
    };
    expect(manifest.sha256).toBe(
      'b1006160a28e66448886bdc4b520a2d94021121748259c2cd1aeefda5f1aaaa0',
    );
    expect(createHash('sha256').update(source).digest('hex')).toBe(
      manifest.fixtureSha256,
    );
    expect(manifest.allOtherBytesIdentical).toBe(true);
    expect(source.split('\n')).toHaveLength(2414);
  });

  it('contains placeholders and no embedded credential signatures', () => {
    expect(source).toContain(
      "define('PARTNER_TOKEN', 'FIXTURE_ONLY_NOT_A_CREDENTIAL');",
    );
    expect(source).toContain("define('COMPANY_ID', '999999999');");
    expect(source).not.toMatch(/-----BEGIN (?:[A-Z ]+)?PRIVATE KEY/);
    expect(source).not.toMatch(/\b\d{7,12}:[A-Za-z0-9_-]{30,}\b/);
    expect(source).not.toMatch(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
    );
    expect(source).not.toMatch(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/);
    expect(source).not.toMatch(/\bsk-[A-Za-z0-9_-]{20,}/);
    expect(source).not.toMatch(/https?:\/\/[^/\s'"]+:[^/@\s'"]+@/);
  });

  it('keeps all four existing ratchets on the versioned source without secret fallback', () => {
    for (const blocker of [13, 14, 16, 17]) {
      const test = read(
        `maya-saas-backend/src/action-engine/package5-b${blocker}-remediation.architecture.spec.ts`,
      );
      expect(test).toContain(fixturePath);
      expect(test).not.toContain('pwa-assets/tg-auth/api-proxy.php');
      expect(test).not.toMatch(/\.skip\(|existsSync/);
    }
    const deploy = read('maya-saas-backend/deploy/vps/deploy.sh');
    expect(deploy).toContain('npm test -- --runInBand --silent');
    expect(deploy).not.toContain('api-proxy.sanitized.php');
    expect(deploy).not.toContain('"$BE/test"');
  });
});
