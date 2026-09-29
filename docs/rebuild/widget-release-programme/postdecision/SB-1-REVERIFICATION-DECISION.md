# SB-1 remaining decision — fresh exact-Client verification

SB-1 A is approved and is not reopened. This packet concerns its unprovided proof issuer and the concrete first-link-only database restriction.

**QUESTION:** Which trusted source will freshly prove this authenticated human's authority for the exact tenant Client after revocation, and may the canonical challenge contract support a new successor episode?

**Observed facts:** `ClientChannelRuntimeService.resolve` accepts only a currently active verified link. The current owner has none. Login/Telegram authentication proves channel control; a User↔Client row, phone match or revoked historical link is not a new current authority proof. `ClientLinkChallengeService.consume` calls `bindChallengeInTransaction`, which enforces initial-only history. The DB function `check_client_link_challenge_outcome_v1` also requires the consumed link's `supersedesLinkId IS NULL`. Separately, `guard_client_channel_link_v1` requires any subsequent episode to name the latest revoked predecessor. Therefore the existing public initial-challenge route cannot reverify this owner.

**OPTION A — independently verified active channel:** use the existing active-link issuer to resolve exact Client authority, followed by a separately approved, subject-bound re-verification challenge. This preserves the present trust source, but is unavailable for the observed owner: all personal Client channel links were inactive. Merely reactivating one is forbidden.

**OPTION B — approved independent exact-Client verifier:** name the real issuer, fresh evidence and verification protocol that proves exact Client authority independently of the revoked episode, and bind it to the authenticated tenant/User subject. The mechanism may issue a new bounded single-use proof; it cannot accept a caller-selected Client. No such deployed issuer is identified in the current code/evidence. This option cannot be implemented by substituting a permissive verifier or signing an arbitrary Client id.

**RECOMMENDED OPTION:** B if self-service re-verification of this account is required. Owner must name/approve the concrete evidence source and protocol; current evidence does not justify choosing one on their behalf. A becomes feasible only if an independently verified active channel actually exists later.

**EXACT SECURITY/PRODUCT CONSEQUENCE:** historical revocation remains immutable. Fresh channel control and fresh exact-Client authority must both be proved; neither restored owner privileges nor phone matching can stand in for either proof. Until then the new personal-context route refuses this owner.

**WHAT IT UNBLOCKS:** creation of a new canonical verified maya_user episode and end-to-end use of the already implemented personal context. It does not enable widgets.runtime or change CLIENT_ROLES.

**SMALLEST SCHEMA/MIGRATION DECISION:** if ClientLinkChallenge is the chosen mechanism, approve a versioned successor-consumption contract for its existing outcome guard, not deletion of the guard or an unrestricted removal of `supersedesLinkId IS NULL`. It must bind fresh issuer evidence to the exact authenticated tenant/subject, same Client and expected latest revoked predecessor; consume atomically once under existing identity locking, and reject replay, active/changed predecessor, Client substitution, expiry and cross-tenant proofs. Existing ClientChannelLink already stores successor lineage and verification evidence. No new model is established as necessary. The minimum additional persistent correlation fields, if any, depend on the chosen issuer/proof format and remain unapproved. No migration is written or applied.

A direct verifier with a separately approved `proven_user_client_link` proof might reuse existing link storage without a challenge migration. The current code does not supply that fresh trusted provenance. This possibility is not a license to reuse a bare User/Client row or historical revoked proof.

**STOP boundary:** only the new-binding/re-verification sub-unit. Unrelated widget evidence and ordinary Client booking paths continue. No request to approve production writes is made here.
