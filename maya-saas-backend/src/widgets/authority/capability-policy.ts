// `WIDGET_CAPABILITY_POLICY` — 56 rows, under the owner's SHEET 01 / OPTION A ruling.
//
// Two columns, two different kinds of thing, and the file keeps them apart on purpose:
//
//   min_verification   DERIVED, deterministically, from fields that already exist and are already
//                      enforced elsewhere. Nothing here is authored and nothing is guessed.
//   consent_class      OWNER-AUTHORED group policy, applied per key against each capability's own
//                      DATA CONTRACT. Where the prefix rule and the data contract disagree, the
//                      data contract wins — the owner's rule 8 is explicit: «Не определять это по
//                      названию.» Every row carries the evidence string that decided it.
//
// The columns are independent of everything else. CONSENT_CLASS != AUTHORITY, and
// CONSENT_CLASS != VERIFICATION: a capability still passes the tenant fence, the principal fence,
// the role fence, the floor, the PII ceiling and its action owner. None of them substitutes for
// another, and this table replaces none of them.

import { C9_CAPABILITIES } from '../../orchestration/c9.registry';
import { MAYA_AI_TOOL_CATALOG } from '../../ai-tools/ai-tool.catalog';
import type {
  ConsentClass,
  WidgetCapabilityPolicyRow,
} from '../../widget-contract/tables';
import type { VerificationLevel } from '../../widget-contract/envelope';

const CLIENT_ROLES = new Set(['client', 'customer']);

const toolByName = new Map(
  (MAYA_AI_TOOL_CATALOG as readonly { name: string }[]).map((t) => [t.name, t]),
);

// ── min_verification — the approved derivation, and only it ──────────────────────────────────────
//
//   resourceClass === 'LOCAL'                      -> ANONYMOUS
//   allowedRoles subset of {client, customer}      -> BOUND_CLIENT
//   any staff/owner role present                   -> SESSION_VERIFIED
//   no catalogue entry, mode READ                  -> CHANNEL_IDENTITY
//   no catalogue entry, PROPOSE_ONLY/OWNER_HANDOFF -> SESSION_VERIFIED
//
// Every other floor term — risk, C9_MODE_FLOOR, C9_RESOURCE_FLOOR, CONSENT_CLASS_FLOOR — can only
// RAISE the result, because they meet in `maxLevel`. None of them can lower it, and neither can
// this column.

export interface DerivedFloor {
  readonly level: VerificationLevel;
  readonly rule: string;
}

export const deriveMinVerification = (cap: {
  capabilityKey: string;
  mode: string;
  resourceClass: string;
}): DerivedFloor => {
  if (cap.resourceClass === 'LOCAL')
    return { level: 'ANONYMOUS', rule: 'resourceClass=LOCAL' };

  const tool = toolByName.get(cap.capabilityKey) as
    { allowedRoles?: readonly string[] } | undefined;

  if (!tool)
    return cap.mode === 'READ'
      ? { level: 'CHANNEL_IDENTITY', rule: 'no catalogue entry + READ' }
      : { level: 'SESSION_VERIFIED', rule: `no catalogue entry + ${cap.mode}` };

  const roles = tool.allowedRoles ?? [];
  if (!roles.length)
    return {
      level: 'SESSION_VERIFIED',
      rule: 'catalogue entry with no allowedRoles — fail closed',
    };

  return roles.every((r) => CLIENT_ROLES.has(r))
    ? {
        level: 'BOUND_CLIENT',
        rule: 'allowedRoles subset of {client, customer}',
      }
    : {
        level: 'SESSION_VERIFIED',
        rule: 'a staff or owner role is present in allowedRoles',
      };
};

