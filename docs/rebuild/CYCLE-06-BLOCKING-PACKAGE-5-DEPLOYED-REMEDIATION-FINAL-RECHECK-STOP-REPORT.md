# Package 5 — remediation deployed; independent final recheck stopped

Date: 2026-09-04. Accepted input: `03c1c3a7`, A26 Internal Trial Bootstrap V1.
Deployed source: `94543056`. Production release:
`20260904-p5-final-remediation-94543056`.

**The approved A18 consent / A26 / AI remediation is deployed and its targeted
production verification passed. Package 5 remains incomplete: the restarted
independent inventory found two additional reachable Python endpoint paths.**
The user's explicit new-bypass STOP applies. Neither path was repaired during
this verification, and no further final-gate regression stages were run.
Waves 1–6 remain accepted; there is no Wave 7 or Chapter 7.

Evidence: `evidence/package5-deployed-remediation-final-recheck.json` includes
the actual deployed registry, selected live function bodies/hashes/route lines,
safe service metadata, publication hashes and isolated blocker reproduction.
No real customer records, credentials, or bearer tokens were collected.

## Completed approved remediation

- A18 consent uses authenticated channel → verified ClientChannelLink →
  canonical consent command → append-only ClientConsentFact. Challenge TTL is
  600 seconds. Phone matching and a bare account reference confer no first-link
  authority. The Python consent SQL helpers fail closed; published PHP forwards
  the original channel proof and command identity.
- Ordinary/internal and administrative trials use the same atomic
  TrialActivation. Internal mode creates only tenant, first branch, reserved
  owner/membership and one owner/provider. No schedules, services, prices,
  additional staff or CRM identities are generated. No new schema was needed.
  Tenant deletion and legacy bootstrap compensation remain disabled.
- AI confirmation uses the immutable revision/snapshot/authority/ordered-plan
  receipt, durable successful child outcomes and real CRM A17/A16 continuation.
  Waiting for CRM preserves the tenant and receipt. Internal trial bootstrap
  cannot impersonate the AI CRM mode. No mock CRM staff linking or direct A28
  writes are introduced.

Local PostgreSQL proof passed AI/A26 **47/47** and A18 **22/22**. It includes
actual process exits after tenant, owner and provider creation, fresh-process
retry, concurrent activation, suspension preservation and later real-CRM
continuation. Python and PHP transport checks each passed **8/8**.
The deployment candidate passed **327 suites / 2726 tests**, Prisma validate,
application/scripts typechecks, project lint, build and build preflight.
Two precise ratchet synchronizations passed **13/13** negative/positive checks;
no broad file/directory or mutation exclusion was added.

Server deployment gates were sequential and passed: source/artifact manifest,
fresh dependency installation, build/preflight, migrations, drift, isolated
candidate readiness and compiled ownership checks. All 73 repository migrations
are applied (76 production migration records including three historical ones),
pending 0, schema drift NONE. This internal-bootstrap cycle added no migration;
the three previously approved remediation foundations remain applied.

The live symlink now points to the new release. Maya and PWA services are
active and ready, with zero error-priority journal entries since activation
at verification. The previously inactive Telegram bot unit was not enabled.
Compiled A18/A26/AI checks, all six AC6 classes, Policy V1 digest and 40 Wave 1–5
registrations passed read-only verification. The temporary candidate listener
was removed. No consent/trial/onboarding/provider business command was used for
smoke.

Python changes were bounded to the four reviewed files/functions; live unrelated
changes were preserved. PHP and both Beget app copies match their candidate
hashes; the VPS app copy was also guarded and updated. Public app HEAD returns
200. The iOS mirror was synchronized and its generated copy matches; no native
build/install was performed. The native worktree already contains unrelated
changes and its branch trails its remote by six commits, so no unrelated native
history was published; the local mirror is retained, with the shared protocol
source committed in the platform repository.

## Fresh inventory of all 13 families

This table reconstructs the current family/owner map. It does **not** certify
global exclusion of alternative writers. The live registry was loaded without
creating the application or invoking any executor. Source AST inspection also
located 143 scoped model mutation call sites, then traced callers and protocol
exceptions; this lexical count is not a business-action count or an exhaustive
cross-language ownership proof. Inventory examination stopped on the findings
below, before completing every remaining alternate-path certification.

