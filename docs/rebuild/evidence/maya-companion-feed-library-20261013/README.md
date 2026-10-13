# Companion Feed / Library — fresh scoped evidence

Product candidate: `ccd38792e3772f65165a9b2f0a7706e1151b145d`.
Branch: `codex/maya-local-crm-setup-20261010`.
Predecessor: `1c2e03084dfdb08539bb039bce6329cf6365230c`.
[Scope, owners, implementation and remaining work](../../MAYA-COMPANION-FEED-LIBRARY-CHECKPOINT-20261013.md).

All tests ran after the product commit, on a clean unchanged HEAD and scrubbed
Node 22.23.3 environment. This archive is a later documentation-only commit.
[Machine summary and exact commands](receipts/summary.json).
The `sha256` entries in that original summary identify original local logs.
[Archive manifest](artifact-manifest.json) identifies both original and repository
hashes: text logs only have trailing line whitespace removed for Git hygiene.
Original files were not modified. No output content was redacted or omitted
from the retained text receipts. All data in the new browser screens is synthetic.

| Fresh surface | Result |
| --- | --- |
| Runtime full suite | 785 PASS / 7 SKIP / 0 FAIL |
| Carrier full suite | 175 PASS |
| Actual Nest/source contract suites with synthetic Prisma | 53 PASS |
| Feed/library mutation programme | green baseline, 13/13 planted defects killed |
| Tasks regression mutations | green baseline, 9/9 killed |
| Runtime ratchets | 68 refuse, 24 admit; 31 coverage; 2 write guard; 51 PWA; 8 bypass probes |
| Carrier ratchets | 72 refuse, 45 admit |
| Emitted browser regressions | chat 35 + tasks 32 PASS |
| Emitted feed/library browser | 52 PASS |
| Packaging tests | 18 PASS |
| Reproducibility and independent PWA/Capacitor parity | PASS |

The new runtime suite also carries seven negative build probes for report suffix,
prefix, UUID guard, encoding, immutable parameter, forbidden Inbox literal and
Inbox mutation suffix. The previous privacy-path proofs remain active. The mutation
harness copies sources to temporary directories and checks named failing tests;
it never mutates the working source. The path-gate test is deliberately a separate
runtime/build proof, not counted in the 13 behavioural mutations.

HTTP proof uses current JWT/session/tenant/role guards, controller methods,
InboxService, OwnerReportStore authorization and real encrypted-plan validation
with artificial credentials and mocked Prisma reads. It proves exact query
predicates and refusal paths, not a real-PostgreSQL or live-provider journey.
Browser proof uses actual emitted React/runtime over synthetic loopback HTTP.
No model/network provider calls or retained owner data were used.

Browser scenarios cover lazy finite GETs, exact snapshot selection, plain escaped
text, dropped payload/deep-link data, no notification acknowledgement, local
filter/sort/layout, list/detail/back, long-list scroll return, empty versus denied
states, malformed/substituted replies, cap disclosures, close/late result,
privacy navigation, chat draft/focus/history preservation and unchanged tasks.
All browser reports have zero external requests, unexpected API paths, CSP
violations and JS errors. Widths: 320/393/427/1280; enlarged report text also
checked. This is not a full OS Dynamic Type/screen-reader or iOS-device audit.

[Feed at 393px](screens/feed-393.png), [feed at 320px](screens/feed-320.png),
[library list](screens/library-list-393.png), [library grid](screens/library-grid-393.png),
[report](screens/report-393.png), [enlarged report text](screens/report-large-text.png).
Visual inspection covered these layouts in the development/final outputs. The
archive manifest retains every fresh browser artifact hash; repeated chat/tasks
regression screenshots remain local with their exact source paths and rerunnable
harness, while all three fresh browser receipts are committed.

[Git boundary proof](receipts/git-boundary.json): backend product, Prisma/iOS
sources, WidgetContract and route registry unchanged. Only one new backend test.
No production, DB, Keychain, grant, provider, OTP, booking, message, deployment,
iPhone installation, push or merge operation occurred.

This is a development checkpoint. Seven runtime tests requiring a separate local
API fixture remain SKIP. Full Platform CI, complete release mutation corpus and
live FBE2E were not run or claimed. No release certificate is issued or inherited.

Development findings: the historical blanket Inbox literal ban required a narrow
exception at the current-user read path, with old producer/write paths still
refused. The exact privacy path ratchet was extended to one UUID report snapshot
path; the prior privacy counterfactual anchors were updated and rerun. The first
mutation-runner name filter did not skip the separately rooted build test in its
temporary copy; using the explicit test skip option fixed that harness setup.
All final receipts use the committed corrected harness with a green baseline.
