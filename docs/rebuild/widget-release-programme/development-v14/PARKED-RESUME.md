# Parked qualification — 2026-10-06

**PARKED by parent instruction.** Website and booking release have priority.
Do not run the commands below until parent resumes this lane after the site
critical path or assigns a separate free resource. There is no scheduled or
background continuation. This defers qualification without weakening its gates.

Preserved checkpoint: `5ad28970e43d6088d4ec07bfb07112d709cb5069`.
Preparation evidence was measured at `3a93408f202006c3b8699b9ab043bfa61f00152b`;
its [manifest](../../evidence/maya-development-integration-20261006/v14-preparation/manifest.json)
and all historical evidence retain their original bytes and pins. Parking adds
documentation and an exact copy of the existing local launcher only.

Certificate remains `NOT_ISSUED`: 163 applicable duties unqualified, two HANDOFF
STOP. Schedule editor stays closed. The [FK choice](../../MAYA-PUBLIC-BOOKING-FK-CHOICE-20261006.md)
awaits a separate owner decision. Do not edit schema, author/apply migrations,
change retention, sign/grant certificates, or derive C10 background authority.

## Resources and retained local state

- One exclusive heavy slot; all commands and all 68 mutation jobs run serially.
  Jest uses one worker, recycled at 768 MB idle heap. The closed launcher sets a
  3 GiB Node heap ceiling per process; controller, worker, local HTTP child and PG
  can coexist. Plan for 8–12 GiB free RAM, not merely the 768 MB worker threshold.
- Budget tens of hours for the full 545-mutant corpus. Prior unrestricted backend
  census took about 334 s and HTTP suites about 114 s; each mutant repeats its
  full declared steps plus required controls. This is an estimate, not a measured
  complete run. Do not overlap with main's website or booking work.
- Reserve at least 10 GiB disk headroom for one disposable mirror, Jest cache,
  build products and receipts; this is a planning allowance, not a measured peak.
  Keep the machine awake only under the operator's own resource arrangement.
- Existing owned PG16 data: `/tmp/maya-unified-gate-20261006/pgdata`; socket:
  `/tmp/maya-unified-gate-20261006/pgsocket`; loopback port `57463`; synthetic user
  `maya_gate`; database `maya_widget_gate_proof_unified`. At parking, PG_VERSION
  is 16 and `postmaster.pid` is absent. No service was started for parking.
- BIN proof also needs free loopback port `3121`; HTTP smoke reserves `57464`.
  Never stop an unrelated listener. Missing cluster/dependencies or an occupied
  port requires a new local setup decision; do not reset, migrate or repoint a DB.
- Private backend dependencies already exist in this worktree. Never generate
  through another worktree's `node_modules` symlink. No install, provider/model
  credential, external network, browser, phone or deployment is needed here.

`parked-local-launch.cjs` is byte-identical to the previously used
`/tmp/maya-unified-gate-20261006/launch.cjs`, SHA-256
`e1700a645aa03148a6734f622d1aad2306df0376b6ee5eacb79cea0ed6148a33`.
It fixes the owned local URL, scrubs the child environment to public test literals
and preserves the child exit status. It is intentionally tied to this Mac/worktree.

## Exact future resume sequence

These are **saved commands, not executed qualification**. Run in one Bash session
only after the resource assignment. Every failure stops the sequence and retains
its logs. No automatic retries, reduced suites, migration or certificate issuance.

