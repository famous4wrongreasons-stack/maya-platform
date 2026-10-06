#!/usr/bin/env node
// Read-only, local release-programme proof. This never grants or writes an entitlement.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { check, recomputeHeadline } from '../evidence/maya-chat-first-ux/gate-audit-check.mjs';
import { loadV13Audit } from './development-v14/prepare-audit.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const baseline = JSON.parse(read('docs/rebuild/widget-release-programme/baseline.json'));
// This programme's 31-false baseline is historical. Do not impose its states on a fresh candidate.
const state = loadV13Audit();
assert.deepEqual(check(state), []);
const falseKeys = state.audit.gates.flatMap(g => Object.entries(g.clauses).filter(([, c]) => c.state === 'false').map(([k]) => k));
assert.deepEqual(baseline.clauses.map(c => c.id), falseKeys);
assert.equal(falseKeys.length, 31);
const states = {};
for (const g of state.audit.gates) for (const c of Object.values(g.clauses)) states[c.state] = (states[c.state] ?? 0) + 1;
const changed = [...new Set([...git('diff', '--name-only', baseline.base).split('\n'), ...git('ls-files', '--others', '--exclude-standard').split('\n')].filter(Boolean))];
const claudeHead = git('rev-parse', baseline.canonical_branch);
const canonicalCheckout = git('worktree', 'list', '--porcelain').split('\n\n')
  .find(block => block.split('\n').includes(`branch refs/heads/${baseline.canonical_branch}`))
  ?.split('\n').find(line => line.startsWith('worktree '))?.slice('worktree '.length);
assert.ok(canonicalCheckout, 'Canonical checkout must be present for the ownership check');
const canonicalGit = (...args) => execFileSync('git', args, { cwd: canonicalCheckout, encoding: 'utf8' }).trim();
const claudeUncommittedPaths = [...new Set([
  ...canonicalGit('diff', '--name-only', 'HEAD').split('\n'),
  ...canonicalGit('ls-files', '--others', '--exclude-standard').split('\n'),
].filter(Boolean))];
const protectedPaths = new Set([...baseline.claude_changed_paths_at_baseline,
  ...git('diff', '--name-only', `${baseline.base}..${claudeHead}`).split('\n'),
  ...claudeUncommittedPaths]);
const prefixes = ['maya-carrier/', 'maya-chat-shell/', 'maya-ios/', 'maya-os-site/', 'сайт и приложение/'];
const violations = changed.filter(f => protectedPaths.has(f) || prefixes.some(p => f.startsWith(p)) || /^maya-carrier-/.test(f) || /\.(css|tsx)$/.test(f));
assert.deepEqual(violations, [], 'Claude ownership overlap');
const contains = (file, needle) => assert.ok(read(file).includes(needle), `${file} missing ${needle}`);
contains('maya-chat-shell/src/net/client.ts', '/widgets/intent');
contains('maya-chat-shell/src/net/client.ts', '/widgets/resolve');
contains('maya-chat-shell/src/shell/intents.ts', 'createLiveSubmission');
contains('maya-saas-backend/src/common/feature-catalog.ts', "'widgets.runtime': defineReadiness('planned'");
contains('maya-saas-backend/src/ai-tools/ai-tool.catalog.ts', 'const CLIENT_ROLES = [UserRole.CLIENT, UserRole.CUSTOMER] as const;');
contains('maya-saas-backend/src/widgets/projection/widget-projector.service.ts', 'composeNavigate');
const classificationCounts = {};
for (const c of baseline.clauses) classificationCounts[c.classification] = (classificationCounts[c.classification] ?? 0) + 1;
console.log(JSON.stringify({ contract: 'maya.widget-release-local-check/1', head: git('rev-parse', 'HEAD'),
  baseline: baseline.base, claudeHead, canonicalCheckout, claudeUncommittedPaths,
  changed, ownershipOverlap: violations, clauseStates: states,
  classificationCounts, headline: recomputeHeadline(state.audit), productionActivation: 'FORBIDDEN',
  clientRolesUnchanged: true, shellSubmissionDriftConfirmed: true,
  level: 'read-only source/inventory proof; not live gate promotion or production acceptance' }, null, 2));
