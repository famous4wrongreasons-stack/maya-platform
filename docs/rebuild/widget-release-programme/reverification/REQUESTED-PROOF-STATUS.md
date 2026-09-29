# Requested successor proofs — exact scope

The successor coordinator, V2 persistence and public flow are blocked on the four persistent JSON correlation members in SCHEMA-DECISION.md. No fixture or pure model result is labelled a working successor verification.

| Requested proof | Current result |
|---|---|
| Happy successor verification | BLOCKED: no V2 issuance/consume implemented |
| Wrong OTP | BLOCKED: no OTP comparison/claim implemented |
| Replay | BLOCKED for V2; existing V1 contract unchanged |
| Expiry | BLOCKED for V2; existing V1 TTL unchanged |
| Client substitution | Candidate resolver negative passes; V2 persisted-proof substitution remains BLOCKED |
| Tenant substitution | Session/candidate negatives pass; V2 persisted-proof substitution remains BLOCKED |
| Predecessor changed | Candidate re-read negative passes; V2 issue-to-consume correlation remains BLOCKED |
| Predecessor active | Candidate refusal passes; V2 consumption remains BLOCKED |
| Non-latest predecessor | Resolver queries current history tips and refuses ambiguity; V2 DB outcome remains BLOCKED |
| Revoked episode remains immutable | Candidate resolution performs zero writes and preserves fixture; existing DB guard unchanged; V2 transaction proof remains BLOCKED |
| Exactly one successor episode | BLOCKED: no new writer added |
| Concurrent consume | BLOCKED: no new writer added |

Completed independent evidence: exact provider/externalId channel resolution with no phone match/User.phone fallback; candidate ambiguity/session/membership/hold checks; re-read after provider access; channel HMAC binds source and address; debug/test/missing transport refusal before any send; provider errors do not expose OTP/phone; existing login-delivery tests remain green.

The new SBV mutation battery targets eight specific candidate/transport guards only. It is not a mutation certificate for the pending successor coordinator.
