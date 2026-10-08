// Assertions only. No parser import, OCR invocation, fabricated result or fixture injection.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { CASES, CORPUS_CONTRACT, CORPUS_LIMITS } from './corpus-plan.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const refusalCodes = new Set([
  'goods_photo_ocr_table_unsupported', 'goods_photo_ocr_table_ambiguous',
  'goods_photo_ocr_rows_unavailable',
]);
const lineKeys = ['name', 'quantity', 'unit_label', 'unit_price', 'line_total', 'price_kind', 'confidence'].sort();
const assertKeys = (value, keys, message) => {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), message);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), message);
};

export function assertCorpusCase(key, outcome) {
  const fixture = CASES.find(entry => entry.key === key);
  assert.ok(fixture, 'Unknown corpus key');
  if (outcome?.status === 'refused') {
    assertKeys(outcome, ['status', 'errorCode'], 'Closed sanitized refusal');
    assert.ok(refusalCodes.has(outcome.errorCode), 'Unexpected decoder/worker/environment error is not a grammar limitation');
    assert.notEqual(fixture.expectation, 'exact', key + ': readable fixture was not parsed exactly');
    return {
      key, status: 'limited-refusal', refusal: outcome.errorCode,
      requiredManualReview: fixture.manualReview,
      limitation: 'No extracted rows. This case is a qualified refusal, not recognition success.',
    };
  }
  assertKeys(outcome, ['status', 'lines'], 'Closed actual parser result');
  assert.equal(outcome.status, 'parsed');
  assert.notEqual(fixture.expectation, 'refusal', key + ': unsupported header unexpectedly admitted');
  assert.ok(Array.isArray(outcome.lines) && outcome.lines.length > 0 && outcome.lines.length <= 20);
  for (const line of outcome.lines) {
    assertKeys(line, lineKeys, 'No IDs, currency, arithmetic, authority or extra parser fields');
    assert.equal(line.price_kind, null, 'Price header never proves price meaning');
    assert.equal(line.confidence, null, 'No invented aggregate row confidence');
  }
  // Deliberately no fuzzy names, guessed punctuation/digits, unit conversion or
  // null filling. The production parser alone may normalize decimal comma.
  assert.deepEqual(outcome.lines, fixture.expectedLines, key + ': exact visible facts and required null fields');
  return {
    key, status: fixture.expectation === 'exact' ? 'exact-provisional' : 'partial-manual-review',
    extractedRows: outcome.lines.length, requiredManualReview: fixture.manualReview,
    limitation: fixture.expectation === 'exact' ? null : 'Missing or ambiguous cells remain null; explicit owner input is required.',
  };
}

// Optional check when the caller also exercises the actual service preview.
// Pure parser results have no review flags, so do not manufacture them here.
export function assertPreviewRemainsUnaccepted(actualPreview) {
  assert.equal(actualPreview?.review_required, true);
  assert.equal(actualPreview?.recognition_acceptance, 'NOT_ACCEPTED');
  assert.ok(Array.isArray(actualPreview?.lines) && actualPreview.lines.length > 0);
  for (const line of actualPreview.lines) {
    assert.equal(line.review_required, true);
    assert.equal(line.price_kind, null);
  }
}

