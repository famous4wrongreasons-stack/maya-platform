/** Build a self-contained PHP proof from pinned candidate case bodies and the
 * actual two relay header blocks. PHP fixture imports no app/config/runtime.
 * Run with PHP -n and network/process/filesystem functions disabled.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const [candidateDirectory, output] = process.argv.slice(2);
if (!candidateDirectory || !output) throw Error('candidate directory and output fixture required');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/rebuild/evidence/package5-wave-ra-r01-overlay-manifest.json'), 'utf8'));
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const relayPaths = ['сайт и приложение/maya-native-api.php', 'maya-saas-backend/deploy/platform/beget-edge/maya-platform-api.php'];
const sources = [];
const blocks = [];
for (const [index, name] of relayPaths.entries()) {
  const source = fs.readFileSync(path.join(root, name), 'utf8');
  const start = source.indexOf('function maya_forwarded_idempotency_key(');
  const end = source.indexOf('\ntry {', start);
  if (start < 0 || end < 0) throw Error('Actual idempotency function missing');
  const helper = source.slice(start, end);
  const slice = source.slice(source.indexOf('$headerValue = static function'), source.indexOf('$responseHeaders = [];'));
  if (!slice.includes(helper) || /curl_|file_get_contents|\b(?:require|include)\b|requests\./.test(slice)) throw Error('Only pure header block allowed');
  const renamed = `maya_forwarded_idempotency_key_${index}`;
  blocks.push(helper.replaceAll('maya_forwarded_idempotency_key', renamed));
  blocks.push(`function relay_${index}($requestHeaders, $fixtureServer) {\n` +
    slice.replace(helper, '').replaceAll('maya_forwarded_idempotency_key', renamed).replaceAll('$_SERVER', '$fixtureServer') + '\nreturn $forwardHeaders;\n}');
  sources.push({file: name, sha256: sha256(source), proofSliceSha256: sha256(slice)});
  const cors = source.match(/header\('Access-Control-Allow-Headers: ([^']+)'\)/)?.[1];
  if (!cors?.split(',').map(x => x.trim()).includes('Idempotency-Key')) throw Error('CORS must pass the logical identity');
}
for (const [index, row] of manifest.overlays.filter(x => x.kind === 'php').entries()) {
  const source = fs.readFileSync(path.join(candidateDirectory, row.target), 'utf8');
  if (sha256(source) !== row.candidateSha256) throw Error('Pinned PHP candidate mismatch');
  const start = source.indexOf("    case 'create_record':");
  const end = source.indexOf("    case '", start + 10);
  const body = source.slice(start, end);
  if (start < 0 || end < 0 || /yc_post|curl_|file_get_contents|\b(?:require|include)\b/.test(body)) throw Error('Provider-free retired case required');
  blocks.push(`function legacy_create_${index}($input) { switch ('create_record') {\n${body}\n} }`);
  sources.push({file: row.target, sha256: row.candidateSha256, proofSliceSha256: sha256(body)});
}
const test = `
$checks = 0;
function check($condition, $label) { global $checks; if (!$condition) throw new RuntimeException($label); $checks++; }
for ($relay = 0; $relay < 2; $relay++) {
    $invoke = 'relay_' . $relay;
    $keyFn = 'maya_forwarded_idempotency_key_' . $relay;
    foreach (['Idempotency-Key', 'idempotency-key', 'IDEMPOTENCY-KEY'] as $name) {
        $headers = $invoke([$name => 'booking:opaque-identity-123', 'Content-Type' => 'application/json'], []);
        check(in_array('Idempotency-Key: booking:opaque-identity-123', $headers, true), 'exact key forwarding');
        check(count(array_filter($headers, fn($h) => str_starts_with($h, 'Idempotency-Key:'))) === 1, 'one forwarded identity');
    }
    check($keyFn([], []) === null, 'no invented key');
    check(in_array('Idempotency-Key: server-fallback-123', $invoke([], ['HTTP_IDEMPOTENCY_KEY' => 'server-fallback-123']), true), 'SAPI fallback');
    foreach ([['Idempotency-Key' => ['a', 'b']], ['Idempotency-Key' => "a\\r\\nb"], ['Idempotency-Key' => 'a', 'idempotency-key' => 'b'], ['Idempotency-Key' => '']] as $invalid) {
        try { $keyFn($invalid, []); throw new RuntimeException('invalid key accepted'); }
        catch (InvalidArgumentException $e) { check(true, 'invalid/ambiguous header rejected'); }
    }
}
$inputs = [[], ['phone' => '+79990000000', 'fullname' => 'untrusted'], ['company_id' => 'wrong', 'user_token' => 'fake'], ['tenantId' => 'other', 'clientId' => 'other', 'auth_data' => ['id' => 1]]];
for ($route = 0; $route < 2; $route++) {
    foreach ($inputs as $input) {
        ob_start(); ('legacy_create_' . $route)($input); $response = json_decode(ob_get_clean(), true);
        check(http_response_code() === 410, 'retired route is HTTP 410');
        check($response['accepted'] === false && $response['success'] === false && $response['retry_allowed'] === false, 'no accepted/retry outcome');
        check($response['code'] === 'verified_client_channel_required' && !isset($response['data']), 'no business receipt or truthy data');
    }
}
echo json_encode(['verdict' => 'PASS', 'checks' => $checks, 'liveHttp' => 0, 'providerCalls' => 0, 'appImports' => 0, 'databaseConnections' => 0, 'filesWrittenByFixture' => 0], JSON_PRETTY_PRINT) . "\\n";
`;
fs.writeFileSync(output, '<?php\n' + blocks.join('\n\n') + '\n' + test, {flag: 'wx'});
process.stdout.write(JSON.stringify({fixtureSha256: sha256(fs.readFileSync(output)), sources}, null, 2) + '\n');
