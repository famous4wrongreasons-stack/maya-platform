// Finite test-module loading only. These tests never execute the providers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const transformer = require('../test/widgets-live/support/core-conversation-mjs-transform.cjs');
const backend = path.resolve(__dirname, '..');

test('owner-chat probe can load its actual complete local ESM dependency graph', () => {
  const visited = new Set();
  function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotThrow(() => transformer.process(source, file), path.relative(backend, file));
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    for (const node of ast.statements) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) &&
          node.moduleSpecifier.text.startsWith('.'))
        visit(path.resolve(path.dirname(file), node.moduleSpecifier.text));
    }
  }
  for (const name of ['local-owner-chat-runtime', 'local-owner-chat-policy', 'local-yclients-read-transport'])
    visit(path.join(backend, 'scripts', name + '.mjs'));
  for (const name of ['local-owner-history-review-policy', 'local-owner-scope', 'local-owner-history-policy', 'local-owner-telegram-policy'])
    assert.ok(visited.has(path.join(backend, 'scripts', name + '.mjs')), 'Real imports must exercise each reconciled module');
});

test('owner-chat probe transformer still refuses unrelated modules and prefix substitutions', () => {
  for (const file of [
    'scripts/local-owner-telegram-runtime.mjs',
    'scripts/local-owner-chat-launch.mjs',
    'scripts/local-owner-history-review-policy-extra.mjs',
    'scripts/unlisted.mjs',
    'src/local-owner-scope.mjs',
  ]) assert.throws(() => transformer.process('export const unused = true;', path.join(backend, file)),
    /core_conversation_transform_outside_finite_modules/, file);
});
