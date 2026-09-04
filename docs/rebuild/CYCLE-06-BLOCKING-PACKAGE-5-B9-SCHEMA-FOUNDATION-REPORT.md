# Package 5 Final Remediation — B9 schema foundation

Owner checkpoint `57196b09` accepted. This is remediation of the Package 5
final gate, not Wave 7.

Implemented the approved single-model `ClientWantedSlotInterest` foundation.
It stores one verified Client's exact staff/time request, derives expiry from
the requested start, allows at most ten active interests per Client, and limits
one availability event to the three earliest eligible interests. Historical
request facts cannot be rewritten or physically deleted. Creation is bound to
the exact tenant, Client, branch, staff, verified `ClientChannelLink`, and
canonical `ActionExecution`. The row is not a booking, reservation, referral
fact, or communication consent.

PostgreSQL schema/adversarial/concurrency proof: **8/8 PASS**. It covers
server-derived exact-time expiry, duplicate rejection, active interests 1–10,
11th rejection, concurrent cap enforcement, cross-tenant rejection, immutable
history, deterministic earliest ordering, fan-out three, absence of consent
creation, and exact Client/channel-link binding. No backfill was performed.

Clean replay: PASS; replay drift: NONE. Prisma validate, schema ratchet 3/3,
application and script typechecks, project lint, and build: PASS. The owned
isolated PostgreSQL clusters, sockets, and databases were removed. The 17
pre-existing local test databases were not touched.

Production migration is not applied by this checkpoint. The next step is the
expected-only, additive production migration gate and apply. If it succeeds,
the same authorized cycle continues with canonical B9 runtime remediation,
deployment, and a fresh Package 5 Final Adversarial Verification across all 13
families. Real production business/provider mutations: 0. Package 5 remains
incomplete; Wave 7 and Chapter 7 have not started.
