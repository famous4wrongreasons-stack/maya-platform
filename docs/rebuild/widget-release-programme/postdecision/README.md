# Reproducing the owner-decision checkpoint

Current source/evidence target: b2a8c8a2bd0ab34ed18456536086ae04ace73f9c. Full runtime regression target: a46b228bcc2c8912f2b25d194944be7ea0dee365. The final commit only packages documentation/evidence. Seven explicitly permitted test/evidence paths connect the two targets; application runtime bytes are unchanged.

## Read-only matrix recomputation

From the repository root:

```sh
node docs/rebuild/widget-release-programme/postdecision/recompute.mjs \
  docs/rebuild/widget-release-programme/postdecision/runtime-audit.json \
  --boundary-evidence docs/rebuild/widget-release-programme/postdecision/evidence \
  --boundary-report docs/rebuild/widget-release-programme/postdecision/mutation-receipts/AB.json \
  --source-head b2a8c8a2bd0ab34ed18456536086ae04ace73f9c
node --test docs/rebuild/widget-release-programme/preintegration/current-audit.test.mjs \
  docs/rebuild/widget-release-programme/postdecision/recompute.test.mjs
node docs/rebuild/widget-release-programme/check.mjs
```

The last checker supplies ownership/planned-runtime/CLIENT_ROLES proofs against the current canonical checkout. It also prints its historical baseline counts of 31; those are not the new clause matrix. Only the postdecision recompute output is the current 18-false figure.

runtime-audit.json preserves the previous current-audit builder's fresh a46b execution. runtime-evidence and mutation-receipts/WR.json + H-harness.json are its provenance. The postdecision builder applies approved acceptance scope without promoting any false state, verifies the additional actual manifest, source/declaration hashes and green AB controls, then admits the separate G13-I7 HTTP/BIN pair. It refuses other backend drift.

The historical preintegration audit and OPEN decision packet are retained. DECISIONS.md supersedes their decision status. CLAUSE-MATRIX.md includes all 165 clauses; CLAUSE-DISPOSITION.md/json tracks the original 31 false rows.

## Fresh isolated proofs

Use an already provisioned dedicated local test database and Node 22.23.2. No production database, secrets or YCLIENTS credentials. The retained current DB schema was reused; this pass did not authorize or apply a migration.

From maya-saas-backend, set DATABASE_URL to that isolated test database. Set WIDGETS_EVIDENCE=1 and WIDGETS_EVIDENCE_DIR to a new empty proof directory before running:

```sh
npm run test:widgets:live -- --testPathPatterns='(wr-release|e1-production-trigger)'
npm run build
npm run test:widgets:http
node scripts/widgets-evidence-verify.mjs --dir "$WIDGETS_EVIDENCE_DIR"
```

WR's suite includes SB1-CREATE. HTTP and production-binary processes independently perform ordinary production-path mint/submission calls with synthetic internal-calendar source facts. The new SB-1 binding itself is a fixture, not proof that a real verification issuer exists. Only WR's declared paired boundary claim is used for G13-I7. No generic HTTP smoke case is upgraded into live admission.

Run npm run test:backend -- --runInBand for the backend suite. The separately tagged integration test remains in the default npm test command; execute npm run test:integration -- --runInBand src/action-engine/beget-relay-release.architecture.spec.ts to observe the missing authorized shell artifact. Do not copy a Claude artifact to make it green.

Fresh mutation receipts disclose exact filters and per-step exits. They are useful targeted killer proofs, not a full unfiltered remote CI certificate. The planner/assembler self-tests pin 410 declarations and reject filtered/incomplete/stale/red receipts:

```sh
node --test scripts/widgets-evidence-lineage.test.mjs scripts/widgets-mutation-ci.test.mjs
```

verification.json maps raw receipt filenames to SHA-256 and records their source heads and boundaries. Raw logs are delivered in the output receipt archive. SB-1-CONTRACT.md and SB-1-REVERIFICATION-DECISION.md distinguish the implemented context consumer from the blocked fresh binding path. INTEGRATION-AND-ACTIVATION.md records 9.6 and AR-1 boundaries.
