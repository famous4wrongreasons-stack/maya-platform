# Organic appointment shadow observer

This package passively verifies organic legacy appointment actions against the
canonical Action Engine preview. It does not create, reschedule, or cancel an
appointment and cannot perform a network request.

## Boundaries

- reads only `maya-saas.service` journal entries with the dedicated structured
  observation prefix;
- persists only opaque tenant/target/identity hashes and minimal policy data;
- drops unknown fields before persistence, including accidental raw payloads;
- runs in a private network namespace with only `AF_UNIX` available;
- has no CRM, messaging, campaign, billing, or application imports;
- never enables cutover and never treats attendance as in scope.

The observer persists its journal cursor and SQLite state under
`/var/lib/maya-shadow-observer`, so a process or host restart resumes without
recounting the same journal delivery.

## Install

Copy this directory to the server and run `install.sh` as root. Reinstalling is
additive and keeps the existing observation window.

## Inspect

```bash
systemctl status maya-organic-appointment-shadow-observer.service
cat /var/lib/maya-shadow-observer/summary.json
/usr/bin/python3 /opt/maya-shadow-observer/legacy_appointment_shadow_observer.py \
  --database /var/lib/maya-shadow-observer/observer.sqlite3 \
  --summary /var/lib/maya-shadow-observer/summary.json \
  --unit maya-saas.service --status
```

Per-class verdicts are `EQUIVALENT`, `DIVERGENT`, or
`NOT OBSERVED IN PRODUCTION`. No verdict triggers cutover automatically.
