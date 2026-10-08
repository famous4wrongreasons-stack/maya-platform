# Independent own-tasks code / fixture review

Qualified PASS for the reviewed implementation and the completed finite local HTTP/current-React proof on `1483b3342dfaea557b5999fb44f44e4b85edded5`. No blocking defect found. The reviewer independently inspected code, completed artifacts, exact Git/source hashes and two screenshots. No gates, services, browser or SSH were run by this reviewer; only scratch review evidence was written.

All 14 reviewed source hashes below match committed runtime `1483b3342dfaea557b5999fb44f44e4b85edded5`. Original code-review base HEAD was `0bf1488ff25c24f7c6386d2ecdcce73e85705b7a`. Local gates executed dirty bytes at that base; their 11 TS hashes bind those exact bytes to the resulting runtime commit, without claiming a post-commit rerun.

- Canonical reader preserves A23 ownership and authority classification §7.2: current OperationalWorkItem status/dueAt, exact tenant/actor and active membership/User/tenant before reads and before disclosure. Inbox supplies only an existing locator, or null. Historical NULL-linked records remain explicitly unverified/read-only, without backfill or a completion binding. Filters precede the 101-row probe; tenant-local dates and bounded output are consistent.
- Presenter/AiCore composes the direct completed tasks.list result on the server, blocks stale/malformed input, separates unfiltered history, emits no completion action or raw locator, and ends before a final model call. Assistant prose is already excluded from model input. Existing same-key runtime replay is a retained snapshot with its original as_of, not a new source read.
- Fixture setup uses actual authenticated A23 HTTP create/complete; missing projection and stale/archived Inbox divergence are explicitly synthetic. Seven task creations plus two task completions precede the READ baseline. The observed total is 15 setup ActionExecutions, including other fixture setup actions; nine is the task-action subtotal, not the total. Do not describe the entire fixture as mutation-free.
- Finite proof design covers four direct HTTP reads plus five chat reads (one retained initial reply, four UI requests), five exact settled C9 TOOL_READ receipts/completed runs, seven browser checkpoints, fresh UI login, retained-history reload/re-login without chat/C9 redispatch, and 401/403 after membership suspension. Own results exclude a teammate and a foreign tenant. Browser role coverage is tenant owner; current staff/client denial variants remain unit coverage, not this UI run.
- Every scripted model call asserts empty toolResults, only user messages, and absence of all PRIVATE_TASK_FIXTURE body markers. Selection remains synthetic, without real-model normalization/semantic acceptance. Browser uses actual HTTP and current compiled React, not response interception or token seeding.
- READ-phase no-effects checks combine exact ActionExecution/OperationalWorkItem/Inbox snapshot stability, appointment/delivery counts, and the observing Prisma writer recorder. Auth/session/chat/audit/C9 persistence and the explicit fixture membership revocation are outside that business-effects claim.
- Browser admission permits only the exact loopback origin, finite prompts, synthetic email auth, static/history reads and passive widget resolution. Mutations, arbitrary tool injection and external page requests are denied. global fetch is rejected; the launcher adds a Node loopback socket fence and Chrome proxy/host fences. This is bounded local isolation, not an independent packet-level egress audit.
- Owned Chrome/profile/dev server cleanup exists for normal completion, failure, disconnect and SIGTERM; child timeout escalates only its owned child. The outer launcher owns finite process groups and the fresh guarded PostgreSQL cluster. Completed local and browser manifests confirm all owned stage groups closed/absent, successful stages exit 0, and the owned PostgreSQL cluster stopped.

Limits: no process/PG restart claim; no real provider/model, notification delivery, production/site, C10 or broader MAYA acceptance. Date DST, malformed/stale payload and reader revocation-during-read checks are unit scope, not all repeated in browser. Functional acceptance here covers the completed finite local run only. It does not issue broader product acceptance.

Reviewed source SHA-256 at 2026-10-08T08:54:03.435153+00:00:

