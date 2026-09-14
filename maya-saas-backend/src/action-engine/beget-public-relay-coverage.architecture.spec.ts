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
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
const load = createRequire(__filename);
const scanner = load(
  '../../deploy/platform/beget-edge/public-relay-inventory.cjs',
) as { inspectScript: string };
const release = load('../../deploy/platform/beget-edge/relay-release.cjs') as {
  validateObserved: (observed: object) => void;
  manifest: { entries: Array<{ path: string; role: string }> };
};
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
