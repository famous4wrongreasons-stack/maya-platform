# Unified MAYA development candidate: heavy-gate execution plan

**PREPARED, NOT RUN.** Parent accepted `75936a2b612b675e530a9834b2274fad5587ae27`
as the light-qualified integration candidate. The heavy slot remains with parent
until explicitly assigned. This preparation starts no PG, AppModule, browser,
build, generator, aggregate test or provider. Stable website/provider-once work is
outside this lane.

## Exact findings before execution

1. Actual restricted scope: `closed-input.no-handoff@1`, certificate contract
   `maya.widget-release-profile-certificate/2`. The old pin is
   `21ffeb2426d9629e8e9110bbecdbdc7b45c0869e70f9395024e0fa728418a49a`.
2. `widgets/owner-ports/release-access.adapter.ts` hashes general + booking +
   servicePrice. `entitlements/widget-release-profile.contract.spec.ts` hashes
   general + booking. Schedule's dedicated `SCHEDULE_INTENT_TEMPLATE` is absent
   from both complete-registry calculations. The profile tuple/template snapshot
   also lacks the three pricing templates and the schedule template. A pin-only
   change cannot qualify this state.
3. The gate inventory/audit metadata still names V1.3. A fresh V1.4 candidate audit
   must distinguish new measurements from historical evidence. Changing the
   version label on historical green rows is not requalification.
4. **Schedule cannot be admitted to this restricted profile under current V1.4.**
   Contract §2.6.16 SETTINGS.4 and `SettingsDraftBody.editor_handoff_intent` make
   the editor HANDOFF mandatory and never droppable. The real schedule minter
   emits `handoff.settings@1`. The profile forbids HANDOFF, including mixed cards.
   Keep this complete card unavailable under this profile. Dropping the editor,
   reclassifying HANDOFF or allowing a partial card would bypass the contract.
   Admitting it requires a separate owner decision changing that exact obligation,
   or completion/certification of the HANDOFF duties in an appropriate full scope.
   This blocks only **schedule in the restricted profile**, not full-scope synthetic
   development runtime proofs or pricing qualification.
5. Existing pricing/schedule/C9 live suites are separate fixtures. No current file
   proves all four purposes in one persisted HTTP conversation. Existing schedule
   carrier proof is headless, not a mounted React browser acceptance. Pricing's
   opt-in browser harness pins its old database/port/user; do not reopen that lane's
   cluster or claim it is the new combined candidate harness.
6. Backend and React `node_modules` are symlinks to another worktree. Prisma
   generation must use a **private dependency copy**, never write through that link.

## Source preparation required before a frozen qualification SHA

These are proposed changes, **not implemented by this preparation**:

| Area | Required change | Boundary |
| --- | --- | --- |
| Complete registry identity | One closed snapshot of general, booking, service-price and schedule recipes; reuse it in release adapter, profile derivation and contract tests. Include versions/semantics, not only names. | No second routing registry, extensible registration system or caller exclusions. |
| Fixed profile snapshot | Produce a reviewed new `PROFILE_MANIFEST`, tuple snapshot and digest from the whole inventory plus the existing fixed no-HANDOFF restrictions. Add only the three exact approved pricing tuples; explicitly account for the schedule dependency exclusion. | Preserve the old manifest/digest in an immutable evidence record; old certificate/token bindings must refuse. Do not accept both generations through a compatibility wildcard. |
| Profile source files | `entitlements/widget-release-profile.contract.ts`, `widget-release-profile.registry.ts`, `widget-release-profile.contract.spec.ts`, `widgets/owner-ports/release-access.adapter.ts`; add source-completeness and old-certificate negatives to existing access/profile suites. | An explicit reviewed pin change may accompany the new manifest; it is not itself certification. Keep one admission owner, locks, CAS, expiry, emission audit and revoke/regrant rules. |
| Derived V1.4 artifacts | Regenerate fenced modules/tables into a temporary directory using `scripts/widget-contract/README.md`; reconcile generated floor/confirmation/ledgers, exact census and document-hash bindings. Create a fresh candidate gate inventory/audit packet. | Keep V1.3 staff read; exact V1.4 catalogue-price MONEY subtype; ordinary money/marketing STEP_UP; B35; no new denial outcomes or promotion of gaps. Do not rewrite historical annex evidence. |
| Combined HTTP source | Add `test/widgets-live/development-integration.live-spec.ts` using the existing HTTP/auth/PG harness and existing domain owners. Reuse the C5 fixture edge and pricing/schedule synthetic provider boundaries. | Proposed filename, currently absent. No mocks of C9, AE, approval, tenant/auth or release owners. Scripted model is labelled synthetic. |
| Current carrier source | Add an opt-in combined browser entry and runner under existing `test/widgets-live` / `maya-carrier-react/test` ownership. Owned random loopback ports, fresh DB, real React email login/composer/cards/history. | Proposed entry `development-integration.browser-spec.ts`, currently absent; no token injection, mocked responses or external network. Parameterize proof infrastructure, not application authority. |
| Certificate assembly | Add a finite offline assembler/validator for this exact candidate packet if needed; existing `widget-release-operator.cjs` only validates signed commands and does not issue certificates. | Never copy the all-green synthetic certificate from `support/widget-profile-proof.ts`; no signing, grants or production trust changes in this task. |