| Family | Actual registered/classified canonical component | Classes | Fresh aggregate result |
| --- | --- | --- | --- |
| A15 | Wave 3 ingress/engine; staff-day provider executor | 1 | Registered; full alternate-path certification stopped |
| A16 | Wave 2 ingress/engine; exact CRM access reducer AC5 | 2 | Registered; AI continuation remediation verified |
| A17 | Wave 3 ingress/engine; classified pre-tenant AC3 and observation/reducers AC4/AC5 | 4 | Registered; canonical AI import continuation verified |
| A18 | Wave 3 Client profile/consent/notes; verified channel foundation; CRM fact projection | 3 | Consent remediation PASS; **B5/B6 legacy Client state remains outside canonical ownership** |
| A22 | Wave 1 settings/dashboard/appointment-notification commands | 3 | **B6 client notification preferences have no demonstrated canonical owner** |
| A23 | Wave 1 OperationalWorkItem; Inbox projection and exact UX/transport AC3 | 3 | Registered; full alternate-path certification stopped |
| A25 | Wave 2 explicit security commands; auth-session/token AC3 | 3 | Registered; full alternate-path certification stopped |
| A26 | Wave 2 post-tenant commands; atomic TrialActivation AC3 | 8 | Trial/admin/internal bootstrap remediation PASS |
| reduced A27 | Wave 4 inventory; approved review acceptance AC4 | 3 | Registered; full alternate-path certification stopped |
| A28 | Wave 4 calendar configuration/avatar commands | 9 | Registered; direct AI writes removed; full inventory certification stopped |
| A29 | Wave 5 correction ingress/engine; recovery source facts/projection AC4/AC5 | 1 | Registered; full alternate-path certification stopped |
| A30 | Central Policy V1 → AC6 coordinator → MaintenanceRun/ItemClaim → executor | 6 AC6 | Compiled ownership/policy structural checks PASS; no Action Engine insertion |
| A31 | EventStore, appointment change/reconciliation and Wave 5 fact plane AC4/AC5 | No extra governed class | Classified; complete cross-path certification stopped |

Set coverage is **13/13**, accepted waves **6/6**. Global canonical/no-bypass
coverage is **not proven**. Existing Wave 3 CRM recheck, team/customer source
observations and presentation projections were checked against their explicit
AC4/AC5 classification and were not mislabeled as human-action bypasses.
Uncalled legacy bootstrap helpers were not counted as reachable merely because
their definitions remain. Script/proof isolation certification remains
unfinished after STOP; a test/migration filename is not treated as isolation.

## B5 — A18 visit preference has a live SQL owner; linked provider helper diverges

Confirmed live chain:

`Beget api-proxy.php case set_visit_mood`
→ active `barbershop-pwa` / `pwa_api.py:35`
→ registered `POST /api/set-visit-mood` (`webhook_server.py:13801`)
→ `set_visit_mood_handler` (`12457–12513`)
→ `database.set_visit_mood` (`2176–2205`).

After channel authentication, the handler loads a legacy SQLite client and
compares the last ten phone digits with a provider record. It does not consume
a ClientLinkChallenge or resolve a verified ClientChannelLink. The database
function directly upserts `visit_mood` and updates
`clients.default_visit_mood`. This explicitly stores the customer's preference
for future visits, so the A18 self-profile / committed legacy Client-writer
scope applies (Entry Gate family table; D2-A Client ownership). It is not a
read-only view, authenticated provider observation or narrow auth protocol.
No canonical profile command, durable execution identity or canonical Client
target owns those writes. A phone comparison is not canonical Client authority.

The same endpoint calls deployed `yclients.py:2442–2518`
`append_record_comment`. **The actual live helper calls `_put` directly, then
`_observe_sensitive_appointment_action`.** An after-the-fact observation does
not own the preceding provider write. The committed local helper instead calls
`dispatch_appointment_action`; inspecting only local source would miss this
production divergence. This raises an additional Package 1 appointment-boundary
baseline failure, not a new Package 5 family/action count. `yclients.py` was not
a target of this remediation deployment; this report does not infer when the
divergence was introduced or claim that a real provider write occurred during
the audit.

## B6 — customer notification preferences and hidden Client creation

Confirmed live chain:

`Beget api-proxy.php case notify_prefs`
→ active PWA server
→ registered `POST /api/cabinet/notify-prefs` (`webhook_server.py:13845`)
→ `notify_prefs_handler` (`7248–7273`)
→ `database.get_or_create_client` (`745–759`)
→ on supplied preferences, `database.set_notify_prefs` (`1225–1256`).

