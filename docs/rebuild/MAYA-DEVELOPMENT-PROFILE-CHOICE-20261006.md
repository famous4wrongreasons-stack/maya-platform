# Closed profile and schedule editor: exact remaining choice

Current implementation keeps `closed-input.no-handoff@1`. SETTINGS.4 requires
`SettingsDraftBody.editor_handoff_intent`; that obligation is unchanged. The
complete SETTINGS_DRAFT card, including a passive/partial card, is unavailable in
this profile. Web/native chat cannot expose a legacy approval control when its
canonical schedule card is refused. Read-only SCHEDULE/status and the explicitly
approved catalogue-price APPROVAL paths do not count as editor HANDOFF proof.

The generated candidate manifest includes all four recipe families in its registry
identity, admits the three exact pricing recipes, and excludes SETTINGS_DRAFT.
The earlier source manifest and pin are retained under
`evidence/maya-development-integration-20261006/profile-previous/`. This is an
explicit source re-pin, not a release certificate. Existing certificate/grant and
emission bindings must refuse the new generation. No production trust is changed.

## Minimal owner choice

1. **Keep the existing closed profile (implemented default).** Schedule editor
   capability stays NOT_USER_REACHABLE wherever HANDOFF is required. Continue
   qualifying permitted pricing, Occupancy and read/status paths. Existing full
   scope schedule approval can be tested as a separate synthetic path; it does
   not discharge the closed-profile editor obligation.
2. **Approve an exact typed chat review alternative (proposal only).** Amend
   SETTINGS.4 and the generated SettingsDraftBody solely for
   `draft_class: schedule_rule`: make the editor member a discriminated union
   of the existing `{ kind: 'handoff', intent_ref }` and
   `{ kind: 'typed_chat_review', draft_ref, revision_ref }`. The latter means the
   existing authenticated chat can collect exactly staff/day/working intervals,
   display the current CRM revision, proposed diff, appointment conflicts and
   expiry, and create a fresh immutable approval through the existing schedule
   owner. It is not a navigation/REFINE alias for HANDOFF. Each edited proposal
   invalidates the earlier confirmation; COMMIT stays bound to tenant, actor,
   current revision, payload hash, expiry, current authorization and AE idempotency.
   Unknown, stale, conflicted, revoked or incomplete data cannot produce a usable
   confirmation. No model-authored operation, generic setup framework, new actor,
   second human approval, or new governance body is implied.

Option 2 requires that exact owner decision before changes to the normative
union, completeness/pairing rules, recipe/card derivation, carrier rendering and
release evidence. It is not implemented or treated as already approved. Option 1
remains usable without waiting for this decision. Neither choice authorizes
background initiation, schema/retention changes, outbound messages or real CRM
mutations.

## Prepared combined fixtures

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
