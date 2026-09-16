#!/usr/bin/env node
// K14 — the Telegram command ledger, derived from the running bot, READ ONLY.
//
// The envelope is explicit that K14's job is "that the REPLACEMENT surface is reachable and proven
// — not that the old one was broken", and that "dead commands are not restored automatically merely
// because they exist in the code; each is re-dispositioned on the ledger". This script builds that
// ledger, and it builds it from the bot's own source rather than from the dossier's description of
// it, because the two do not agree.
//
// WHAT THE DOSSIER SAYS, AND WHAT THIS TREE HOLDS
//
// §D-TG's security note states that `canonical_staff_access._principal` is written only inside the
// aiohttp middleware while the bot runs `start_polling`, so `is_admin()` returns False for every
// Telegram-originated update and roughly 45 owner/staff commands execute into bodies that cannot be
// entered. In THIS working tree that mechanism does not exist: `canonical_staff_access` has zero
// occurrences across all 164 Python files, and `is_admin` is a plain SQLite lookup keyed by Telegram
// user id (database.py:1555) with no ContextVar and no middleware dependency. The signed K1 dossier
// anticipated exactly this: it records that "the copy of bot.py on the branch this signature is
// being prepared from does not match that checkout".
//
// So the ledger reports what IS here, per command, and says plainly where it differs from the
// description. It restores nothing and deletes nothing.
//
// bot.py IS READ ONLY. This script opens it for reading and never writes to that tree.
//
// Run: node docs/rebuild/evidence/maya-chat-first-ux/k14-telegram-ledger.mjs [--json]

import fs from 'node:fs';
import path from 'node:path';

const BOT_TREE = '/Users/stanislavmosin/Desktop/Projects/maya-platform/ai администратор';
const readBot = (f) => fs.readFileSync(path.join(BOT_TREE, f), 'utf8');

if (!fs.existsSync(path.join(BOT_TREE, 'bot.py'))) {
  console.error('bot.py not found; this ledger derives from the running bot and will not guess');
  process.exit(1);
}

const bot = readBot('bot.py');
const database = readBot('database.py');
const loyalty = readBot('loyalty.py');
const leadAlerts = fs.existsSync(path.join(BOT_TREE, 'lead_alerts.py')) ? readBot('lead_alerts.py') : '';

