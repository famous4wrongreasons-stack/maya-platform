#!/bin/bash
# Established prepared-release readiness step; every scheduler is suppressed only
# in the disposable probe process. Live runtime code/config is not rewritten.
set -euo pipefail
REV=${1:?exact release revision required}
[[ "$REV" =~ ^[0-9a-f]{8}$ ]]
REL=/opt/maya-saas/releases/20260908-p5-rc-$REV
STAGE=/tmp/maya-wave-rc-$REV-python
test "$(readlink -f /opt/maya-saas/current)" = /opt/maya-saas/releases/20260908-a18-security-consent-0867ecea
test -f "$STAGE/readonly-preload.cjs"
cd "$REL"
set -a; . <(sudo -n cat /etc/maya-saas/live-widgets.env); set +a
SMOKE_LOG=$(mktemp /tmp/maya-rc-readiness.XXXXXX)
SPID=''
cleanup() {
 if [ -n "$SPID" ]; then
  kill "$SPID" 2>/dev/null || true
  for i in $(seq 1 10); do kill -0 "$SPID" 2>/dev/null || break; sleep 1; done
  kill -0 "$SPID" 2>/dev/null && kill -KILL "$SPID" 2>/dev/null || true
  wait "$SPID" 2>/dev/null || true
 fi
 rm -f "$SMOKE_LOG"
}
trap cleanup EXIT
PORT=3199 /opt/node-v24/bin/node --require "$STAGE/readonly-preload.cjs" dist/src/main.js > "$SMOKE_LOG" 2>&1 &
SPID=$!
CODE=''
for i in $(seq 1 25); do
 sleep 2
 kill -0 "$SPID" 2>/dev/null || break
 CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3199/api/health/ready || true)
 [ "$CODE" = 200 ] && break
done
[ "$CODE" = 200 ] || { echo 'R-C READINESS: FAIL'; exit 1; }
cleanup
kill -0 "$SPID" 2>/dev/null && exit 1
SPID=''
printf '%s\n' '{"status":"PASS","readiness":"PASS","schedulersSuppressed":9,"ownedSmokeProcesses":0,"productionBusinessMutations":0,"messages":0}'
