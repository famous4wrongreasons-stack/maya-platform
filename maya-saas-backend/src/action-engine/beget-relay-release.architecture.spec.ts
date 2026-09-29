import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const root = resolve(__dirname, '../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');
const load = createRequire(__filename);
const boundary = load(
  '../../deploy/platform/beget-edge/client-initiator-boundary.cjs',
) as {
  assertRetiredPhp: (source: string) => void;
  assertNoDirectBooking: (source: string) => void;
};
const release = load('../../deploy/platform/beget-edge/relay-release.cjs') as {
  candidate: (source: string) => string;
  validateObserved: (observed: object) => unknown;
  validateCommittedSources: (
    entries: Array<{ path: string; sha256: string; committedSource?: string }>,
    baseDir?: string,
  ) => number;
  archiveRequest: (env?: Record<string, string | undefined>) => {
    dir: string | null;
    pointer: string;
  };
  deniedStatuses: string[];
  deniedRoles: string[];
  replaceScript: string;
  retireScript: string;
  denialUrls: (entry: { path: string }) => string[];
  manifest: {
    incident: { path: string; canonicalSha256: string; unsafeSha256: string };
    archive: {
      rollbackManifestSha256: string;
      locator: {
        note: string;
        env: string;
        pointerEnv: string;
        pointerDefault: string;
      };
    };
    entries: Array<{
      path: string;
      role: string;
      sha256: string;
      committedSource?: string;
    }>;
  };
};
const edge = load(
  '../../deploy/platform/beget-edge/verify-edge-candidate.cjs',
) as {
  verify: (directory: string) => object;
  verifyShellCandidate: (
    directory: string,
    options?: { publishPath?: string; reservedIds?: string[] },
  ) => { files: number; php: number; icons: number; id: string };
};
const source = read('test/fixtures/beget/api-proxy.sanitized.php');
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

