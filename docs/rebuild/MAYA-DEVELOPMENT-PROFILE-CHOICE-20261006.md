# Closed profile and schedule editor: exact remaining choice

Updated 2026-10-08 against candidate `e9fc42572b110486ce10d40f8bc14b098359fb40`.
**Decision status: PROPOSED — NOT APPROVED.** This is the schedule-card question
in the [current decision list](MAYA-REMAINING-READINESS-DECISIONS.md#текущие-отдельные-вопросы--2026-10-08),
independent of first Client binding, C10 and the rejected SSH action.

Current implementation keeps `closed-input.no-handoff@1`. SETTINGS.4 requires
`SettingsDraftBody.editor_handoff_intent`; that obligation is unchanged. The
complete SETTINGS_DRAFT card, including a passive/partial card, is unavailable in
this profile. Web/native chat cannot expose a legacy approval control when its
canonical schedule card is refused. Read-only SCHEDULE/status and the explicitly
approved catalogue-price APPROVAL paths do not count as editor HANDOFF proof.

The generated candidate manifest pins the reviewed finite recipe combinations,
including the separately approved pricing and goods-receipt recipes, and excludes
SETTINGS_DRAFT. Neither MONEY exception changes the schedule editor obligation.
The earlier source manifest and pin are retained under
`evidence/maya-development-integration-20261006/profile-previous/`. This is an
explicit source re-pin, not a release certificate. Existing certificate/grant and
emission bindings must refuse the new generation. No production trust is changed.

## Minimal owner choice

**Concrete question:** May the card for one master's schedule on one local day
use correction by an ordinary authenticated chat message instead of the required
separate editor, always showing a fresh before/after card and requiring a new
confirmation after any correction?

1. **Keep the existing closed profile (implemented default).** Schedule editor
   capability stays NOT_USER_REACHABLE wherever HANDOFF is required. Continue
   qualifying permitted pricing, Occupancy and read/status paths. Existing full
   scope schedule approval can be tested as a separate synthetic path; it does
   not discharge the closed-profile editor obligation.
2. **Approve an exact typed chat review alternative (recommended, proposal only).** Amend
   SETTINGS.4 and the generated SettingsDraftBody solely for the conjunction of
   `draft_class: schedule_rule`, source `staff.schedule.update`, recipe
   `commit.schedule.day@1` and AE
   `package5.wave3.update-staff-schedule-day.execute.v1`:
   make the schedule editor member a discriminated union
   of the existing `{ kind: 'handoff', intent_ref }` and
   `{ kind: 'typed_chat_review', draft_ref, revision_ref }`. The latter means the
   existing authenticated chat can collect exactly one staff member, one local
   day and its working intervals (`close_day`, `set_break`, `set_hours`),
   display the current CRM revision, proposed diff, appointment conflicts and
   expiry, and create a fresh immutable approval through the existing schedule
   owner. It is not a navigation/REFINE alias for HANDOFF. Each edited proposal
   invalidates the earlier confirmation; COMMIT stays bound to tenant, actor,
   current revision, payload hash, expiry, current authorization and AE idempotency.
   Unknown, stale, conflicted, revoked or incomplete data cannot produce a usable
   confirmation. No model-authored operation, generic setup framework, new actor,
   second human approval, or new governance body is implied.

Option 2 deliberately replaces the **non-chat fallback obligation** for this
exact schedule branch. A chat correction prompt is not the current editor
HANDOFF, and a fullscreen read-only card does not discharge SETTINGS.4 by itself.
Keyboard/screen-reader review, exact before/after facts, discard and explicit
confirmation remain required; all other draft classes keep their existing
required `editor_handoff_intent` and remain excluded by the closed profile.

Option 2 requires that exact owner decision before changes to the normative
union, completeness/pairing rules, recipe/card derivation, carrier rendering and
release evidence. It is not implemented or treated as already approved. Option 1
remains usable without waiting for this decision. Neither choice authorizes
background initiation, schema/retention changes, outbound messages or real CRM
mutations.

## Exact current grounds

Line references below are for candidate `e9fc4257`; the named clauses are the
normative references if line numbers later move.

| Owner/source | Current requirement and consequence |
|---|---|
| [Widget contract §2.6.16](MAYA-WIDGET-CONTRACT-V1.md), lines 3499–3525 | `SettingsDraftBody.editor_handoff_intent` is required at line 3514. SETTINGS.4 at line 3525 gives it priority 0, makes it undroppable and names the non-chat fallback for audit/exactness/accessibility/correction. Removing it or retaining a partial card is a contract change. |
| [Generated body](../../maya-saas-backend/src/widget-contract/kinds.ts), lines 492–510; [current renderer](../../maya-chat-shell/src/renderer/render.ts), lines 440–442 | The generated type requires the editor reference and the renderer includes it in the card actions. A nullable field or renderer-only omission would disagree with the current contract. |
| [Approved profile design](widget-release-programme/profile-isolation/DESIGN.md), lines 3, 15–25, 33–47; [fixed profile registry](../../maya-saas-backend/src/entitlements/widget-release-profile.registry.ts), line 6; [profile contract](../../maya-saas-backend/src/entitlements/widget-release-profile.contract.ts), lines 18–28 | The approved default forbids HANDOFF, explicitly excludes the entire SETTINGS_DRAFT kind and checks fixed reviewed combinations at mint, ingress and cached egress. G6-6/G13-R8 remain excluded only for HANDOFF. A new caller-selected profile or an alias to an existing allowed effect is not an alternative. |
| [F79/F80](MAYA-WIDGET-CONTRACT-V1.md), lines 1603–1636; [existing schedule recipe](../../maya-saas-backend/src/widgets/emission/schedule-intent-template.ts), lines 7–31 | `staff.schedule.update` is already the SCHEDULE_RULE_OWNER. The exact A15 COMMIT recipe is single-use, 600-second maximum and bound to approval/payload handles. Product development and the action owner are already authorized; this decision concerns the fallback presentation obligation. |
| [Current schedule minter](../../maya-saas-backend/src/widgets/emission/schedule-confirmation-minter.service.ts), lines 94–113, 154–170, 173–211 | It emits the required editor reference and the actual `handoff.settings@1` proposal, then returns unavailable on profile refusal. The [native source checkpoint](MAYA-NATIVE-SCHEDULE-SOURCE-CHECKPOINT-20261008.md) qualifies full-scope synthetic HTTP/PG and headless/SSR evidence only; that cannot be promoted to closed-profile or browser acceptance. |

## Finite implementation delta if option 2 is approved

This section is a reviewable proposal, not instructions to activate the path now.

1. Version the normative SETTINGS.4/body exception and regenerate its derived
   types. Preserve the existing body/editor field for every other draft class.
   Only the exact schedule/A15 conjunction above admits the typed-chat variant;
   an unbound draft or another capability cannot choose it. Its `draft_ref` and
   `revision_ref` bind the existing immutable approval ID and payload hash; they
   are presentation references, not a new revision store, authority or token.
2. Derive the review marker, interactive paths, completeness, degradation and
   accessibility/text parity for that variant. The marker is **not an intent**:
   no fake HANDOFF, REFINE or NAVIGATE is minted for it. Correction is a new user
   turn through the existing chat writer and schedule owner, followed by fresh
   source reads and a new immutable approval/card. Arbitrary prose and the model
   cannot change the retained approved payload. Old confirmation cannot apply a
   corrected proposal; UNKNOWN cannot be bypassed by proposing the same effect
   again.
3. Add only the exact no-HANDOFF schedule recipe/body combination to the fixed
   profile snapshot and all existing admission/resolve/replay checks. Do not
   merely remove SETTINGS_DRAFT from a global exclusion: other draft classes,
   editor-HANDOFF variants, future recipes and mixed envelopes still refuse.
   Keep the global HANDOFF refusal and G6-6/G13-R8 status. Regenerate the candidate
   digest/pins; old grant/certificate/emission bindings cannot authorize the new
   generation. This work does not itself issue a certificate.
4. Preserve existing actor/tenant/role/feature admission, original
   company/branch/staff/timezone source witness, current revision and conflicts,
   approval hash/expiry, one COMMIT and the existing A15 execution/reconciliation
   owner. No new schema, retention, role, capability or provider permission is
   part of this proposal. Keep UNKNOWN, stale, revoked, conflicted and incomplete
   outcomes distinct; confirmed replay is historical confirmation, not a new
   CRM read or repeat PUT.
5. Before claiming the card reachable, prove the approved contract/derived
   profile boundary and current React + authenticated HTTP + app/PG restart:
   day-off/break/hours review, correction/new approval, old-token refusal,
   foreign/revoked/expired/stale source, transport loss/UNKNOWN with no resend,
   readable/a11y review and retained terminal result. Negative controls must
   still reject other SETTINGS_DRAFT and every HANDOFF. Use synthetic provider
   transport; real-provider/model/production acceptance remains separate.

Choosing a genuine non-chat HANDOFF editor instead would retain SETTINGS.4 but
require a separately specified receiver and profile admission/qualification.
That broader alternative is not granted by option 2 or by ordinary schedule
development approval. Until an exact choice is approved and implemented, the
current closed-profile refusal remains correct.

## Prepared combined fixtures

Historical fixture plan from 2026-10-06, preserved for scope context; the current
native schedule evidence is the separately linked 2026-10-08 checkpoint above.

`development-integration.live-spec.ts` uses one persisted owner conversation for
general chat, real C9 cancellation evidence/version/replay, exact pricing approval
through HTTP/AE and explicit schedule card denial. It includes transport auth,
foreign tenant and revoked membership checks. The shared fixture replaces only
CRM adapter/model boundaries with marked synthetic behavior; business owners are
not mocked and global fetch fails closed. C5 is invoked explicitly for source
fixture setup, then its activation flag is disabled.

`development-integration.browser-spec.ts` drives the actual built React carrier
through its email login, composer, pricing decision, schedule denial, history,
offline retry and membership revocation. It has ordered IPC assertions and a
bounded lifetime; listener readiness alone cannot pass. Its child uses an owned
Chrome profile and blocks non-loopback requests. These source fixtures require
heavy execution evidence before any runtime claim. They do not issue a candidate
certificate or prove real model/provider behavior.
