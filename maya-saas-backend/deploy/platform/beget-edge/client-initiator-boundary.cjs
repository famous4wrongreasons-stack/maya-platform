/** Permanent R01 cutover ratchet. Pure source inspection: no app/network imports.
 * Every candidate is registered, every patch is bounded, and retired entry
 * bodies cannot acquire a side effect before their refusal. No backup exemption.
 */
const fs = require('node:fs');
const path = require('node:path');
const {Script} = require('node:vm');
const ts = require('../../../node_modules/typescript');
const {retirePhp, retirePwa, sha256, MESSAGE, CODE} = require('./retire-legacy-client-create.cjs');

function phpCase(source) {
  const matches = [...source.matchAll(/\bcase\s+['"]create_record['"]\s*:/g)];
  if (matches.length !== 1) throw Error('Exactly one guarded create_record case required');
  const start = matches[0].index;
  const next = source.slice(start + matches[0][0].length).search(/\bcase\s+['"]/);
  if (next < 0) throw Error('Bounded PHP case required');
  return source.slice(start, start + matches[0][0].length + next).trim();
}
const allowedPhpCase = phpCase(retirePhp("<?php\n    case 'create_record':\n yc_post('/records/'); yc_post('/book_record/'); break;\n    case 'next': break;").source);

function assertRetiredPhp(source) {
  if (phpCase(source) !== allowedPhpCase) throw Error('Retired PHP entry changed: no writer, authority lookup, or delegation allowed before refusal');
  return true;
}

function assertRetiredPwa(source) {
  let submitCount = 0;
  let legacyCount = 0;
  for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/type\s*=\s*["']application\/(?:ld\+)?json/.test(match[1])) continue;
    const code = match[2];
    new Script(code);
    const ast = ts.createSourceFile('candidate.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    function visit(node) {
      if (ts.isCallExpression(node) && node.arguments.some(arg => /[?&]action=create_record/.test(arg.getText(ast))))
        throw Error('Raw create_record transport is forbidden in every PWA alias');
      if (ts.isFunctionDeclaration(node) && node.name?.text === 'submit' && node.getText(ast).includes('R01 canonical Client entry')) {
        submitCount++;
        const allowedCalls = new Set(['digitsPhone', "(bname || '').trim", 'setErr', 'setSubmitting', 'setPreviewInfo']);
        const guest = node.body.statements.filter(statement => !(ts.isIfStatement(statement) && statement.expression.getText(ast) === 'localSaasMode'));
        for (const statement of guest) {
          const inspect = child => {
            if (ts.isCallExpression(child) && !allowedCalls.has(child.expression.getText(ast)))
              throw Error('Unapproved guest submit effect/authority call: ' + child.expression.getText(ast));
            ts.forEachChild(child, inspect);
          };
          inspect(statement);
        }
        if (!node.body.getText(ast).includes(JSON.stringify(MESSAGE))) throw Error('Guest handoff required');
      }
      if (ts.isFunctionDeclaration(node) && node.name?.text === 'afLegacy') {
        const branches = node.body.statements.filter(statement => ts.isIfStatement(statement) && statement.expression.getText(ast).includes("'/appointments'"));
        for (const branch of branches) {
          legacyCount++;
          const text = branch.thenStatement.getText(ast);
          const expected = `{var refusal = new Error(${JSON.stringify(MESSAGE)}); refusal.code = '${CODE}'; refusal.retry_allowed = false; return Promise.reject(refusal);}`;
          const compact = value => value.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, '');
          if (compact(text) !== compact(expected)) throw Error('Legacy appointment branch must refuse before authority lookup or effect');
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  if (submitCount !== 1 || legacyCount > 1) throw Error('Exact retired PWA entries required');
  return {submitCount, legacyCount};
}

function assertOverlayTransition(before, after, kind) {
  const expected = (kind === 'php' ? retirePhp : retirePwa)(before).source;
  if (after !== expected) throw Error('Unreviewed write outside the bounded R01 overlay');
  return kind === 'php' ? assertRetiredPhp(after) : assertRetiredPwa(after);
}

function assertRegisteredDeployment(entries, manifest) {
  const registered = new Map(manifest.overlays.map(row => [row.target, row]));
  if (registered.size !== manifest.overlays.length) throw Error('Duplicate registered target');
  const seen = new Set();
  for (const entry of entries) {
    const row = registered.get(entry.target);
    if (!row || seen.has(entry.target)) throw Error('Unregistered or duplicate delivery target: ' + entry.target);
    seen.add(entry.target);
    if (sha256(entry.source) !== row.candidateSha256) throw Error('Unreviewed candidate bytes: ' + entry.target);
    if (row.kind === 'php') assertRetiredPhp(entry.source);
    if (row.kind === 'pwa') assertRetiredPwa(entry.source);
  }
  if (seen.size !== registered.size) throw Error('Missing registered deployment target');
  return seen.size;
}

module.exports = {assertRetiredPhp, assertRetiredPwa, assertOverlayTransition, assertRegisteredDeployment};
if (require.main === module) {
  const [directory, manifestPath] = process.argv.slice(2);
  if (!directory || !manifestPath) throw Error('Candidate directory and manifest required');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const entries = [];
  function walk(folder) {
    for (const item of fs.readdirSync(folder, {withFileTypes: true})) {
      const filename = path.join(folder, item.name);
      if (item.isDirectory()) walk(filename);
      else entries.push({target: path.relative(directory, filename).split(path.sep).join('/'), source: fs.readFileSync(filename, 'utf8')});
    }
  }
  walk(directory);
  process.stdout.write(JSON.stringify({verdict: 'PASS', registeredTargets: assertRegisteredDeployment(entries, manifest), effects: 0}) + '\n');
}