The approved V1.4 is sufficient for its narrow pricing semantics. No new normative
permission is needed merely to derive artifacts and measure them. Broadening
HANDOFF, changing SETTINGS.4, adding exclusions beyond the fixed two duties,
lowering a floor or adding schema/retention/autonomy requires an exact owner blocker.

## Ordered gate sequence and commands

Execute serially, only after parent assigns the slot. Each attempt gets a fresh
directory, private cluster and explicit final source SHA. Stop on a red gate;
preserve its logs and JSON. Fixes create a new code SHA and invalidate affected
downstream evidence. Do not suppress a test or change policy to obtain green.

### G0 — frozen source and private execution setup

From this integration worktree, set the final reviewed SHA after the preparation
changes above. The baseline `75936a2b` remains immutable. For a baseline diagnostic
run, the missing combined/profile work must remain marked BLOCKED rather than PASS.

```bash
set -euo pipefail
MAYA_GATE_ROOT="$PWD"
: "${MAYA_GATE_SHA:?Set the exact reviewed 40-character candidate SHA}"
: "${MAYA_GATE_PORT:?Parent-assigned free private PostgreSQL port}"
: "${MAYA_GATE_HTTP_PORT:?Parent-assigned free HTTP-smoke port}"
test "$(git rev-parse HEAD)" = "$MAYA_GATE_SHA"
test -z "$(git status --porcelain)"
git merge-base --is-ancestor 75936a2b612b675e530a9834b2274fad5587ae27 HEAD
test ! -e maya-saas-backend/.env
test ! -e maya-saas-backend/.env.local
MAYA_GATE_DIR=$(mktemp -d /tmp/maya-unified-gate.XXXXXX)
MAYA_GATE_PGBIN=/opt/homebrew/opt/postgresql@16/bin
```

Record Node/npm/PG versions, source/tree/lockfile hashes, source worktree states and
ownership receipt before work. Validate both assigned ports are unused; reject PG
5432/55611 and any occupied port, never stop its listener. Do not fake CI variables
to make local database guards accept another database.

Materialize only owned dependency paths before generation. Resolve the existing
symlink target, `rsync -a` (trailing slash on the source; preserve internal `.bin` symlinks) into a new private directory, rename the **owned symlink**
to an evidence-side reference and move the copy into the worktree; verify package
locks and `.prisma` provenance. No install/download or write to the source tree.
If local dependencies are insufficient, stop this step with the exact missing item.

Define this closed-environment launcher in the **backend directory** after the
private dependency copy. Every backend command below runs as `maya_gate <command>`;
only the literal command tails are listed in later blocks. For generation/build,
the widget URL may name the not-yet-created private database (no connection is made).
Set the URL to the appropriate one of the three databases before a live stage.
`MAYA_GATE_EVIDENCE` is unset for ordinary tests and names a fresh directory only
for its intended evidence stage. The launcher itself has not been executed.

