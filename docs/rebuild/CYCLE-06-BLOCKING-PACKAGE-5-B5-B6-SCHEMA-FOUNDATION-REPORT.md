# Package 5 B5/B6 — approved schema foundation

Accepted baseline `cdd97012`. Owner approved Maya-local mood and exactly three nullable fields; no new models or historical backfill. This is final remediation, not a new wave.

## Owner decision applied

- Client owns `CustomerProfile.defaultVisitMood`; `Appointment.clientVisitMood` remains an independent visit choice. No automatic CRM write. A07 remains a separate capability.
- `CustomerProfile.notificationPreferencesJson` stores versioned explicit overrides, not consent. Absence inherits applicable approved policy. Row existence never grants consent.
- Reminder hours: integer 1–48; zero invalid, disable by `reminder=false`. Missing hours inherit policy; no hidden legacy three-hour substitution. Contradictory input must be rejected by the runtime validator.
- Canonical verified Client binding is required; no-op, read, missing or ambiguous identity must not create Client/business facts.

Migration `20260904170000_client_preferences_v1` adds only these three nullable columns with no default. Database guards constrain mood, exact version/allowlist/types/ranges, nullable Client ownership and immutable established visit identity. Existing composite FKs and profile owner guard remain. The schema does not introduce new inherited delivery defaults.

## Validation

PostgreSQL schema adversarial/concurrency proof: 37/37. Separate clean replay: PASS; drift NONE. Schema ratchets: 3/3. Prisma validate, backend and script typechecks, project lint, build and release-preflight compilation: PASS. Temporary owned PostgreSQL clusters were removed. The initial local function alias ambiguity was corrected before the passing proof and migration gate.

Production runtime remains accepted `94543056`. Production migration is the next conditional step; no runtime cutover or Package 5 completion claimed. After expected-only migration gate/apply, continue the authorized B5/B6 runtime remediation without stopping. Full deployment and fresh 13-family final inventory remain required.

Production business/provider mutations for proof: 0. Existing 17 local databases untouched. Waves 1–6 remain accepted; no Wave 7 or Chapter 7.
