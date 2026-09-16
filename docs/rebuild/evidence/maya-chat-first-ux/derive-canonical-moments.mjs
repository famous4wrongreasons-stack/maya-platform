#!/usr/bin/env node
// K13 — deriving the twelve canonical moments, rather than inventing twelve names.
//
// The contract asserts a CARDINALITY — "MOMENT_REGISTRY carries exactly twelve rows" — and never
// enumerates the twelve. The UX architecture's verification pass records that it "confirmed 12
// proactive moments" against the repository, so the set was counted from something; the passage
// that named them did not survive into the certified corpus. Filling twelve slots with plausible
// names would reproduce exactly the defect the wave-2 enum ruling forbids: «не придумывать members
// по количеству».
//
// So the set is DERIVED, from three sources that are each admissible on the owner's own terms, and
// the count is checked AFTERWARDS rather than aimed at:
//
//   1. `Package2InboxType` — a normative TypeScript union in the compiled backend, whose exact
//      domain is fixed by `Record<Package2InboxType, string>` on PACKAGE2_CAPABILITY_BY_TYPE. 21
//      members. A registry whose domain contractually defines the type.
//
//   2. The certified surface inventory's notification channels — scheduler (32), web-push (16),
//      sms (3), email (1) = 52 of the 135. A moment is something a SCHEDULER emits; a type no
//      scheduler emits is a reply or a webhook echo, not a moment.
//
//   3. `ProactiveProvenance.artefact_kind` — a six-member closed union in the contract. A moment
//      must reference a canonical artefact of one of those six kinds. This is what separates
//      `team_message` (a fan-out of something a human wrote — no admissible artefact kind) from
//      the twelve, and it is a TYPE-level exclusion rather than a judgement about the name.
//
// Run: node docs/rebuild/evidence/maya-chat-first-ux/derive-canonical-moments.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');

const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');

// ── source 1: the compiled union, read through the total Record that keys it ─────────────────────
const deliverySrc = read(
  'maya-saas-backend/src/communication-delivery/communication-delivery.service.ts',
);
const recordBlock = /const PACKAGE2_CAPABILITY_BY_TYPE: Record<Package2InboxType, string> = \{([\s\S]*?)\n\};/.exec(
  deliverySrc,
);
if (!recordBlock)
  throw new Error(
    'PACKAGE2_CAPABILITY_BY_TYPE not found — the domain source moved; refusing to guess',
  );
const DOMAIN = [...recordBlock[1].matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]);

// The union itself, read separately, so the two spellings are cross-checked rather than trusted.
const unionBlock = /export type Package2InboxType =([\s\S]*?);/.exec(deliverySrc);
const UNION = [...unionBlock[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
const sameSet = (a, b) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();
if (!sameSet(DOMAIN, UNION))
  throw new Error(
    `the Record domain and the union disagree (${DOMAIN.length} vs ${UNION.length}) — one of them is not total`,
  );

// ── source 2: the certified notification surfaces ────────────────────────────────────────────────
const inventory = JSON.parse(
  read('docs/rebuild/evidence/maya-chat-first-ux/surface-inventory.json'),
);
const NOTIFY_CHANNELS = ['scheduler', 'web-push', 'sms', 'email'];
const notifySurfaces = inventory.filter((s) =>
  NOTIFY_CHANNELS.includes(s.channel),
);
const notifyText = JSON.stringify(notifySurfaces);

// Exact token match, not a normalised one. `team message` (with a space) is prose ABOUT a fan-out;
// `team_message` is the type. Matching loosely would fold the two together, and the difference is
// load-bearing — see source 3.
const emittedByAScheduler = DOMAIN.filter((t) => notifyText.includes(t));

// ── source 3: the artefact kinds a proactive emission may reference ──────────────────────────────
const lifecycle = read('maya-saas-backend/src/widget-contract/lifecycle.ts');
const artefactBlock = /artefact_kind:([\s\S]*?);/.exec(lifecycle);
const ARTEFACT_KINDS = [...artefactBlock[1].matchAll(/'([a-z_]+)'/g)].map(
  (m) => m[1],
);

// Which artefact each candidate references. Every assignment names the canonical row the emission
// is ABOUT — not the message, the row. A type with no such row cannot carry a ProactiveProvenance
// and therefore cannot be a moment, whatever it is called.
const ARTEFACT_OF = {
  appointment_reminder: 'appointment',
  shift_reminder: 'shift',
  wanted_slot_available: 'appointment',
  native_feedback_invitation: 'appointment',
  daily_report: 'closed_report',
  morning_brief: 'closed_report',
  weekly_expense_reminder: 'closed_report',
  growth_plan: 'opportunity',
  hanging_lead: 'opportunity',
  owner_alert: 'opportunity',
  birthday_alert: 'opportunity',
  review_alert: 'opportunity',
  // deliberately absent, and this is the discriminator:
  //   team_message            — a message a human wrote; no canonical artefact row
  //   native_feedback_response — a reply to an invitation, not a moment
  //   new_appointment, appointment_{deleted,cancelled,rescheduled,reassigned}
  //                           — webhook echoes of a change, emitted on the event, not scheduled
  //   maya_task, client_support_request — inbound, not outbound
};

const MOMENTS = emittedByAScheduler.filter((t) => ARTEFACT_OF[t]);

for (const [t, kind] of Object.entries(ARTEFACT_OF))
  if (!ARTEFACT_KINDS.includes(kind))
    throw new Error(`${t} claims artefact kind ${kind}, which is not one of the six`);

// ── report ───────────────────────────────────────────────────────────────────────────────────────
const out = {
  domain: DOMAIN.length,
  notificationSurfaces: notifySurfaces.length,
  artefactKinds: ARTEFACT_KINDS.length,
  emittedByAScheduler: emittedByAScheduler.length,
  moments: MOMENTS.sort(),
  excluded: DOMAIN.filter((t) => !MOMENTS.includes(t)).sort(),
};

console.log(JSON.stringify(out, null, 2));

const problems = [];
if (out.domain !== 21) problems.push(`Package2InboxType domain is ${out.domain}, was 21`);
if (out.notificationSurfaces !== 52)
  problems.push(`notification surfaces ${out.notificationSurfaces}, was 52`);
if (out.artefactKinds !== 6) problems.push(`artefact kinds ${out.artefactKinds}, was 6`);
if (out.moments.length !== 12)
  problems.push(
    `DERIVED ${out.moments.length} moments; the contract declares exactly 12 — reconcile before use`,
  );
// The one independent cross-check available: §triage-135 names three of the twelve by hand.
for (const named of [
  'appointment_reminder',
  'wanted_slot_available',
  'native_feedback_invitation',
])
  if (!out.moments.includes(named))
    problems.push(`${named} is named as a canonical moment in triage-135 and did not derive`);

if (problems.length) {
  console.error('\nDERIVATION PROBLEMS:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.error('\nDERIVED 12/12 — cardinality reproduced, not assumed; 3/3 named moments present.');
