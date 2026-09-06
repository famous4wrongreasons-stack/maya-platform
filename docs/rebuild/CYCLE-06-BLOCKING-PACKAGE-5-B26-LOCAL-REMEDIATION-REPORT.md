# Package 5 B26 — verified Client appointment read

Accepted baseline: `cec7bdfd` / B25 production PASS. No accepted wave is reopened; no schema, model or action class is added.

## Existing contract sufficiency

`Appointment.mayaClientId + tenantId` is the durable Client owner used by B17/B25. `ClientChannelLink` already stores tenant/provider/HMAC subject to exact verified Client. Account identity is only a channel subject: authenticated request context, active User/Membership and the existing verified `maya_user` link are required. Bare User→Client, phone or optional Appointment account association cannot authorize this projection. Telegram needs authenticated channel proof and the same verified link, without any fabricated User.

Canonical synchronization already exists: `AppointmentMirrorService.bootstrap` handles initial bounded journal windows before observation baseline; `AppointmentReconciliationService.run` → `AppointmentObservationService.fromSourceShape` → `AppointmentChangeService.applyObservation` materializes/updates canonical records using exact provider Client links. Scheduled contours are ±7 days and ±31 days; the existing explicit reconciliation runner accepts other date ranges. This does not promise that every historical CRM record is already local. The owner explicitly accepts last synchronized canonical state and no result for missing local records. B26 changes neither synchronization windows nor scheduler policy, and never triggers these owners from a read.

## Runtime

`AppointmentsService.listClientAppointments` delegates to `ClientAppointmentReadService.forAccount`, covering `/appointments/my`, account customer-portal appointment section and AI `listOwnAppointments`. The former phone CRM read/import helper is removed. An authenticated channel projection is also available through the existing tenant-bound Client command bridge (`appointments-projection`) and account Client channel route; its payload accepts no Client/phone/channel selectors.

The reader authenticates, requires exactly one active versioned ClientChannelLink, rejects merged/unresolved identities, and selects only `tenantId + mayaClientId`. All database work runs in PostgreSQL READ ONLY / repeatable-read transaction. It performs no Client/Appointment/link/consent mutation, no lazy import or cache warm-up. Public service/staff labels may be read; their failure leaves the canonical row usable with minimal labels. Stored appointment price/time/status remain canonical, and raw provider payload is not disclosed. Existing PWA callers retain the response shape; unlinked identities fail closed. No UI controls or visuals change.

## Local verification

18 PostgreSQL scenarios PASS; before/after serialized Appointment, Client, ClientChannelLink, User/Membership, profile/consent and synthetic provider state are byte-equivalent for each scenario. Includes verified Client without User, account binding, duplicate phones, forged identifiers, missing/revoked/ambiguous identity, other Client/tenant, 20 concurrent GETs, missing local/unmatched remote record, stale canonical status, catalog failure and PostgreSQL rejecting a future helper write.

Six targeted suites / 72 tests PASS, including common architectural scanner, channel transport, account reader delegation and B17/B20/B25 regression. The scanner covers all production TS sources and detects Client-read phone authority, direct writes, GET synchronization and unqualified Appointment projection; mutation tests verify its rejection behavior. Existing tests that expected GET import were replaced with read-only delegation assertions.

79 migrations replayed on this cycle's isolated PostgreSQL; schema diff NONE. Production baseline preflight PASS: pending0, drift NONE, health/readiness PASS, active Package4/Package5 Python/PWA guards PASS. Mandatory full deployment gates and production verification follow; no production business/PII operation was invoked for proof.

Package5 remains NOT COMPLETE pending deployment and a new full all13-family Final Gate. No P4-11/Wave7/Chapter7. All17 pre-existing databases remain untouched. Owned proof database/process will be removed at closure.