The explicit customer settings include reminder enablement/hours, marketing
frequency/categories and quiet hours. They are business/client preferences,
not inbox read state or delivery transport. The handler writes
`INSERT OR REPLACE INTO notify_prefs` directly using a legacy chat-derived
client. No verified canonical Client binding, approved command/execution owner
or versioned target mutation boundary is involved. This is an uncovered A22
notification-setting path with A18 Client identity/state dependencies; the
existing membership-oriented A22 commands are not assumed to accept these
fields or semantics without contract examination.

Even `{}` (the read mode of this endpoint) calls `get_or_create_client` and can
insert a new SQLite Client. The read path therefore cannot receive a no-hidden-
mutation verdict. The existing consent repair does not authorize this setting
write or turn a newly created legacy row into a verified canonical Client.

## Reproduction and STOP limits

Only the selected **deployed function ASTs** were executed locally, without
importing the production application or its configuration. SQLite was
`:memory:` with synthetic rows; channel authentication and all provider calls
were fakes. Four checks reproduced: direct Client mood update, direct provider
PUT followed by observation, direct notification-preference SQL, and Client
creation from the read-mode payload. No network call or filesystem database was
created. The real endpoints were never submitted to for proof.

The deployed file hashes are:

- `webhook_server.py`: `6408c9a21d9fbfedb28b1886ddeee59da33f5426a8cfa97fbce135c486430010`.
- `database.py`: `7748e34f82e2eddb9010407cfa9229db32a47c7e6f7645d71a1334266bb692f8`.
- `yclients.py`: `b1f4a28d0032c42a87a06e79aed91394613c2f433dba435eb007c95493ddba6a`.

The final-remediation ratchet covers consent, trial/admin and AI confirmation.
It does not establish ownership of every Python customer/settings endpoint or
equality of every live helper with committed source. Its PASS and the 2726
deployment tests are not relabeled as independent aggregate completeness.

Under the user's STOP rule, the fresh final clean replay, aggregate ratchets,
full cross-wave adversarial/regression sequence and final Packages 1–4 baseline
certification were not continued. Earlier migration/deployment verification
remains valid evidence of its own scope. D1-A…D7-A global enforcement and
Package 5 COMPLETE cannot be asserted, even though the targeted remediation
and A30 structural baseline passed.

Next boundary: separately approve remediation of B5/B6 (including precise
Client preference authority/storage and the live appointment helper routing),
then rerun the **entire** 13-family final gate from the beginning. Do not silently
add profile/settings schema or classify the SQL paths as transport exclusions.
Preserve deployed A18 consent, atomic A26 and AI receipt behavior.

```text
APPROVED A18/A26/AI REMEDIATION DEPLOYED: YES
REMEDIATION PRODUCTION STRUCTURAL/READ-ONLY VERIFICATION: PASS
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
PACKAGE 5 GLOBAL CANONICAL COVERAGE: NOT PROVEN
A18 PRODUCTION CONSENT BYPASSES: 0
A26 CANONICAL TRIAL ACTIVATION: ENFORCED
A26 INTERNAL OWNER/PROVIDER BOOTSTRAP: ENFORCED
A26 LEGACY BOOTSTRAP OWNERS: 0
A26 PHYSICAL TENANT DELETE PATHS: 0
A26 DIRECT ADMIN TENANT CREATION OWNERS: 0
AI ONBOARDING DIRECT A28 MUTATIONS: 0
AI ONBOARDING MOCK CRM STAFF LINKING: 0
PRODUCTION DIRECT BUSINESS MUTATION BYPASSES: PRESENT — B5/B6
LEGACY MUTATING OWNERS ACTIVE: PRESENT — PYTHON CLIENT/PREFERENCE WRITERS
D1-A…D7-A AGGREGATE VERDICT: NOT PROVEN — A18 CLIENT OWNERSHIP BLOCKER
REMEDIATION FULL REGRESSION GATE: PASS — 327 SUITES / 2726 TESTS
FINAL FULL REGRESSION GATE: NOT RUN — STOP AT NEW BLOCKING INVENTORY
PENDING MIGRATIONS: 0
SCHEMA DRIFT: NONE
REAL PRODUCTION MUTATIONS FOR FINAL PROOF: 0
WAVE 7 CREATED: NO
CHAPTER 6 COMPLETE: NOT DECLARED
CHAPTER 7 STARTED: NO
PRE-EXISTING LOCAL TEMP/TEST DATABASES: 17
PRE-EXISTING DATABASES DELETED: 0
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```
