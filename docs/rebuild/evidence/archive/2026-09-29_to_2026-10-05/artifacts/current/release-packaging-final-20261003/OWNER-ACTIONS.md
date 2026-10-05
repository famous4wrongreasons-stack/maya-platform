<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: 8e22aa5e5d19730e2905335f53873e6031d2339426e9266ecd4a5b03ead8d4d2 -->

# External operator actions still required

Candidate: `77ecb3f5696583389e75592141f46fd0664d33d8`.
Profile: `closed-input.no-handoff@1`; HANDOFF remains unavailable.
Exact intended tenant from the accepted production preflight: `cmsuavtar0003bjyrfngxsne6` (`muzhskaya-estetika-3`). Reconfirm it against current production status before any execution.

1. Owner/approver: provide the real Ed25519 public key, stable principal/key IDs and custody/fingerprint confirmation through the operator's authenticated channel. Keep the private key outside the repository and chat.
2. Independent security reviewer: provide a distinct public key/principal, review this candidate's final fresh evidence and sign the production profile certificate. The reviewer must differ from both approver and platform operator. No test or assistant-generated identity substitutes.
3. Platform operator: authenticate through the existing global platform-owner password login, omitting tenantSlug. The preflight located global User `cmrqx5xva002eohyru7djyogq`, with no active global session then; verify current state. Use its actual credentials/session, never the product tenant_owner token or a manually minted JWT. Do not send passwords/tokens to chat.
4. Obtain a fresh owner execution authorization for this exact new candidate, signed certificate digest, profile, tenant, actual operator, current entitlement CAS and a bounded window of at most 24 hours. Authorization for 76df1766 does not authorize the changed candidate.
5. Only after separate execution authorization: install reviewed public trust configuration, run canonical status/validate, and follow the approved rollback/migration/deploy/grant procedure. The present pass executes none of those production mutations.

`OPERATOR-RUNBOOK.md` gives the exact configuration names, signing encoding, offline checker commands, HTTP routes, CAS/window bindings and revoke procedure. Offline validation neither authenticates a platform session nor grants entitlement.

Fresh complete admission has passed for this exact candidate; see `CERTIFICATION-RECEIPTS.json` and `RELEASE-CHECKPOINT.json`. The two sleep-overlapped WR partitions were excluded and fully reexecuted before strict admission. `PROFILE-CERTIFICATE-PROPOSAL.json` is an unsigned synthetic review proposal, not a production certificate, signature or execution authorization. All four external prerequisites above remain required.
