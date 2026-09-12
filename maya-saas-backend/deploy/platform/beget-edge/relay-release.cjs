#!/usr/bin/env node
/** B38/R01 release/recovery gate. No PHP application or business request runs.
 * Private source bytes stay in process/SSH stdin; only hashes leave the gate.
 * verify is read-only. repair restores one relay and denies two known writers.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const boundary = require('./client-initiator-boundary.cjs');
const manifest = require('./relay-release-manifest.json');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const fixture = path.resolve(__dirname, '../../../test/fixtures/beget/api-proxy.sanitized.php');
const sourceManifest = require('../../../test/fixtures/beget/api-proxy.provenance.json');

function sanitized(source) {
  let result = source;
  for (const row of sourceManifest.redactions) {
    const pattern = new RegExp("(define\\('" + row.constant + "',\\s*)'([^']*)'(\\);)", 'g');
    assert.equal([...result.matchAll(pattern)].length, 1, 'Exact config definition required');
    result = result.replace(pattern, (_, a, _secret, b) => a + "'" + row.replacement + "'" + b);
  }
  return result;
}
function candidate(source) {
  // Idempotent recovery. Never reconstruct historical config or use an unsafe backup.
  if (sha(source) === manifest.incident.canonicalSha256) {
    boundary.assertRetiredPhp(source); return source;
  }
  assert.equal(sha(source), manifest.incident.unsafeSha256, 'Unknown incident input; reconcile before repair');
  const canonical = fs.readFileSync(fixture, 'utf8');
  assert.equal(sha(canonical), sourceManifest.fixtureSha256);
  boundary.assertRetiredPhp(canonical);
  const bounded = /    case 'create_record':[\s\S]*?(?=    case ')/g;
  const oldCases = [...source.matchAll(bounded)], newCases = [...canonical.matchAll(bounded)];
  assert.equal(oldCases.length, 1); assert.equal(newCases.length, 1);
  const result = source.replace(bounded, () => newCases[0][0]);
  assert.equal(sha(result), manifest.incident.canonicalSha256, 'Repair must reproduce exact certified bytes');
  assert.equal(sanitized(result), canonical, 'Only existing secret substitutions may differ from fixture');
  boundary.assertRetiredPhp(result);
  return result;
}

const {inspectScript} = require('./public-relay-inventory.cjs');
function sshPython(script, input) {
  // Script is fixed repository code; data (including candidate credentials) uses stdin.
  const command = 'python3 -c ' + "'" + script.replaceAll("'", "'\\''") + "'";
  const result = spawnSync('ssh', ['-i', path.join(os.homedir(), '.ssh/beget_deploy'),
    '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', 'mocine3388@prime.beget.com', command],
    {input: JSON.stringify(input), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 90000});
  if (result.status !== 0) throw Error('Beget gate transport/host check failed; private output withheld');
  return JSON.parse(result.stdout);
}
function parseCandidate(source) {
  // Syntax inspection only: TOKEN_PARSE never executes the supplied PHP program.
  const script = "token_get_all(stream_get_contents(STDIN), TOKEN_PARSE); echo 'PARSE_PASS';";
  const command = '/usr/local/bin/php8.4 -n -r ' + "'" + script.replaceAll("'", "'\\''") + "'";
  const result = spawnSync('ssh', ['-i', path.join(os.homedir(), '.ssh/beget_deploy'),
    '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', 'mocine3388@prime.beget.com', command],
    {input: source, encoding: 'utf8', timeout: 45000});
  assert.ok(result.status === 0 && result.stdout === 'PARSE_PASS', 'Candidate PHP syntax check failed');
}
function validateObserved(observed, allowIncident = false) {
  const expectedRoots = [...new Set(manifest.entries.map(e =>
    e.path.slice(0, e.path.indexOf('/public_html') + '/public_html'.length)))].sort();
  assert.deepEqual(observed.roots, expectedRoots, 'Unreconciled public web root');
  assert.deepEqual(observed.symlinks, [], 'Unreconciled public symlink/alias target');
  assert.deepEqual(observed.scanErrors, [], 'Incomplete public-root scan');
  const expectedPaths = manifest.entries.filter(e => e.role.endsWith('php') || e.role === 'blocked_archive').map(e => e.path).sort();
  assert.deepEqual(observed.found, expectedPaths, 'Unregistered/missing relay copy');
  const expectedConfiguration = manifest.entries.filter(e => e.role === 'hosting_config')
    .filter(e => !(allowIncident && manifest.retirements.some(r => r.path === e.path && r.beforeSha256 === null)
      && observed.rows.some(r => r.path === e.path && r.missing))).map(e => e.path).sort();
  assert.deepEqual(observed.configurationFound, expectedConfiguration, 'Unreconciled local routing/handler configuration');
  assert.equal(observed.rows.length, manifest.entries.length);
  const seen = new Set();
  for (const entry of manifest.entries) {
    const row = observed.rows.find(r => r.path === entry.path);
    assert.ok(row && !seen.has(row.path), 'Missing/duplicate manifest entry'); seen.add(row.path);
    const incident = allowIncident && entry.path === manifest.incident.path;
    const retirement = allowIncident && manifest.retirements.find(r => r.path === entry.path);
    assert.ok(row.sha256 === entry.sha256 || (incident && row.sha256 === manifest.incident.unsafeSha256)
      || (retirement && row.sha256 === retirement.beforeSha256
        && (row.sha256 !== null || row.missing === true)), 'Live artifact changed: ' + entry.path);
    if (entry.role.endsWith('php')) {
      const bytes = Buffer.from(row.source, 'base64'); assert.equal(sha(bytes), row.sha256);
      const text = incident ? candidate(bytes.toString('utf8')) : bytes.toString('utf8');
      if (entry.role === 'full_php') boundary.assertRetiredPhp(text);
      else boundary.assertNoDirectBooking(text);
    }
  }
  return {entries: seen.size, activePhp: manifest.entries.filter(e => e.role.endsWith('php')).length,
    publicRoots: expectedRoots.length, localRoutingFiles: expectedConfiguration.length, protectedHtmlAndBackups: 7,
    blockedArchives: manifest.entries.filter(e => e.role === 'blocked_archive').length};
}
function denialUrls(entry) {
  const root = manifest.hosting.roots.find(r => entry.path.startsWith(r.path + '/'));
  assert.ok(root, 'Denied artifact has no reviewed domain mapping');
  const relative = entry.path.slice(root.path.length);
  const suffixes = manifest.retirements.some(r => r.artifact === entry.path) ? ['', '/r01-path-info'] : [''];
  return root.origins.flatMap(origin => suffixes.map(suffix => origin + relative + suffix));
}
function verifyBlockedArchives(allowIncident = false) {
  const receipts = [];
  for (const entry of manifest.entries.filter(e => e.role === 'blocked_archive')) {
    if (allowIncident && manifest.retirements.some(r => r.artifact === entry.path)) continue;
    for (const url of denialUrls(entry)) {
    const result = spawnSync('curl', ['--silent', '--show-error', '--head', '--output', '/dev/null',
      '--location', '--max-redirs', '5', '--proto', '=http,https', '--proto-redir', '=http,https',
      '--write-out', '%{http_code} %{url_effective}', '--max-time', '15', url], {encoding: 'utf8', timeout: 20000});
    assert.equal(result.status, 0, 'Archive accessibility check unavailable');
    const [status, effectiveUrl] = result.stdout.trim().split(' ');
    assert.ok(['403', '404', '410'].includes(status), 'Historical archive is publicly reachable: ' + url);
    assert.ok(manifest.hosting.roots.some(r => r.origins.includes(new URL(effectiveUrl).origin)), 'Unreviewed redirect target');
    receipts.push({url, status, effectiveUrl});
    }
  }
  return receipts;
}

// Monotonic HTTP retirement, not a new PHP owner. Validate the entire finite
// pre-state first, then atomic per-file writes under the same remediation lock.
// An interrupted batch is safe to resume; no recovery ever re-enables a writer.
const retireScript = String.raw`
import pathlib,json,hashlib,os,tempfile,fcntl
r=json.loads(input());sha=lambda b:hashlib.sha256(b).hexdigest()
evidence=pathlib.Path.home()/'.maya-release-evidence'/'r01-20260912'
evidence.mkdir(parents=True,exist_ok=True,mode=0o700)
os.chmod(evidence.parent,0o700);os.chmod(evidence,0o700)
with (evidence/'repair.lock').open('a') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 pending=[]
 for item in r['protected']:
  p=pathlib.Path(item['path']);assert not p.is_symlink()
  assert sha(p.read_bytes())==item['sha256']
 for item in r['retirements']:
  p=pathlib.Path(item['path']);assert not p.is_symlink() and p.parent.is_dir()
  before=p.read_bytes() if p.exists() else None
  current=sha(before) if before is not None else None
  assert current in [item['beforeSha256'],item['sha256']]
  if current==item['sha256']:continue
  after=(before or b'')+item['append'].encode()
  assert sha(after)==item['sha256']
  pending.append((p,before,after,item))
 for p,before,after,item in pending:
  backup=evidence/(hashlib.sha256(str(p).encode()).hexdigest()+'.routing-before.json')
  import base64
  record=json.dumps(dict(path=str(p),sha256=item['beforeSha256'],source=base64.b64encode(before).decode() if before is not None else None)).encode()
  if backup.exists():assert backup.read_bytes()==record
  else:
   fd=os.open(backup,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
   with os.fdopen(fd,'wb') as f:f.write(record);f.flush();os.fsync(f.fileno())
  fd,tmp=tempfile.mkstemp(prefix='routing-',dir=evidence)
  try:
   with os.fdopen(fd,'wb') as f:f.write(after);f.flush();os.fsync(f.fileno())
   os.chmod(tmp,(p.stat().st_mode & 0o777) if p.exists() else 0o644)
   assert (p.read_bytes() if p.exists() else None)==before
   os.replace(tmp,p)
   assert sha(p.read_bytes())==item['sha256']
  finally:
   if os.path.exists(tmp):os.unlink(tmp)
 for item in r['retirements']:assert sha(pathlib.Path(item['path']).read_bytes())==item['sha256']
 for item in r['protected']:assert sha(pathlib.Path(item['path']).read_bytes())==item['sha256']
 print(json.dumps(dict(status='HTTP_RETIRED',changedFiles=len(pending),historicalPhpChanged=0,businessEffects=0)))
`;

const replaceScript = String.raw`
import pathlib,json,hashlib,os,tempfile,fcntl
r=json.loads(input()); target=pathlib.Path('/home/m/mocine3388/muzhskayaestetika.rf/public_html/app/api-proxy.php')
import base64
candidate=base64.b64decode(r['candidate'],validate=True)
expected='b1006160a28e66448886bdc4b520a2d94021121748259c2cd1aeefda5f1aaaa0'
unsafe='d5eeaa82f69f6d72c366576797c2920fecd0d27f76262e2c5f4a342f363ddd05'
sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha(candidate)==expected
evidence=pathlib.Path.home()/'.maya-release-evidence'/'r01-20260912'
evidence.mkdir(parents=True,exist_ok=True,mode=0o700)
os.chmod(evidence.parent,0o700);os.chmod(evidence,0o700)
with (evidence/'repair.lock').open('a') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 before=target.read_bytes();state=sha(before)
 assert state in [unsafe,expected]
 for item in r['protected']:
  assert sha(pathlib.Path(item['path']).read_bytes())==item['sha256']
 if state==expected:
  print(json.dumps(dict(status='ALREADY_CANONICAL',sha256=state,changedFiles=0)));raise SystemExit(0)
 backup=evidence/(unsafe+'.private-backup')
 if backup.exists():assert sha(backup.read_bytes())==unsafe
 else:
  fd=os.open(backup,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
  with os.fdopen(fd,'wb') as f:f.write(before);f.flush();os.fsync(f.fileno())
 fd,tmp=tempfile.mkstemp(prefix='candidate-',dir=evidence)
 try:
  with os.fdopen(fd,'wb') as f:f.write(candidate);f.flush();os.fsync(f.fileno())
  os.chmod(tmp,target.stat().st_mode & 0o777)
  assert sha(target.read_bytes())==unsafe
  os.replace(tmp,target)
  assert sha(target.read_bytes())==expected
  for item in r['protected']:assert sha(pathlib.Path(item['path']).read_bytes())==item['sha256']
  print(json.dumps(dict(status='REMEDIATED',sha256=expected,changedFiles=1,backup=str(backup),businessEffects=0)))
 finally:
  if os.path.exists(tmp):os.unlink(tmp)
# Never roll back to unsafe bytes. On an error after replacement, reconcile read-only.
`;
function main(mode) {
  assert.ok(['verify', 'prepare', 'repair'].includes(mode), 'Usage: relay-release.cjs verify|prepare|repair');
  const observed = sshPython(inspectScript, manifest);
  const summary = validateObserved(observed, mode !== 'verify');
  let denials = verifyBlockedArchives(mode !== 'verify');
  const row = observed.rows.find(e => e.path === manifest.incident.path);
  const result = candidate(Buffer.from(row.source, 'base64').toString('utf8'));
  parseCandidate(result);
  let repair = null;
  if (mode === 'repair') {
    const retirement = sshPython(retireScript, {retirements: manifest.retirements,
      protected: observed.rows.filter(e => !manifest.retirements.some(r => r.path === e.path))
        .map(e => ({path: e.path, sha256: e.sha256}))});
    // Denial must work at the actual known URLs before the active relay repair.
    denials = verifyBlockedArchives();
    repair = sshPython(replaceScript, {candidate: Buffer.from(result).toString('base64'),
      protected: manifest.entries.filter(e => e.path !== manifest.incident.path)});
    repair.retirement = retirement;
    validateObserved(sshPython(inspectScript, manifest));
    denials = verifyBlockedArchives();
  }
  console.log(JSON.stringify({status: 'PASS', mode, ...summary, repair, denials,
    phpSourceEvaluation: 0, bookingProviderMessageEffects: 0}));
}
module.exports = {candidate, sanitized, validateObserved, inspectScript, replaceScript, retireScript, denialUrls, manifest};
if (require.main === module) {
  try { main(process.argv[2]); } catch (e) {
    // Assertion errors can include private actual/expected source strings.
    console.error('R01 relay gate failed: ' + (e.code === 'ERR_ASSERTION' ? 'manifest/source assertion; no private values emitted' : e.message));
    process.exitCode = 1;
  }
}
