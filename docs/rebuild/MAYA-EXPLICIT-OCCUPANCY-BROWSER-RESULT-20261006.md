# Explicit owner Occupancy — executed local browser acceptance

**PASS, heavy slot returned.** The actual React carrier → HTTP/AppModule → isolated
PostgreSQL path passed for the exact owner request “Проверь окна после отмен”.
Final code: `2061e4e16efc8fd8ad1c68b54f6eb9219f1ef802`, on the isolated
`codex/maya-explicit-occupancy-20261006` branch. This completes this local browser
acceptance step, not C10, real-model acceptance or live CRM/provider acceptance.

The parent explicitly assigned the slot after pricing released it. The final command,
from `maya-saas-backend/`, was:

```bash
node scripts/c9-occupancy-proof.mjs --run --browser --output=/tmp/maya-c9occ-browser-20261006-attempt4
```

The driver used its own PG 16 database `maya_widget_gate_proof_c9occ_3958d066814d`
on `127.0.0.1:50427`, real Nest HTTP, same-origin local relay and private Chrome.
Chrome was `154.0.8037.98`, desktop viewport 1280×900, with the dark UI visible in
the captured pixels. No existing browser profile or shared PostgreSQL was reused.

## What was observed

| Step | Actual browser/HTTP behavior | Persistence and effect checks |
| --- | --- | --- |
| Explicit request | Debug email start/verify 201 via current UI; chat 201; one complete AVAILABLE answer, 12:00–13:00 Europe/Moscow, bounded alternatives, saved version 1 | One run/revision/settled receipt, native Opportunity/AgentTask evidence and current CRM schedule/availability read pair |
| Reload/relogin | Memory-only session returns to sign-in. Real 60-second email cooldown is honored; UI login succeeds. History 200 restores the answer with the warning that data/availability need rechecking | Original run/version/receipt graph unchanged; no new run or CRM reads |
| Offline | Actual request fails with `net::ERR_INTERNET_DISCONNECTED`; UI displays “Нет связи — повторить” | Still one run; no new CRM reads |
| Reconnect | Existing “Повторить отправку” control retries once with the same failed request ID. Chat 201 renders exactly one new complete answer | Second explicit run with version 1; exactly one additional schedule/availability pair; first graph unchanged |
| Revocation | Fixture membership is suspended. Next chat and auth refresh both return 401; sign-in shows “Сессия завершена — войдите снова”; composer is absent | No additional C9 run or CRM reads |
| Expiry | Separate owner logs in through the same UI. Chat 201 says the opportunity has expired; only “Ничего не делать” | EXPIRED/current=false, empty active source refs, no new CRM reads, saved version/settled receipt |

At all six checkpoints the backend checked appointment/opportunity/task/event
state and recorded application writes. Final report: **modelCalls=0,
businessWrites=0**. Model and unapproved adapter edges throw if reached. Only the
CRM adapter edge is synthetic; auth, C5, C9, timeline, persistence, request retry
and rendering use their real owners. No UI/API response fixture, storage token
seed, clock mock or auth rate-limit reset was used.

Request-stage browser guards only continued or failed requests. Both page guards
reported empty blocked/error lists; only the admitted local HTTP paths were used.
Embedded data images in the network log are local assets, not external requests.
No voice, widget mutation, notification, booking, pricing, model or live provider
action was exercised.

## Durable evidence

- [Final driver manifest](evidence/explicit-occupancy-browser-20261006/attempt4/manifest.json)
- [Backend checkpoint report](evidence/explicit-occupancy-browser-20261006/attempt4/browser.json)
- [Browser observations, DOM snapshots and redacted request audit](evidence/explicit-occupancy-browser-20261006/attempt4/output/playwright/browser.json)
- Screenshots: [available](evidence/explicit-occupancy-browser-20261006/attempt4/output/playwright/available.png), [restored history](evidence/explicit-occupancy-browser-20261006/attempt4/output/playwright/history-after-relogin.png), [offline](evidence/explicit-occupancy-browser-20261006/attempt4/output/playwright/offline.png), [reconnected](evidence/explicit-occupancy-browser-20261006/attempt4/output/playwright/reconnected.png), [revoked](evidence/explicit-occupancy-browser-20261006/attempt4/output/playwright/revoked.png), [expired](evidence/explicit-occupancy-browser-20261006/attempt4/output/playwright/expired.png)
- [Cleanup checks](evidence/explicit-occupancy-browser-20261006/cleanup.json) and [byte inventory](evidence/explicit-occupancy-browser-20261006/inventory.json)

The initial final-run graph is run `55fd2eda-b069-4ae4-8d4c-ce845026dbe0`, revision
`21ee16f3-446e-4978-8b6b-c57f015a5a22`, work receipt
`92b41b07-64a0-476b-8190-012e9cfd322e`. The backend report also records the distinct
reconnect and expired graphs. These are synthetic local identities, not production.

All 57 attempt files are retained byte-for-byte with SHA-256 inventory; no failed
attempt was replaced. Credential-field scan found no access/refresh tokens, passwords
or debug codes in copied logs/JSON. Private PG data and private receipt paths were
not copied. Raw initdb logs retain their original trailing blank line.

## Failures and narrow harness corrections

| Attempt | Result | Finding and response |
| --- | --- | --- |
| 1 | FAIL before login | CDP return-by-value waits returned React DOM objects. Changed only the harness waits to explicit booleans. Actual page/bundle had loaded. |
| 2 | FAIL at offline retry selector | Real offline error and restored history were visible. The retry button's accessible name is “Повторить отправку”; the harness had searched for its shorter visible text. Fixed exact observed selector. |
| 3 | Functional PASS | The history screenshot captured an early paint frame despite complete DOM evidence. Added two real animation-frame waits before screenshots; no UI pixels or data were modified. |
| 4 | PASS | All six steps and original PNGs verified after the capture correction. |

These corrections affect only `maya-carrier-react/test/occupancy-browser-probe.mjs`.
No product code, schema, source registry, policy or environment configuration was
changed in this acceptance turn. Raw earlier evidence remains available under the
matching attempt directories.

## Checks, cleanup and remaining limits

The final real React build passed its source gate, carrier/runtime typecheck
(21 carrier files, 20 runtime modules, 201 contract exports) and eight-file web
payload verification. The dedicated browser suite passed in 78.964 seconds.
Eight pure driver/guard tests, syntax and source diff checks passed. Independent
code/evidence review checked the fixes and final screenshots without launching
another heavy process and reported no blockers.

All four owned clusters report `server stopped`, all four postmaster PID files are
absent, the final backend PID has exited, and the read-only process check found no
Chrome process using this probe's private profile prefix. The parent was notified
that the heavy slot is free before documentation work continued.

This proof is limited to the exact deterministic request, synthetic CRM and this
desktop Chrome run. The earlier [HTTP/PG restart proof](MAYA-EXPLICIT-OCCUPANCY-HTTP-PG-RESULT-20261006.md)
remains the separate evidence for process/PG restart, occupied-window behavior,
dedupe and foreign-tenant rejection. Safari/mobile/device, real provider/model,
receiving-branch integration and aggregate gates were not run here. There is no
new background initiator or autonomy authorization, deployment, push or merge.
