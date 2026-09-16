#!/usr/bin/env node
// K14 — the Telegram command ledger, over the CANONICAL tree, READ ONLY.
//
// CORRECTION (2026-09-17). The first version of this file hard-coded the owner's Desktop working
// copy (`/Users/.../Desktop/Projects/maya-platform/ai администратор`). That copy predates the R02
// staff-principal cutover — it gates admin commands on a SQLite `is_admin` lookup and carries no
// `canonical_staff_access` at all — so everything the ledger published described a tree production
// does not run:
//
//   published from the Desktop copy          true of the canonical line
//   commands into an unreachable body: 0     28
//   mute_master / scan_and_alert: LIVE       FENCED (raise / retired stub)
//   fenced capabilities: 4 of 6              7 of 7
//
// On the canonical tree the dossier's premise holds exactly as the dossier stated it: the staff
// principal is a ContextVar set only inside the aiohttp middleware, the bot runs start_polling, and
// every command gated on it executes into a body it can never enter.
//
// The tree is now repository-relative, and the reading is an AST probe (k14-telegram-probe.py) that
// resolves same-file helpers and reads each fence at its definition, because the regex detectors of
// the first version matched only the Desktop copy's code shapes and printed a blind 0 on this tree.
//
// Run: node docs/rebuild/evidence/maya-chat-first-ux/k14-telegram-ledger.mjs [--json]

import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');
const TREE = path.join(repo, 'ai администратор');

const probe = JSON.parse(
  execFileSync('python3', [path.join(here, 'k14-telegram-probe.py'), TREE], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }),
);

const out = {
  tree: 'canonical — repository-relative "ai администратор"',
  commandsRegistered: probe.commands,
  canonicalStaffAccessPresent: probe.canonical_staff_access_in_bot,
  cancelRegistered: probe.rows.some((r) => r.command === 'cancel'),
  fencedCapabilities: probe.fences,
  commandsExecutingIntoAnUnreachableBody: probe.unreachable_under_polling.length,
  unreachableCommands: probe.unreachable_under_polling,
  commandsReachingAFencedBody: probe.reaching_fenced_body.length,
  fencedBodyCommands: probe.reaching_fenced_body,
  ledger: probe.rows,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2));
} else {
  const fences = Object.entries(out.fencedCapabilities);
  console.log('K14 TELEGRAM COMMAND LEDGER  (canonical tree, read only; nothing restored, nothing deleted)');
  console.log('='.repeat(78));
  console.log(`commands registered:                         ${out.commandsRegistered}`);
  console.log(`/cancel registered (the escape verb):        ${out.cancelRegistered ? 'yes' : 'NO'}`);
  console.log(`canonical_staff_access gates the bot:        ${out.canonicalStaffAccessPresent ? 'yes' : 'NO'}`);
  console.log();
  console.log('BODY-LEVEL FENCES, read at their definition:');
  for (const [name, f] of fences) console.log(`  ${f.state.padEnd(7)} ${name.padEnd(18)} ${f.why}`);
  console.log(`  -> ${fences.filter(([, f]) => f.state === 'FENCED').length} of ${fences.length} fenced`);
  console.log();
  console.log(`COMMANDS EXECUTING INTO AN UNREACHABLE BODY: ${out.commandsExecutingIntoAnUnreachableBody}   (K14 exit target 0)`);
  console.log(`  ${out.unreachableCommands.join(', ')}`);
  console.log(`COMMANDS REACHING A FENCED BODY:             ${out.commandsReachingAFencedBody}   (${out.fencedBodyCommands.join(', ')})`);
  console.log();
  console.log('The staff principal is a ContextVar set only by the aiohttp middleware, and the bot runs');
  console.log('start_polling. Each command above therefore gates on a principal that cannot exist for a');
  console.log('Telegram update. K14 re-dispositions them onto the served shell; it does not restore them.');
}
