#!/usr/bin/env node
// The D12 schema constrains ten columns with CHECK constraints over enums it says come from the
// certified contract. Nothing compared the two. mapping-vs-contract-check.mjs passes 14/14 without
// ever looking at a member count, and widget-schema-count.mjs counts CHECK annotations without
// resolving what any of them admits — so a cardinality could differ by three and every gate stayed
// green. This checker compares them, because the difference decides what the database will accept:
// a CHECK narrower than the contract turns a legal envelope into a failed INSERT at runtime, in the
// least diagnosable place in the system.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const ROOT_GUESS = path.resolve(new URL('.', import.meta.url).pathname, '../../../..');
// typescript lives in the backend's node_modules; this file sits in docs/, so it is resolved from
// there explicitly rather than by package lookup.
const require_ = createRequire(path.join(ROOT_GUESS, 'maya-saas-backend/package.json'));
const ts = require_('typescript');

const ROOT = ROOT_GUESS;
const MAP = fs.readFileSync(path.join(ROOT, 'docs/rebuild/MAYA-CHAT-FIRST-K1-K16-IMPLEMENTATION-MAPPING.md'), 'utf8');
const SRC = path.join(ROOT, 'maya-saas-backend/src/widget-contract');

// what the contract declares, read from the module generated FROM the contract
const unions = {};
for (const f of fs.readdirSync(SRC).filter((f) => f.endsWith('.ts'))) {
  const sf = ts.createSourceFile(f, fs.readFileSync(path.join(SRC, f), 'utf8'), ts.ScriptTarget.ES2022, true);
  sf.forEachChild((n) => {
    if (ts.isTypeAliasDeclaration(n) && ts.isUnionTypeNode(n.type)) {
      const vals = n.type.types.filter(ts.isLiteralTypeNode).map((t) => t.literal.getText(sf).replace(/'/g, ''));
      if (vals.length) unions[n.name.text] = vals;
    }
  });
}

// what the mapping's §5.5 enum table asserts
const rows = [...MAP.matchAll(/^\|\s*`(\w+)`\s*\|\s*(\d+)\s*\|\s*([^|]*)\|/gm)]
  .map((m) => ({ set: m[1], members: Number(m[2]), source: m[3].trim() }));

const agree = [], differ = [], undeclared = [];
for (const r of rows) {
  if (!unions[r.set]) { undeclared.push(r); continue; }
  (unions[r.set].length === r.members ? agree : differ).push({ ...r, contract: unions[r.set].length, values: unions[r.set] });
}

console.log(`§5.5 enum table rows: ${rows.length}   declared by the contract: ${rows.length - undeclared.length}\n`);
for (const d of differ)
  console.log(`DIFFER    ${d.set.padEnd(22)} mapping says ${String(d.members).padStart(2)}   contract declares ${String(d.contract).padStart(2)}   (mapping cites: ${d.source})\n          contract: ${d.values.join(' ')}`);
for (const u of undeclared)
  console.log(`NO UNION  ${u.set.padEnd(22)} mapping says ${String(u.members).padStart(2)}   the contract declares no such type   (mapping cites: ${u.source})`);
console.log(`\nAGREE ${agree.length}  ·  DIFFER ${differ.length}  ·  NOT A CONTRACT TYPE ${undeclared.length}`);

// A row that names no members and has no contract union cannot be turned into a CHECK constraint at
// all. That is not a disagreement — it is an absence, and it is reported separately so the two are
// never confused.
const spelled = undeclared.filter((u) => /`\w+`\s*\/|\//.test(u.source));
console.log(`of the ${undeclared.length} without a contract union, ${spelled.length} spell their members out in the table and ${undeclared.length - spelled.length} give only a count`);

if (differ.length) {
  console.log(`\nBLOCKED: ${differ.length} enum(s) cannot be written as a CHECK constraint without choosing between the mapping and the certified contract.`);
  process.exit(1);
}
console.log('\nevery enum in the table matches the contract');
