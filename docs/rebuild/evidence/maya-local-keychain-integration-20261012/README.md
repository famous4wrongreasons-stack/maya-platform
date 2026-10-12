# Local two-credential integration — executable checkpoint

Implementation/test candidate: `570d806f812b601534bbbcf0f018ef18719a8177`.
Branch: `codex/maya-local-crm-setup-20261010`.
Baseline: `0a34e04826c83b38c22f4a334e92db2bcddbb67c`.
Documentation commits after this checkpoint do not claim a new release certificate.

This completes the previously prepared local helper/admission/pipe integration.
It is **not a real Keychain enrollment, paid allowance, live history acceptance,
production release, or autonomous model training**. The earlier preparation
[README](../maya-local-keychain-preparation-20261012/README.md) remains historical.

## Implemented path

The existing retained-owner launcher accepts a distinct `macos-keychain` source
only for its two already-defined owner read/history profiles. The existing
source manifest, owner approval, one-use permit/claim, candidate, scope, expiry,
revocation and budget checks remain authoritative. There is no new permit engine
or automatic renewal. A prepared storage reference cannot load credentials.

The source pins owner/reader UID, absolute helper path, executable SHA-256,
code-signature CDHash and the external storage approval reference. Verification
uses `codesign --verify --strict` with an exact identifier/CDHash requirement.
The helper is built and signed ad hoc locally; no private signing key is made.

1. The broker validates and claims the current permit before loading DeepSeek.
2. The verified native helper reads one of two fixed generic-password items.
3. A private inherited fd3 delivers the model key to the existing bounded broker.
4. After broker readiness, the same claimed admission authorizes the partner read.
5. A separate fd4 delivers the partner token to the existing runtime (fd3 remains
   diagnostic IPC). No real token is exported in argv, environment or stdout.
6. A server-bootstrap closure supplies the existing CRM factory. It is not a DTO,
   tenant setting, HTTP route, persisted authority or alternative CRM adapter.
   The old default environment path is unchanged. An installed reader refuses
   replacement and does not fall back to environment when empty/revoked.
7. Cancellation/expiry/refusal stops the owned processes; buffers are cleared and
   owned string references released. JavaScript/Swift do not promise secure
   erasure of every internal string copy.

The small product seam is in `CrmAdapterFactory` and `YclientsCRMAdapter` only:
optional server-owned credential injection. Booking, identity, Action Engine,
roles, database schema, widgets, carrier and design were not changed.

## Actual results

Fresh checks on the implementation candidate above:

| Surface | Result |
|---|---|
| Local Node tests, admission, budgets, source binding, lifecycle, helper | 480 PASS / 0 FAIL / 0 SKIP |
| CRM factory + YCLIENTS adapter Jest suites | 132 PASS / 0 FAIL |
| Backend build and React web build | PASS in isolated AppModule proof |
| Backend typecheck (`tsconfig.build.json`) | PASS |
| Scoped ESLint for three changed product/test TS files | PASS |
| Native memory/helper/admission/broker/launcher/compiled factory | 9 integration checks PASS |
| Actual AppModule + new synthetic PostgreSQL + HTTP login | 4 checks PASS; child and PG stopped |
| Native owner-storage build and exact signature verification | PASS, never executed/enrolled |
| Real Keychain open/read/write/delete or ACL verification | NOT PERFORMED |

`integration-proof.json` exercises the actual native helper compiled with memory
storage, existing admission and budget broker, private sockets, actual retained
launcher/process cleanup and the compiled CRM factory. Two fresh one-use runs
need no prompt; reuse and concurrent claims refuse. Revocation, expiry,
not-yet-valid approval and candidate substitution refuse. Provider transports
are synthetic. Fake model calls exercise usage accounting without spending.
Reports/ledgers are checked for accidental fixture-secret output.

`appmodule-proof.json` uses the actual runtime entry and AppModule, not the
synthetic child: a new synthetic tenant, ordinary login and provider-effect route
refusal. Its OS network sandbox allows only its loopback DB and HTTP listener;
provider and model calls are zero. It applies existing migrations only to its
new disposable database, which is then stopped and removed. Retained owner
state, customer records and production are never opened.

Memory tests cover enrollment, duplicate refusal, locked/missing storage,
rollback and deletion. Cross-process fixture reads are compile-time synthetic
values; **they do not prove OS persistence, Keychain ACLs or OS prompt behavior**.
No real key was required or entered during these proofs.

## Separate pre-existing typecheck limitation

The wider `tsconfig.scripts.json` check fails on four TS2339 diagnostics in
`src/conversation-intelligence/reschedule-preference-carry.spec.ts`, lines
142/144 (`appointment`) and 146/148 (`new_employee`), inferred as
`Record<string, string> | {}`. A TypeScript compiler-host comparison with the
changed TS/declaration sources replaced **in memory** by Git baseline `0a34e048`
produced the identical four diagnostics. No checkout/source was reset or edited.
This test file is unchanged by this unit. Do not label that broader check green.

## Trust boundary and remaining step

The intended records are in the owner's explicitly selected local login Keychain:

| Service | Account |
|---|---|
| `ru.mayaos.dev.local-model.deepseek.v1` | `local-owner-501` |
| `ru.mayaos.dev.local-read.yclients-partner.v1` | `local-owner-501` |

Native bundle identifier: `ru.mayaos.local.credentials`. The owner-storage build
is indexed in `native-helper-build.json`; it remains outside Git and uninstalled.
The helper has a native secure two-field enrollment UI and exact-item deletion.
Existing items refuse overwrite. No `/usr/bin/security`, generic Node/Terminal
ACL or arbitrary Keychain search is used. File-based Keychain APIs are available
but deprecated in this SDK; compilation is not evidence of real OS behavior.

As in the existing local launch contract, this trusts the Mac owner's processes.
ACL authenticates the native helper, not every possible same-UID caller. Pipes
and mode 0700 do not establish broker-only OS process identity. No such stronger
claim is made. There is no new platform/release authority.

Real installation/enrollment/ACL proof needs the owner's **specific storage
approval**, described in [OWNER-STORAGE-STEP.md](OWNER-STORAGE-STEP.md). Until then
no keychain is opened, no record or trust is installed and no live run is started.
Saved encrypted YCLIENTS `user_token` is unchanged. Telegram and all production,
platform, OTP and signing credentials are out of scope.

## Reproduction (synthetic only)

From the clean committed backend checkout, run the following with a fresh output
directory and an environment containing no provider credentials:

```sh
node --test scripts/local-*.test.mjs \
  scripts/conversation-qualification/core-conversation-admission.test.mjs \
  scripts/conversation-qualification/core-conversation-broker-usage.test.mjs \
  scripts/conversation-qualification/core-conversation-source.test.mjs \
  scripts/conversation-qualification/core-owner-prepare.test.mjs \
  scripts/conversation-qualification/core-local-terminal-credential.test.mjs
node scripts/local-keychain-integration-proof.mjs /private/tmp/NEW_SYNTHETIC_OUTPUT
node scripts/local-keychain-app-proof.mjs /private/tmp/NEW_SYNTHETIC_APP_OUTPUT
```

The second proof builds current backend/React artifacts and owns a new disposable
PG. Neither proof reads real Keychain records. All external model/provider calls
are refused or replaced by closed synthetic transports. These commands do not
constitute permission for a real storage or paid session.