// ── consent_class — the owner's group policy, applied against each data contract ─────────────────
//
// The enum is closed at five members and NO NEW ONE IS CREATED here:
//   none · communication · personal_data · identity_binding · finance
//
// Two things the owner asked to be kept straight, and which this file keeps straight:
//
//   MARKETING RANKING/SELECTION != CONTACT PERMISSION
//   OWNER APPROVAL              != CLIENT MARKETING CONSENT
//
// And one the enum settles: there IS no marketing class and no combined privacy+marketing class.
// `communication` is the canonical delivery class — §4.9.3 fixes it: "a delivery permission is
// always a communication consent, never another class". So b35 takes `communication`, and no
// combined value is invented to sit beside it.

export interface ConsentAssignment {
  readonly consentClass: ConsentClass;
  /** Which of the owner's rules fired. */
  readonly rule: string;
  /** The capability's own words, when its data contract is what decided it. */
  readonly evidence: string;
  /** True where the prefix rule and the data contract disagreed, or the call is close. */
  readonly exceptional: boolean;
}

/**
 * Capabilities whose DATA CONTRACT decides them, against or beyond their prefix.
 *
 * Each quotes the capability's own description. This is the owner's rule 8 discharged: a class is
 * assigned from what the capability says it returns, never from what its name suggests.
 */
const BY_DATA_CONTRACT: Readonly<Record<string, ConsentAssignment>> =
  Object.freeze({
    // Prefix says clients/customers; the data contract says no PII. The contract wins.
    'customers.count': {
      consentClass: 'none',
      rule: 'rule 8 — data contract states PII-free',
      evidence: 'Read a tenant customer count WITHOUT customer PII',
      exceptional: true,
    },
    // Prefix says clients.*; the contract says policy signals, privacy-safe. Assigned the STRICTER
    // of the two readings and flagged, because `personal_data` only raises a floor and only narrows
    // what an intent may do — being wrong in this direction costs a handoff, not a disclosure.
    'clients.dormant.list': {
      consentClass: 'personal_data',
      rule: 'rule 4 prefix, held against a privacy-safe data contract — stricter reading kept',
      evidence:
        'canonical C8 dormancy policy signals, privacy-safe and bounded',
      exceptional: true,
    },
    'clients.retention.scan': {
      consentClass: 'personal_data',
      rule: 'rule 4 — identified client retention scan',
      evidence: 'client retention scan over identified CRM clients',
      exceptional: false,
    },
    // F81 names loyalty ADJUSTMENT as finance, by the contract's own enumeration. Not my choice.
    'loyalty.internal.adjust': {
      consentClass: 'finance',
      rule: 'F81 — finance covers loyalty redemption and loyalty adjustment, by name',
      evidence:
        'Adjust an internal-calendar loyalty balance after owner approval',
      exceptional: false,
    },
    // F81's enumeration does NOT include a loyalty READ. Rule 6 governs: an identified customer's
    // balance is that customer's personal data.
    'loyalty.own.read': {
      consentClass: 'personal_data',
      rule: 'rule 6 — identified client loyalty; F81 enumerates redemption and adjustment, not a read',
      evidence: 'the authenticated customer authoritative loyalty balance',
      exceptional: false,
    },
    // Explicitly PII-free, and it is the F-CRM-JOURNAL-READ surface, so the wording matters.
    'operations.journal.read': {
      consentClass: 'none',
      rule: 'rule 8 — data contract states PII-free',
      evidence:
        'Read the exact PII-FREE YClients appointment journal for one calendar date',
      exceptional: true,
    },
    'reviews.list.read': {
      consentClass: 'none',
      rule: 'rule 8 — privacy-safe by its own contract; original review text is not returned',
      evidence:
        'privacy-safe recent business review facts; original review text is not returned',
      exceptional: false,
    },
    'reviews.analyze': {
      consentClass: 'none',
      rule: 'rule 8 — privacy-safe aggregates',
      evidence: 'Analyze privacy-safe business review aggregates',
      exceptional: false,
    },
    // Transactional reminder POLICY, tenant-wide. Not marketing, and not a contact permission — but
    // it is a capability over communication behaviour, so it is flagged for the owner.
    'notifications.appointments.read': {
      consentClass: 'none',
      rule: 'rule 3 — tenant configuration, transactional not marketing',
      evidence: 'the tenant-wide TRANSACTIONAL appointment reminder policy',
      exceptional: false,
    },
    'notifications.appointments.update': {
      consentClass: 'communication',
      rule: 'rule 7 boundary — it configures whether communication is sent at all',
      evidence:
        'Enable or disable tenant-wide transactional appointment reminders',
      exceptional: true,
    },
    // Client-initiated, in-app, after the customer confirms. Inbound to the owner, not outbound
    // marketing — so it is not a contact permission in the sense rule 7 governs.
    'support.contact-admin.request': {
      consentClass: 'none',
      rule: 'rule 8 — client-initiated inbound request, confirmed by the customer',
      evidence:
        'Create a persistent in-app request … after the customer confirms it',
      exceptional: true,
    },
    // An owner report is the most concentrated personal data this product makes (K10). Neither key
    // carries a catalogue description, so the class is assigned on what the artefact can hold.
    'owner_report.status': {
      consentClass: 'none',
      rule: 'rule 8 — status of a job, carries no client data',
      evidence: 'no catalogue description; status only',
      exceptional: true,
    },
    'owner_report.download': {
      consentClass: 'personal_data',
      rule: 'rule 4 — the artefact can carry identified client data; K10 binds it to one principal',
      evidence:
        'no catalogue description; the delivered artefact declares contains_pii',
      exceptional: true,
    },
    'reports.recovered': {
      consentClass: 'none',
      rule: 'rule 8 — attribution aggregates for a period, not identified client data',
      evidence:
        'deterministic MAYA Recovered attribution for a reporting period',
      exceptional: true,
    },
    // Staff schedules are employment data, not CLIENT personal data. Client consent classes do not
    // govern them; the tenant and role fences do.
    'staff.schedule.read': {
      consentClass: 'none',
      rule: 'rule 8 — staff employment data, not identified CLIENT personal data',
      evidence: 'the exact YClients work schedule for one named staff member',
      exceptional: true,
    },
    'staff.schedule.own.read': {
      consentClass: 'none',
      rule: 'rule 8 — the authenticated employee own schedule',
      evidence: 'the authenticated employee own verified CRM work schedule',
      exceptional: false,
    },
    'commerce.certificates.read': {
      consentClass: 'none',
      rule: 'rule 8 — tenant-configured denominations, not a balance; F81 enumerates acts, not reads',
      evidence: 'only the certificate denominations configured by this tenant',
      exceptional: false,
    },
    'commerce.memberships.read': {
      consentClass: 'none',
      rule: 'rule 8 — tenant-configured offers, not a balance',
      evidence:
        'the membership or subscription offers configured by this tenant',
      exceptional: false,
    },
    'referrals.status.read': {
      consentClass: 'none',
      rule: 'rule 8 — programme status and configured rewards; creates and grants nothing',
      evidence: 'This does not create a referral or grant a reward',
      exceptional: false,
    },
  });