```json
{
  "maya-saas-backend/test/widgets-live/own-tasks.probe-spec.ts": "abab7bd2ac59dd7c0873a51ea482ffb11cffe33ebb43bd06c5515c97bc8be241",
  "maya-carrier-react/test/own-tasks-browser-probe.mjs": "0485fd6b1904e8c65a74f7385411bc796dfb594a13e4adbb294bcf8b2de02dc9",
  "maya-carrier-react/test/own-tasks-browser-guard.mjs": "cd02d11d7a0d836b3b821d7c8771c1b469db14858d5f17f3f1dd80bb79a4dfc0",
  "maya-carrier-react/test/own-tasks-browser-guard.test.mjs": "865ab0e599f96a4764b857e9dffe4b4e2ddcfc728dbbfc328c132ee508effddf",
  "maya-saas-backend/src/package5-wave1/operational-tasks.read.ts": "93ebdf198a81a418d25eb31300081931f775aae41f8acc2bae7e7d763adb3cc1",
  "maya-saas-backend/src/package5-wave1/operational-tasks.read.spec.ts": "e0d6103fd79cfbdc01d7b6d9842ceeb809a46762c1b51dd55327fe9a6efe94a4",
  "maya-saas-backend/src/package5-wave1/package5-wave1-canonical-cutover.service.ts": "9b9dda93923067621b921cdc232b02fa5084f8d19b017b0b1f80f25d760e5799",
  "maya-saas-backend/src/ai-tools/ai-tool-handler.service.ts": "209fdd59c70b03fdb9dca5b3cf36cda3ba5c7bc0c1766073688c9b30a9fdcd8c",
  "maya-saas-backend/src/ai-tools/ai-tool-handler.service.spec.ts": "48e03a37d4ce6653fa6abe509c63b5e0403647b7d56ff8a01b36bea4732644c8",
  "maya-saas-backend/src/ai-tools/ai-tool-extended-capabilities.spec.ts": "14e54b295d810a93a0c0f9664f53644cda68b027780f10f13d11c333b66716e7",
  "maya-saas-backend/src/ai-tools/own-tasks-presentation.ts": "ba8082213bf2030aee9da1790ca4bac98960be0b95f837ba31f0f16654a24bfc",
  "maya-saas-backend/src/ai-tools/own-tasks-presentation.spec.ts": "fae3cdd01c099b4495c026bb63743c883ca139c16f3060ae48c4ecdc9080b080",
  "maya-saas-backend/src/ai-tools/ai-core.service.ts": "a3cf2b0f237f04b97ae47c5819b6a1bfcefae667370c186cc334d595f28038df",
  "maya-saas-backend/src/ai-tools/ai-core.service.spec.ts": "f60211501d35b8d9b47bcbdc6c3daebe084ee85fe1e3b04a1328bbf37cd32e1f"
}
```

Final artifact review (2026-10-08T09:00:37.027627+00:00):

- `browser-attempt2`: 1850/1850 source hashes equal exact Git blobs at the committed runtime; aggregate source hash matches. `candidateCommit == commitAtEnd`, sourceUnchanged and harnessUnchanged are true. Launcher, supervisor and socket-fence byte hashes match. One Jest test/one suite passes without skips. Seven ordered checkpoints and seven PNGs are present; browser guard blocked/errors arrays are empty.
- `local-attempt3`: 11/11 TS hashes equal the committed runtime. 331/331 tests across six suites pass, zero pending; backend/live/contract types and changed-file lint exit 0. Contract checks are 31/31 PASS with four historical pending prerequisites; K3 is 10/10 PASS. The separate browser-guard log records 5/5 PASS. Source/harness stability and all seven owned groups closed/absent are recorded. Local launcher, fence, supervisor and executed command dependency hashes match.
- HTTP/current React observations: four direct HTTP filters produce canonical counts all=5, active=3, today=2, overdue=2, always with two separately unverified historical records. Five scripted model selections correspond to five settled C9 reads. History/reload and the revoked 401 leave model/C9 counts at five and preserve the READ business snapshot. Provider fetches=0, real model calls=0, unexpected=[]; no total-network measurement is claimed.
- Setup records 15 total ActionExecutions and zero push tokens. The no-business-effect claim begins after setup. The seven A23 creates/two completes are a nine-action subtotal; other fixture setup actions also exist.
- Browser attempt 1 is retained as FAIL before fixture execution: migration launcher inherited repository cwd and could not find Prisma's module. Its owned migration process exited 1, group was absent, and PG stopped. Archived launcher hash matches that attempt. The sole scratch launcher change for attempt 2 is `cwd: command.cwd ?? backend`; runtime/source hash stayed unchanged. This failed attempt is not counted as functional acceptance.
- Screenshot review: `all.png` displays the canonical completed/active tasks and separately qualified history readably. `active.png` contains partial headless paint/clipping. Therefore this is functional DOM/HTTP acceptance with limited pixel evidence, not complete visual/design acceptance. No process/PG restart acceptance is claimed by this run.

