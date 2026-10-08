// Prepared actual OCR proof: unchanged production parser/native binary, real
// synthetic table pixels. Expected rows are assertions, never injected results.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { generateSyntheticImages, tables } from './synthetic-images.mjs';

const backend = '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend';
const scratch = '/tmp/maya-actual-ocr-20261008';
const binary = path.join(backend, 'dist/ocr/goods-photo-vision');
const require = createRequire(path.join(backend, 'package.json'));
const digest = (value) => createHash('sha256').update(value).digest('hex');
const fileHash = (file) => digest(fs.readFileSync(file));
const expectedRows = (name) => ({ lines: tables[name].rows.map(([name, quantity, unit_label, unit_price, line_total]) => ({ name, quantity, unit_label, unit_price, line_total, price_kind: null, confidence: null })) });
const errorCode = (error) => typeof error?.getResponse === 'function' ? error.getResponse()?.message : error?.message;
function validateWords(raw) {
  assert.deepEqual(Object.keys(raw).sort(), ['contract', 'image_height', 'image_width', 'languages', 'revision', 'words']);
  assert.equal(raw.contract, 'maya.local-vision.words/1');
  assert.deepEqual(raw.languages, ['ru-RU', 'en-US']); assert.equal(raw.revision, 3);
  assert.equal(raw.image_width, 1800); assert.equal(raw.image_height, 440);
  assert.ok(Array.isArray(raw.words) && raw.words.length <= 4000);
  for (const word of raw.words) {
    assert.deepEqual(Object.keys(word).sort(), ['confidence', 'height', 'left', 'text', 'top', 'width']);
    assert.equal(typeof word.text, 'string'); assert.ok(word.text.length > 0 && word.text.length <= 256);
    for (const key of ['left', 'top', 'width', 'height', 'confidence']) assert.ok(Number.isFinite(word[key]) && word[key] >= 0 && word[key] <= 1);
    assert.ok(word.width > 0 && word.height > 0);
    assert.ok(word.left + word.width <= 1 + 1e-9 && word.top + word.height <= 1 + 1e-9);
  }
}