```bash
cd "$MAYA_GATE_ROOT/maya-saas-backend"
MAYA_GATE_DATABASE_URL="postgresql://maya_gate@127.0.0.1:$MAYA_GATE_PORT/maya_widget_gate_proof_unified"
maya_gate() {
  env -i PATH="$PATH" HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" \
    MAYA_GATE_DATABASE_URL="$MAYA_GATE_DATABASE_URL" \
    MAYA_GATE_HTTP_PORT="$MAYA_GATE_HTTP_PORT" \
    MAYA_GATE_EVIDENCE="${MAYA_GATE_EVIDENCE:-}" \
    NODE_OPTIONS=--max-old-space-size=3072 \
    node -r ./node_modules/ts-node/register/transpile-only -e '
      const { spawnSync } = require("node:child_process");
      const { WIDGETS_LIVE_TEST_LITERALS } = require("./test/widgets-live/support/environment");
      const url = new URL(process.env.MAYA_GATE_DATABASE_URL);
      if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || !url.port || ["5432", "55611"].includes(url.port)
          || url.username !== "maya_gate" || url.password || url.search || url.hash
          || !["/maya_widget_gate_proof_unified", "/maya_events_proof_unified", "/maya_gates_smoke_unified"].includes(url.pathname))
        throw new Error("Owned proof URL required");
      const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
        NODE_OPTIONS: process.env.NODE_OPTIONS, ...WIDGETS_LIVE_TEST_LITERALS,
        DATABASE_URL: url.href, HTTP_SMOKE_PORT: process.env.MAYA_GATE_HTTP_PORT };
      if (url.pathname.startsWith("/maya_widget_gate_proof_")) env.WIDGET_GATEWAY_PG = "required";
      if (process.env.MAYA_GATE_EVIDENCE) {
        env.WIDGETS_EVIDENCE = "1"; env.WIDGETS_EVIDENCE_DIR = process.env.MAYA_GATE_EVIDENCE;
      }
      const args = process.argv.slice(1);
      const child = spawnSync(args[0], args.slice(1), { env, stdio: "inherit" });
      if (child.error) throw child.error;
      process.exit(child.status ?? 1);
    ' -- "$@"
}
```

### G1 — generated contract reconciliation, type checks and build

Reconciliation is source work before the freeze: use the existing README's complete
temporary-output workflow (`emit.mjs` deletes its output; never point it directly at
`src/widget-contract`). Commit only reviewed deterministic differences. On the
frozen candidate, these are checks:

```bash
cd "$MAYA_GATE_ROOT/maya-saas-backend"
node node_modules/prisma/build/index.js generate
node node_modules/prisma/build/index.js validate
node scripts/widget-contract/build-tables.mjs --check
node scripts/widget-contract/emit-runtime-floor.mjs --check
node scripts/widget-contract/emit-confirmation-guard.mjs --check
node scripts/widget-contract/emit-ledgers.mjs --check
node scripts/widget-contract/emit-f88.mjs --check
node node_modules/typescript/bin/tsc --noEmit --project tsconfig.widget-contract.json --incremental false
node scripts/widget-contract-check.mjs
npm run typecheck
npm run typecheck:scripts
npm run typecheck:widgets-live
npm run lint
node scripts/k3-gateway-check.mjs
npm run build
```

Prisma generation/validate use the launcher and private dependencies above;
generation runs once before TypeScript. The backend build excludes `src/widget-contract`,
so its separate tsc/check above is mandatory. No full-model test is implied.

### G2 — current carrier artifacts, then full census