// ── the commands, enumerated from the registration site ──────────────────────────────────────────
const COMMANDS = [...bot.matchAll(/CommandHandler\("([a-z_]+)"\s*,\s*([A-Za-z_][A-Za-z0-9_]*)/g)].map(
  (m) => ({ command: m[1], handler: m[2] }),
);

// ── the authority gate, as it actually is ────────────────────────────────────────────────────────
const CANONICAL_STAFF_ACCESS_PRESENT = fs
  .readdirSync(BOT_TREE)
  .filter((f) => f.endsWith('.py'))
  .some((f) => readBot(f).includes('canonical_staff_access'));

const isAdminIsDbLookup = /def is_admin\(telegram_user_id: int\) -> bool:\s*\n\s*with _db\(\) as conn:/.test(
  database,
);

// ── the six body-level fences, each checked at its own definition ────────────────────────────────
//
// "Fenced" means: the body returns or raises BEFORE doing its work. A body that still does its work
// is live, whatever a document says about it. Each is read at its definition rather than inferred.
const bodyOf = (src, name) => {
  const m = new RegExp(`\\n(?:async )?def ${name}\\(`).exec(src);
  if (!m) return null;
  const from = m.index + 1;
  const rest = src.slice(from);
  const next = /\n(?:async )?def /.exec(rest.slice(1));
  return rest.slice(0, next ? next.index + 1 : 4000);
};

const FENCE_MARKERS = [
  /_legacy_loyalty_mutation_disabled\(/,
  /raise RuntimeError\(/,
  /return False\s*$/m,
  /retired_no_canonical/,
  /_disabled\b/,
];

const fenceState = (src, name) => {
  const body = bodyOf(src, name);
  if (body === null) return { state: 'ABSENT', why: `no definition of ${name} in this tree` };
  // Only the statements BEFORE any real work count: a fence that fires after the effect is not one.
  const head = body.split('\n').slice(0, 14).join('\n');
  const marker = FENCE_MARKERS.find((r) => r.test(head));
  if (marker) return { state: 'FENCED', why: `body returns/raises early: ${marker.source}` };
  return { state: 'LIVE', why: 'the body performs its work; no early return or raise' };
};

const FENCED_CAPABILITIES = [
  { name: 'mute_master', src: database, file: 'database.py' },
  { name: 'run_loyalty_job', src: loyalty, file: 'loyalty.py' },
  { name: 'run_backfill_job', src: loyalty, file: 'loyalty.py' },
  { name: 'scan_and_alert', src: leadAlerts, file: 'lead_alerts.py' },
  { name: 'can_redeem_codes', src: database, file: 'database.py' },
  { name: 'set_cashier_role', src: database, file: 'database.py' },
].map((c) => ({ ...c, ...fenceState(c.src, c.name) }));

// ── per command: is its gate reachable, and does its body reach a fence? ─────────────────────────
const handlerBody = (name) => bodyOf(bot, name) ?? '';

const ledger = COMMANDS.map(({ command, handler }) => {
  const body = handlerBody(handler);
  const gated = /database\.is_admin\(|database\.is_staff\(/.test(body);
  const reachesFence = FENCED_CAPABILITIES.filter(
    (c) => c.state === 'FENCED' && body.includes(c.name),
  ).map((c) => c.name);
  return {
    command,
    handler,
    // Reachable because the gate is a database lookup, not a ContextVar the polling bot never sets.
    gateReachable: !CANONICAL_STAFF_ACCESS_PRESENT && isAdminIsDbLookup,
    adminGated: gated,
    reachesFencedBody: reachesFence,
    // K14 disposition: HANDOFF is the default under the signed G11 condition — Telegram stays a
    // delivery and handoff channel, so a command's successor is the shell surface it hands off to.
    disposition: reachesFence.length ? 'RETIRE — body fenced, no successor restored' : 'HANDOFF to the shell',
  };
});

const intoUnreachableBody = ledger.filter((r) => !r.gateReachable && r.adminGated);

// NON-VACUITY. "0 commands execute into an unreachable body" is worth nothing unless the check
// could have said otherwise, so the count it WOULD have reported under the dossier's premise is
// published beside it: every admin-gated command, which is what would be unenterable if the gate
// really were a ContextVar the polling bot never sets.
const adminGatedCount = ledger.filter((r) => r.adminGated).length;
const intoFencedBody = ledger.filter((r) => r.reachesFencedBody.length);

const out = {
  commandsRegistered: ledger.length,
  canonicalStaffAccessPresent: CANONICAL_STAFF_ACCESS_PRESENT,
  isAdminIsDatabaseLookup: isAdminIsDbLookup,
  cancelRegistered: ledger.some((r) => r.command === 'cancel'),
  fencedCapabilities: FENCED_CAPABILITIES.map(({ name, file, state, why }) => ({ name, file, state, why })),
  commandsExecutingIntoAnUnreachableBody: intoUnreachableBody.length,
  adminGatedCommands: adminGatedCount,
  commandsReachingAFencedBody: intoFencedBody.map((r) => r.command),
  ledger,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log('K14 TELEGRAM COMMAND LEDGER  (bot.py read only; nothing restored, nothing deleted)');
  console.log('='.repeat(78));
  console.log(`commands registered:                      ${out.commandsRegistered}`);
  console.log(`/cancel registered (the escape verb):     ${out.cancelRegistered ? 'yes' : 'NO'}`);
  console.log(`canonical_staff_access present in tree:   ${out.canonicalStaffAccessPresent ? 'yes' : 'NO  <- dossier premise absent'}`);
  console.log(`is_admin is a database lookup:            ${out.isAdminIsDatabaseLookup ? 'yes <- gate IS reachable from polling' : 'no'}`);
  console.log();
  console.log('THE SIX BODY-LEVEL FENCED CAPABILITIES, as they are in THIS tree:');
  for (const c of out.fencedCapabilities)
    console.log(`  ${c.state.padEnd(7)} ${c.name.padEnd(18)} ${c.file.padEnd(15)} ${c.why}`);
  const fenced = out.fencedCapabilities.filter((c) => c.state === 'FENCED').length;
  console.log(`  -> ${fenced} of 6 fenced; the dossier describes 6 of 6 (see the checkout note above)`);
  console.log();
  console.log(`COMMANDS EXECUTING INTO AN UNREACHABLE BODY:  ${out.commandsExecutingIntoAnUnreachableBody}`);
  console.log(`  ...and the number it WOULD be under the dossier's premise: ${out.adminGatedCommands}`);
  console.log(`COMMANDS REACHING A FENCED BODY:             ${out.commandsReachingAFencedBody.length}` +
    (out.commandsReachingAFencedBody.length ? `  (${out.commandsReachingAFencedBody.join(', ')})` : ''));
  console.log();
  console.log('EVERY command carries a recorded disposition:');
  const byDisp = {};
  for (const r of ledger) byDisp[r.disposition] = (byDisp[r.disposition] ?? 0) + 1;
  for (const [d, n] of Object.entries(byDisp)) console.log(`  ${String(n).padStart(3)}  ${d}`);
}

// No process.exit here: it truncates a pending stdout write, and --json emits megabytes.
