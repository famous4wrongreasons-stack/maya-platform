import { createRequire } from 'node:module';
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const load = createRequire(__filename);
const sha = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');
const scanner = load(
  '../../deploy/platform/beget-edge/public-relay-inventory.cjs',
) as { inspectScript: string };
const release = load('../../deploy/platform/beget-edge/relay-release.cjs') as {
  validateObserved: (observed: object) => void;
  validateCommittedSources: (
    entries: Array<{ path: string; sha256: string; committedSource?: string }>,
    baseDir?: string,
  ) => number;
  validateArchive: (archive: object | undefined) => object;
  assertDenialResponse: (probe: {
    url: string;
    status: string;
    effectiveUrl: string;
  }) => void;
  denialUrls: (entry: { path: string }) => string[];
  deniedRoles: string[];
  manifest: {
    archive: { rollbackManifestSha256: string };
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
  ) => object;
};
const gateDir = resolve(__dirname, '../../deploy/platform/beget-edge');
const entries = () => release.manifest.entries;
const archived = () => entries().filter((e) => e.role === 'archived_offroot');
// A structurally complete observation: correct roots, sets and row count, with the
// five archived bundles absent. Every mutation below changes exactly one thing.
function observedFromManifest() {
  const roots = [
    ...new Set(
      entries().map((e) => e.path.split('/public_html/')[0] + '/public_html'),
    ),
  ].sort();
  return {
    roots,
    symlinks: [] as unknown[],
    scanErrors: [] as string[],
    found: entries()
      .filter((e) => e.role.endsWith('php') || e.role === 'blocked_archive')
      .map((e) => e.path)
      .sort(),
    configurationFound: entries()
      .filter((e) => e.role === 'hosting_config')
      .map((e) => e.path)
      .sort(),
    rows: entries().map((e) =>
      e.role === 'archived_offroot'
        ? { path: e.path, sha256: null, missing: true }
        : { path: e.path, sha256: e.sha256 },
    ) as Array<{ path: string; sha256: string | null; missing?: boolean }>,
  };
}
function archiveFromManifest() {
  return {
    resolved: true,
    reason: null,
    source: 'env',
    mode: '0o700',
    files: 45,
    bytes: 104312958,
    hashes: [
      release.manifest.archive.rollbackManifestSha256,
      ...archived().map((e) => e.sha256),
    ].sort(),
    symlinks: 0,
    errors: [] as string[],
    insidePublicRoot: false,
  };
}
interface Scan {
  found: string[];
  configurationFound: string[];
  roots: string[];
  symlinks: Array<{ path: string; target: string }>;
  scanErrors: string[];
  discovered: Array<{
    path: string;
    directBookRecord: boolean;
    providerWriteCandidate: boolean;
    canonicalRefusal: boolean;
  }>;
}
function inspect(home: string): Scan {
  const request = join(home, 'request.json');
  writeFileSync(request, JSON.stringify({ entries: [] }), { mode: 0o600 });
  const fd = openSync(request, 'r');
  try {
    return JSON.parse(
      execFileSync(
        'python3',
        [
          '-I',
          '-B',
          '-c',
          scanner.inspectScript.replace('/home/m/mocine3388', home),
        ],
        { cwd: home, encoding: 'utf8', stdio: [fd, 'pipe', 'pipe'] },
      ),
    ) as Scan;
  } finally {
    closeSync(fd);
  }
}
describe('R01 finite public relay surface class', () => {
  it('blocks a new relay inside a known root before manifest row validation', () => {
    const entries = release.manifest.entries;
    const roots = [
      ...new Set(
        entries.map(
          (entry) => entry.path.split('/public_html/')[0] + '/public_html',
        ),
      ),
    ].sort();
    const found = entries
      .filter(
        (entry) =>
          entry.role.endsWith('php') || entry.role === 'blocked_archive',
      )
      .map((entry) => entry.path);
    expect(() =>
      release.validateObserved({
        roots,
        symlinks: [],
        scanErrors: [],
        rows: [],
        found: [...found, roots[0] + '/recovery/renamed.phtml'].sort(),
      }),
    ).toThrow('Unregistered/missing relay copy');
    expect(() =>
      release.validateObserved({
        roots,
        symlinks: [],
        scanErrors: ['unreadable'],
        rows: [],
      }),
    ).toThrow('Incomplete public-root scan');
    expect(() =>
      release.validateObserved({
        roots,
        symlinks: [{ path: roots[0] + '/alias', target: '/outside' }],
        scanErrors: [],
        rows: [],
      }),
    ).toThrow('Unreconciled public symlink/alias target');
  });
  it('discovers nested, renamed, legacy-extension and alternate-root relays without executing PHP', () => {
    const home = mkdtempSync(join(tmpdir(), 'maya-public-relay-'));
    try {
      const root = join(home, 'business.example/public_html'),
        other = join(home, 'technical.example/public_html');
      mkdirSync(join(root, 'app/backups'), { recursive: true });
      mkdirSync(other, { recursive: true });
      const paths = [
        join(root, 'app/api-proxy.php'),
        join(root, 'app/backups/before-loyalty.php'),
        join(root, 'app/backups/recovered.phtml'),
        join(root, 'app/backups/recovered.phtm'),
        join(root, 'app/backups/service.php.bak'),
        join(root, 'app/backups/renamed.txt'),
        join(other, 'gateway.php'),
      ];
      for (const file of paths)
        writeFileSync(
          file,
          '<?php yc_post("/records/$tenant", $body); file_put_contents("EXECUTED", "bad");',
        );
      writeFileSync(join(root, '.htaccess'), 'Require all denied');
      writeFileSync(paths[1], '<?php yc_post("/book_record/1", $body);');
      writeFileSync(join(root, 'photo.jpg'), Buffer.from([0, 1, 2, 3]));
      const result = inspect(home);
      expect(result.roots).toEqual([root, other]);
      expect(result.found).toEqual(paths.sort());
      expect(result.configurationFound).toEqual([join(root, '.htaccess')]);
      expect(result.scanErrors).toEqual([]);
      expect(result.discovered.every((r) => r.providerWriteCandidate)).toBe(
        true,
      );
      expect(result.discovered.filter((r) => r.directBookRecord)).toHaveLength(
        1,
      );
      expect(result.discovered.every((r) => !r.canonicalRefusal)).toBe(true);
      expect(existsSync(join(home, 'EXECUTED'))).toBe(false);
      expect(() => release.validateObserved(result)).toThrow();
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
  it('reports symlink targets and refuses incomplete/unreconciled coverage', () => {
    const home = mkdtempSync(join(tmpdir(), 'maya-public-relay-'));
    try {
      const root = join(home, 'business.example/public_html'),
        privateDir = join(home, 'private-release');
      mkdirSync(root, { recursive: true });
      mkdirSync(privateDir);
      writeFileSync(join(privateDir, 'relay.php'), '<?php echo "private";');
      symlinkSync(privateDir, join(root, 'recovery'));
      const result = inspect(home);
      expect(result.symlinks).toEqual([
        { path: join(root, 'recovery'), target: realpathSync(privateDir) },
      ]);
      expect(() => release.validateObserved(result)).toThrow();
      symlinkSync(
        join(home, 'business.example'),
        join(home, 'aliased.example'),
      );
      const aliased = inspect(home);
      expect(aliased.symlinks).toContainEqual({
        path: join(home, 'aliased.example'),
        target: realpathSync(join(home, 'business.example')),
      });
      expect(() => release.validateObserved(aliased)).toThrow();
      expect(() =>
        release.validateObserved({ ...result, scanErrors: ['unreadable'] }),
      ).toThrow();
      const gate = readFileSync(
        join(__dirname, '../../deploy/platform/beget-edge/relay-release.cjs'),
        'utf8',
      );
      expect(gate).toContain("require('./public-relay-inventory.cjs')");
      for (const marker of [
        'observed.roots',
        'observed.symlinks',
        'observed.scanErrors',
        'observed.found, expectedPaths',
      ])
        expect(gate).toContain(marker);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('R01 archived-off-root reconciliation — mutation rows', () => {
  it('fails closed when an archived bundle is restored to a public root', () => {
    const target = archived()[0];
    // The scanner's PHP predicate never sees HTML, so absence is the only mechanism.
    const restored = observedFromManifest();
    const row = restored.rows.find((r) => r.path === target.path)!;
    row.sha256 = target.sha256;
    row.missing = false;
    expect(() => release.validateObserved(restored)).toThrow(
      'Archived artifact restored into a public root',
    );
    const halfRestored = observedFromManifest();
    const other = halfRestored.rows.find((r) => r.path === target.path)!;
    delete other.missing;
    expect(() => release.validateObserved(halfRestored)).toThrow(
      'Archived artifact restored into a public root',
    );
  });

  it('fails closed on a live artifact whose bytes no longer match its pin', () => {
    const drifted = observedFromManifest();
    const first = entries()[0];
    drifted.rows.find((r) => r.path === first.path)!.sha256 = sha('drifted');
    expect(() => release.validateObserved(drifted)).toThrow(
      'Live artifact changed',
    );
  });

  it('fails closed when a pinned hash is edited to match a changed file', () => {
    const owned = entries().filter((e) => e.committedSource);
    expect(owned).toHaveLength(4);
    // Committed bytes unchanged, pin moved to a new "live" hash: manifest-only weakening.
    for (const entry of owned)
      expect(() =>
        release.validateCommittedSources([
          { ...entry, sha256: sha('a changed routing file') },
        ]),
      ).toThrow('Committed routing source does not match its pin');
    // And the mirror image: the committed file edited while the pin stands still.
    const home = mkdtempSync(join(tmpdir(), 'maya-routing-'));
    try {
      mkdirSync(join(home, 'rc'), { recursive: true });
      for (const entry of owned) {
        mkdirSync(resolve(home, entry.committedSource!, '..'), {
          recursive: true,
        });
        writeFileSync(
          join(home, entry.committedSource!),
          readFileSync(join(gateDir, entry.committedSource!)),
        );
        expect(release.validateCommittedSources([entry], home)).toBe(1);
        writeFileSync(
          join(home, entry.committedSource!),
          readFileSync(join(gateDir, entry.committedSource!), 'utf8') +
            '\n# drift\n',
        );
        expect(() => release.validateCommittedSources([entry], home)).toThrow(
          'Committed routing source does not match its pin',
        );
      }
      // A committed source may not be reached from outside the gate directory.
      expect(() =>
        release.validateCommittedSources(
          [{ ...owned[0], committedSource: '../../../package.json' }],
          home,
        ),
      ).toThrow('must live beside the gate');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('fails closed on a former public URL that answers 200 or redirects off-review', () => {
    expect(release.deniedRoles).toContain('archived_offroot');
    const urls = archived().flatMap((e) => release.denialUrls(e));
    expect(urls).toHaveLength(36);
    expect(urls.every((u) => new URL(u).search === '')).toBe(true);
    for (const status of ['200', '204', '301', '500'])
      expect(() =>
        release.assertDenialResponse({
          url: urls[0],
          status,
          effectiveUrl: urls[0],
        }),
      ).toThrow('Historical archive is publicly reachable');
    for (const status of ['403', '404', '410'])
      expect(() =>
        release.assertDenialResponse({
          url: urls[0],
          status,
          effectiveUrl: urls[0],
        }),
      ).not.toThrow();
    expect(() =>
      release.assertDenialResponse({
        url: urls[0],
        status: '404',
        effectiveUrl: 'https://example.invalid/app/tenant-test.html',
      }),
    ).toThrow('Unreviewed redirect target');
  });

  it('fails closed when an archive hash does not match, or the locator does not resolve', () => {
    expect(release.validateArchive(archiveFromManifest())).toEqual({
      archivedOffrootVerified: 5,
      archiveFiles: 45,
    });
    const missingPin = archiveFromManifest();
    missingPin.hashes = missingPin.hashes.filter(
      (h) => h !== archived()[0].sha256,
    );
    expect(() => release.validateArchive(missingPin)).toThrow(
      'no longer present at its pinned hash',
    );
    const altered = archiveFromManifest();
    altered.hashes = altered.hashes.map((h) =>
      h === archived()[0].sha256 ? sha('an altered archived byte') : h,
    );
    expect(() => release.validateArchive(altered)).toThrow(
      'no longer present at its pinned hash',
    );
    const swapped = archiveFromManifest();
    swapped.hashes = swapped.hashes.filter(
      (h) => h !== release.manifest.archive.rollbackManifestSha256,
    );
    expect(() => release.validateArchive(swapped)).toThrow(
      'rollback manifest of record is absent',
    );
    // A missing pointer must fail the gate, never skip the class.
    for (const reason of [
      'locator-missing',
      'locator-empty',
      'archive-missing',
    ])
      expect(() =>
        release.validateArchive({
          ...archiveFromManifest(),
          resolved: false,
          reason,
        }),
      ).toThrow('Private archive locator unresolved');
    expect(() => release.validateArchive(undefined)).toThrow(
      'Private archive locator unresolved',
    );
    expect(() =>
      release.validateArchive({
        ...archiveFromManifest(),
        insidePublicRoot: true,
      }),
    ).toThrow('outside every public root');
    expect(() =>
      release.validateArchive({ ...archiveFromManifest(), symlinks: 1 }),
    ).toThrow('Unreconciled private archive symlink');
    expect(() =>
      release.validateArchive({
        ...archiveFromManifest(),
        errors: ['unreadable'],
      }),
    ).toThrow('Incomplete private archive scan');
  });

  it('keeps a manifest edited to hide the drift pinned to the R3 record', () => {
    const r3 = JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          '../../../docs/rebuild/evidence/maya-chat-first-ux/legacy-bundle-remediation-r3.json',
        ),
        'utf8',
      ),
    ) as {
      rollbackManifestSha256: string;
      publicLegacyBundlesExposed: { after: number };
      files: Array<{ sha256: string; httpAfter: number }>;
    };
    // Editing a pinned hash to match a changed file stops matching R3's own record
    // of what was moved, so the drift cannot be hidden inside the release manifest.
    const moved = new Map(r3.files.map((f) => [f.sha256, f.httpAfter]));
    expect(archived()).toHaveLength(5);
    for (const entry of archived()) {
      expect(moved.has(entry.sha256)).toBe(true);
      expect(moved.get(entry.sha256)).toBe(404);
    }
    expect(r3.publicLegacyBundlesExposed.after).toBe(0);
    expect(release.manifest.archive.rollbackManifestSha256).toBe(
      r3.rollbackManifestSha256,
    );
  });

  it('refuses a shell release input that carries PHP, routing config or an escaping manifest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'maya-shell-candidate-'));
    try {
      const manifest = {
        id: '/maya-shell-test/',
        scope: './',
        start_url: './',
        icons: [{ src: './icons/a.png', sizes: '192x192', type: 'image/png' }],
      };
      const write = (name: string, body: string | Buffer) => {
        mkdirSync(join(dir, name, '..'), { recursive: true });
        writeFileSync(join(dir, name), body);
      };
      const reset = () => {
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(join(dir, 'icons'), { recursive: true });
        write('index.html', '<!doctype html><title>shell</title>');
        write('manifest.webmanifest', JSON.stringify(manifest));
        write('icons/a.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]));
      };
      reset();
      expect(edge.verifyShellCandidate(dir)).toMatchObject({
        files: 3,
        php: 0,
        icons: 1,
      });
      // A shell release input carries no PHP — by extension or by opener.
      reset();
      write('relay.php', '<?php echo 1;');
      expect(() => edge.verifyShellCandidate(dir)).toThrow('carries no PHP');
      reset();
      write('notes.txt', '<?php echo 1;');
      expect(() => edge.verifyShellCandidate(dir)).toThrow('carries no PHP');
      reset();
      write('api-proxy.php.bak', 'historical');
      expect(() => edge.verifyShellCandidate(dir)).toThrow(
        'archives are not release candidates',
      );
      reset();
      write('.htaccess', 'Require all denied');
      expect(() => edge.verifyShellCandidate(dir)).toThrow(
        'Routing/handler configuration is not a shell release input',
      );
      reset();
      symlinkSync(join(dir, 'index.html'), join(dir, 'alias.html'));
      expect(() => edge.verifyShellCandidate(dir)).toThrow(
        'Unreviewed symlink release input',
      );
      reset();
      write(
        'manifest.webmanifest',
        JSON.stringify({
          ...manifest,
          icons: [{ src: './icons/missing.png' }],
        }),
      );
      expect(() => edge.verifyShellCandidate(dir)).toThrow(
        'icon does not resolve inside the candidate',
      );
      reset();
      write(
        'manifest.webmanifest',
        JSON.stringify({ ...manifest, scope: '../' }),
      );
      expect(() => edge.verifyShellCandidate(dir)).toThrow(
        'escapes the candidate',
      );
      reset();
      write(
        'manifest.webmanifest',
        JSON.stringify({ ...manifest, id: '/app/' }),
      );
      expect(() => edge.verifyShellCandidate(dir)).toThrow(
        'reserved legacy install id',
      );
      reset();
      write(
        'manifest.webmanifest',
        JSON.stringify({ ...manifest, id: 'https://elsewhere.example/' }),
      );
      expect(() => edge.verifyShellCandidate(dir)).toThrow(
        'must be same-origin',
      );
      // And the PHP-free input the old gate rejects stays rejected by the old gate.
      reset();
      expect(() => edge.verify(dir)).toThrow(
        'Incomplete PWA/relay release input',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('wires every new class into the gate itself, not only into these tests', () => {
    const gate = readFileSync(join(gateDir, 'relay-release.cjs'), 'utf8');
    for (const marker of [
      'validateCommittedSources(manifest.entries)',
      'validateArchive(sshPython(archiveScript, archiveRequest()))',
      "role === 'archived_offroot'",
      'row.missing === true && row.sha256 === null',
      'deniedRoles.includes(e.role)',
      'manifest.entries.filter(preservedClass).length',
    ])
      expect(gate).toContain(marker);
    // The derived count replaced the literal that used to hide a drift.
    expect(gate).not.toContain('protectedHtmlAndBackups: 7');
    // Both PHP predicates come from the live scanner, so they cannot drift.
    const candidateGate = readFileSync(
      join(gateDir, 'verify-edge-candidate.cjs'),
      'utf8',
    );
    expect(candidateGate).toContain("require('./public-relay-inventory.cjs')");
    expect(candidateGate).toContain('new RegExp(phpNamePattern');
    expect(candidateGate).toContain('new RegExp(phpOpenerPattern');
    // verify() keeps its own mandatory shape.
    expect(candidateGate).toContain(
      "if (!php || !pwa) throw Error('Incomplete PWA/relay release input');",
    );
  });
});