describe('R01 live artifact and release/recovery protection', () => {
  it('checks actual versioned source semantically, independently of a matching fixture hash', () => {
    expect(() => boundary.assertRetiredPhp(source)).not.toThrow();
    for (const effect of [
      'yc_post($dynamic, $body);',
      "yc_request('POST', $target, $body);",
      '$target = "book_record";',
      '$client = resolve_by_phone($phone);',
    ]) {
      expect(() =>
        boundary.assertRetiredPhp(
          source.replace(
            /(case 'create_record':[\s\S]*?)http_response_code\(410\);/,
            (_, prefix: string) => prefix + effect + 'http_response_code(410);',
          ),
        ),
      ).toThrow();
    }
  });

  it.each([
    'yc_post($target, $body);',
    "yc_request('DELETE', $target, []);",
    '$url = "/book_record/1";',
  ])('rejects provider writes moved outside the retired case: %s', (effect) => {
    expect(() => boundary.assertRetiredPhp(source + effect)).toThrow();
  });

  it('checks both versioned passthrough aliases without forbidding canonical API transport', () => {
    for (const file of [
      '../сайт и приложение/maya-native-api.php',
      'deploy/platform/beget-edge/maya-platform-api.php',
    ]) {
      expect(() => boundary.assertNoDirectBooking(read(file))).not.toThrow();
      expect(() =>
        boundary.assertNoDirectBooking(read(file) + 'yc_post($url, $body);'),
      ).toThrow();
    }
  });

  it('cannot promote a sanitized or unknown source by recovery or deploy', () => {
    expect(() => release.candidate(source)).toThrow();
    expect(() => release.candidate(source + '\n')).toThrow();
    const dir = mkdtempSync(join(tmpdir(), 'r01-candidate-'));
    try {
      writeFileSync(join(dir, 'api-proxy.php'), source);
      expect(() => edge.verify(dir)).toThrow('fixture is not deployable');
      rmSync(join(dir, 'api-proxy.php'));
      writeFileSync(join(dir, 'api-proxy.php.bak'), source);
      expect(() => edge.verify(dir)).toThrow(
        'archives are not release candidates',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('registers every live alias, PWA backup and inaccessible historical relay copy', () => {
    const entries = release.manifest.entries;
    expect(entries).toHaveLength(42);
    expect(new Set(entries.map((e) => e.path)).size).toBe(42);
    expect(entries.filter((e) => e.role.endsWith('php'))).toHaveLength(10);
    expect(entries.filter((e) => e.role === 'preserved_html')).toHaveLength(2);
    expect(entries.filter((e) => e.role === 'preserved_backup')).toHaveLength(
      0,
    );
    // R3 moved five of the seven preserved files off-root. The class total is
    // what is pinned, so a role rename can never quietly drop one of them.
    expect(entries.filter((e) => e.role === 'archived_offroot')).toHaveLength(
      5,
    );
    expect(
      entries.filter((e) =>
        ['preserved_html', 'preserved_backup', 'archived_offroot'].includes(
          e.role,
        ),
      ),
    ).toHaveLength(7);
    expect(entries.filter((e) => e.role === 'blocked_archive')).toHaveLength(
      16,
    );
    expect(entries.filter((e) => e.role === 'hosting_config')).toHaveLength(9);
    expect(() => release.validateObserved({ found: [], rows: [] })).toThrow();
    expect(() =>
      release.validateObserved({
        found: [
          ...entries
            .filter(
              (e) => e.role.endsWith('php') || e.role === 'blocked_archive',
            )
            .map((e) => e.path),
          '/unknown.php',
        ].sort(),
        rows: [],
      }),
    ).toThrow();
  });

  it('blocks backend upload/activation and checks post-state; the backend cannot replace Beget pages', () => {
    const deploy = read('deploy/vps/deploy.sh');
    const calls = [...deploy.matchAll(/verify_live_relays \|\| fail/g)].map(
      (m) => m.index,
    );
    expect(calls).toHaveLength(3);
    expect(calls[0]).toBeLessThan(deploy.indexOf('step "3/10'));
    expect(calls[1]).toBeLessThan(deploy.indexOf("sudo -n ln -sfn '$REL'"));
    expect(calls[2]).toBeGreaterThan(
      deploy.indexOf('systemctl restart maya-saas'),
    );
    expect(deploy).toContain('relay-release.cjs" verify');
    expect(deploy).toContain('npm test -- --runInBand --silent');
    expect(deploy).not.toMatch(/public_html|relay-release.cjs" repair/);
    expect(read('deploy/platform/build-mayaos-edge.sh')).toContain(
      'verify-edge-candidate.cjs" "$output"',
    );
  });

  it('probes every former public URL of an archived bundle on every reviewed alias', () => {
    const entries = release.manifest.entries;
    expect(release.deniedRoles).toEqual([
      'blocked_archive',
      'archived_offroot',
    ]);
    expect(release.deniedStatuses).toEqual(['403', '404', '410']);
    const archived = entries.filter((e) => e.role === 'archived_offroot');
    // Four archived files on the eight-origin root, one on the four-origin root.
    expect(archived.flatMap((e) => release.denialUrls(e))).toHaveLength(36);
    expect(
      entries
        .filter((e) => release.deniedRoles.includes(e.role))
        .flatMap((e) => release.denialUrls(e)),
    ).toHaveLength(164);
    // An archived bundle is not a retirement, so it gets one suffix, not two.
    expect(
      archived.flatMap((e) =>
        release.denialUrls(e).filter((u) => u.endsWith('/r01-path-info')),
      ),
    ).toHaveLength(0);
  });

  it('keeps the private archive operator-local and never pins a host archive path', () => {
    const locator = release.manifest.archive.locator;
    expect(Object.keys(locator).sort()).toEqual([
      'env',
      'note',
      'pointerDefault',
      'pointerEnv',
    ]);
    expect(locator.env).toBe('MAYA_R01_ARCHIVE_DIR');
    expect(locator.pointerEnv).toBe('MAYA_R01_ARCHIVE_POINTER');
    // The already-committed private evidence directory the retirement writer owns.
    expect(locator.pointerDefault).toBe(
      '.maya-release-evidence/r01-20260912/archive-dir',
    );
    expect(locator.pointerDefault.startsWith('/')).toBe(false);
    expect(release.manifest.archive.rollbackManifestSha256).toBe(
      'f93c052092bd9ca68a04b4ec56fbe9ee2068ce92345c7f4e606454369e44342e',
    );
    expect(release.archiveRequest({})).toEqual({
      dir: null,
      pointer: '.maya-release-evidence/r01-20260912/archive-dir',
    });
    expect(
      release.archiveRequest({ MAYA_R01_ARCHIVE_DIR: '/operator/local' }).dir,
    ).toBe('/operator/local');
    // The repository publishes the R3 hash of record and nothing else about the archive.
    const evidence = JSON.parse(
      read(
        '../docs/rebuild/evidence/maya-chat-first-ux/legacy-bundle-remediation-r3.json',
      ),
    ) as { rollbackManifestSha256: string };
    expect(evidence.rollbackManifestSha256).toBe(
      release.manifest.archive.rollbackManifestSha256,
    );
  });

  it('pins the two repository-owned routing files against their committed bytes', () => {
    const owned = release.manifest.entries.filter((e) => e.committedSource);
    expect(owned).toHaveLength(2);
    expect(owned.map((e) => e.committedSource).sort()).toEqual([
      '.htaccess',
      'rc/r12-legacy-team-media.htaccess',
    ]);
    for (const entry of owned)
      expect(
        sha(read('deploy/platform/beget-edge/' + entry.committedSource!)),
      ).toBe(entry.sha256);
    expect(release.validateCommittedSources(release.manifest.entries)).toBe(2);
  });

  // Integration-only: consumes the separately built presentation artifact. Backend verification
  // excludes this labelled check explicitly; the ordinary full test command still requires it.
  it('[INTEGRATION-ONLY] gates a static shell candidate as strictly as a PHP edge candidate', () => {
    const shell = resolve(root, '../maya-chat-shell/dist/web');
    const result = edge.verifyShellCandidate(shell);
    // e437e114 split the runtime DOM boundary into shell/dom-port.js. The approved artifact
    // therefore has 38 files; keep the census exact instead of accepting arbitrary extra files.
    expect(result).toMatchObject({ files: 38, php: 0, icons: 3 });
    // A shell that claims the legacy install id would update the owner's existing PWA.
    expect(result.id).toBe('/maya-chat-shell/');
    expect(() =>
      edge.verifyShellCandidate(shell, { reservedIds: ['/maya-chat-shell/'] }),
    ).toThrow('reserved legacy install id');
    expect(() =>
      edge.verifyShellCandidate(shell, { publishPath: '/app/' }),
    ).toThrow('escapes the publish path');
    // verify() keeps its own shape: a PHP-free input is still not an edge release.
    expect(() => edge.verify(shell)).toThrow(
      'Incomplete PWA/relay release input',
    );
  });

  it('atomically repairs one synthetic file; concurrent retry, preserved pages, private history and wrong pre-state', () => {
    const dir = mkdtempSync(join(tmpdir(), 'r01-atomic-'));
    try {
      const target = join(dir, 'relay.php'),
        protectedFile = join(dir, 'maintenance.html');
      const before = 'unsafe synthetic bytes',
        after = 'canonical synthetic refusal';
      writeFileSync(target, before);
      writeFileSync(protectedFile, 'preserve');
      // Run the actual host transaction. Only pinned incident values and host paths
      // are substituted; production CLI has no override for any of these constants.
      const script = release.replaceScript
        .replace(release.manifest.incident.path, target)
        .replaceAll(release.manifest.incident.canonicalSha256, sha(after))
        .replaceAll(release.manifest.incident.unsafeSha256, sha(before))
        .replace(
          'pathlib.Path.home()',
          'pathlib.Path(' + JSON.stringify(dir) + ')',
        );
      const request = {
        candidate: Buffer.from(after).toString('base64'),
        protected: [{ path: protectedFile, sha256: sha('preserve') }],
      };
      const harness = `import sys,json,subprocess,concurrent.futures
r=json.load(sys.stdin)
def run(_):
 p=subprocess.run([sys.executable,'-c',r['script']],input=json.dumps(r['request']),text=True,capture_output=True)
 assert p.returncode==0,p.stderr
 return json.loads(p.stdout)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(run,range(2)))
results.append(run(2))
print(json.dumps(results))`;
      const result = spawnSync('python3', ['-c', harness], {
        input: JSON.stringify({ script, request }),
        encoding: 'utf8',
      });
      expect({ status: result.status, stderr: result.stderr }).toEqual({
        status: 0,
        stderr: '',
      });
      const receipts = JSON.parse(result.stdout) as Array<{
        changedFiles: number;
        backup?: string;
      }>;
      expect(receipts.map((r) => r.changedFiles).sort()).toEqual([0, 0, 1]);
      expect(readFileSync(target, 'utf8')).toBe(after);
      expect(readFileSync(protectedFile, 'utf8')).toBe('preserve');
      expect(
        readFileSync(receipts.find((r) => r.backup)!.backup!, 'utf8'),
      ).toBe(before);
      writeFileSync(target, 'unreviewed upstream change');
      const rejected = spawnSync('python3', ['-c', script], {
        input: JSON.stringify(request),
        encoding: 'utf8',
      });
      expect(rejected.status).not.toBe(0);
      expect(readFileSync(target, 'utf8')).toBe('unreviewed upstream change');
      expect(readFileSync(protectedFile, 'utf8')).toBe('preserve');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
