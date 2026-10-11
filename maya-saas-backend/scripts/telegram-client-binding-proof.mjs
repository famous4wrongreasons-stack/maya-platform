// Isolated synthetic Telegram/CRM proof. Never starts the owner database or uses provider credentials.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
const backend = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const { proofCommands, proofEnvironment, runCommand } = await import(
  pathToFileURL(path.join(backend, 'scripts/c9-occupancy-proof.mjs'))
);
const output = process.argv[2];
const withBrowser = process.argv[3] === '--browser';
const testNamePattern = process.env.JEST_TELEGRAM_TEST_PATTERN || undefined;
assert.ok(!testNamePattern || (testNamePattern.length <= 500 && !/[\r\n]/.test(testNamePattern)));
assert.ok(process.argv.length === (withBrowser ? 4 : 3), 'unknown proof arguments');
assert.ok(output && path.isAbsolute(output) && !fs.existsSync(output));
for (const f of ['.env', '.env.local'])
  assert.equal(fs.existsSync(path.join(backend, f)), false);
fs.mkdirSync(output, { mode: 0o700 });
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-telegram-initial-'));
fs.chmodSync(root, 0o700);
const cluster = path.join(root, 'pg'),
  pgBin = '/opt/homebrew/opt/postgresql@16/bin';
const s = net.createServer();
await new Promise((r) => s.listen(0, '127.0.0.1', r));
const port = s.address().port;
await new Promise((r) => s.close(r));
const database =
  'maya_widget_gate_proof_c9occ_' + randomBytes(6).toString('hex');
const env = proofEnvironment(
  process.env,
  `postgresql://c9_proof@127.0.0.1:${port}/${database}`,
);
if (withBrowser) env.JEST_TELEGRAM_BROWSER_OUTPUT = output;
const scopes = [
  'src',
  'test/widgets-live',
  'test/jest-widgets-live.json',
  'scripts/c9-occupancy-proof.mjs',
  'scripts/telegram-client-binding-proof.mjs',
  'scripts/telegram-client-binding-mutations.mjs',
  'scripts/local-*.mjs',
  'scripts/local-*.d.mts',
  'scripts/conversation-qualification/current-candidate-budget.mjs',
  '../maya-chat-shell/dev',
  '../maya-chat-shell/test/cdp-verify.mjs',
  'prisma',
  '../maya-chat-shell/src',
  '../maya-carrier-react/src',
  '../maya-carrier-react/build.mjs',
  '../maya-carrier-react/test/telegram-personal-browser-probe.mjs',
  'deploy/platform/beget-edge/oauth-callback.html',
  'package.json',
  'package-lock.json',
];
const git = (args) =>
  execFileSync('git', args, {
    cwd: backend,
    encoding: 'utf8',
    maxBuffer: 12 * 1024 * 1024,
  });
const hashes = () =>
  Object.fromEntries(
    [
      ...new Set(
        git([
          'ls-files',
          '-z',
          '--cached',
          '--others',
          '--exclude-standard',
          '--',
          ...scopes,
        ])
          .split('\0')
          .filter(Boolean),
      ),
    ]
      .sort()
      .map((f) => [
        f,
        createHash('sha256')
          .update(fs.readFileSync(path.resolve(backend, f)))
          .digest('hex'),
      ]),
  );
const before = hashes();
const head = git(['rev-parse', 'HEAD']).trim();
fs.writeFileSync(
  path.join(output, 'source-hashes.json'),
  JSON.stringify(before, null, 2) + '\n',
  { mode: 0o600 },
);
const manifest = {
  qualification: 'SYNTHETIC_SCRIPTED_HTTP_PG_NOT_RELEASE_CERTIFICATION',
  head,
  workingPatch:
    git([
      'status',
      '--porcelain',
      '--untracked-files=all',
      '--',
      ...scopes,
    ]).trim() !== '',
  testNamePattern: testNamePattern ?? null,
  cluster,
  database,
  port,
  status: 'running',
  completed: [],
  realModelAcceptance: false,
  realProviderAcceptance: false,
  runnerSha256: createHash('sha256')
    .update(fs.readFileSync(process.argv[1]))
    .digest('hex'),
};
const save = () =>
  fs.writeFileSync(
    path.join(output, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    { mode: 0o600 },
  );
const control = {
  cancelled: null,
  terminateActive: null,
  activeCleanup: false,
};
const cancel = (signal) => {
  control.cancelled = signal;
  if (!control.activeCleanup) control.terminateActive?.();
};
const term = () => cancel('SIGTERM'),
  int = () => cancel('SIGINT');
process.on('SIGTERM', term);
process.on('SIGINT', int);
const commands = proofCommands({
  pgBin,
  cluster,
  log: path.join(output, 'postgres.log'),
  port,
  database,
  receipt: path.join(root, 'private.json'),
  output,
  ownerChat: true,
}).slice(0, 4);
if (withBrowser) commands.push({
  name: 'current-react-build', command: process.execPath,
  args: ['build.mjs', '--target=web'],
  cwd: path.resolve(backend, '../maya-carrier-react'),
});
commands.push({
  name: 'telegram-initial',
  command: process.execPath,
  args: [
    'node_modules/jest/bin/jest.js',
    '--config',
    'test/jest-widgets-live.json',
    '--runInBand',
    '--runTestsByPath',
    'test/widgets-live/telegram-client-binding.live-spec.ts',
    'test/widgets-live/local-owner-telegram.live-spec.ts',
    ...(process.env.JEST_TELEGRAM_WITH_SUCCESSOR === '1'
      ? ['test/widgets-live/sb1-successor.live-spec.ts']
      : []),
    ...(testNamePattern ? ['--testNamePattern', testNamePattern] : []),
    '--json',
    '--outputFile=' + path.join(output, 'telegram-initial-jest.json'),
  ],
});
let start = false;
save();
try {
  for (const c of commands) {
    if (c.name === 'pg-start') start = true;
    process.stdout.write(c.name + '\n');
    await runCommand(c, env, output, control);
    manifest.completed.push(c.name);
    save();
  }
  manifest.status = 'passed';
} catch (error) {
  manifest.status = 'failed';
  manifest.failure = error.message;
  process.exitCode = 1;
} finally {
  if (start) {
    try {
      await runCommand(
        {
          name: 'pg-stop',
          command: path.join(pgBin, 'pg_ctl'),
          args: ['-D', cluster, '-m', 'fast', '-w', '-t', '30', 'stop'],
        },
        env,
        output,
        control,
      );
      manifest.clusterStopped = true;
    } catch {
      manifest.clusterStopped = false;
      manifest.status = 'failed-cleanup';
      process.exitCode = 1;
    }
  }
  manifest.pidFileAbsent = !fs.existsSync(path.join(cluster, 'postmaster.pid'));
  manifest.sourceUnchanged =
    JSON.stringify(hashes()) === JSON.stringify(before) &&
    git(['rev-parse', 'HEAD']).trim() === head;
  if (!manifest.sourceUnchanged) {
    manifest.status = 'failed-source-drift';
    process.exitCode = 1;
  }
  save();
  process.off('SIGTERM', term);
  process.off('SIGINT', int);
}
console.log(
  JSON.stringify({
    status: manifest.status,
    clusterStopped: manifest.clusterStopped,
    sourceUnchanged: manifest.sourceUnchanged,
  }),
);
