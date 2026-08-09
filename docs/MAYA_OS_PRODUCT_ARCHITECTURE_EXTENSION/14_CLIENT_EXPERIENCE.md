# Chapter 14 — Client Experience

<!-- markdownlint-configure-file {"MD013": false} -->

## 14.1 Goal

Give a customer a simple, trustworthy assistant for consultation, booking,
service and account control while exposing only the customer's own data and
tenant-approved public information.

Maya Consult is a capability profile over the same core, not a separate
customer-data system.

## 14.2 Entry modes

- guest/public catalog and consultation;
- signed booking link;
- Telegram binding;
- authenticated Maya User;
- existing CRM customer linked after safe verification;
- tenant-branded PWA/native experience.

Authentication is requested only when needed for personal data or actions.

## 14.3 Core journeys

### Discover and consult

- understand the request;
- recommend appropriate services without unsupported medical/legal claims;
- show price, duration, location and availability from tools;
- explain alternatives.

### Book

- choose service, location, provider and slot;
- collect or resolve identity through deterministic backend steps;
- show exact preview and policy;
- confirm;
- create via canonical booking service/adapter;
- return receipt and next actions.

### Manage own booking

- list own appointments;
- non-destructively reschedule where allowed;
- cancel under policy;
- see status and notifications;
- contact the business through approved channel.

### Relationship

- own visit history;
- packages, certificates, loyalty or benefits;
- feedback/review;
- communication and privacy preferences;
- account/data requests.

## 14.4 Identity linking

The client may link an existing CRM customer only through a verified flow.
Knowledge of a name, phone fragment or customer ID is insufficient.

Linking records:

- authenticated/verified subject;
- identity evidence;
- tenant;
- linked customer;
- timestamp, policy and actor;
- conflict or recovery state.

## 14.5 Customer 360 self-view

The customer sees only own permitted:

- profile and verified identities;
- bookings and visit history;
- packages/benefits;
- communication preferences and consent;
- active service requests.

Internal opportunity scores, merge evidence, staff notes, employee analytics
and business finance are excluded.

## 14.6 Communication and consent

The experience clearly separates:

- transactional service messages;
- reminders;
- feedback requests;
- recommendations/marketing.

Customers can view and withdraw applicable optional purposes. A booking does
not silently create broad marketing consent.

## 14.7 Personalization

Permitted personalization may use:

- selected service and location;
- own prior completed services;
- explicit preferences;
- active benefits;
- accessible availability.

Maya avoids sensitive inference and explains when a recommendation is based on
limited history.

## 14.8 Proactive client experience

Client-facing proactive messages are downstream of an approved business action
and individual eligibility decision. Examples:

- booking reminder;
- requested wait-list opening;
- service follow-up;
- return-cadence suggestion;
- package expiry notice.

Maya Watch does not contact clients directly.

## 14.9 Widgets

Initial client widgets:

- service options;
- availability list/calendar;
- booking preview and confirmation;
- appointment summary;
- package/benefit summary;
- consent/preferences;
- support handoff.

Every widget has a text fallback and revalidates sensitive action state.

## 14.10 Trust and recovery

- Prices, availability and policies come from backend tools.
- Stale provider data is visible.
- Failed booking does not show success.
- Duplicate submission is idempotent.
- Reschedule never silently cancels and recreates.
- Account recovery does not expose whether an unrelated customer exists.
- Human handoff is available when automation cannot safely complete the task.

## 14.11 Accessibility and channel parity

Core journeys work on mobile first and degrade across Telegram/voice without
losing confirmations, warnings or own-data boundaries.

## 14.12 Acceptance scenarios

- Guest can browse public services without accessing customer data.
- Existing customer links only after verified identity flow.
- Telegram/Yandex linking occurs only inside trusted tenant entry and requires
  verified phone evidence available with user consent.
- Missing phone consent never falls back to name, username or profile-photo
  matching.
- Customer sees and changes own communication preferences.
- Booking preview reflects current slot and exact service/price.
- Duplicate confirmation produces one booking.
- Customer cannot access another customer's appointment by ID.
- Approved return outreach excludes ineligible clients and offers a valid
  opt-out.
