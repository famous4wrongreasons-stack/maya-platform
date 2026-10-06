#!/bin/bash
set -euo pipefail
out=/tmp/maya-unified-gate-20261006
pg=/opt/homebrew/opt/postgresql@16/bin
test ! -e "$out/pgdata"
node -e 'const net=require("node:net"); const s=net.createServer(); s.on("error", e=>{console.error(e.code);process.exit(1)});s.listen(57463,"127.0.0.1",()=>s.close());'
mkdir "$out/pgsocket"
"$pg/initdb" -D "$out/pgdata" -U maya_gate --encoding=UTF8 --locale=C --auth=trust > "$out/pg-init.log" 2>&1
"$pg/pg_ctl" -D "$out/pgdata" -l "$out/pg.log" -o "-p 57463 -h 127.0.0.1 -k $out/pgsocket -c shared_buffers=32MB -c max_connections=40" -w start
for database in maya_widget_gate_proof_unified maya_events_proof_unified maya_gates_smoke_unified; do
  "$pg/createdb" -h 127.0.0.1 -p 57463 -U maya_gate "$database"
done
"$pg/psql" -h 127.0.0.1 -p 57463 -U maya_gate -d maya_widget_gate_proof_unified -Atc 'SELECT version(), pg_postmaster_start_time()' > "$out/pg-ownership.txt"
