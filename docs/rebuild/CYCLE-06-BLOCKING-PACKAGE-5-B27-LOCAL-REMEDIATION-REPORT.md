# Package 5 B27 — verified Client loyalty reads

Accepted production baseline: `47a91dbd` / B26. B26 and Waves 1–6 remain closed.

## Contract reconstruction

The approved P4-03 guest Client ownership gate and LoyaltyAccount runtime
nullability alignment already define `tenantId + Client.id` account/history
reads. A missing account returns `loyalty_account_not_established`; account
establishment/import remains an explicit canonical value lifecycle operation.
B27 supersedes the older final-P4 exception allowing a zero-account upsert in
`getForUser`. It also removes the transient CRM/legacy balance fallback from
private current-value projections, as explicitly required by the owner.

No new no-account business decision, model, migration, or action class is
needed. No account or historical value is backfilled.

The current balance is the established Client-owned canonical LoyaltyAccount.
A query never chooses a CRM card to replace it. Multiple CrmClientLinks do not
change this account identity and do not require a new reverse-link selection
policy. Existing P4-03 explicit imports still use their approved exact
provider/external-id evidence boundary and Action Engine; these are unchanged.
The existing single tenant CrmIntegration qualifies an exact external-id
target in authorized staff dossiers. Ambiguous discovery returns no loyalty
projection. The target must also have a verified active ClientChannelLink.

## Runtime candidate

- Shared `ClientLoyaltyReadService` authenticates own-account or signed channel
  queries, resolves one active versioned ClientChannelLink, rejects merged or
  held identities, and reads the exact Client-owned account/ledger in a
  PostgreSQL READ ONLY / RepeatableRead transaction.
- Client without Maya User is supported by the channel query and internal
  authenticated transport. Caller-supplied Client, phone, raw Telegram id, and
  legacy User-owned account caches do not authorize a projection.
- `/loyalty/me`, ledger reads, customer portal and AI own-loyalty reads use the
  shared boundary. Existing authorized customer-manager lists/details and
  staff dossiers use the same canonical account after their existing staff
  authority and exact target binding checks. No additional staff role is
  granted by this change.
- Canonical cabinet projection keeps its verified Client predicate and gains
  a database read-only fence and P02/P03 hold check for its value section.
- Python AI balance/booking-preparation helpers call the verified query;
  absence/failure is unavailable, without SQLite/phone fallback. The raw
  Telegram `/api/internal/loyalty-snapshot` compatibility endpoint returns
  `410 FEATURE_NOT_AVAILABLE`, disclosing no value or Client existence.
- PWA existing failure handling accepts unavailable loyalty state; no PWA,
  proxy, iOS, schema, provider adapter, or canonical value executor change is
  required.

## Local verification

- PostgreSQL executable proof: **23/23 PASS**, including the real GET
  controller, signed Telegram channel without User, duplicate phone/different
  CRM identities, multiple links, populated own/other ledgers, revoked/missing
  and forged identities, held identities, failed reads, authorized staff
  target selection, and 20 concurrent GETs.
- Every case compares complete account, ledger, Client, CRM link, channel
  link, consent, User, Membership, ActionExecution and synthetic provider
  snapshots before/after: byte-equivalent. Private provider card reads and
  provider writes: zero.
- Targeted backend and cross-package architectural tests: **8 suites / 77
  tests PASS**. Restored GET account writes, phone/raw-Telegram authority and
  unverified exact-Client reads are rejected. Existing P4 value-owner checks
  are tightened by removing the GET upsert exception.
- Python real-branch/transport/retired-handler and adversarial ratchet tests:
  **4/4 PASS**. Active P4 and P5 Python architectural guards pass.
- Production and script typechecks and targeted ESLint pass. Existing 79
  migrations replayed into a newly owned disposable PostgreSQL cluster;
  no schema change was introduced.
- Read-only production preflight: pending migrations **0**, drift **NONE**,
  health/readiness **PASS**, accepted B26 release active.

Production deployment and the fresh full Package 5 final inventory follow
the mandatory deployment gates. This local report does not assert production
B27 completion or Package 5 completion.

Real production business/provider/value mutations for proof: **0**.
Package 4 reopened: **NO**. P4-11 / Wave 7 / Chapter 7 created: **NO**.
The 17 pre-existing databases are outside this cycle's ownership and untouched.
