// Prepared only: import does not generate images, load Sharp, execute OCR or use network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { CASES, CORPUS_CONTRACT, CORPUS_LIMITS } from './corpus-plan.mjs';

const scratch = path.dirname(fileURLToPath(import.meta.url));
const defaultBackend = '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const positions = [60, 960, 1210, 1470, 1850];
const rowY = index => 330 + index * 140;
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const textCells = (cells, y) => cells.map((value, index) =>
  value ? `<text x="${positions[index]}" y="${y}">${escape(value)}</text>` : '',
).join('');

function renderSourceSvg(fixture) {
  // Every string comes from the closed synthetic plan, no external fonts/URLs/images.
  const rows = fixture.cells.map((cells, index) => textCells(cells, rowY(index))).join('');
  const cover = fixture.occlude
    ? `<rect x="${positions[fixture.occlude.column] - 8}" y="${rowY(fixture.occlude.row) - 65}" width="315" height="85" fill="#000000"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CORPUS_LIMITS.width}" height="${CORPUS_LIMITS.height}" viewBox="0 0 ${CORPUS_LIMITS.width} ${CORPUS_LIMITS.height}"><rect width="100%" height="100%" fill="#ffffff"/><g fill="#000000" font-family="DejaVu Sans, Arial, sans-serif"><text x="60" y="65" font-size="30">SYNTHETIC TABLE — NOT A REAL DOCUMENT</text><g font-size="44">${textCells(fixture.headers, 190)}${rows}<text x="60" y="650">${escape(fixture.footer[0])}</text><text x="1850" y="650">${escape(fixture.footer[1])}</text></g></g>${cover}</svg>`;
}

export async function generateCorpus({ output, backend = defaultBackend }) {
  assert.ok(path.isAbsolute(output ?? ''), 'A fresh absolute output directory is required');
  const relative = path.relative(scratch, output);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Output must be a child of this scratch directory');
  assert.equal(fs.existsSync(output), false, 'Never overwrite prior corpus evidence');
  assert.ok(path.isAbsolute(backend), 'Installed backend path must be absolute');
  const require = createRequire(path.join(backend, 'package.json'));
  const sharp = require('sharp'); // Existing dependency only; no install or subprocess.
  assert.equal(CASES.length, CORPUS_LIMITS.fixtures);
  fs.mkdirSync(output, { mode: 0o700 });
  const sourceHashes = Object.fromEntries(['corpus-plan.mjs', 'generate-corpus.mjs', 'assert-corpus.mjs'].map(file => [file, hash(fs.readFileSync(path.join(scratch, file)))]));
  const manifest = {
    contract: CORPUS_CONTRACT, generator: 'EXISTING_SHARP_SVG_TO_ACTUAL_PIXELS',
    synthetic: true, sourceHashes, sharpVersions: sharp.versions,
    limits: CORPUS_LIMITS, fixtures: [],
    qualification: 'INPUT_IMAGES_AND_EXPECTED_FACTS_ONLY; NO_OCR_EXECUTED_BY_GENERATOR',
  };
  for (const fixture of CASES) {
    const source = renderSourceSvg(fixture);
    const svg = Buffer.from(source, 'utf8');
    // Rasterize first. Rotation must affect real pixels, not be an SVG hint.
    const upright = await sharp(svg).flatten({ background: '#ffffff' }).removeAlpha().png().toBuffer();
    let pipeline = sharp(upright);
    if (fixture.transform === 'rotate-pixels-90-exif-8') pipeline = pipeline.rotate(90).withMetadata({ orientation: 8 });
    if (fixture.format === 'png') pipeline = pipeline.png({ compressionLevel: 9 });
    else if (fixture.format === 'jpeg') pipeline = pipeline.jpeg({ quality: 96, chromaSubsampling: '4:4:4' });
    else if (fixture.format === 'webp') pipeline = pipeline.webp({ lossless: true });
    else throw new Error('Unexpected closed fixture format');
    const image = await pipeline.toBuffer();
    const metadata = await sharp(image).metadata();
    assert.ok(image.length > 0 && image.length <= CORPUS_LIMITS.maxImageBytes, fixture.key + ': input byte cap');
    assert.equal(metadata.format, fixture.format);
    assert.equal(metadata.pages ?? 1, 1);
    const rotated = fixture.transform === 'rotate-pixels-90-exif-8';
    assert.equal(metadata.width, rotated ? CORPUS_LIMITS.height : CORPUS_LIMITS.width);
    assert.equal(metadata.height, rotated ? CORPUS_LIMITS.width : CORPUS_LIMITS.height);
    if (rotated) assert.equal(metadata.orientation, 8);
    const filename = `${fixture.key}.${fixture.format === 'jpeg' ? 'jpg' : fixture.format}`;
    fs.writeFileSync(path.join(output, filename), image, { flag: 'wx', mode: 0o600 });
    // Source SVG is provenance only. The OCR harness must consume the raster file.
    fs.writeFileSync(path.join(output, fixture.key + '.svg'), source, { flag: 'wx', mode: 0o600 });
    manifest.fixtures.push({
      key: fixture.key, filename, imageSha256: hash(image), bytes: image.length,
      svgSha256: hash(svg), format: fixture.format,
      storedWidth: metadata.width, storedHeight: metadata.height,
      exifOrientation: metadata.orientation ?? null,
      expectedUprightWidth: CORPUS_LIMITS.width, expectedUprightHeight: CORPUS_LIMITS.height,
      expectation: fixture.expectation, purpose: fixture.purpose,
      mandatoryManualReview: fixture.manualReview,
    });
    svg.fill(0); upright.fill(0); image.fill(0);
  }
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return manifest;
}

if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  const { values } = parseArgs({ strict: true, options: { generate: { type: 'boolean' }, output: { type: 'string' }, backend: { type: 'string' } } });
  if (!values.generate) process.stdout.write('Prepared only. Parent serial command: --generate --output=<fresh scratch child> [--backend=<installed backend>]\n');
  else generateCorpus({ output: values.output, backend: values.backend ?? defaultBackend }).then(manifest => {
    process.stdout.write(`Generated ${manifest.fixtures.length} synthetic raster inputs. OCR has not run.\n`);
  }).catch(error => { process.stderr.write(String(error.message).slice(0, 2000) + '\n'); process.exitCode = 1; });
}
