# G13-I7 — F33/F76 evidence unit

Status: **PASS — G13-I7 promoted from false to L by executable evidence.** No runtime semantics changed for this unit.

G13-I7 concerns the Action Engine boundary, not a complete reschedule/cancel/approval journey. F33 requires the honest `authenticated_request` source and the canonical capability policy. F76 keeps widget-kind and confirmation-subject fields outside the Action Engine; mint/Gate 7 own widget validation. The existing architecture implements this boundary.

The proof uses the ordinary server-minted catalog → selectors → DRAFT → COMMIT flow, with one canonical durable internal-calendar execution. It additionally observes the persisted ActionExecution sourceType, ALLOW policy and canonical prepare fields; forged sourceType/widget_kind/confirmation_subject properties on the widget submission must refuse before any execution. The HTTP and production-binary records must share the declared clause and independently captured mint provenance. No injected COMMIT is admitted as live proof.

A whole-tree architecture ratchet checks every non-test Action Engine TypeScript source for all four forbidden widget metadata spellings. Its mutant adds a forbidden field to the canonical trusted request type. A second mutation removes the existing booking invocation source guard alone and must be killed by WR-F33 with a correct server key. Existing G13-P07 verifies create, cancel and reschedule owner invocation shapes; the canonical policy/source registry remains unchanged.

These witnesses establish the shared boundary. They do not prove the non-draft producing-record ancestry, appointment re-resolution or proposed confirmation flow, so G7-5, G7-BOOK1, G7-FR6b/d, G11-I9 and G13-I3 remain separate false clauses. No widget registration, authority, entitlement or presentation behavior is introduced.
