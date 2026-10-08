// Explicit local build only. No package manager, download, model or image input.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(backend, 'scripts/goods-photo-vision.swift');
const directory = path.join(backend, 'dist/ocr');
const output = path.join(directory, 'goods-photo-vision');
const temporary = path.join(directory, 'goods-photo-vision.building');
const digest = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export async function build(args = []) {
  assert.equal(args.length, 0, 'This build takes no paths, flags or network options');
  assert.equal(process.platform, 'darwin', 'Local Apple Vision requires macOS; no fallback/install is attempted');
  assert.ok(['arm64', 'x64'].includes(process.arch), 'Unsupported macOS architecture');
  fs.accessSync('/usr/bin/swiftc', fs.constants.X_OK);
  assert.ok(fs.lstatSync(source).isFile(), 'Fixed Swift source must be a regular file');
  for (const item of [path.join(backend, 'dist'), directory]) {
    if (fs.existsSync(item)) assert.ok(fs.lstatSync(item).isDirectory() && !fs.lstatSync(item).isSymbolicLink(), 'Build directory cannot be a symlink');
    else fs.mkdirSync(item);
  }
  for (const item of [output, temporary]) {
    if (fs.existsSync(item)) assert.ok(fs.lstatSync(item).isFile() && !fs.lstatSync(item).isSymbolicLink(), 'Build output cannot be a symlink');
  }
  const sourceSha256 = digest(source);
  const architecture = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  const compilerArgs = [
    '-O', '-whole-module-optimization', '-target', architecture + '-apple-macosx13.0',
    '-module-cache-path', path.join(directory, 'module-cache'),
    '-framework', 'Foundation', '-framework', 'Vision', '-framework', 'ImageIO', '-framework', 'CoreGraphics',
    source, '-o', temporary,
  ];
  let child, timeout, killTimer, failure, compilerOutput = '', compilerBytes = 0;
  const groupAlive = () => {
    if (!child?.pid) return false;
    try { process.kill(-child.pid, 0); return true; }
    catch (error) { if (error.code === 'ESRCH') return false; throw error; }
  };
  const signal = (name) => {
    if (!groupAlive()) return;
    try { process.kill(-child.pid, name); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  const waitGone = async (milliseconds) => {
    const deadline = performance.now() + milliseconds;
    while (groupAlive() && performance.now() < deadline)
      await new Promise(resolve => setTimeout(resolve, 25));
    return !groupAlive();
  };
  const reapGroup = async () => {
    if (!groupAlive()) return;
    signal('SIGTERM');
    if (await waitGone(1000)) return;
    signal('SIGKILL');
    assert.equal(await waitGone(2000), true, 'Owned Swift compiler group did not stop');
  };
  const stop = (reason) => {
    failure ??= new Error(reason);
    signal('SIGTERM');
    killTimer ??= setTimeout(() => signal('SIGKILL'), 1000);
  };
  const onInt = () => stop('Swift build cancelled by SIGINT');
  const onTerm = () => stop('Swift build cancelled by SIGTERM');
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  try {
    try {
      await new Promise((resolve, reject) => {
        // A separate process group lets this build stop only its own compiler tree.
        child = spawn('/usr/bin/swiftc', compilerArgs, {
          cwd: backend, shell: false, detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        timeout = setTimeout(() => stop('Swift build exceeded 120 seconds'), 120000);
        const capture = (chunk) => {
          compilerBytes += chunk.length;
          if (compilerBytes > 65536) { stop('Swift compiler output exceeded 64 KiB'); return; }
          compilerOutput += chunk.toString('utf8');
        };
        child.stdout.on('data', capture);
        child.stderr.on('data', capture);
        child.once('error', (error) => { failure ??= error; });
        child.once('close', (code) => {
          if (failure) reject(failure);
          else if (code !== 0) reject(new Error('Swift build failed (' + code + '):\n' + compilerOutput));
          else resolve();
        });
      });
    } finally {
      clearTimeout(timeout);
      // swiftc close does not prove its frontend/linker descendants exited.
      // Inspect and stop only this spawn's process group, on every outcome.
      await reapGroup();
    }
    if (failure) throw failure;
    assert.equal(digest(source), sourceSha256, 'Swift source changed during compilation');
    fs.chmodSync(temporary, 0o755);
    fs.renameSync(temporary, output);
    const result = {
      contract: 'maya.local-vision-build/1', platform: process.platform, architecture,
      sourceSha256, binarySha256: digest(output), output,
      compilerPgid: child.pid, compilerGroupAbsent: !groupAlive(),
      imageRecognitionExecuted: false, externalCalls: 0,
    };
    process.stdout.write(JSON.stringify(result) + '\n');
    return result;
  } finally {
    clearTimeout(timeout);
    clearTimeout(killTimer);
    process.off('SIGINT', onInt);
    process.off('SIGTERM', onTerm);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  build(process.argv.slice(2)).catch((error) => {
    process.stderr.write(String(error.message).slice(0, 65536) + '\n');
    process.exitCode = 1;
  });
}