export async function main(args) {
  const { values } = parseArgs({ args, strict: true, options: { run: { type: 'boolean' }, output: { type: 'string' } } });
  if (!values.run) { process.stdout.write('Prepared only. Parent serial run: --run --output=/tmp/maya-actual-ocr-20261008/actual-attempt1\n'); return; }
  assert.equal(process.platform, 'darwin');
  assert.equal(fs.realpathSync(process.cwd()), fs.realpathSync(backend), 'Use backend cwd for the fixed worker path');
  assert.ok(values.output && path.isAbsolute(values.output));
  const relative = path.relative(scratch, values.output);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  assert.equal(fs.existsSync(values.output), false, 'Never overwrite actual OCR evidence');
  fs.accessSync(binary, fs.constants.X_OK);
  fs.mkdirSync(values.output, { mode: 0o700 });
  const files = [
    'scripts/goods-photo-vision.swift', 'scripts/build-goods-photo-ocr.mjs',
    'src/ai-tools/goods-photo-parser.service.ts', 'src/ai-tools/goods-photo-ocr-rows.ts',
    'src/ai-tools/goods-photo.service.ts', 'package.json', 'package-lock.json', 'tsconfig.json',
  ].map(file => path.join(backend, file));
  files.push(path.join(scratch, 'actual-parser-proof.mjs'), path.join(scratch, 'synthetic-images.mjs'), binary);
  const hashes = Object.fromEntries(files.map(file => [file, fileHash(file)]));
  fs.writeFileSync(path.join(values.output, 'source-hashes.json'), JSON.stringify(hashes, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  const report = {
    contract: 'maya.actual-local-goods-photo-ocr-proof/1', status: 'running',
    qualification: 'ACTUAL_PRODUCTION_PARSER_AND_APPLE_VISION_ON_SYNTHETIC_IMAGE_PIXELS',
    processObserver: 'CALL_THROUGH_REAL_SPAWN_ARGUMENTS_AND_RESULTS_UNCHANGED',
    scriptedOcr: false, stubbedOcr: false, modelCalls: 0, providerCalls: 0,
    httpAcceptance: false, currentReactAcceptance: false, realDocumentAcceptance: false, deploymentAcceptance: false,
    binarySha256: hashes[binary], cases: {}, workers: [], unexpectedNetworkCalls: 0,
  };
  const childProcess = require('node:child_process');
  const originalSpawn = childProcess.spawn, originalConnect = net.Socket.prototype.connect, originalFetch = globalThis.fetch;
  let activeCase = 'setup';
  const buffers = new Set();
  globalThis.fetch = () => { report.unexpectedNetworkCalls++; throw new Error('Actual OCR proof forbids network fetch'); };
  net.Socket.prototype.connect = function () { report.unexpectedNetworkCalls++; throw new Error('Actual OCR proof forbids network sockets'); };
  childProcess.spawn = function (...forwarded) {
    const [command, argv, options] = forwarded;
    assert.equal(command, binary); assert.deepEqual(argv, []);
    assert.equal(options.shell, false); assert.deepEqual(options.stdio, ['pipe', 'pipe', 'pipe']);
    assert.deepEqual(options.env, { PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' });
    // No args/options/streams/results are replaced. Observe the actual process.
    const child = Reflect.apply(originalSpawn, this, forwarded);
    const record = { case: activeCase, pid: child.pid ?? null, stdoutBytes: 0, stderrBytes: 0, exited: false };
    const chunks = []; const stderrHash = createHash('sha256');
    report.workers.push(record);
    child.stdout.on('data', chunk => {
      record.stdoutBytes += chunk.length;
      if (record.stdoutBytes <= 256 * 1024) { const copy = Buffer.from(chunk); chunks.push(copy); buffers.add(copy); }
    });
    child.stderr.on('data', chunk => { record.stderrBytes += chunk.length; stderrHash.update(chunk); });
    child.once('close', (code, signal) => {
      record.exited = true; record.exitCode = code; record.signal = signal; record.stderrSha256 = stderrHash.digest('hex');
      const data = Buffer.concat(chunks); buffers.add(data);
      record.stdoutSha256 = digest(data);
      if (code === 0 && record.stdoutBytes <= 256 * 1024) {
        try { record.words = JSON.parse(data.toString('utf8')); }
        catch { record.invalidJson = true; }
      }
      for (const chunk of chunks) { chunk.fill(0); buffers.delete(chunk); }
      data.fill(0); buffers.delete(data);
    });
    return child;
  };
  try {
    require('reflect-metadata');
    require('ts-node').register({ project: path.join(backend, 'tsconfig.json'), transpileOnly: true });
    const { ConfigService } = require('@nestjs/config');
    const { GoodsPhotoParser } = require(path.join(backend, 'src/ai-tools/goods-photo-parser.service.ts'));
    const parser = new GoodsPhotoParser(new ConfigService({ GOODS_PHOTO_OCR_PROVIDER: 'apple_vision' }));
    const fixtures = await generateSyntheticImages(path.join(values.output, 'fixtures'));
    report.fixtures = fixtures;
    assert.notEqual(fixtures.russian.sha256, fixtures.changed.sha256, 'Different rendered pixels required');
    for (const name of ['russian', 'changed', 'english']) {
      activeCase = name;
      const input = fs.readFileSync(fixtures[name].path); buffers.add(input);
      const before = report.workers.length;
      const pending = parser.parse(input);
      let result;
      try {
        if (name === 'russian') {
          const busyInput = fs.readFileSync(fixtures.changed.path); buffers.add(busyInput);
          const beforeBusy = report.workers.length;
          assert.throws(() => parser.parse(busyInput), error => errorCode(error) === 'goods_photo_ocr_busy');
          assert.equal(report.workers.length, beforeBusy, 'Busy refusal starts no worker');
          busyInput.fill(0); buffers.delete(busyInput);
          report.cases.busy = { synchronousRefusal: 'goods_photo_ocr_busy', extraWorkers: 0 };
        }
      } finally {
        // Drain this real parse even if a proof assertion fails; no orphan work.
        result = await pending;
        input.fill(0); buffers.delete(input);
      }
      // Case variation in a provisional unit label is recorded, never mapped to a catalog unit.
      const expected = expectedRows(name);
      assert.deepEqual({ lines: result.lines.map(line => ({...line, unit_label: line.unit_label?.toLowerCase() ?? null})) }, expected);
      report.cases[name + 'UnitCaseVariations'] = result.lines.flatMap((line, index) => line.unit_label === expected.lines[index].unit_label ? [] : [{row: index + 1, rendered: expected.lines[index].unit_label, recognizedLiteral: line.unit_label}]);
      assert.equal(report.workers.length, before + 1, 'One real worker for each accepted image');
      const worker = report.workers.at(-1);
      assert.equal(worker.exited, true); assert.equal(worker.exitCode, 0); assert.equal(worker.signal, null);
      assert.ok(worker.stdoutBytes > 0 && worker.stdoutBytes <= 256 * 1024); assert.ok(worker.stderrBytes <= 4096);
      validateWords(worker.words);
      assert.ok(worker.words.words.length > 0, 'Actual image text observations required');
      report.cases[name] = { recognizedRows: result.lines, workerPid: worker.pid, wordsSha256: worker.stdoutSha256, recognizedWordCount: worker.words.words.length };
    }
    assert.notDeepEqual(report.cases.russian.recognizedRows, report.cases.changed.recognizedRows);
    assert.notEqual(report.cases.russian.wordsSha256, report.cases.changed.wordsSha256);
    report.dynamicPixelsChangeWordsAndRows = true;
    activeCase = 'blank';
    const blank = fs.readFileSync(fixtures.blank.path); buffers.add(blank);
    const beforeBlank = report.workers.length;
    try { await assert.rejects(parser.parse(blank), error => errorCode(error) === 'goods_photo_ocr_table_unsupported'); }
    finally { blank.fill(0); buffers.delete(blank); }
    assert.equal(report.workers.length, beforeBlank + 1);
    const blankWorker = report.workers.at(-1);
    assert.equal(blankWorker.exitCode, 0); validateWords(blankWorker.words); assert.deepEqual(blankWorker.words.words, []);
    report.cases.blank = { actualNativeWorker: true, error: 'goods_photo_ocr_table_unsupported', words: 0 };
    activeCase = 'malformed';
    const malformed = Buffer.from('SYNTHETIC NOT AN IMAGE'); buffers.add(malformed);
    const beforeMalformed = report.workers.length;
    try { await assert.rejects(parser.parse(malformed), error => errorCode(error) === 'goods_photo_image_invalid'); }
    finally { malformed.fill(0); buffers.delete(malformed); }
    assert.equal(report.workers.length, beforeMalformed);
    report.cases.malformed = { error: 'goods_photo_image_invalid', nativeWorkers: 0 };
    assert.equal(report.workers.length, 4); assert.equal(report.unexpectedNetworkCalls, 0);
    assert.ok(report.workers.every(worker => worker.exited));
    report.sourceUnchanged = Object.entries(hashes).every(([file, sha]) => fileHash(file) === sha);
    assert.equal(report.sourceUnchanged, true);
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.failureCase = activeCase;
    report.failure = String(error.message).slice(0, 12000); report.failureStack = String(error.stack).slice(0, 20000);
    throw error;
  } finally {
    childProcess.spawn = originalSpawn; net.Socket.prototype.connect = originalConnect; globalThis.fetch = originalFetch;
    for (const buffer of buffers) buffer.fill(0);
    fs.writeFileSync(path.join(values.output, 'actual-parser.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
  process.stdout.write('Actual local OCR synthetic image proof passed: ' + values.output + '\n');
}
if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => { process.stderr.write(String(error.message).slice(0, 2000) + '\n'); process.exitCode = 1; });
}
