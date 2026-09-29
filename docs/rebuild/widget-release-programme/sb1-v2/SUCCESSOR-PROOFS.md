# Successor verification receipts

Twelve required scenarios use real PostgreSQL and the actual coordinator/link writer. SMS.ru fetch is intercepted; the additional HTTP case uses a recording delivery double. No real OTP is sent.

| Proof | Result | Scenario |
|---|---|---|
| SV2-01 | PASS | happy successor verification creates usable explicit personal context and actual actor audit |
| SV2-02 | PASS | wrong OTP has no link or consumption effect |
| SV2-03 | PASS | replay fails closed |
| SV2-04 | PASS | expired OTP fails under database time |
| SV2-05 | PASS | Client substitution cannot transfer a challenge |
| SV2-06 | PASS | tenant substitution fails closed |
| SV2-07 | PASS | predecessor changed after resolver read is rejected inside identity lock |
| SV2-08 | PASS | active predecessor never authorizes issuance or consumption |
| SV2-09 | PASS | non-latest revoked predecessor cannot be consumed |
| SV2-10 | PASS | revoked episode remains byte-for-byte immutable |
| SV2-11 | PASS | successful consume creates exactly one successor and one outcome |
| SV2-12 | PASS | concurrent consume serializes to one success and one refusal |

Additional passing coverage: mandatory/immutable JSON V2 fields; current canonical channel change; current session revocation; persistent failed-attempt limits; failed SMS delivery; immutable and functioning V1 initial consumption; authenticated HTTP route/strict input; session-deadline cap (unit + mutation).

The concurrency test submits two consumes concurrently through separate PostgreSQL transactions and asserts exactly one fulfilled result, one refusal, one successor and one consumed outcome. The predecessor immutability test compares the entire persisted row before/after and verifies that database reactivation is refused.

These receipts prove the mechanism on synthetic identities. They do not claim production owner re-verification, carrier acceptance, widget activation or external CRM effects.
