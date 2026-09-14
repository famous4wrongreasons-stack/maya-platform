# Package 5 Final Remediation — B18 Contract Inventory

Status: `MAPPED 6/6`

This inventory reconstructs the six production-reachable direct YClients
appointment PUT owners found after the B17 deployment. It does not reopen Waves
1–6 and introduces no action class or schema.

## Exact six-site map

| Site | Initiator and business intent | Former identity/authority | Provider operation and local side effects | Existing canonical action and executor | UNKNOWN/reconciliation |
|---|---|---|---|---|---|
| `YClientsAPI.update_booking` | Client AI `update_booking`: replace the services of an existing appointment | SQLite `database.get_client(user_id)` plus phone-based booking lookup | Direct `PUT record/{company}/{record}`; AI also wrote a legacy actor marker after some appointment mutations | `set_appointment_services` → `crm.appointment.services.v1` → Action Engine → `CrmService.executeResidualAppointmentWithReceipt` → YClients adapter | Provider read-before/write/read-back; timeout or unproven result is `UNKNOWN`; reconciliation compares provider state; blind retry is forbidden |
| `YClientsAPI.set_record_attendance` | Legacy journal: mark arrived/no-show/awaiting/confirmed | Telegram/widget/legacy session → legacy panel role | Direct `PUT record/{company}/{record}`; no approved local business fact | `set_appointment_attendance` → `crm.appointment.attendance.v1` → same canonical executor | Same durable ActionExecution and read-only reconciliation contract |
| `YClientsAPI.add_services_to_record` | Legacy journal: add services and derived duration | Telegram/widget/legacy session → legacy panel role | Provider reads followed by direct `PUT record/{company}/{record}` | `set_appointment_services` → `crm.appointment.services.v1` → same canonical executor | Same durable ActionExecution and read-only reconciliation contract |
| `YClientsAPI.set_record_services` | Legacy journal: replace services and duration | Telegram/widget/legacy session → legacy panel role | Provider reads followed by direct `PUT record/{company}/{record}` | `set_appointment_services` → `crm.appointment.services.v1` → same canonical executor | Same durable ActionExecution and read-only reconciliation contract |
| `YClientsAPI.set_record_duration` | Legacy journal: change visit duration | Telegram/widget/legacy session → legacy panel role | Direct `PUT record/{company}/{record}` | `set_appointment_duration` → `crm.appointment.duration.v1` → same canonical executor | Same durable ActionExecution and read-only reconciliation contract |
| `YClientsAPI.set_record_client_name` | Legacy journal: change appointment client name or phone | Telegram/widget/legacy session → legacy panel role | Provider read followed by direct `PUT record/{company}/{record}` | `set_appointment_fields` with `fieldKind=client_name` → `crm.appointment.fields.v1` → same canonical executor | Same durable ActionExecution and read-only reconciliation contract |

## Canonical authority alignment

Customer AI appointment mutations use:

```text
authenticated channel
  -> verified active ClientChannelLink
  -> tenant-qualified canonical Client
  -> exact canonical Appointment ownership check
  -> Action Engine
  -> canonical appointment executor
```

AI no longer resolves appointment authority from phone, chat id, a legacy
session, or SQLite Client state. Reschedule, cancel, and service replacement use
the same verified Client boundary. The command has a deterministic identity and
rechecks Client/Appointment authority immediately before provider dispatch.

Staff journal mutations use the existing authenticated SaaS journal. Its JWT
principal and `CrmStaffAccess` resolve staff authority server-side; full-access
roles remain tenant-scoped. The service rechecks record authority immediately
before the canonical executor dispatches. The legacy Telegram/session journal
write routes fail closed with an explicit canonical-staff-session requirement.

## Closure decision

`B18 APPOINTMENT SITES MAPPED: 6/6`

`B18 UNMAPPED PROVIDER MUTATION: NONE`

`ADDITIONAL SCHEMA REQUIRED: NO`

`NEW ACTION CLASS REQUIRED: NO`

`CANONICAL PROVIDER EXECUTION OWNER: ACTION ENGINE`

`CUSTOMER APPOINTMENT AUTHORITY: VERIFIED CLIENT CHANNEL LINK + EXACT APPOINTMENT OWNERSHIP`

`STAFF APPOINTMENT AUTHORITY: SERVER-DERIVED JWT/CRM STAFF ACCESS`

`UNKNOWN/RECONCILIATION REQUIRED: YES`

`REAL PRODUCTION BUSINESS/PROVIDER MUTATIONS FOR PROOF: 0`
