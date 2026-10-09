# Independent offline 48 semantic checkpoint review

The independent read-only reviewer found no remaining source-review or evidence
integrity blocker for this diagnostic checkpoint. The result remains
`completed-with-semantic-failures`, exit 2; it is not functional acceptance.

## Review scope and evidence

Reviewed final runtime source `e02dfde6619e7f838dd1323d9c7c6961f9f4347b`,
the evaluator and audit projection, and actual run `r2` under
`evidence/maya-offline-48-semantics-20261009/http/r2/`.
The reviewer did not edit files or run services, model calls or additional tests.

- All 2,490 source hashes matched the files and the exact runtime Git commit.
- Manifest SHA256 was
  `c22434ab717a088d9ae6807e994708daa02bc60d4fcc87e1d591fe92cf4f555b`.
  Source digest, raw HTTP report hash and all 81 reply/audit/history/response
  bindings matched, including the null reply for the expected auth refusal.
- The 81 actual attempts were 80 HTTP 201 plus one expected 401, without skipped
  or unresolved attempts. Counts were 41 pass, 25 semantic failures, 9 unsupported
  bounded scenarios and 6 insufficient-evidence turns.
- The selected 17:00 time had one current tenant-bound canonical review envelope;
  the explicit correction selected Maxim at 19:30. Both retained actual evidence.
- Occupancy changed from AVAILABLE to a new CLOSED/current-false run after the
  controlled fixture transition. The original graph remained unchanged. This is
  source invalidation, not restart/replay proof or a second provider availability
  read; the second turn made zero such reads.
- Membership revocation returned 401 with zero model/source reads and unchanged
  history. All 81 observed business-state hashes were unchanged, with empty
  business-write and forbidden-call lists and zero outbound calls. This does not
  assert absence of every conceivable external effect outside the observed scope.
- All 93 application/broker reservations matched excluding timestamps. The
  maximum serialized request was 97,455 bytes and ledgers closed. The broker's
  46 dialogues / 78 turns differ from application's 48 / 81 because three turns
  made no model call. Upstream calls were zero and credentials were not loaded.
- Six owned groups were reported closed and absent, PostgreSQL stopped, the
  postmaster PID file was independently absent, and the broker stopped with zero
  connections or requests remaining.

The root additionally verified all 96 evidence-manifest entries byte-for-byte
against the Git index, plus the manifest itself. The 10,997,020 archived bytes
include original r1 results, failed checks, final r2 results and the human-readable
81-turn audit. Evidence-manifest SHA256:
`b651d195e316243ba93eacf960a062f3e917dc11f8ccba8e1befccc2c6fdcaeb`.
Whitespace checks pass for authored code and documents. Copied raw logs retain
their original whitespace and are excluded from that formatting-only check.

## Limits

Critical checks have zero observed failures but two missing schedule-evidence
turns. The lifecycle answer correctly fails for not explaining the 30-day rule.
Safe scripted financial clarification without an owner READ remains insufficient;
a lost comparison request remains a failure. Earlier evaluator false positives
and false negatives are preserved and described in the checkpoint, rather than
erased from the record.

Real model/language quality, React presentation, live YCLIENTS branch binding,
restart, UNKNOWN recovery and business acceptance were not established. The
frozen nine-dialogue candidate and prepared handoff were unchanged. No claim of
overall MAYA or C10 completion follows from this diagnostic.