Reviewed artifact SHA-256 (paths relative to `/tmp/maya-task-list-20261008`):

```json
{
  "browser-attempt2/manifest.json": "a68e9f53fb70461f97d8c448e6a526b82b9c4e925db866eedb51e2e8e4528f43",
  "browser-attempt2/source-hashes.json": "984927fec736aecfcb01dc9375d40bdb3e18b2f1df4da8d2b96d0e41fd9a4ec9",
  "browser-attempt2/own-tasks-observations.json": "cb761361776c7d478e9624bff934ef0142e6df252ee01185c7ef0e7fd8f19b75",
  "browser-attempt2/browser-jest.json": "6f63563365800f7982646daf78b38dd524eb8f72986a94591286a1d56822453c",
  "browser-attempt2/output/playwright/browser.json": "2a9ba7d2fb55775d0895d6adf2092264a7d58e5bed9e05096dd7e2338546ec06",
  "local-attempt3/report.json": "1cdcbf298164571e17b1c42cf4fccf1dd3e4a4d955fad502a3a7a68a789c233e",
  "local-attempt3/targeted-unit.json": "4c6beebf820ec60f243d75c2586d2be34b855ea18627df1c7164c87a3d8eacbc",
  "local-attempt3/contract-check.log": "4b4dcd3635a38a0dd137894ec21039362f726930d49a98fb954105d63a16fe21",
  "local-attempt3/k3.log": "ac417a602e6a928bfc26d6082fe1bd715f735be5a31d917a44d5895f8ba216f1",
  "browser-guard-test.log": "ed05e3a1b82139687bb3b983813d0d91a7ea29b71f5ee0c3255a72287682d9b2",
  "browser-attempt1/manifest.json": "660fb1270f971ccd09bdf080240136e74cfdb0355c41986e1414c362a4bbfad3",
  "browser-attempt1/migrations.log": "0c36fd124fe1253650ee19dc20d9d986737b9c75c62b5aaef38f76ae8cac6c14",
  "native-proof-attempt1.mjs": "51e545b14699913bd9def2901b70d24b17f70f7799ba13f513f1c763cb7d1a4d",
  "native-proof.mjs": "5733d32c51aa24abc88da7a02f8d9ec6796a5dcabfb3b1f71cefc9a0aa0ff65e",
  "owned-stage.mjs": "619b7c592681951cd06e02c306c273c18c8c14bb693ad0e2eed4a063d777fe04",
  "loopback-only.cjs": "16b5aba6f1080f8d32d19d2059a4e8705a45b707f6b426aa58fcfaebceb951fe",
  "local-gates.mjs": "2bff70b239fcd5ea64746b19e3613e11f1029d7cdb2d4641554934de98a5eda9",
  "independent-artifact-verification.json": "0ca30ea5af9cf4bd737d40f3ba043b3c00083037c55434c9076b58cf57c4eac1",
  "browser-attempt2/output/playwright/active.png": "1fc1a1a5fc37bd57bca7cf59741512441a2e31b59dc2d675b8f14ff437ba124c",
  "browser-attempt2/output/playwright/all.png": "a654e407734783365d9ce9833cc04aae788c485e0ae3a531ce121c08452f263e",
  "browser-attempt2/output/playwright/history.png": "4b5257ffbfc6e8ad98da58d660a9445450c94119ffe35e4bd2f5cfbf4016043d",
  "browser-attempt2/output/playwright/overdue.png": "638d987e3bfed483d436564d924d0792cf2d215ed0026199d3d4e5832c5bee09",
  "browser-attempt2/output/playwright/reload.png": "cacebc6eee98fde7af5a3d05937cd7a94fa15ced44b3e096185d6656057b4c45",
  "browser-attempt2/output/playwright/revoked.png": "2a39419eca95787f4427db0c982ba814a83bff40daaad339b55e22748b25e7ab",
  "browser-attempt2/output/playwright/today.png": "d53c38082fbf2df37ccc868f9db1b2c42b350299baa6bfa60150b52c938d0d46"
}
```
