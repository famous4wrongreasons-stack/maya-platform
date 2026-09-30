# BS-1 / NS-1 — fixed approved source contracts

Owner approved BS-1 A and NS-1 A. This implements those exact backend sources on the isolated combined candidate. No release certificate or production permission follows from implementation.

## BS-1

Only the completed `appointments.own.list` read can enter the personal source port. The existing `PersonalClientContextService` resolves the current verified exact Client from the authenticated account. The source is intersected with fresh `ClientAppointmentReadService.forAccount` results by canonical appointment id. The source and binding are revalidated before mint; subsequent proposal and commit use the existing canonical owners and Action Engine checks.

The bounded source presents one upcoming personal appointment. Cancellation and (for a single-service appointment with a canonical available alternative) reschedule reuse the existing fixed templates. Frozen opaque handles carry exact appointment/service/staff/slot identity. The availability owner supplies a closed candidate; there is no free text, new InputSchema kind, phone/time/index identity or caller-selected Client. Membership roles and CLIENT_ROLES are unchanged.

The body-level action exposes the reschedule proposal through the existing renderer; its entry retains the exact cancellation proposal. Runtime support for activating that entry must be proved independently; backend HTTP success does not certify the carrier.

## NS-1

`navigate.journal.detail@1` is exactly SCHEDULE/NAVIGATE/detail:fs.calendar, source C9:operations.journal.read, no InputSchema. The initial journal read retains its server-validated local business date. The existing REFINE template remains as a separate secondary action.

Detail dispatch resolves the retained, unerased source under the current principal/release, checks its body hash/seal and retained scalar correlation, then rereads the journal owner with that scalar. It never takes a query from historical display text, today's clock or caller input. The sealed historical body is compared only to reject inconsistent retained evidence.

`navigate.journal.parent@1` can be minted only by the dedicated journal-detail path. It references the exact retained parent in the same tenant/principal/conversation/current release. Mint verifies the parent's retention, seal, source and grant; return resolves it again and checks the child's parent correlation. Arbitrary w targets cannot be minted through this template. The parent return action is the detail body's visible action.

The additive migration changes only `WidgetIntentRecord_journal_date_scope_check`: the original REFINE branch is preserved verbatim, and one exact no-input NAVIGATE branch is added. No new table/column. Production application is forbidden.

## Profile and evidence

The fixed profile registry is repinned to its exact new finite registry. `full165.closed-input` and the global HANDOFF contracts are unchanged. G6-6/G13-R8 remain globally false/STOP; only a separately certified restricted profile could pass.

Clean source cases are `gateBS.cases.ts` and `gateNS.cases.ts`, reused by independent HTTP/Jest and BIN processes. Fixtures establish isolated identity/catalog facts; the cases never write widget records or replace authority owners. Booking effects use only the local internal calendar. New live tests cover retained-date shape, tampered/erased/expired/foreign source, parent erasure, and the two sources under an actual signed synthetic restricted grant.

`gateBS.json` and `gateNS.json` declare ten counterfactuals, increasing the complete programme to 502 declarations. Anchor checks and focused diagnostics are not complete mutation certification. Final certification must run unrestricted controls/test steps on the exact final SHA.

`source-carrier.probe-spec.ts` is an explicit integration probe, run with the widgets-live config and its exact testRegex plus GITHUB_SOURCE_PROBE_OUT. It invokes the unchanged renderer, React drawer and shell against actual server emissions. A failure is a certification blocker, not an accepted limitation or synthetic green source proof.
