# Verified owner with no appointment history: catalog entry

Code: `5f24fcbc9e87e9c24ac61840f5f6c3c2e481a12f`, isolated `codex/maya-development-integration-20261006`, following `3d704b0a`. The explicit owner request **«Хочу записаться»** can now open the existing personal booking form with **zero Appointment rows**. This is a local development checkpoint, not activation or C10 completion.

The typed `booking.prepare_personal` intent performs the registered `catalog.services.read` through the existing C9 read owner. A real SERVICE_SELECTOR adds the fixed `navigate.personal-catalog@1` entry. The current SB-1 PersonalClientContext is selected separately before the catalog reread; the child is bound to its same-tenant/principal/conversation/turn, sealed, current-release, unexpired retained parent. It contains only passive NONE and CONTROL intents, no recursive NAV, REFINE, DRAFT or COMMIT. The existing transient personal form then uses the unchanged SB-1 preview/results/create and Action Engine owners. TENANT_OWNER remains unchanged; no CLIENT role substitution or invented appointment is used.

The old BS-1 SCHEDULE source still requires a real eligible appointment from own.list and retains its empty guard. An owner `booking.create_own` semantic request remains denied; it is not reinterpreted as an authorized widget source. The new opening action has its own truthful READ source. The catalog is public data, not Client authority.

The response offers the form only when the fresh completed read actually returned a matched catalog envelope with that exact NAV. Empty/malformed/stale catalog, absent/refused resolution and missing navigation yield an honest unavailable response. Revocation before NAV or during mint produces a durable REFUSED receipt. Expired/unavailable parent or a catalog that becomes unusable between read and NAV likewise produces REFUSED; unexpected infrastructure errors remain errors. The full profile snapshot was regenerated with the existing registry-probe tool, preserving the previous candidate in evidence. No certificate or production grant was issued.

## Executed evidence

Final **r3** uses built React, actual Chrome clicks, actual Nest/auth/HTTP/C9 and a fresh owned PostgreSQL migrated with existing migrations. Identity, catalog and model decisions are synthetic. The configured external-calendar scenario uses an owned loopback provider that persists one request and drops the response; no real YCLIENTS adapter is instantiated.

| Scenario | Observed result |
|---|---|
| Current verified owner with no history | Zero Appointment and AE rows are asserted before UI work. Current catalog opens the real personal form without an own.list prerequisite. |
| Repeated opening | The same parent NAV can open a distinct bounded child. No appointment/AE exists before preview. Neither child can recursively open another form. |
| Explicit confirmation | One SUCCEEDED AE, attempt 1, one new canonical appointment. Membership remains `tenant_owner`. |
| Revocation before confirmation | No appointment and no AE; UI reports changed personal access. |
| Revocation after parent read, before NAV | Canonical HTTP REFUSED, exactly one persisted insufficient-authority receipt; only the parent emission, no child or personal-results request. No appointment/AE. |
| Lost local provider response | UNKNOWN AE attempt 1; one provider ledger row and zero mirror appointments. UI blocks repeat confirmation. |
| Real application + PostgreSQL restart | New application PID and PG start time; success and UNKNOWN retain attempt 1. Fresh catalog opens the form even for UNKNOWN with zero appointments. No provider dispatch or reconciliation after restart. |
| Manual result refresh | A new completed read is awaited; no second create POST. Preview/results request scopes have zero recorded Prisma writes. |
| Model boundary | **12 full serialized request bodies**, 10 before and 2 after restart, intercepted at the exact model URL before network. User-only conversation, empty tool results, no tested private labels, UUIDs, identity/start values. |

Verification: **172 distinct domain/registry tests** (170-test batch plus the final 39-test router rerun with two added source-race cases), **177 AiCore tests**, **110 runtime tests**, production-only TypeScript with 4096 MB heap, scoped ESLint (zero errors; two pre-existing warnings), registry `--check`, shell and React builds pass. Full test/scripts semantic typechecking and new real-model acceptance are not claimed. Independent read-only review found no remaining blocking finding; the reviewer ran no tests or services.

All attempts and earlier RED checks are preserved. R1 exposed a harness selector that clicked an identically named public catalog control instead of the personal form. R2 passed; R3 adds durable pre-NAV revocation and repeated-opening evidence after the reviewed source-race fix. All three owned clusters have `pg_ctl status` exit 3, recorded PG/carrier ports are closed and no owned Chrome process remains. See the [hashed manifest](evidence/maya-development-integration-20261006/personal-owner-empty/manifest.json), [final observations](evidence/maya-development-integration-20261006/personal-owner-empty/r3/prepare-observations.json) and [restart observations](evidence/maya-development-integration-20261006/personal-owner-empty/r3/resume-observations.json).

## Exact limits

- **Initial identity:** [first Client binding remainder](MAYA-FIRST-CLIENT-LINK-REMAINDER-20261007.md) distinguishes existing A18 V1 initial binding through another verified channel, V2 revoked-link successor, and the still undecided trusted bootstrap source for a never-linked visitor. No new identity admission or first-time reverification flow was invented.
- **Reachability:** the normal PHP/dev relay still does not forward the personal-context header. This proof uses the existing explicit test-only loopback relay. Production/dev relay parity, real identity/provider/model acceptance and release remain unqualified.
- **Presentation:** screenshots confirm the usable form and restarted UNKNOWN. Detail repeats the passive catalog above the personal form; this is not a UI polish or mobile acceptance checkpoint. Success after restart is preserved in canonical state/results, not newly qualified as a restored success terminal.
- **Effects:** only synthetic local test booking effects occurred. Notification delivery is not qualified; synthetic internal notification lineage fails closed. No real model/provider/SMS, production query/mutation, phone/HTTPS, website change, push/merge/deployment, schema/retention/autonomy decision or second orchestrator. Qualification remains **NOT_ISSUED**.
