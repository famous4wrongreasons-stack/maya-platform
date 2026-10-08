// Metadata only: no OCR/process/network. Run once after root's final native proof.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration';
const scratch = '/tmp/maya-linux-ocr-20261008';
const harness = path.join(scratch, 'http-carrier-harness');
const proofPath = path.join(scratch, 'actual-attempt3/actual-corpus.json');
const nativeHashesPath = path.join(scratch, 'actual-attempt3/source-hashes.json');
const corpusPath = path.join(scratch, 'corpus-attempt2/manifest.json');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export function bindNativeInputs() {
  const proof = read(proofPath), corpus = read(corpusPath), nativeHashes = read(nativeHashesPath);
  assert.equal(proof.contract, 'maya.native-tesseract-actual-corpus-proof/1');
  assert.equal(proof.status, 'passed');
  assert.equal(proof.sourceUnchanged, true);
  assert.equal(proof.scriptedOcr, false);
  assert.equal(proof.observer, 'REAL_SPAWN_CALL_THROUGH_UNCHANGED');
  assert.equal(proof.modelApiCalls, 0); assert.equal(proof.providerCalls, 0);
  assert.equal(proof.unexpectedNodeNetwork, 0);
  assert.equal(proof.evaluation.status, 'qualified');
  assert.deepEqual(proof.evaluation.failures, []);
  assert.equal(corpus.synthetic, true);
  assert.equal(proof.workers.length, corpus.fixtures.length);
  assert.ok(proof.workers.every(worker => worker.exited && worker.exitCode === 0 && worker.signal === null));
  assert.ok(Object.hasOwn(nativeHashes, path.join(root, 'maya-saas-backend/src/ai-tools/goods-photo-tesseract.ts')));
  for (const [file, digest] of Object.entries(nativeHashes)) {
    assert.match(digest, /^[a-f0-9]{64}$/);
    assert.equal(hash(file), digest, 'Native proof source changed: ' + file);
  }
  const files = [proofPath, nativeHashesPath, corpusPath, ...Object.keys(nativeHashes)];
  for (const key of ['ru-fractions-dot', 'ru-changed-pixels', 'unsupported-price-header']) {
    const matching = corpus.fixtures.filter(fixture => fixture.key === key);
    assert.equal(matching.length, 1);
    const fixture = matching[0];
    assert.equal(path.basename(fixture.filename), fixture.filename);
    const file = path.join(scratch, 'corpus-attempt2', fixture.filename);
    assert.equal(hash(file), fixture.imageSha256);
    const observed = proof.observations.cases.filter(item => item.key === key);
    assert.equal(observed.length, 1);
    assert.equal(observed[0].imageSha256, fixture.imageSha256);
    if (key !== 'unsupported-price-header') {
      assert.equal(observed[0].outcome.status, 'parsed');
      assert.ok(observed[0].outcome.lines.some(line => line.unit_label === null));
    } else {
      assert.deepEqual(observed[0].outcome, { status: 'refused', errorCode: 'goods_photo_ocr_table_unsupported' });
    }
    files.push(file);
  }
  const modelsPath = path.join(root, 'maya-saas-backend/scripts/goods-photo-ocr-models.json');
  const models = read(modelsPath);
  assert.equal(models.contract, 'maya.goods-photo.ocr-models/1');
  assert.deepEqual(models.files.map(file => file.name), ['eng.traineddata', 'rus.traineddata', 'LICENSE']);
  files.push(modelsPath);
  for (const model of models.files) {
    const file = path.join(root, 'maya-saas-backend/ocr-assets', model.name);
    assert.equal(fs.statSync(file).size, model.size);
    assert.equal(hash(file), model.sha256);
    files.push(file);
  }
  const hashes = Object.fromEntries([...new Set(files)].sort().map(file => [file, hash(file)]));
  const output = path.join(harness, 'fixed-input-hashes.json');
  fs.writeFileSync(output, JSON.stringify(hashes, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  process.stdout.write(JSON.stringify({ contract: 'maya.tesseract-http-input-binding/1', status: 'bound', metadataOnly: true, nativeProofSha256: hash(proofPath), outputSha256: hash(output), files: Object.keys(hashes).length }) + '\n');
}

if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  assert.equal(process.argv.length, 2, 'No arbitrary input paths accepted');
  bindNativeInputs();
}
