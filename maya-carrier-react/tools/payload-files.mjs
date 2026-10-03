import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

/** Closed file inventory. A receipt supplied beside a payload is never its authority. */
export function readTree(directory) {
  assert.ok(fs.existsSync(directory) && !fs.lstatSync(directory).isSymbolicLink(), 'payload directory missing or symlink');
  const files = new Map();
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      assert.ok(!entry.isSymbolicLink(), 'payload symlink refused');
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else {
        assert.ok(entry.isFile(), 'non-file payload entry refused');
        files.set(path.relative(directory, file).split(path.sep).join('/'), fs.readFileSync(file));
      }
    }
  }
  walk(directory);
  return files;
}

export function assertFiles(actual, expected) {
  assert.deepEqual([...actual.keys()].sort(), [...expected.keys()].sort(), 'payload file set differs from the canonical React build');
  for (const [name, bytes] of expected)
    assert.ok(actual.get(name).equals(Buffer.from(bytes)), `payload bytes differ: ${name}`);
}

export function assertTree(directory, expected) {
  assertFiles(readTree(directory), expected);
}

export function writeTree(directory, expected) {
  fs.rmSync(directory, { recursive: true, force: true });
  for (const [name, bytes] of expected) {
    const target = path.join(directory, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  assertTree(directory, expected);
}
