# Infrastructure incident, open since 2026-09-23 — the backend host is gone

**Status: OPEN. Three owner actions, one of them today. No production change has been made.**

Established read-only on 2026-09-26 and re-verified on 2026-09-28 after the cloud account was paid.
Hosts, addresses and secrets are named here only where they are already public or already in this
repository; no secret value appears.

## What happened

The virtual machine that served the Maya backend and the salon bot stopped answering between
21:05:30 and 01:52:47 (+03:00) on the night of 2026-09-23. Its public address was **ephemeral**, so it
returned to the provider's pool and has since been assigned to an unrelated tenant: every port this
project used is refused there, and the one port that does answer runs a third party's application.
Paying the cloud bill restored the account, not the instance.

The edge is healthy and is not the fault:

| Surface | State | Who answers |
|---|---|---|
| `mayaos.ru` frontend | **healthy**, HTTP 200, the real marketing site | static hosting, never depended on the VM |
| `mayaos.ru/api` | **502** on every path | the relay's own literal, because its upstream leg fails |
| `rt.malesthetic.pro` (salon bot) | **dead**, DNS still points at the lost address | nothing of ours |

The relay and its routing file on the host are byte-identical to this repository, so there is nothing
to repair at the edge. What is stale is the upstream address it names.

## The consequences, in order of urgency

1. **A personal-data exposure that has not fired yet.** The webhook relay still forwards raw YClients
   bodies — client names, phone numbers, booking records — plus the shared webhook secret in the query
   string, to `rt.malesthetic.pro`, which resolves to an address now held by someone else. Nothing
   leaks **only** because port 443 is closed there. If that tenant starts any TLS listener, the data
   and the secret are handed over automatically, with no change on our side.
2. **Five days of lost salon events.** YClients keeps delivering to the edge and every forward fails.
   Bookings, changes and cancellations since 2026-09-23 never reached the bot: no master
   notifications, loyalty, cashback or reminders.
3. **The database is unaccounted for.** It lived only on that machine. Whether it survives depends on
   whether the instance was stopped (data intact) or deleted (gone unless a snapshot exists).

## Owner actions

| # | Action | Why it is yours |
|---|---|---|
| **O-1** | In the cloud console or with an authenticated CLI: list instances, then the instance's disks and any snapshots. This single answer decides everything else. | No cloud credential exists on the work machine — only an SSH key for the host's account. |
| **O-2 — today** | Repoint the salon-bot DNS record away from the lost address (remove it, or park it on the hosting address). | Consequence 1. It is a DNS change in your panel, and it ends the exposure without touching the pinned edge files. |
| **O-3** | Rotate the webhook secret when the bot returns. | It has travelled in query strings toward an address outside our control for five days. |
| **O-4** | If the instance and disks are gone with no snapshot: decide what was lost and what is acceptable to lose. | A 152-FZ and business decision, not an engineering one. |
| **O-5** | Answer Sheet 05 item S5-1. | `deploy.sh` fails closed at the release gate, so even a recovered host cannot receive a release. |
| **O-6** | Decide whether to reserve a static address (billed) and give the backend a real DNS name instead of an address-literal name. | An address-literal name means the TLS identity **is** the address: a change invalidates the certificate as well as the configuration. That is what turned an address change into a five-day outage. |

## If the instance exists and is merely stopped

Starting a paid, existing instance with no architecture or data change is ordinary recovery. The start
action, its rollback (stop returns it to exactly this state; starting changes no disk content) and the
verification sequence are prepared and recorded in the programme folder: instance state and the **new**
address; ownership confirmed from the instance's own record before connecting to anything; backend
health and readiness over loopback on the host; PostgreSQL over its socket, with pending migrations
listed and **not** applied until S5-1 is answered; the release identity compared against this
repository's receipt; both units active; the first successful webhook forward after the DNS repoint;
and the journal read for the Prisma client and column errors that caused the August failures.

**Certificates.** On a new address the address-literal names change, so the existing certificates for
the backend are dead by construction and must be reissued before the relay can complete TLS to it.

## Stale references to the lost address

Live on the hosting account: the relay's upstream constant, the webhook relay's bot endpoint, and the
salon-bot DNS record. In this repository: the relay copy, both staging nginx configurations, both
live-widgets configurations — whose **filenames** carry the address — the deploy script's host, and the
two live verifiers that dial it. None has been changed: they are listed so the repoint is one reviewed
pass rather than a hunt.
