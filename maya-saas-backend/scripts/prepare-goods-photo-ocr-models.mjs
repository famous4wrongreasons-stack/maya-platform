import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { request } from 'node:https';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Build/developer preparation only. Never called by an HTTP request or OCR worker.
// The caller cannot supply a URL, path, language, filename or alternate manifest.
const backend = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));
const destination = join(backend, 'ocr-assets');
const names = ['eng.traineddata', 'rus.traineddata', 'LICENSE'];
const maxBytes = [4_200_000, 4_000_000, 16_384];
const timeoutMs = 20_000;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (code) => {
  throw new Error(`goods_photo_ocr_assets_${code}`);
};

function readRegular(path, limit) {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1)
    fail('unsafe_file');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > limit ||
        stat.dev !== before.dev || stat.ino !== before.ino)
      fail('unsafe_file');
    const bytes = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, length);
      if (!count) break;
      length += count;
    }
    if (length > limit) fail('size_limit');
    return bytes.subarray(0, length);
  } finally {
    closeSync(fd);
  }
}

function loadManifest() {
  const manifest = JSON.parse(readRegular(
    join(backend, 'scripts', 'goods-photo-ocr-models.json'), 16_384,
  ).toString('utf8'));
  if (manifest?.contract !== 'maya.goods-photo.ocr-models/1' ||
      manifest.repository !== 'https://github.com/tesseract-ocr/tessdata_fast' ||
      !/^[a-f0-9]{40}$/.test(manifest.sourceCommit) ||
      manifest.license !== 'Apache-2.0' ||
      !Array.isArray(manifest.files) || manifest.files.length !== names.length)
    fail('manifest_invalid');
  manifest.files.forEach((file, index) => {
    if (file?.name !== names[index] || !Number.isSafeInteger(file.size) ||
        file.size <= 0 || file.size > maxBytes[index] ||
        !/^[a-f0-9]{40}$/.test(file.gitBlob) ||
        !/^[a-f0-9]{64}$/.test(file.sha256))
      fail('manifest_invalid');
  });
  return manifest;
}

function verifyBytes(bytes, file) {
  const blob = createHash('sha1')
    .update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (bytes.length !== file.size || hash(bytes) !== file.sha256 || blob !== file.gitBlob)
    fail('checksum_mismatch');
}

function verifyDirectory(path, manifest) {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== path)
    fail('unsafe_directory');
  if (JSON.stringify(readdirSync(path).sort()) !== JSON.stringify([...names].sort()))
    fail('unexpected_files');
  for (const file of manifest.files) {
    verifyBytes(readRegular(join(path, file.name), file.size), file);
  }
}

function exists(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function download(manifest, file) {
  const url = new URL(`https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${manifest.sourceCommit}/${file.name}`);
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    let response;
    const finish = (error, bytes) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        response?.destroy();
        req.destroy();
        reject(error);
      } else resolve(bytes);
    };
    const req = request(url, {
      method: 'GET',
      agent: false,
      headers: {
        'User-Agent': 'MAYA-ocr-assets-build/1',
        Accept: 'application/octet-stream',
        'Accept-Encoding': 'identity',
      },
    }, (incoming) => {
      response = incoming;
      // In particular, redirects are refused; no alternate host is followed.
      if (incoming.statusCode !== 200 ||
          (incoming.headers['content-encoding'] && incoming.headers['content-encoding'] !== 'identity') ||
          (incoming.headers['content-length'] !== undefined &&
           incoming.headers['content-length'] !== String(file.size))) {
        finish(new Error('goods_photo_ocr_assets_response_refused'));
        return;
      }
      incoming.on('data', (chunk) => {
        size += chunk.length;
        if (size > file.size) finish(new Error('goods_photo_ocr_assets_size_limit'));
        else if (!settled) chunks.push(chunk);
      });
      incoming.once('aborted', () => finish(new Error('goods_photo_ocr_assets_incomplete')));
      incoming.once('error', () => finish(new Error('goods_photo_ocr_assets_network_failed')));
      incoming.once('end', () => {
        if (size !== file.size) finish(new Error('goods_photo_ocr_assets_incomplete'));
        else finish(null, Buffer.concat(chunks, size));
      });
    });
    const timer = setTimeout(() => finish(new Error('goods_photo_ocr_assets_timeout')), timeoutMs);
    req.once('error', () => finish(new Error('goods_photo_ocr_assets_network_failed')));
    req.end();
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--fetch', '--verify'].includes(args[0]))
    fail('mode_required');
  const manifest = loadManifest();
  let downloaded = false;
  if (args[0] === '--verify' || exists(destination)) {
    // Existing invalid assets are refused, never repaired or replaced implicitly.
    verifyDirectory(destination, manifest);
  } else {
    const lock = join(backend, '.ocr-assets.lock');
    const lockFd = openSync(lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    let stage;
    try {
      if (exists(destination)) fail('destination_exists');
      stage = mkdtempSync(join(backend, '.ocr-assets-stage-'));
      chmodSync(stage, 0o700);
      for (const file of manifest.files) {
        const bytes = await download(manifest, file);
        verifyBytes(bytes, file);
        const fd = openSync(join(stage, file.name), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o444);
        try { writeFileSync(fd, bytes); } finally { closeSync(fd); }
      }
      verifyDirectory(stage, manifest);
      if (exists(destination)) fail('destination_exists');
      chmodSync(stage, 0o755);
      // Publish all three verified files together; failures keep destination absent.
      renameSync(stage, destination);
      stage = undefined;
      verifyDirectory(destination, manifest);
      downloaded = true;
    } finally {
      try {
        if (stage) rmSync(stage, { recursive: true, force: true });
      } finally {
        closeSync(lockFd);
        rmSync(lock);
      }
    }
  }
  process.stdout.write(`${JSON.stringify({
    contract: 'maya.goods-photo.ocr-assets-preparation/1',
    status: 'verified', mode: args[0].slice(2), downloaded,
    sourceCommit: manifest.sourceCommit,
    license: manifest.license,
    files: manifest.files.map(({ name, size, sha256, gitBlob }) => ({ name, size, sha256, gitBlob })),
  })}\n`);
}

main().catch((error) => {
  const code = typeof error?.message === 'string' &&
    /^goods_photo_ocr_assets_[a-z_]+$/.test(error.message)
    ? error.message : 'goods_photo_ocr_assets_preparation_failed';
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
