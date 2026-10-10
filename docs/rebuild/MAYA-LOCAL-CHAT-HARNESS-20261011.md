# Local model harness regression diagnosis

Fresh aggregate on `a784c5308be789aa4853edc8c216edefa950bb41`:
603 tests, 595 passed, 8 failed. The failures are retained at
`/private/tmp/maya-owner-chat-core-final-20261011.txt`.

Five old A+B launcher tests used the Mac's default long temporary directory,
whereas their established private-layout contract requires `/private/tmp`.
Rerunning with `TMPDIR=/private/tmp` passed those five without source changes.

Three legacy dry broker tests independently returned 503. Exact cause:
`serveCandidateBroker` passes `{caseId, turn}` as the third reservation callback
argument. The old direct callback forwarded it as the optional budget profile
to `candidateReservation`, which correctly refused the unknown object. The
core-profile broker already wraps this callback correctly.

The correction wraps the legacy callback to select its existing default limits.
It changes no product behavior, price, timeout, authority or live transport.
All 16 tests in `current-candidate-dry-broker.test.mjs` pass after the correction;
the same tests failed before. Receipt:
`/private/tmp/maya-dry-broker-callback-fixed-20261011.txt`.

Separately, the same retained owner database and keys ran with exact source
`a784c5308be789aa4853edc8c216edefa950bb41`: backend/React build, health/readiness
200, natural one-minute expiry, runtime group absent, PostgreSQL stopped,
unchanged source/keys/stage-0 manifest, no provider or model dispatch.
Receipt: `/private/tmp/maya-owner-chat-keyless-readiness-20261011-01/`.
This is startup/persistence evidence; no claim of owner login or actual AChat
answer after restart. The callback correction does not change those application
bytes. Fresh aggregate on the resulting source commit is still required.