```bash
cd "$MAYA_GATE_ROOT/maya-chat-shell"
npm run typecheck
npm run self-test
npm test
node build.mjs
cd "$MAYA_GATE_ROOT/maya-carrier-react"
npm run typecheck
npm test
node tools/release.mjs build
node tools/release.mjs verify
npm run test:release
cd "$MAYA_GATE_ROOT/maya-saas-backend"
npm test -- --runInBand --json --outputFile="$MAYA_GATE_DIR/backend-full.json"
npm run test:e2e -- --runInBand
cd "$MAYA_GATE_ROOT"
bash docs/rebuild/evidence/maya-chat-first-ux/run-all-checks.sh
```

Use the sanitized public test literals below for backend tests. The headless shell
artifact must exist before the unfiltered census; it is an integration fixture,
not a replacement for React AChat. `run-all-checks.sh` invokes generator/check
subcommands: retain any resulting diff and stop if tracked source changes. Do not
quietly recertify changed bytes. Native payload parity is checked by the release
owner; no Capacitor sync, Xcode build, install, phone or deploy is in this plan.

### G3 — owned PostgreSQL, schema and event transaction acceptance

Use a fresh private cluster, not either lane's prior proof cluster. Example exact
provisioning after port ownership checks:

```bash
MAYA_GATE_CLUSTER="$MAYA_GATE_DIR/pg"
maya_gate_pg_started=0
trap 'if [ "$maya_gate_pg_started" = 1 ]; then "$MAYA_GATE_PGBIN/pg_ctl" -D "$MAYA_GATE_CLUSTER" -m fast -w -t 30 stop; fi' EXIT
"$MAYA_GATE_PGBIN/initdb" -D "$MAYA_GATE_CLUSTER" --auth=trust --username=maya_gate --encoding=UTF8 --locale=C
"$MAYA_GATE_PGBIN/pg_ctl" -D "$MAYA_GATE_CLUSTER" -w -t 30 -l "$MAYA_GATE_DIR/postgres.log" -o "-h 127.0.0.1 -p $MAYA_GATE_PORT -k ''" start
maya_gate_pg_started=1
for db in maya_widget_gate_proof_unified maya_events_proof_unified maya_gates_smoke_unified; do
  "$MAYA_GATE_PGBIN/createdb" -h 127.0.0.1 -p "$MAYA_GATE_PORT" -U maya_gate "$db"
done
```

Retain the owned data directory/PID in the run receipt; the trap stops only the
cluster started above. Retain its data and logs; never drop/reset an existing DB.
The three database names intentionally satisfy three different existing guards.
The database role is synthetic test infrastructure, not role-hardening evidence.

Every application command starts with an empty environment plus OS process values,
`WIDGETS_LIVE_TEST_LITERALS` from `test/widgets-live/support/environment.ts` and
these explicit per-command fields: local `DATABASE_URL`, `NODE_OPTIONS`, and when
needed `WIDGET_GATEWAY_PG=required`, `WIDGETS_EVIDENCE`, `WIDGETS_EVIDENCE_DIR`,
`HTTP_SMOKE_PORT`. No `.env`, provider keys, externally configured URL, CI disguise,
or inherited application settings. A small launcher may import that existing
literal object and call `spawnSync` with the closed environment; preserve child exit
code. It must not patch the production environment/guards.

For **each** new database, with its exact local URL:

