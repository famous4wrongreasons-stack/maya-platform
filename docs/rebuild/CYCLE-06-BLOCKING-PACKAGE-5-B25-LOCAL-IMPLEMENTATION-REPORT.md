# B25 — approved reminder policy implementation candidate

Accepted baseline: `43007f03`; D1-A / D2-A approved. B24 and Waves 1–6 stay accepted. No schema, model or action class added.

The scheduler reads exact `Appointment.mayaClientId + tenantId`. Missing, merged, ambiguous or ineligible identity does not produce a private intent. It never resolves a recipient from phone or repairs/creates Client identity. Canonical privacy/preferences and tenant eligibility are evaluated after identity. Private reminder content is minimized to the own canonical appointment time and existing appointment-panel navigation.

One existing `deliver_appointment_reminder` ActionExecution stores encrypted normalized route, exact verified link, APNs identity snapshot and maximum-five Web Push episode snapshot before effect. Its stable caller identity binds tenant, Client, Appointment, active schedule/policy and lead occurrence. Competing planners reload the winning immutable input. Inbox wins over Telegram, then Web Push-only; no fabricated primary receipt. Approved device children require durable primary success and share that logical occurrence. UNKNOWN/failure/revocation cannot select another primary route. Existing B24 receipt initiators retain their policy; B25 cannot use their dynamic receipt fan-out to bypass its frozen plan.

Dispatch rechecks current owner, tenant access, consent/preferences, schedule hash, occurrence window, primary HMAC/link and each selected device. Explicit Client hours replace the tenant schedule, absent/null inherits; reminder=false or tenant disable suppresses delivery. Current tenant policy allows at most four distinct occurrences. Canonical reschedule makes old plans stale. Candidate enumeration is paginated, so a batch bound does not silently cap eligible appointments.

Validation: clean replay of all 79 migrations on newly owned isolated PostgreSQL; schema diff NONE; 20 executable adversarial/concurrency scenarios PASS; 6 targeted suites / 47 tests PASS. Proof includes actual canonical ActionExecution/Communication Delivery with synthetic transport only. Production preflight: pending0, drift NONE, health/readiness PASS, existing Package4/5 active Python/PWA guards PASS. Full deployment regression/build and production runtime cutover are next; Package5 remains NOT COMPLETE.

Evidence: `evidence/package5-b25-local-proof.json`. All 17 pre-existing databases preserved. Newly owned proof database dropped and isolated PostgreSQL stopped. Real production mutations for proof: 0. No P4-11, Wave7 or Chapter7.
