#!/bin/bash
set -euo pipefail
out=/tmp/maya-unified-gate-20261006
node "$out/launch.cjs" node node_modules/prisma/build/index.js migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > "$out/schema-drift-exact.sql" 2>&1
for database in maya_events_proof_unified maya_gates_smoke_unified; do
 export MAYA_GATE_DATABASE_URL="postgresql://maya_gate@127.0.0.1:57463/$database"
 node "$out/launch.cjs" node node_modules/prisma/build/index.js migrate deploy > "$out/$database-migrate.log" 2>&1
 node "$out/launch.cjs" node node_modules/prisma/build/index.js migrate status > "$out/$database-status.log" 2>&1
done
/opt/homebrew/opt/postgresql@16/bin/psql -h 127.0.0.1 -p 57463 -U maya_gate -d maya_widget_gate_proof_unified -Atc "SELECT n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY 1,2,3" > "$out/schema-triggers.txt"
/opt/homebrew/opt/postgresql@16/bin/psql -h 127.0.0.1 -p 57463 -U maya_gate -d maya_widget_gate_proof_unified -Atc "SELECT c.relname,t.conname,pg_get_constraintdef(t.oid) FROM pg_constraint t JOIN pg_class c ON c.oid=t.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY 1,2" > "$out/schema-constraints.txt"
MAYA_GATE_DATABASE_URL=postgresql://maya_gate@127.0.0.1:57463/maya_events_proof_unified node "$out/launch.cjs" npm run test:events:live -- --json --outputFile="$out/events.json" > "$out/events.log" 2>&1