/** The owner's group rules, applied in order. The first that matches decides. */
const GROUP_RULES: readonly {
  test: (key: string) => boolean;
  consentClass: ConsentClass;
  rule: string;
}[] = Object.freeze([
  {
    test: (k) => k.startsWith('catalog.'),
    consentClass: 'none',
    rule: 'rule 1 — catalogue, non-personal business information',
  },
  {
    test: (k) => k.startsWith('analytics.') || k.startsWith('expenses.'),
    consentClass: 'none',
    rule: 'rule 2 — analytics / finance / expenses under staff authority',
  },
  {
    test: (k) => k.startsWith('a22.'),
    consentClass: 'none',
    rule: 'rule 3 — tenant configuration authority',
  },
  {
    test: (k) => k.startsWith('clients.') || k.startsWith('customers.'),
    consentClass: 'personal_data',
    rule: 'rule 4 — identified client personal data',
  },
  {
    test: (k) => k.startsWith('appointments.own.'),
    consentClass: 'personal_data',
    rule: 'rule 5 — the client own appointments are that client personal data',
  },
  {
    test: (k) => k.startsWith('loyalty.'),
    consentClass: 'personal_data',
    rule: 'rule 6 — identified client loyalty',
  },
  {
    test: (k) => k.startsWith('b35.'),
    consentClass: 'communication',
    rule: 'rule 7 — marketing communication; `communication` is the canonical delivery class',
  },
]);

