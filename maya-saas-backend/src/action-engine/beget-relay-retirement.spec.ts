import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const load = createRequire(__filename);
const release = load('../../deploy/platform/beget-edge/relay-release.cjs') as {
  retireScript: string;
  denialUrls: (entry: { path: string }) => string[];
  manifest: {
    retirements: Array<{ artifact: string }>;
    entries: Array<{ path: string; role: string }>;
  };
};
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

describe('R01 exact public retirement and recovery', () => {
  it('covers known alternate domains, redirects and PATH_INFO without business request parameters', () => {
    const urls = release.manifest.retirements.flatMap((r) =>
      release.denialUrls({ path: r.artifact }),
    );
    expect(urls).toHaveLength(20);
    expect(new Set(urls.map((u) => new URL(u).hostname)).size).toBe(6);
    expect(
      urls.some((u) => u.startsWith('http://www.mocine3388.beget.tech/')),
    ).toBe(true);
    expect(
      urls.some((u) => u.includes('www.xn--80aaocmjdk0cclbf8l3a.xn--p1ai')),
    ).toBe(true);
    expect(urls.filter((u) => u.endsWith('/r01-path-info'))).toHaveLength(10);
    expect(urls.every((u) => new URL(u).search === '')).toBe(true);
    expect(() => release.denialUrls({ path: '/unmapped/relay.php' })).toThrow();
  });

  it('preserves historical PHP and maintenance, resumes partial retirement, rejects changed pre-state before any write', () => {
    const home = mkdtempSync(join(tmpdir(), 'maya-r01-retire-'));
    try {
      const first = join(home, 'technical.htaccess'),
        second = join(home, 'backups/.htaccess');
      mkdirSync(join(home, 'backups'));
      const php = join(home, 'legacy.php'),
        page = join(home, 'maintenance.html');
      writeFileSync(php, 'historical unsafe source');
      writeFileSync(page, 'preserved maintenance');
      const original = 'existing configuration';
      const addition = '\n<Files "legacy.php">\nRequire all denied\n</Files>\n';
      writeFileSync(first, original);
      const request = {
        retirements: [
          {
            path: first,
            beforeSha256: sha(original),
            sha256: sha(original + addition),
            append: addition,
          },
          {
            path: second,
            beforeSha256: null,
            sha256: sha(addition),
            append: addition,
          },
        ],
        protected: [
          { path: php, sha256: sha('historical unsafe source') },
          { path: page, sha256: sha('preserved maintenance') },
        ],
      };
      const script = release.retireScript.replace(
        'pathlib.Path.home()',
        'pathlib.Path(' + JSON.stringify(home) + ')',
      );
      const run = () =>
        spawnSync('python3', ['-c', script], {
          input: JSON.stringify(request),
          encoding: 'utf8',
        });
      // An unexpected second config must prevent even the first write.
      writeFileSync(second, 'external routing');
      expect(run().status).not.toBe(0);
      expect(readFileSync(first, 'utf8')).toBe(original);
      rmSync(second);
      // Crash/restart state: first file already retired, second not yet admitted.
      writeFileSync(first, original + addition);
      const result = run();
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        changedFiles: 1,
        historicalPhpChanged: 0,
        businessEffects: 0,
      });
      expect(run().stdout).toContain('"changedFiles": 0');
      expect(readFileSync(second, 'utf8')).toBe(addition);
      expect(readFileSync(first, 'utf8')).toBe(original + addition);
      expect(readFileSync(php, 'utf8')).toBe('historical unsafe source');
      expect(readFileSync(page, 'utf8')).toBe('preserved maintenance');
      // Concurrent full retries converge under the shared lock.
      const harness = `import sys,json,subprocess,concurrent.futures
r=json.loads(input())
def run(_):
 p=subprocess.run([sys.executable,'-c',r['script']],input=json.dumps(r['request']),text=True,capture_output=True)
 assert p.returncode==0,p.stderr
 return json.loads(p.stdout)['changedFiles']
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: print(json.dumps(list(pool.map(run,range(2)))))`;
      const concurrent = spawnSync('python3', ['-c', harness], {
        input: JSON.stringify({ script, request }),
        encoding: 'utf8',
      });
      expect(concurrent.status).toBe(0);
      expect(JSON.parse(concurrent.stdout)).toEqual([0, 0]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