export function evaluateCorpus(manifest, observations) {
  assert.equal(manifest?.contract, CORPUS_CONTRACT);
  assert.equal(manifest.synthetic, true);
  const planPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'corpus-plan.mjs');
  assert.equal(manifest.sourceHashes?.['corpus-plan.mjs'], hash(fs.readFileSync(planPath)), 'Expectations must remain bound to rendered corpus');
  assert.equal(observations?.contract, 'maya.synthetic-goods-photo-observations/1');
  assert.equal(observations.actualProcessor?.executionMode, 'actual-image-bytes');
  assert.equal(typeof observations.actualProcessor.engine, 'string');
  assert.ok(observations.actualProcessor.engine.length > 0);
  assert.equal(typeof observations.actualProcessor.platform, 'string');
  assert.ok(observations.actualProcessor.platform.length > 0);
  assert.ok(Array.isArray(manifest.fixtures) && manifest.fixtures.length === CASES.length);
  assert.ok(Array.isArray(observations.cases) && observations.cases.length === CASES.length, 'Every fixture must have a real observed outcome');
  const manifestKeys = manifest.fixtures.map(entry => entry.key);
  const observationKeys = observations.cases.map(entry => entry.key);
  assert.deepEqual([...manifestKeys].sort(), CASES.map(entry => entry.key).sort());
  assert.deepEqual([...observationKeys].sort(), [...manifestKeys].sort(), 'No skipped/duplicated cases');
  const report = {
    contract: 'maya.synthetic-goods-photo-corpus-evaluation/1',
    qualification: 'ASSERTIONS_OVER_CALLER_RECORDED_ACTUAL_OBSERVATIONS; EXECUTION_PROVENANCE_REQUIRES_SEPARATE_HARNESS_EVIDENCE',
    actualProcessor: observations.actualProcessor, status: 'qualified',
    syntheticPixelsOnly: true, realDocumentAcceptance: false,
    providerWriteAcceptance: false, manualReviewRequired: true,
    scope: CORPUS_LIMITS.scope, cases: [], failures: [],
  };
  for (const fixture of manifest.fixtures) {
    const observed = observations.cases.find(entry => entry.key === fixture.key);
    try {
      assert.match(observed.imageSha256 ?? '', /^[a-f0-9]{64}$/);
      assert.equal(observed.imageSha256, fixture.imageSha256, 'Observation must bind actual rendered image bytes');
      report.cases.push(assertCorpusCase(fixture.key, observed.outcome));
    } catch (error) {
      report.failures.push({ key: fixture.key, message: String(error.message).slice(0, 5000) });
    }
  }
  // This independently catches accidental reuse of the first result for changed pixels.
  const base = observations.cases.find(entry => entry.key === 'ru-fractions-dot');
  const changed = observations.cases.find(entry => entry.key === 'ru-changed-pixels');
  try {
    assert.notEqual(base.imageSha256, changed.imageSha256);
    if (base.outcome.status === 'parsed' && changed.outcome.status === 'parsed') assert.notDeepEqual(base.outcome.lines, changed.outcome.lines);
  } catch (error) { report.failures.push({ key: 'changed-pixels-correlation', message: String(error.message).slice(0, 5000) }); }
  if (report.failures.length) report.status = 'failed';
  report.exactProvisionalCases = report.cases.filter(entry => entry.status === 'exact-provisional').map(entry => entry.key);
  report.partialManualReviewCases = report.cases.filter(entry => entry.status === 'partial-manual-review').map(entry => entry.key);
  report.refusedCases = report.cases.filter(entry => entry.status === 'limited-refusal').map(entry => entry.key);
  return report;
}

if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  const { values } = parseArgs({ strict: true, options: { manifest: { type: 'string' }, observations: { type: 'string' }, output: { type: 'string' } } });
  if (!values.manifest || !values.observations || !values.output) {
    process.stdout.write('Prepared assertions only. Use --manifest=<generated manifest> --observations=<actual harness JSON> --output=<new report JSON>\n');
  } else {
    try {
      assert.equal(fs.existsSync(values.output), false, 'Never overwrite evidence');
      const manifest = JSON.parse(fs.readFileSync(values.manifest, 'utf8'));
      // Confirm raster files have not changed after generation, before trusting hashes.
      for (const fixture of manifest.fixtures) {
        assert.equal(path.basename(fixture.filename), fixture.filename);
        assert.equal(hash(fs.readFileSync(path.join(path.dirname(values.manifest), fixture.filename))), fixture.imageSha256);
      }
      const report = evaluateCorpus(manifest, JSON.parse(fs.readFileSync(values.observations, 'utf8')));
      fs.writeFileSync(values.output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      process.stdout.write(`Corpus assertions: ${report.status}. Exact provisional, partial and refusal outcomes remain separately reported.\n`);
      if (report.status === 'failed') process.exitCode = 1;
    } catch (error) { process.stderr.write(String(error.message).slice(0, 5000) + '\n'); process.exitCode = 1; }
  }
}
