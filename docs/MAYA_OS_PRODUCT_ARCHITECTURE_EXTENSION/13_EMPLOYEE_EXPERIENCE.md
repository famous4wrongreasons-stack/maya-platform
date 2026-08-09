# Chapter 13 — Employee Experience

<!-- markdownlint-configure-file {"MD013": false} -->

## 13.1 Goal

Give each employee the minimum trusted context and actions needed to deliver
service, manage the working day and improve personal performance without
exposing owner-only finance, unrelated customers or other employees' data.

Employee experience covers provider, staff, administrator and manager
capability profiles. Role and scope determine the final surface.

## 13.2 Primary surfaces

- today/next shift briefing;
- personal or scoped schedule;
- client preparation cards;
- operational task queue;
- role-relevant opportunities;
- canonical Maya conversation;
- own/scoped performance;
- notifications and approvals assigned to the employee.

## 13.3 Start-of-day briefing

For a provider, Maya may show:

- today's appointments and changes;
- gaps or freed slots;
- customer/service preparation notes allowed by policy;
- tasks and follow-ups;
- schedule or integration warnings;
- personal opportunities.

For an administrator/manager, the briefing may include location workload,
unconfirmed appointments, capacity gaps and service exceptions.

## 13.4 Client context

The employee Customer 360 view is minimized:

- appointment and service context;
- relevant permitted visit history;
- safe preferences or service notes;
- consent/communication eligibility when the role must contact the customer;
- outstanding operational task.

Default exclusions include unrestricted contact export, lifetime business value,
unrelated staff notes and internal identity evidence.

## 13.5 Schedule and booking

Employees may inspect and perform only operations allowed by role and scope.

Every change:

- revalidates availability;
- verifies resource/customer ownership and location scope;
- previews old/new values;
- uses non-destructive provider semantics;
- applies confirmation, idempotency and audit;
- notifies affected parties through the consent/purpose policy.

## 13.6 Tasks and opportunities

Role-relevant opportunities can become tasks:

- contact a customer after an approved service issue;
- confirm a high-risk appointment;
- review a schedule gap;
- follow up after a failed delivery;
- resolve a duplicate/customer data issue if authorized.

The employee sees why the task exists and what completion means. Completing a
task does not automatically claim a business outcome.

## 13.7 Personal analytics

Providers may access:

- own booked and completed work;
- own utilization;
- own revenue or compensation only when permissioned;
- own cancellation/no-show patterns;
- own retention/service mix;
- trends and targets approved by tenant policy.

Peer rankings and business-wide finance are denied by default. When provided,
they require explicit role scope and should avoid harmful or misleading
comparisons.

## 13.8 Administrator and manager scope

Administrators may receive location operations, customer service and booking
tools. Managers may receive location/team analytics and task assignment.

Neither role automatically receives:

- tenant billing or integration secrets;
- owner-only financial detail;
- payroll across the business;
- unrestricted mass communication;
- permission or salary changes;
- platform administration.

## 13.9 Conversational examples

- “Кто у меня сегодня первый?”
- “Покажи свободные окна до пятницы.”
- “Что изменилось в расписании?”
- “Подготовь перенос этой записи.”
- “Какие мои клиенты скоро должны вернуться?”
- “Почему моя загрузка ниже прошлого месяца?”

The same orchestrator serves these requests with a role-limited tool registry.

## 13.10 Notifications

Employee notifications prioritize:

- immediate schedule change;
- assigned task/approval;
- customer arrival or operational exception;
- start-of-day briefing;
- low-priority performance insight in feed.

Quiet hours, shift schedule and escalation policy apply.

## 13.11 Privacy and safety

- Raw PII is shown only when needed and separately permissioned.
- Customer notes are purpose-limited and auditable.
- Employee metrics are not exposed to customers.
- A provider cannot infer other employees' customers from IDs.
- AI prompts use minimized opaque references.
- High-risk writes and communications remain approved under tenant policy.

## 13.12 Acceptance scenarios

- Provider sees own day and only permitted customer context.
- Manager sees location utilization but not unrelated tenant finance.
- A foreign appointment ID returns not found.
- Booking change rechecks availability and produces an audit event.
- A communication task cannot bypass customer eligibility.
- Personal metric follow-ups preserve period but not a prior broader scope.
- A CRM workforce record receives no interactive access until a verified User
  link or accepted invitation activates its Membership.
- Active non-bookable administrators can be imported and explicitly assigned
  administrator access.
- Authoritative CRM deactivation suspends staff capabilities and sessions while
  preserving separately granted owner authority.