```bash
node node_modules/prisma/build/index.js validate
node node_modules/prisma/build/index.js migrate deploy
node node_modules/prisma/build/index.js migrate status
node node_modules/prisma/build/index.js migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Store migration names/checksums and a
`pg_catalog` inventory of public constraints/indexes/triggers/functions; Prisma's
empty diff does not by itself prove custom SQL constraints. Existing schema specs
plus live immutable-event/C9 tests remain required. No migration is authored here.

With `maya_events_proof_unified`:

```bash
npm run test:events:live -- --runInBand
```

Require the duplicate-event transaction to remain usable, the second event and
mirror update to commit, and the old-implementation counterfactual to fail. With
`maya_gates_smoke_unified` only, seed the declared synthetic fixtures and run:

```bash
npm run prisma:seed
npm run test:http
```

The widget/event databases remain unseeded. `http-smoke` must start its own built
binary (`HTTP_SMOKE_EXTERNAL_SERVER` unset), at the assigned loopback port. Model
fallback uses no provider credentials. This is local HTTP/auth/AE regression,
not real-provider acceptance.

### G4 — combined HTTP/auth/AE/C9 runtime, then complete widget evidence

With `maya_widget_gate_proof_unified`, current React test bundle and fresh evidence
directory, first run the existing focused cohort:

```bash
node ../maya-carrier-react/test/build-harness.mjs
node node_modules/jest/bin/jest.js --config test/jest-widgets-live.json --runInBand --runTestsByPath test/widgets-live/service-price.live-spec.ts test/widgets-live/schedule-chat.live-spec.ts test/widgets-live/c9-chat-reads.live-spec.ts test/widgets-live/conversation-history.live-spec.ts test/widgets-live/business-rules.live-spec.ts
```

Then the **new, currently missing** combined scenario, only after it is implemented,
reviewed and committed into the same frozen SHA:

```bash
test -f test/widgets-live/development-integration.live-spec.ts
node node_modules/jest/bin/jest.js --config test/jest-widgets-live.json --runInBand --runTestsByPath test/widgets-live/development-integration.live-spec.ts
```

One authenticated owner/tenant/branch/conversation must traverse general chat →
explicit Occupancy → pricing preview/confirmation → schedule preview/confirmation
and direct switches from unresolved schedule clarifications. Assert real persisted
turns/approval IDs/hashes, C9 run/version/evidence, tenant/actor/branch boundaries,
current-policy revocation, foreign tenant/client audience denials, stale/expired
and UNKNOWN-no-redispatch outcomes. Occupancy has zero business writes. Price and
schedule each dispatch at most once to the **synthetic** provider after their own
confirmation; no notification/delivery rows. Retain counts before and after each
request, not only a successful HTTP status. No blanket zero-mutation assertion for
the intentionally confirmed synthetic price/schedule changes.

Full-scope fixture grants remain explicitly synthetic controls. A restricted-profile
run additionally requires fresh exact profile evidence and must prove the entire
schedule card unavailable; it cannot substitute a broader synthetic grant.

Run the C9 two-process + PG-restart proof on a new owned cluster, then its actual
React browser mode, serially (these drivers own and stop their own clusters):

```bash
node scripts/c9-occupancy-proof.mjs --run --output="$MAYA_GATE_DIR/c9-restart" --pg-bin="$MAYA_GATE_PGBIN"
node scripts/c9-occupancy-proof.mjs --run --browser --output="$MAYA_GATE_DIR/c9-browser" --pg-bin="$MAYA_GATE_PGBIN"
```

For fresh production-path widget clause evidence, in a separate empty evidence
directory and using the existing evidence writers:

```bash
MAYA_GATE_EVIDENCE="$MAYA_GATE_DIR/widgets-clause-evidence"
mkdir "$MAYA_GATE_EVIDENCE"
npm run test:widgets:live -- --runInBand
npm run test:widgets:http
npm run test:widgets:release-binary
node scripts/widgets-evidence-verify.mjs --dir "$MAYA_GATE_EVIDENCE"
```

Do not merge the synthetic combined scenario into L/L-T clause claims: the verifier
forbids model stubs/owner replacement for those claims. Diagnostic runtime proof
and release-clause proof are distinct outputs. HTTP/BIN claims need independent
processes, real production mint lineage and DB sidecars. Empty verified manifests
are not sufficient evidence.

### G5 — current mounted React combined proof

The new opt-in browser harness/runner is a source-preparation blocker, not an
existing ready command. Once implemented at the frozen SHA, its explicit entry is:

```bash
test -f test/widgets-live/development-integration.browser-spec.ts
node node_modules/jest/bin/jest.js --config test/jest-widgets-live.json --runInBand --testRegex='widgets-live/development-integration[.]browser-spec[.]ts$' --runTestsByPath test/widgets-live/development-integration.browser-spec.ts
```

That entry must perform the full browser assertions and cleanup, not merely wait
for STOP. Prove visible email login, one coherent Occupancy answer, price confirm
and reject/detail, schedule confirmation under admissible full scope, restricted
profile denial, history/relogin, offline/retry identity, late UNKNOWN observation,
and revoked actor UI. Bind screenshots/DOM/network/counts to the actual current
React web hashes. Price/schedule outcomes must reflect canonical owner receipts.
The mandatory schedule editor fallback remains intact. Inspect screenshots after
execution. Browser and Node egress allow only owned loopback endpoints; fixture
mail/model/provider edges are labelled synthetic. No real OTP/model/YCLIENTS calls.

### G6 — fresh profile evidence/certificate assembly

Run complete declared mutation batteries only after green baseline gates and a
separately reserved long enough slot. A focused PI battery is diagnostic, not full
certification. Preserve the existing per-mutant steps and controls:

```bash
node scripts/widgets-mutation-ci.mjs plan
# For each declared gate/partition printed above, run sequentially:
node scripts/widgets-mutation-battery.mjs --gate "$gate" --partition "$partition" --out "$MAYA_GATE_DIR/mutation-parts/widgets-mutation-part-$slot.json"
# Omit --partition entirely for unpartitioned gates; do not add test/step filters.
node scripts/widgets-mutation-ci.mjs release "$MAYA_GATE_DIR/mutation-parts" "$MAYA_GATE_DIR/mutation-complete" "$MAYA_GATE_SHA"
```

The mutation `release` entry checks the complete corpus plus contract/dossier gates;
`assemble` with a subset is not a release certificate. Existing audit builders have
historical fixed overlays/headline expectations; they do not issue a new certificate
for arbitrary V1.4 evidence. Use a reviewed candidate-specific assembly path that
retains the original validators and exact 165-duty denominator. Do not weaken the
verifier or reclassify a failed source proof to U merely to close the matrix.

Fresh packet requirements:

- Exact source SHA/tree, contract V1.4 hash, lockfiles/toolchain and output-file
  digests; build digest must be recomputed by the existing `WidgetReleasePolicy`
  byte-hashing owner, carrier digest from current payload files.
- Whole registry identity, reviewed allowed tuples/templates/successors, explicit
  schedule dependency exclusion, new profile digest, archived old manifest/digest.
- All 165 clause IDs; exactly G6-6/G13-R8 remain STOP. All other 163 require their
  legitimate L/L-T/U evidence, with complete U basis/absence/refusal/mechanism.
  Global matrix digest, isolation/dependency proof digests and fresh FBE2E,
  revocation, HTTP/BIN/mutation receipts; no inherited “green” relabelled as fresh.
- Certificate payload uses the current strict profile schema and binds candidate,
  build, carrier, registry, evidence, integration, FBE2E and revocation digests plus
  issuedAt/expiresAt. Missing duty/evidence leaves status INCOMPLETE; no fabricated
  `CERTIFIED_FOR_PROFILE` payload. A completed unsigned payload is an offline
  qualification artifact, not signed authority or an entitlement grant.
- Old certificate/digest/token refusal, unknown future row refusal, mixed HANDOFF
  refusal, grant-generation binding, revoke/regrant and cached projection negatives.

No signing-key generation, trust changes, release grant, remote run/push or deployment
is part of the sequence. Any later authorized signing/grant is a separate action
through the existing owner. No background C10 authority is derived from these gates.

## Current stop points

- EXECUTION: waiting for parent heavy-slot assignment; **nothing above was run**.
- SOURCE: combined HTTP/browser scenario and complete registry/profile/artifact
  reconciliation must be prepared and committed before the final qualifying run.
- NORMATIVE: schedule's mandatory HANDOFF blocks its inclusion in the restricted
  profile under V1.4. Keep it unavailable and continue permitted work; no pin or
  certificate can waive SETTINGS.4.
- CERTIFICATE: full fresh applicable clause/mutation/FBE2E/isolation evidence and
  exact manifest are required; light integration evidence alone cannot issue it.
