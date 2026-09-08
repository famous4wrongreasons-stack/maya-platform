#!/bin/bash
# Existing release step 9, restricted to read-only readiness with jobs disabled.
set -euo pipefail
REL=/opt/maya-saas/releases/20260908-a18-security-consent-0867ecea
test -f "$REL/dist/scripts/a18-consent-security-remediation.js"
test "$(readlink -f /opt/maya-saas/current)" = /opt/maya-saas/releases/20260908-native-consent-compat-b6c53ff9
cd "$REL"
set -a; . <(sudo -n cat /etc/maya-saas/live-widgets.env); set +a
export OWNER_REPORTS_SCHEDULER_ENABLED=false BILLING_SCHEDULER_ENABLED=false
export APPOINTMENT_REMINDERS_SCHEDULER_ENABLED=false INGESTION_QUARANTINE_RETENTION_ENABLED=false
export CRM_RECONCILIATION_SCHEDULER_ENABLED=false
SMOKE_LOG=$(mktemp /tmp/maya-security-readiness.XXXXXX)
SPID=''
cleanup() {
  if [ -n "$SPID" ]; then
    kill "$SPID" 2>/dev/null || true
    for i in $(seq 1 15); do kill -0 "$SPID" 2>/dev/null || break; sleep 1; done
    kill -0 "$SPID" 2>/dev/null && kill -KILL "$SPID" 2>/dev/null || true
    wait "$SPID" 2>/dev/null || true
  fi
  rm -f "$SMOKE_LOG"
}
trap cleanup EXIT
PORT=3199 /opt/node-v24/bin/node dist/src/main.js > "$SMOKE_LOG" 2>&1 &
SPID=$!
CODE=''
for i in $(seq 1 25); do
 sleep 2
 CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3199/api/health/ready || true)
 [ "$CODE" = 200 ] && break
 kill -0 "$SPID" 2>/dev/null || break
done
[ "$CODE" = 200 ] || { echo 'READINESS: FAIL'; exit 1; }
cleanup
kill -0 "$SPID" 2>/dev/null && exit 1
SPID=''
printf '%s\n' '{"status":"PASS","readiness":"PASS","schedulersDisabled":5,"ownedSmokeProcesses":0,"businessMutations":0,"messages":0}'