```bash
set -euo pipefail
cd /Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration
MAYA_RESUME_ROOT="$PWD"
MAYA_RESUME_SHA=$(git rev-parse HEAD)
test -z "$(git status --porcelain)"
git merge-base --is-ancestor 5ad28970e43d6088d4ec07bfb07112d709cb5069 HEAD
git diff --exit-code 5ad28970e43d6088d4ec07bfb07112d709cb5069 -- maya-saas-backend maya-chat-shell maya-carrier-react docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md docs/rebuild/evidence/maya-chat-first-ux/gate-clause-inventory.json docs/rebuild/evidence/maya-chat-first-ux/gate-conformance-audit.json
test ! -e maya-saas-backend/.env
test ! -e maya-saas-backend/.env.local
test -d maya-saas-backend/node_modules
test ! -L maya-saas-backend/node_modules
MAYA_RESUME_PG=/opt/homebrew/opt/postgresql@16/bin
MAYA_RESUME_CLUSTER=/tmp/maya-unified-gate-20261006/pgdata
MAYA_RESUME_SOCKET=/tmp/maya-unified-gate-20261006/pgsocket
test "$(cat "$MAYA_RESUME_CLUSTER/PG_VERSION")" = 16
test ! -e "$MAYA_RESUME_CLUSTER/postmaster.pid"
test -d "$MAYA_RESUME_SOCKET"
for port in 57463 3121 57464; do
  if /usr/sbin/lsof -nP -iTCP:"$port" -sTCP:LISTEN; then exit 1; fi
done
MAYA_RESUME_OUT=$(mktemp -d /tmp/maya-v14-resume.XXXXXX)
printf '%s\n' "$MAYA_RESUME_SHA" > "$MAYA_RESUME_OUT/source-head.txt"
MAYA_RESUME_LAUNCH="$MAYA_RESUME_ROOT/docs/rebuild/widget-release-programme/development-v14/parked-local-launch.cjs"
shasum -a 256 "$MAYA_RESUME_LAUNCH" > "$MAYA_RESUME_OUT/launcher.sha256"
test "$(shasum -a 256 "$MAYA_RESUME_LAUNCH" | cut -d ' ' -f 1)" = e1700a645aa03148a6734f622d1aad2306df0376b6ee5eacb79cea0ed6148a33
maya_resume_pg_started=0
trap 'if [ "$maya_resume_pg_started" = 1 ]; then "$MAYA_RESUME_PG/pg_ctl" -D "$MAYA_RESUME_CLUSTER" -m fast -w -t 30 stop; fi' EXIT
"$MAYA_RESUME_PG/pg_ctl" -D "$MAYA_RESUME_CLUSTER" -w -t 30 -l "$MAYA_RESUME_OUT/postgres.log" -o "-h 127.0.0.1 -p 57463 -k $MAYA_RESUME_SOCKET -c shared_buffers=32MB -c max_connections=40" start
maya_resume_pg_started=1
"$MAYA_RESUME_PG/psql" -h 127.0.0.1 -p 57463 -U maya_gate -d maya_widget_gate_proof_unified -v ON_ERROR_STOP=1 -Atc 'SELECT current_database(), pg_postmaster_start_time()' > "$MAYA_RESUME_OUT/pg-ownership.txt"
cd "$MAYA_RESUME_ROOT/maya-saas-backend"
export MAYA_GATE_DATABASE_URL=postgresql://maya_gate@127.0.0.1:57463/maya_widget_gate_proof_unified
unset MAYA_GATE_LARGE_HEAP WIDGETS_EVIDENCE WIDGETS_EVIDENCE_DIR JEST_COMBINED_BROWSER_OUTPUT
gate() { local name="$1"; shift; node "$MAYA_RESUME_LAUNCH" "$@" > "$MAYA_RESUME_OUT/$name.log" 2>&1; }
gate shell-artifact node ../maya-chat-shell/build.mjs
gate types npm run typecheck
gate script-types npm run typecheck:scripts
gate live-types npm run typecheck:widgets-live
gate lint npm run lint
gate contract-types node node_modules/typescript/bin/tsc --noEmit --project tsconfig.widget-contract.json --incremental false
gate contract node scripts/widget-contract-check.mjs
gate k3 node scripts/k3-gateway-check.mjs
gate build npm run build
gate full-unit node node_modules/jest/bin/jest.js --maxWorkers=1 --workerIdleMemoryLimit=768MB --json --outputFile="$MAYA_RESUME_OUT/full-unit.json"
mkdir "$MAYA_RESUME_OUT/clauses"
export WIDGETS_EVIDENCE=1 WIDGETS_EVIDENCE_DIR="$MAYA_RESUME_OUT/clauses"
gate full-live node node_modules/jest/bin/jest.js --config test/jest-widgets-live.json --maxWorkers=1 --workerIdleMemoryLimit=768MB --json --outputFile="$MAYA_RESUME_OUT/full-live.json"
gate full-bin npm run test:widgets:http
gate release-binary npm run test:widgets:release-binary
unset WIDGETS_EVIDENCE WIDGETS_EVIDENCE_DIR
gate evidence node scripts/widgets-evidence-verify.mjs --dir "$MAYA_RESUME_OUT/clauses"
test -z "$(git status --porcelain)"
test "$(git rev-parse HEAD)" = "$MAYA_RESUME_SHA"
mkdir "$MAYA_RESUME_OUT/mutation-parts"
node --input-type=module -e 'import {registry,plan} from "./scripts/widgets-mutation-ci.mjs"; for (const j of plan(registry("test/widgets-live/mutations")).matrix.include) console.log([j.gate,j.partition,j.slot].join("|"));' > "$MAYA_RESUME_OUT/jobs.txt"
test "$(wc -l < "$MAYA_RESUME_OUT/jobs.txt" | tr -d ' ')" = 68
while IFS='|' read -r gate_id partition slot; do
  test -z "$(git status --porcelain)"
  test "$(git rev-parse HEAD)" = "$MAYA_RESUME_SHA"
  args=(node scripts/widgets-mutation-battery.mjs --gate "$gate_id")
  if [[ -n "$partition" ]]; then args+=(--partition "$partition"); fi
  args+=(--out "$MAYA_RESUME_OUT/mutation-parts/widgets-mutation-part-$slot.json")
  gate "mutation-$slot" "${args[@]}"
done < "$MAYA_RESUME_OUT/jobs.txt"
gate mutation-release node scripts/widgets-mutation-ci.mjs release "$MAYA_RESUME_OUT/mutation-parts" "$MAYA_RESUME_OUT/mutation-complete" "$MAYA_RESUME_SHA"
"$MAYA_RESUME_PG/pg_ctl" -D "$MAYA_RESUME_CLUSTER" -m fast -w -t 30 stop
maya_resume_pg_started=0
```

The final command admits complete mutation receipts; it does not issue a profile
certificate or prove all V1.4 clauses. F32a approval evidence gaps remain explicit.
No synthetic model fixture may be relabelled as L/L-T or real-model acceptance.
On interruption, retain receipts and wait for all children to exit. Reuse a finished
part only after exact HEAD, battery hash, controls and completeness validation;
partial JSON or historical receipts never count. Source fixes require a new frozen
candidate and fresh affected evidence. Do not force the outstanding FK diff green.
