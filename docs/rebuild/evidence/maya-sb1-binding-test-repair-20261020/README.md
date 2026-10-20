# SB1 binding assertion repair

The owner authorized continuation after the exact `SB1-M09` certification stop.
Diagnostic parent: `1e10a38365284791a5e7a8e5ec96c486e8079b05`.
Preserved diagnostic packet:
[`9942b11b`](https://github.com/famous4wrongreasons-stack/maya-platform/tree/9942b11b6d9f76c51456d49c35ebfbf98ddfb19e/docs/rebuild/evidence/maya-sb1-binding-mutation-20261020).

`SB1-BOUND` previously accepted any thrown error and omitted the required booking
preview hash. Removing the link-ID guard still passed the test because the
independent preview check returned `booking_preview_stale`.

The test now obtains a valid quote before substituting exactly one personal
context field, carries that quote's hash into creation, and requires the exact
403 context/binding refusal. It also asserts zero provider calls, local rows and
Action Engine plans. The existing valid-context quote/create positive control
is preserved.

Only this test and this evidence documentation changed. No product code,
authority contract, profile, mutation declaration, or release threshold changed.

Precommit development checks:

- Both affected unit files: 101 PASS, 0 FAIL, 0 SKIP.
- Prettier check: PASS.
- All ten existing SB1 mutants: expected kills, green unmutated baseline.
- `SB1-M09`: killed by `SB1-BOUND refuses a changed selected linkId`.
- Restored affected files: 101 PASS, 0 FAIL, 0 SKIP.

These targeted checks used mocks with outbound networking denied and started no
database. They are development evidence only. Their parent-HEAD receipts must
not be admitted as final certification. The resulting committed SHA requires
fresh complete CI, all mutation parts, and the other release evidence surfaces.

No real provider calls, production effects, owner database migrations, grants,
signing secrets, or phone installation are authorized by this repair.
