# Barbershop Native Release 1 Scope

<!-- markdownlint-configure-file {"MD013": false} -->

## Decision

The first implementation release is a native iOS pilot for one service
vertical: barbershops connected to YCLIENTS.

The universal MAYA OS architecture remains unchanged. This release narrows the
delivery surface so identity, data correctness and role parity can be proven
before more verticals or channels are added.

## Included

- native iOS application in `/Users/stanislavmosin/Desktop/maya-ios`;
- owner trial/subscription onboarding inside the canonical Maya conversation;
- YCLIENTS connection through protected native forms and backend APIs;
- branch selection, capability proof, activation and initial sync;
- authenticated owner bootstrap;
- owner-provider composite access;
- owner assignment of administrator, manager, provider and employee access;
- automatic suspension of workforce access after authoritative CRM
  deactivation, subject to owner safeguards;
- Telegram OIDC/native and Yandex ID authentication through one platform
  identity layer;
- customer linking by verified tenant-scoped phone evidence;
- explicit client/staff/owner mode chooser and mode switch;
- owner and staff read surfaces backed by canonical synchronized facts;
- deterministic, role-filtered analytics with freshness and quality;
- separate entitlements for optional store and referral modules.

## Explicitly excluded from this release

- changes to the production PWA bundle;
- PWA/native parity work;
- non-barbershop onboarding choices;
- operation without an external CRM;
- DIKIDI, Whitelines, Salon Online or unverified provider scaffolds;
- automatic marketing sends;
- live booking writes before capability, reconciliation and rollout gates pass;
- custom domains or separate App Store binaries per tenant;
- universal store/certificate/package behavior without an enabled entitlement.

Excluded features remain in the target architecture where applicable; they are
not removed from the long-term product.

## Required backend sequence

1. Trusted tenant entry and social provider capability proof.
2. Owner bootstrap and multi-role Membership projection.
3. Full initial YCLIENTS operational sync and reconciliation.
4. Read-only owner “today” summary and role-filtered staff day.
5. Native mode chooser and mode switch over server-returned capabilities.
6. Customer social linking inside a signed tenant entry.
7. Optional entitled modules.
8. Governed writes only after read parity and rollback evidence.

## Agent ownership

### Codex / backend owner

- architecture and contracts;
- Prisma migrations and repair plans;
- auth, tenant resolution, Membership and role policy;
- CRM sync, reconciliation and readiness;
- deterministic metrics, permission tests and security tests;
- API schemas, stable errors and rollout flags.

### Cursor / native client owner

- native iOS screens and navigation after API contracts are frozen;
- mode chooser and switch presentation;
- onboarding, status, partial/stale and remediation states;
- accessibility, keyboard, safe areas and native visual parity;
- API integration without duplicating backend authorization or formulas.

Cursor must not edit the production PWA, derive roles locally, parse provider
payloads, persist CRM secrets or invent missing backend data.

## Native acceptance journey

~~~text
install native MAYA
  → start owner trial
  → authenticate
  → connect and confirm YCLIENTS branch
  → owner bootstrap
  → identify optional “I am this provider” link
  → review team access candidates
  → wait for reconciled initial sync
  → choose owner or staff mode
  → see complete role-appropriate data with freshness
~~~

Customer journey:

~~~text
open tenant smart link / QR / NFC
  → authenticate with Telegram or Yandex
  → consent to verified phone access
  → link exact CRM Customer in that tenant
  → enter own client mode
~~~

## Release gates

- zero cross-tenant identity or data access in negative tests;
- owner bootstrap replay and last-owner safeguards pass;
- active/inactive employee reconciliation passes;
- initial sync counts and money reconcile to approved YCLIENTS fixtures;
- missing or stale data is never shown as zero;
- owner-provider mode switch preserves server-authorized scope;
- social login without verified phone fails closed with remediation;
- no production PWA files change in native release PRs;
- native rollback can return to the existing production application without
  deleting synchronized evidence.