export const assignConsentClass = (
  capabilityKey: string,
): ConsentAssignment => {
  const explicit = BY_DATA_CONTRACT[capabilityKey];
  if (explicit) return explicit;

  const group = GROUP_RULES.find((g) => g.test(capabilityKey));
  if (group)
    return {
      consentClass: group.consentClass,
      rule: group.rule,
      evidence: `group rule on the capability key prefix`,
      exceptional: false,
    };

  return {
    consentClass: 'none',
    rule: 'rule 8 — no identified client personal data, no marketing preparation, no consent mutation',
    evidence: 'tenant-scoped business capability',
    exceptional: false,
  };
};

// ── the table ────────────────────────────────────────────────────────────────────────────────────

export interface PolicyRowWithProvenance extends WidgetCapabilityPolicyRow {
  readonly capabilityKey: string;
  readonly floorRule: string;
  readonly consentRule: string;
  readonly consentEvidence: string;
  readonly exceptional: boolean;
}

export const POLICY_ROWS: readonly PolicyRowWithProvenance[] = Object.freeze(
  C9_CAPABILITIES.map((cap) => {
    const floor = deriveMinVerification(cap);
    const consent = assignConsentClass(cap.capabilityKey);
    return Object.freeze({
      capabilityKey: cap.capabilityKey,
      min_verification: floor.level,
      consent_class: consent.consentClass,
      // R3.11.5's flag. Every C9 propose key in this registry dispatches through the orchestrator's
      // own synchronous compose step; none queues after APPROVED. False would make a COMMIT naming
      // that propose key refuse until the owner declares it, so the conservative value is the one
      // that REFUSES, and true is asserted only because no key here queues.
      dispatch_is_synchronous: true,
      floorRule: floor.rule,
      consentRule: consent.rule,
      consentEvidence: consent.evidence,
      exceptional: consent.exceptional,
    });
  }),
);

/** The table in the shape `tables.ts` declares: keyed on `capKey(ref)`, i.e. `C9:<key>`. */
export const WIDGET_CAPABILITY_POLICY: Readonly<
  Record<string, WidgetCapabilityPolicyRow>
> = Object.freeze(
  Object.fromEntries(
    POLICY_ROWS.map((r) => [
      `C9:${r.capabilityKey}`,
      Object.freeze({
        min_verification: r.min_verification,
        consent_class: r.consent_class,
        dispatch_is_synchronous: r.dispatch_is_synchronous,
      }),
    ]),
  ),
);

export class PolicyLoadFailure extends Error {}

/**
 * F28's totality, at `EP-REGISTRY-LOAD`, or the process does not start.
 *
 * "A C9 key with no row fails the build." And over those only: a row for a key that is not a C9
 * capability would be a row the floor derivation never reads and nobody maintains.
 */
export const assertPolicyTotality = (): void => {
  const keys = new Set(C9_CAPABILITIES.map((c) => c.capabilityKey));
  if (POLICY_ROWS.length !== keys.size)
    throw new PolicyLoadFailure(
      `WIDGET_CAPABILITY_POLICY has ${POLICY_ROWS.length} rows for ${keys.size} C9 capabilities`,
    );
  for (const k of keys)
    if (!WIDGET_CAPABILITY_POLICY[`C9:${k}`])
      throw new PolicyLoadFailure(`C9 key ${k} has no policy row`);
  for (const composed of Object.keys(WIDGET_CAPABILITY_POLICY))
    if (!keys.has(composed.slice('C9:'.length)))
      throw new PolicyLoadFailure(
        `${composed} is a row for a key that is not a C9 capability`,
      );
};
