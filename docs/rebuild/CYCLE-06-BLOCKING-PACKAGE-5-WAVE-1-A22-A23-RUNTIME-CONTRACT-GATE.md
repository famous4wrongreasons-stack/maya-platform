# CYCLE 06 — PACKAGE 5 WAVE 1 A22/A23 RUNTIME CONTRACT GATE

Status: **PASS — exact local contracts fixed; schema sufficient**

Date: `2026-09-03`

## Scope and action classes

Wave 1 contains six business mutations:

1. `update_assistant_preferences`
2. `update_finance_dashboard_preferences`
3. `update_appointment_notification_settings`
4. `create_operational_task`
5. `complete_operational_task`
6. `request_administrator_contact`

Inbox read/archive/delete state, push-token registration and Package 2
message delivery are transport/user-experience protocols, not Wave 1 business
actions.

## Current production ownership

Before the future Wave 1 runtime cutover, A22 is directly owned by
`DashboardPreferencesService` and `AppointmentNotificationsService`. A23 task
creation and support requests are represented directly as `InboxItem`
projections by `AiToolHandlerService`; task completion rewrites inbox payload
state. These are the exact known pre-cutover owners and are captured by the
narrow bypass ratchet. No new production owner was switched in this cycle.

## Canonical contract

Every action follows:

`authenticated/legacy initiator → Canonical Action Ingress → server-derived authority and exact target generation → ActionExecution → local canonical executor`

Settings use tenant + exact membership + exact setting target + expected
generation + normalized before/after state hashes. A same-state request is a
durable successful no-op and does not fabricate an applied generation.
Conflicting concurrent requests for the same generation have one winner; the
stale request fails closed.

Operational task/support creation is immutable and binds one exact assignee
and one create ActionExecution. Completion is the sole `OPEN → COMPLETED`
transition and binds one completion execution. Support requests select one
responsible active administrator deterministically by server role priority;
Package 2 may separately project the request to other eligible administrators.
The inbox never becomes the business aggregate.

## Authority, approval and blast radius

- assistant and finance preferences belong to the exact active membership;
- tenant-wide appointment notification policy requires an active management
  role;
- task assignees are exact active tenant memberships;
- only the exact assignee can complete an operational task;
- support ownership is selected from active tenant management memberships;
- caller-supplied role, policy decision or approval is rejected;
- every command has exactly one target and bulk mutation is forbidden.

All six actions are pure PostgreSQL mutations. Commit/rollback is
authoritative, external dispatch does not exist, `UNKNOWN` is not applicable,
and provider reconciliation is not required.

## Schema decision

`ActionTargetMutation` covers exact settings generations and immutable
before/after hashes. `OperationalWorkItem` covers A23 creation, assignment and
one-time completion while `InboxItem.operationalWorkItemId` preserves a
separate delivery projection. The approved Package 5 foundation therefore
represents the full Wave 1 contract without another migration.

`PACKAGE 5 WAVE 1 RUNTIME CONTRACT GATE: PASS`

`WAVE 1 FAMILIES: A22, A23`

`WAVE 1 EXACT ACTION CLASSES: 6`

`CANONICAL SCHEMA SUFFICIENT: YES`

`ADDITIONAL SCHEMA REQUIRED: NO`

`UNKNOWN/RECONCILIATION: NOT REQUIRED`

`PRODUCTION RUNTIME CUTOVER: NO`

`PRODUCTION BUSINESS MUTATIONS: 0`
