# Package 5 B14 GOD Billing Owner Decision V1

Status: **owner decision required; runtime/schema/migration implementation not started**.

## D1 — What should Maya do with infrastructure renewal reminders?

### A — Retire the writable GOD renewal tracker in Chapter 6
The founder sees canonical customer subscription, payment and entitlement facts
from Package 4, but the manual Yandex Cloud, Timeweb, Beget, domain, YClients
and AI top-up countdown list is removed from the GOD screen. Those legacy rows
do not initiate, schedule or prove any payment.
`CANONICAL OWNER: NONE — LEGACY DISPLAY FEATURE RETIRED`
`AUTHORITY: NONE`
`ALLOWED VALUES/RANGE: NOT APPLICABLE`
`ENFORCEMENT: NONE; P4-05 CUSTOMER RENEWALS REMAIN UNCHANGED`
`AUDIT/VERSION: NOT REQUIRED FOR A RETIRED SETTING`
`NEW SCHEMA REQUIRED: NO`
`NEW ACTION CLASS REQUIRED: NO`
`WHAT BUSINESS/USER LOSES WITH A: editable infrastructure-bill dates, amounts and countdown warnings in the GOD screen; no customer billing/payment behavior is lost`
### B — Re-express reminders as existing A23 operational tasks
Each infrastructure bill becomes an explicit `OperationalWorkItem` with a due
date and completion state. It remains a human reminder only and never triggers
a payment; amount can be informational text, not a value authority.
`CANONICAL OWNER: A23 OperationalWorkItem`
`AUTHORITY: verified platform operator under a separately approved platform-to-workspace authority mapping`
`ALLOWED VALUES/RANGE: existing A23 title/body limits and valid dueAt; no typed monetary authority`
`ENFORCEMENT: reminder/task lifecycle only; no scheduler payment or provider write`
`AUDIT/VERSION: existing ActionExecution/work-item audit; new authority mapping must be versioned`
`NEW SCHEMA REQUIRED: NO`
`NEW ACTION CLASS REQUIRED: NO`
### C — Create a canonical platform renewal policy/obligation capability
Maya stores allowlisted infrastructure obligations with currency, bounded
amount, due date, recurrence and owner approval, then produces audited alerts.
It still cannot pay automatically without a separate payment contract.
`CANONICAL OWNER: new central versioned PlatformRenewalPolicy/Obligation`
`AUTHORITY: step-up verified platform owner; explicit approval for every create/change`
`ALLOWED VALUES/RANGE: allowlisted obligation key; ISO due date; RUB amount 0..100,000,000; bounded recurrence`
`ENFORCEMENT: audited alerting only; payment/provider writes forbidden`
`AUDIT/VERSION: REQUIRED`
`NEW SCHEMA REQUIRED: YES`
`NEW ACTION CLASS REQUIRED: YES`
`RECOMMENDED: A`
`WHY: The current values are a manual infrastructure checklist used only for display and warnings. They are not consumed by P4-05, a payment scheduler or any canonical value owner, so preserving them would create a new capability only for an old control.`
## D2 — What should the GOD AI budget control mean?
### A — Retire the writable global threshold and keep measured spend only
The GOD screen continues to show actual AI and server cost. It no longer shows
or edits a global “spent versus budget” threshold; model execution and customer
features behave exactly as before because the current setting never enforced a
limit.
`CANONICAL OWNER: measured AI usage/cost projection; no mutable budget owner`
`AUTHORITY: NONE FOR BUDGET MUTATION`
`ALLOWED VALUES/RANGE: NOT APPLICABLE`
`ENFORCEMENT: NONE; OBSERVED COST ONLY`
`AUDIT/VERSION: existing usage evidence remains; no policy record is created`
`NEW SCHEMA REQUIRED: NO`
`NEW ACTION CLASS REQUIRED: NO`
`WHAT BUSINESS/USER LOSES WITH A: editable global USD warning threshold and its warning badge; actual spend visibility and AI execution are unchanged`
### B — Add a tenant-scoped alert threshold to A22 finance preferences
A tenant owner/admin may set a monthly USD warning threshold. It affects only
that tenant’s dashboard warning and never blocks AI calls.
`CANONICAL OWNER: A22 FinanceDashboardPreference, new policy/config version`
`AUTHORITY: verified tenant owner or approved tenant administrator`
`ALLOWED VALUES/RANGE: NULL means no threshold; otherwise 1..100,000 USD per calendar month`
`ENFORCEMENT: ALERT ONLY; NO MODEL OR CUSTOMER-FEATURE SHUTOFF`
`AUDIT/VERSION: ActionExecution audit and a new A22 config/policy version REQUIRED`
`NEW SCHEMA REQUIRED: NO`
`NEW ACTION CLASS REQUIRED: NO`
### C — Create a central versioned platform AI spend policy
A step-up verified platform owner sets a global monthly limit. The policy must
define whether crossing it only alerts or blocks explicitly allowlisted AI
capabilities; every change is versioned and audited.
`CANONICAL OWNER: new central PlatformAiSpendPolicy`
`AUTHORITY: step-up verified platform owner with explicit approval`
`ALLOWED VALUES/RANGE: 0..1,000,000 USD per calendar month; 0 means explicitly disabled only if hard enforcement is approved`
`ENFORCEMENT: versioned soft-alert or allowlisted hard-stop policy; fail-closed behavior must be separately approved`
`AUDIT/VERSION: REQUIRED`
`NEW SCHEMA REQUIRED: YES`
`NEW ACTION CLASS REQUIRED: YES`
`RECOMMENDED: A`
`WHY: The current global number is read only to color a health warning and does not stop models, schedule work or affect customer value. Retiring the mutation preserves real cost visibility without inventing a policy whose scope and enforcement did not previously exist.`
## Existing D4-A mapping
`GOD OVERVIEW OWNER DECISION: ALREADY COVERED BY D4-A`
`maya_tenants AS CURRENT SUBSCRIBER AUTHORITY: NO`
`maya_tenants AS FALLBACK PROJECTION: NO`
The future runtime remediation must use the canonical tenant/subscription
projection or return unavailable/empty. It must also remove the mutating
`god_probe_ts` write and `repair=True` identity audit from overview/health read
paths; neither side effect needs a new owner decision.
`RECOMMENDED OPTIONS: D1-A / D2-A`
`NEW MODELS IF BOTH A APPROVED: 0`
`NEW ACTION CLASSES IF BOTH A APPROVED: 0`
`PRODUCTION MUTATIONS: 0`
