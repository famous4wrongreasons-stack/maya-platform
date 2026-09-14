import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { runInNewContext, Script } from 'node:vm';
import ts from 'typescript';

const root = resolve(__dirname, '../../..');
const source = (file: string) => readFileSync(resolve(root, file), 'utf8');
type OverlayResult = { source: string; replacements: number };
const overlay = createRequire(__filename)(
  '../../deploy/platform/beget-edge/retire-legacy-client-create.cjs',
) as {
  retirePhp: (text: string) => OverlayResult;
  retirePwa: (text: string) => OverlayResult;
};
const boundary = createRequire(__filename)(
  '../../deploy/platform/beget-edge/client-initiator-boundary.cjs',
) as {
  assertRetiredPhp: (text: string) => boolean;
  assertRetiredPwa: (text: string) => object;
  assertOverlayTransition: (
    before: string,
    after: string,
    kind: string,
  ) => unknown;
  assertRegisteredDeployment: (
    entries: Array<{ target: string; source: string }>,
    manifest: object,
  ) => number;
};
type Manifest = {
  overlays: Array<{
    target: string;
    kind: string;
    patch: string;
    baselineSha256: string;
    candidateSha256: string;
  }>;
  coveredCallers: Array<{ file: string; line?: number }>;
};
const manifest = JSON.parse(
  source('docs/rebuild/evidence/package5-wave-ra-r01-overlay-manifest.json'),
) as Manifest;
const pwa = source('сайт и приложение/app.html');
const scripts = [...pwa.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
  .filter((match) => !/type=["']application\/(ld\+)?json/.test(match[1]))
  .map((match) => match[2]);

function findFunction(name: string, marker: string) {
  const matches: string[] = [];
  for (const text of scripts) {
    const ast = ts.createSourceFile(
      'pwa.js',
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    const walk = (node: ts.Node) => {
      if (
        ts.isFunctionDeclaration(node) &&
        node.name?.text === name &&
        node.getText(ast).includes(marker)
      )
        matches.push(node.getText(ast));
      ts.forEachChild(node, walk);
    };
    walk(ast);
  }
  expect(matches).toHaveLength(1);
  return matches[0];
}

describe('R01 permanent Client initiator boundary', () => {
  it('executes every retired native entry and callback with business dependencies trapped', () => {
    const result = spawnSync(
      'python3',
      [resolve(root, 'ai администратор/test_r01_client_entry.py')],
      {
        encoding: 'utf8',
        timeout: 30_000,
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
      },
    );
    expect({ status: result.status, error: result.error?.message }).toEqual({
      status: 0,
      error: undefined,
    });
    expect(result.stderr).toContain('Ran 9 tests');
  });

  it('has no direct guest-create fetch left in the canonical PWA source and parses every script', () => {
    expect(() => boundary.assertRetiredPwa(pwa)).not.toThrow();
    for (const text of scripts) {
      expect(() => new Script(text)).not.toThrow();
      expect(text).not.toMatch(/fetch\([^\n]*[?]action=create_record/);
    }
    expect(pwa).toContain(
      "saasLive ? '/appointments' : '/appointments/preview'",
    );
  });

  it('fails the actual legacy booking card before contact/projection lookup or HTTP', async () => {
    const fetch = jest.fn(() => {
      throw new Error('Live/legacy HTTP forbidden');
    });
    const window = Object.defineProperty({}, 'APP_DATA', {
      get: () => {
        throw new Error('Legacy profile lookup forbidden');
      },
    });
    const invoke = runInNewContext(
      '(' + findFunction('afLegacy', 'R01 canonical Client entry') + ')',
      { fetch, window },
    ) as (path: string, init: object) => Promise<unknown>;
    for (const path of ['/appointments', '/appointments/preview']) {
      await expect(invoke(path, { body: '{}' })).rejects.toMatchObject({
        code: 'verified_client_channel_required',
        retry_allowed: false,
      });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails the actual guest booking submit without starting a provider request', () => {
    const fetch = jest.fn();
    const setErr = jest.fn();
    const submittingRef = { current: false };
    const invoke = runInNewContext(
      '(' + findFunction('submit', 'R01 canonical Client entry') + ')',
      {
        fetch,
        submittingRef,
        digitsPhone: () => '79990000000',
        bphone: 'synthetic',
        bname: 'Synthetic',
        localSaasMode: false,
        saasUser: null,
        setSubmitting: jest.fn(),
        setErr,
        retryRef: { current: null },
        setPreviewInfo: jest.fn(),
      },
    ) as () => void;
    invoke();
    expect(fetch).not.toHaveBeenCalled();
    expect(submittingRef.current).toBe(false);
    expect(setErr).toHaveBeenLastCalledWith(
      'Для записи откройте MAYA в приложении и подтвердите привязку клиента.',
    );
  });

  it('preserves the actual authenticated PWA route and exact caller key to the existing transport', async () => {
    const receipt = {
      execution: { executionId: 'same-execution', state: 'UNKNOWN' },
    };
    const canonical = jest.fn().mockResolvedValue(receipt);
    const invoke = runInNewContext(
      '(' + findFunction('af', 'return afLegacy(path, init)') + ')',
      {
        window: {
          __ME_SAAS_CTX: { api: 'https://canonical.synthetic.test/api' },
          __meSaasAuthedFetch: canonical,
        },
        afLegacy: () => {
          throw new Error('Legacy fallback forbidden');
        },
      },
    ) as (path: string, init: object) => Promise<unknown>;
    const request = {
      method: 'POST',
      headers: { 'Idempotency-Key': 'opaque-confirmation-123' },
      body: '{"staffId":"s","serviceIds":["svc"],"start":"2099-01-01T10:00:00Z"}',
    };
    await expect(invoke('/appointments', request)).resolves.toBe(receipt);
    await expect(invoke('/appointments', request)).resolves.toBe(receipt);
    expect(canonical).toHaveBeenNthCalledWith(1, '/appointments', request);
    expect(canonical).toHaveBeenNthCalledWith(2, '/appointments', request);
  });

  it('pins every inventoried PWA variant and both PHP targets with bounded deploy patches', () => {
    expect(manifest.overlays.map((row) => row.target).sort()).toEqual([
      'mayaos/app/index.html',
      'mayaos/maya-platform-api.php',
      'salon/app/api-proxy.codex-loyalty-20260721.php',
      'salon/app/api-proxy.php',
      'salon/app/index.backup-20260731-anton-analytics.html',
      'salon/app/index.codex-loyalty-20260721.html',
      'salon/app/index.html',
      'salon/app/maya-native-api.php',
      'salon/app/tenant-test.html',
      'vps/app.html',
    ]);
    expect(manifest.coveredCallers.filter((row) => row.line)).toHaveLength(11);
    expect(manifest.coveredCallers.filter((row) => !row.line)).toHaveLength(3);
    for (const row of manifest.overlays) {
      expect(row.baselineSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(row.candidateSha256).toMatch(/^[a-f0-9]{64}$/);
      const patch = source(row.patch);
      expect(patch).toContain('+++ b/' + row.target);
      const additions = patch
        .split('\n')
        .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
        .join('\n');
      if (row.kind !== 'relay') expect(additions).toContain('R01');
      expect(additions).not.toMatch(/yc_post\(|fetch\(|file_get_contents\(/);
      if (row.kind === 'php') {
        expect(additions).toContain('http_response_code(410)');
        expect(additions).toContain("'accepted' => false");
        expect(additions).toContain("'retry_allowed' => false");
      }
    }
  });

  it('rejects injected provider/profile/authority calls before a real retired PWA refusal', () => {
    for (const injected of [
      'yc.create_booking({});',
      'database.update_client(phone, {});',
      'resolveClientByPhone(phone);',
      'fetch("/appointment/write", {method: "POST"});',
    ]) {
      expect(() =>
        boundary.assertRetiredPwa(
          pwa.replace(
            '// R01 canonical Client entry: retired raw provider create.',
            injected +
              '\n// R01 canonical Client entry: retired raw provider create.',
          ),
        ),
      ).toThrow();
    }
    expect(() =>
      boundary.assertRetiredPwa(
        pwa.replace(
          'var refusal = new Error(',
          'var client = window.APP_DATA.phone; var refusal = new Error(',
        ),
      ),
    ).toThrow();
  });

  it('rejects a writer before PHP denial, altered delegation, and unregistered backup aliases', () => {
    const before = `<?php\n    case 'create_record':\nyc_post('/records/'); yc_post('/book_record/'); break;\n    case 'other': break;`;
    const after = overlay.retirePhp(before).source;
    expect(() => boundary.assertRetiredPhp(after)).not.toThrow();
    for (const injected of [
      'yc_post("/records/");',
      'save_client($phone);',
      'resolve_by_phone($phone);',
    ]) {
      expect(() =>
        boundary.assertRetiredPhp(
          after.replace(
            'http_response_code(410);',
            injected + 'http_response_code(410);',
          ),
        ),
      ).toThrow();
      expect(() =>
        boundary.assertOverlayTransition(before, injected + after, 'php'),
      ).toThrow();
    }
    expect(() =>
      boundary.assertRegisteredDeployment(
        [{ target: 'salon/app/unregistered-backup.php', source: after }],
        manifest,
      ),
    ).toThrow('Unregistered');
    expect(() =>
      boundary.assertRegisteredDeployment(
        [{ target: 'salon/app/subdir/unknown.html', source: pwa }],
        manifest,
      ),
    ).toThrow('Unregistered');
    expect(() => boundary.assertRegisteredDeployment([], manifest)).toThrow(
      'Missing',
    );
  });

  it.each([
    'сайт и приложение/maya-native-api.php',
    'maya-saas-backend/deploy/platform/beget-edge/maya-platform-api.php',
  ])(
    'requires PHP 5.6-compatible single-key forwarding and browser CORS in %s',
    (file) => {
      const text = source(file);
      expect(text.match(/Access-Control-Allow-Headers:[^\n]+/)?.[0]).toContain(
        'Idempotency-Key',
      );
      const forwarding = text.slice(
        text.indexOf('$forwardHeaders ='),
        text.indexOf('$responseHeaders ='),
      );
      expect(forwarding).toContain("'Idempotency-Key'");
      expect(forwarding).toContain(
        "$forwardHeaders[] = $name . ': ' . $value;",
      );
      const helper = text.slice(
        text.indexOf('function maya_forwarded_idempotency_key'),
        text.indexOf(
          '\ntry {',
          text.indexOf('function maya_forwarded_idempotency_key'),
        ),
      );
      expect(helper).toContain('count($values) > 1');
      expect(helper).toContain('return $value;');
      expect(helper).not.toMatch(
        /function\s+maya_forwarded_idempotency_key\([^\n]+\)\s*:\s*\?string/,
      );
      expect(helper).not.toContain('??');
      expect(helper).not.toMatch(/trim\(|hash\(|random|uniqid|strtolower\(/);
      expect(
        text.indexOf('maya_forwarded_idempotency_key($requestHeaders'),
      ).toBeLessThan(text.indexOf('curl_init('));
    },
  );

  it('refuses unknown overlay structure rather than silently patching a partial target', () => {
    expect(() => overlay.retirePhp('<?php echo "unknown";')).toThrow();
    expect(() =>
      overlay.retirePwa('<script>fetch("/other")</script>'),
    ).toThrow();
    const php = `<?php\nswitch ($action) {\n    case 'create_record':\nyc_post('/records/'); yc_post('/book_record/'); break;\n    case 'other': break;\n}`;
    const result = overlay.retirePhp(php);
    expect(result.replacements).toBe(1);
    expect(result.source).not.toContain('yc_post(');
    expect(result.source).toContain('http_response_code(410)');
    expect(() => overlay.retirePhp(result.source)).toThrow();
  });
});
