#!/usr/bin/env node
/** R01 bounded deployment overlay. Pure transformations; no app/provider/DB I/O.
 * Input is an owner-inventoried local source copy. Never patch unknown bytes.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('../../../node_modules/typescript');

const MESSAGE = 'Для записи откройте MAYA в приложении и подтвердите привязку клиента.';
const CODE = 'verified_client_channel_required';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function retirePhp(source) {
  const marker = "    case 'create_record':";
  const start = source.indexOf(marker);
  if (start < 0 || source.indexOf(marker, start + 1) >= 0) throw Error('Exact single create_record case required');
  const end = source.indexOf("    case '", start + marker.length);
  if (end < 0) throw Error('Bounded next PHP case required');
  const body = source.slice(start, end);
  if ((body.match(/yc_post\(/g) || []).length !== 2 || !body.includes('/book_record/'))
    throw Error('Expected inventoried direct provider create branches required');
  const replacement = `    case 'create_record':
        // R01: raw phone/guest/provider-token input is not canonical Client authority.
        http_response_code(410);
        echo json_encode([
            'success' => false, 'accepted' => false, 'retry_allowed' => false,
            'code' => '${CODE}',
            'error' => '${MESSAGE}',
            'message' => '${MESSAGE}',
            'canonical_url' => 'https://malesthetic.pro/app/',
        ], JSON_UNESCAPED_UNICODE);
        break;

`;
  return {source: source.slice(0, start) + replacement + source.slice(end), replacements: 1};
}

function retirePwa(source) {
  const edits = [];
  const scripts = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let match;
  while ((match = scripts.exec(source))) {
    if (/\btype\s*=\s*["'](?:application\/ld\+json|application\/json)/i.test(match[1])) continue;
    const code = match[2];
    const offset = match.index + match[0].indexOf('>') + 1;
    const ast = ts.createSourceFile('pwa.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const seen = new Set();
    function walk(node) {
      if (ts.isCallExpression(node) && node.expression.getText(ast) === 'fetch' &&
          node.arguments[0]?.getText(ast).includes('?action=create_record')) {
        let statement = node;
        while (statement && !ts.isExpressionStatement(statement) && !ts.isReturnStatement(statement)) statement = statement.parent;
        if (!statement || seen.has(statement.pos)) return;
        seen.add(statement.pos);
        const message = JSON.stringify(MESSAGE);
        const replacement = ts.isReturnStatement(statement)
          ? `\n      // R01 canonical Client entry: retired raw provider create.\n      var refusal = new Error(${message}); refusal.code = '${CODE}'; refusal.retry_allowed = false; return Promise.reject(refusal);\n    `
          : `// R01 canonical Client entry: retired raw provider create.\n    submittingRef.current = false;\n    setSubmitting(false);\n    setErr(${message});`;
        if (ts.isReturnStatement(statement)) {
          const block = statement.parent;
          if (!ts.isBlock(block) || !ts.isIfStatement(block.parent) ||
              !block.parent.expression.getText(ast).includes("'/appointments'"))
            throw Error('Expected exact legacy appointment branch');
          edits.push({start: offset + block.getStart(ast) + 1, end: offset + block.end - 1, replacement});
        } else {
          edits.push({start: offset + statement.getStart(ast), end: offset + statement.end, replacement});
        }
      }
      ts.forEachChild(node, walk);
    }
    walk(ast);
  }
  if (edits.length < 1 || edits.length > 2) throw Error('Expected one/two inventoried guest create callers');
  for (const edit of edits.sort((a, b) => b.start - a.start))
    source = source.slice(0, edit.start) + edit.replacement + source.slice(edit.end);
  return {source, replacements: edits.length};
}

module.exports = {retirePhp, retirePwa, sha256, MESSAGE, CODE};
if (require.main === module) {
  const [kind, input, output, expectedHash] = process.argv.slice(2);
  if (!['php', 'pwa'].includes(kind) || !input || !output || !/^[a-f0-9]{64}$/.test(expectedHash || ''))
    throw Error('Usage: retire-legacy-client-create.cjs php|pwa source output exact-source-sha256');
  if (path.resolve(input) === path.resolve(output)) throw Error('Use a separate reviewable candidate');
  const bytes = fs.readFileSync(input);
  if (sha256(bytes) !== expectedHash) throw Error('Source differs from admitted overlay baseline');
  const result = (kind === 'php' ? retirePhp : retirePwa)(bytes.toString('utf8'));
  fs.writeFileSync(output, result.source, {flag: 'wx'});
  process.stdout.write(JSON.stringify({sourceSha256: expectedHash, candidateSha256: sha256(result.source), replacements: result.replacements}) + '\n');
}
