# Package 5 B14 contract reconstruction STOP

Status: **B14 contract reconstruction complete; owner decision required; implementation not started**.

Accepted checkpoint: `a4a50d2f`.

B13 remains an accepted production baseline and was not reopened. Waves 1–6
remain accepted 6/6. This cycle performed source and active-runtime inspection
only; it did not invoke `/api/god/billing`, change schema, create a migration or
mutate production data.

## GOD overview mapping

Approved D4-A fully determines the owner boundary:

- `maya_tenants` is not current subscriber authority;
- `maya_tenants` is not a fallback projection;
- current state must come from canonical Tenant, TrialActivation, Package 4
  subscription/payment/entitlement facts and other approved operational facts;
- absent canonical data is rendered as unknown, unavailable or empty under the
  existing API contract.

The same read path currently reaches two additional side effects that need no
new owner decision: `_god_health_checks` writes `god_probe_ts` and runs the
dual-role identity audit with `repair=True`. Both must be removed from the
future read-only overview/health projection.

## D1 reconstruction — renewals

`god_renewals` is a manual global list for Yandex Cloud, Timeweb, Beget, domain,
YClients licence and AI top-up dates/amounts. The active runtime reads it for
countdown/display warnings only. No Package 4/P5 payment action, scheduler or
provider writer consumes it.

There is no approved canonical owner for caller-supplied renewal key, label,
date and amount. The recommended decision is D1-A: retire the writable GOD
renewal tracker. This removes only editable infrastructure-bill reminders from
the GOD screen; P4-05 customer subscription renewals and all canonical payment
facts remain unchanged. It needs no schema or action class.

## D2 reconstruction — AI budget

`god_ai_budget_usd` is a single global USD threshold, defaulting to `50.0`,
compared with measured 30-day AI usage for a health warning. It does not stop
models, deny customer functions, schedule actions or own customer value.

There is no approved canonical owner for this mutable platform threshold. The
recommended decision is D2-A: retire the writable threshold and retain measured
AI/server cost visibility. This removes only the editable warning threshold and
warning badge; actual spend evidence and AI behavior stay unchanged. It needs
no schema or action class.

The exact A/B/C choices, authorities, ranges, enforcement and version/audit
requirements are recorded in
`package5-b14-god-billing-owner-decision-v1.md`.

## Exact active-runtime evidence

- `_god_get_renewals`: SHA-256
  `d8f5f28ab1a62799634edb89bbe4fc4238b89f498b0331f9460bdaa65d0e52a9`;
- `_god_set_renewals`: SHA-256
  `ac2222cc04e62bb33a890d27df6b867957a3da7114231dcad1df07c879fd008f`;
- `_god_ai_budget_usd`: SHA-256
  `10fe2e515a95d5fde26dd0301e4c40d0418d10235b886e94d3a43d1ba16a8f90`;
- `_god_health_checks`: SHA-256
  `5496ba4e3521eb91dc6bc2d806b633e6d800e400503a03d970f4b4beb0278ca9`;
- `god_overview_handler`: SHA-256
  `287fd0cd9e1456ea2c6dd4e92d2a0b06db01a8282cfb13a38c544bc94e6bc878`;
- `god_billing_handler`: SHA-256
  `ac1d51f9d417acd061aaf2682ecb95efbaa89117b5e1e87a08d06108e4e84be3`.

The active PWA is request-only; the full bot is inactive and background tasks
are disabled. These deployment facts do not turn SQLite settings into an
approved business authority.

## Verdict

`B14 CONTRACT RECONSTRUCTION: COMPLETE`

`GOD OVERVIEW D4-A MAPPING: COMPLETE`

`maya_tenants AS CURRENT SUBSCRIBER AUTHORITY: NO`

`maya_tenants AS FALLBACK PROJECTION: NO`

`GOD OVERVIEW HIDDEN WRITE/REPAIR SIDE EFFECTS FOUND: YES`

`RENEWAL SETTING CANONICAL OWNER ALREADY APPROVED: NO`

`AI BUDGET SETTING CANONICAL OWNER ALREADY APPROVED: NO`

`OWNER DECISION REQUIRED: YES`

`RECOMMENDED OPTIONS: D1-A / D2-A`

`NEW MODELS IF BOTH A APPROVED: 0`

`NEW ACTION CLASSES IF BOTH A APPROVED: 0`

`RUNTIME IMPLEMENTATION STARTED: NO`

`SCHEMA/MIGRATION IMPLEMENTATION STARTED: NO`

`PRODUCTION MUTATIONS: 0`

`P4-11 CREATED: NO`

`WAVE 7 CREATED: NO`

`CHAPTER 7 STARTED: NO`

The 17 pre-existing local test databases were not changed or deleted. Owned
temporary processes, watchers, browser processes and temporary databases are
zero.
