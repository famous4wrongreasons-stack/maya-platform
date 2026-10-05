# Maya — factual current state, 2026-10-05

This document is a map of existing source, Git provenance and recorded results. It is not a new architecture specification, release authorization or certificate. Created during the development archival task; no product/runtime code was edited or executed against production.

## Evidence labels

- **VERIFIED FROM LOCAL GIT/CODE** — repository objects, branch ancestry, source owners or files inspected during archival.
- **VERIFIED FROM EXECUTED LOCAL RECEIPT** — an existing executed receipt was inspected and its recorded candidate/hash relationships rechecked. This does not mean the test was rerun today by the archive task.
- **REPORTED BY HISTORICAL CHECKPOINT** — a dated report states the result; it is preserved with its scope and limitations.
- **NOT REVERIFIED** — no current execution/read against that environment occurred in this task.
- **NOT DEPLOYED** — the latest candidate's release reports explicitly record no production deployment. Older Maya versions and earlier chapter releases existed; this does not mean production never existed.

## A. Repository and candidate

**VERIFIED FROM LOCAL GIT/CODE**

- Canonical remote: `git@github.com:famous4wrongreasons-stack/maya-platform.git`, [GitHub repository](https://github.com/famous4wrongreasons-stack/maya-platform). The repository is public. Default branch: `main`; unchanged by archival.
- Canonical common Git directory: `/Users/stanislavmosin/Desktop/Projects/maya-platform/.git`. Other same-history clones were identified by remote, root commits and object reachability, not directory names alone.
- Current development/integration line: `codex/maya-controlled-integration-20260930`.
- Latest verified integration candidate: **`dff728e85a97841dd72bd290992b888344780780`**, already exactly on its origin branch at inventory time. It descends from `77ecb3f5696583389e75592141f46fd0664d33d8`, preserving the previous packaging checkpoint and the single-operator changes.
- Latest candidate worktree: `/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/work/maya-controlled-integration`; clean at inventory. This is distinct from the older dirty main physical checkout and from the new documentation-only archive branch.
- Archival branch: `archive/maya-development-20261005`, based on DFF. Its commits preserve documentation and snapshots; they do **not** become new certified product candidates.
- Initial inventory: 69 local branches, 59 actual origin branch heads and 58 registered worktrees; 48 worktree paths existed, but some temporary directories no longer contained a valid Git checkout. The complete per-path record is in [WORKTREE-INVENTORY.json](evidence/archive/2026-09-29_to_2026-10-05/WORKTREE-INVENTORY.json).
- 12 safe local branch names were absent remotely; two local branches were ahead; two had diverged and require archival names. `main` was behind, not merged or rewritten. Full exact SHAs, upstreams, purpose and source worktrees: [BRANCH-INVENTORY.json](evidence/archive/2026-09-29_to_2026-10-05/BRANCH-INVENTORY.json).
- Seven atomic WIP snapshots preserve separate backend/site/carrier/documentation topics. Original dirty trees intentionally remain dirty and untouched; an original dirty tree is not evidence of unpublished work after its safe snapshot is published.

The safety bundle and exclusions are documented in [SAFETY.md](evidence/archive/2026-09-29_to_2026-10-05/SAFETY.md). Publication is verified by exact branch SHA after normal push, never by assuming a successful command means complete preservation.

## B. Product architecture

**VERIFIED FROM LOCAL GIT/CODE**, with chapter acceptance status separately identified below.

| Area | Existing owner/boundary | Evidence location |
|---|---|---|
| Maya OS / multi-tenant platform | Shared platform with tenant isolation, global platform authority separate from tenant roles. A founder's salon is an ordinary tenant. | `maya-saas-backend/src`, chapter closure reports |
| CRM / YCLIENTS | External CRM adapter and reconciliation boundary. Maya interprets authoritative outcomes; UNKNOWN is not success and must not allow blind duplicate retry. | `src/crm`, `src/action-engine`, C2/C3/C6 reports |
| Client Identity | `User`, tenant business membership and personal `Client` are distinct; `CrmClientLink` and verified `ClientChannelLink` episodes preserve exact lineage. No caller-selected Client or phone equality as authority. | Client identity source, SB-1 and JSON V2 archived decisions |
| Action Engine | Canonical capability owner for confirmation, current authority, execution/attempt, receipt and reconciliation; chat/voice/widget surfaces initiate through this owner. | `src/action-engine`; C6 final acceptance |
| Measurement | Source-qualified results, revisions, completeness, monetary basis and attribution; no parallel business writer or invented causality. | C7 final report and measurement source |
| C8 intelligence | Deterministic qualified facts and evaluation architecture; limited-data mode preserves unavailable predictions. | C8 final report |
| Orchestrator / agents | One C9 orchestrator and bounded registered agents; domain surfaces share canonical facts and authority. Historical final gate covers four agents / 32 surfaces, not every possible future agent. | `src/orchestration/c9.*`; C9 final report |
| React AChat | Certified presentation carrier, with runtime ports preserving server-owned contracts. Legacy HTML and older shell history remain archival, not the canonical release payload. | `maya-carrier-react`, `maya-chat-shell`, packaging scripts |
| Widgets | Server-owned envelope, registry, policy, current principal/tenant, receipts and lifecycle. Closed-input scope; HANDOFF remains globally STOP and server-refused in the restricted release. | `src/widgets`, `src/widget-contract`, widget contract/decision sheets |
| Booking widgets | BS-1 personal-client SCHEDULE source; NS-1 journal detail; server appointment handles, availability and existing confirmation/Action Engine ownership. | Approved source decisions and source/carrier probes |
| Voice | Existing voice integration and authority lowering preserved; archival work adds no alternate voice architecture. | Runtime/carrier source and recorded integration receipts |
| PWA / iOS | One React AChat web payload, constrained endpoint substitution and parity; Capacitor packages the same canonical payload. Signed development build evidence is distinct from device installation. | `maya-ios-carrier`, release manifest and packaging/parity receipts |

## C. Chapters

All completion statements in this table are **REPORTED BY HISTORICAL CHECKPOINT**, not new chapter certification by this archival pass.

| Chapter | Recorded state and limits | Source |
|---|---|---|
| C1 | Foundation packages P0–P7 completed; report records an August production release. | [C1 completion](CYCLE-01-COMPLETION.md) |
| C2 | Chapter closure including timezone, Client Identity and canonical CRM boundary work. | [C2 completion](CYCLE-02-CHAPTER-2-COMPLETION.md) |
| C3 | Event ingestion, appointment mirror, reconciliation and source completeness closure. | [C3 completion](CYCLE-03-CHAPTER-3-COMPLETION.md) |
| C4 | UNDERSTAND foundation complete; closure code `399f4aba`, documentation `bd8549dd`. | [C4 final](CYCLE-04-CHAPTER-4-COMPLETION-REPORT.md) |
| C5 | Final adversarial closure follows earlier failing findings; section 19 supersedes the pre-closure verdict. | [C5 final](CYCLE-05-CHAPTER-5-COMPLETION-REPORT.md) |
| C6 | Final acceptance PASS on accepted input `438260714da5d150adfb6f692072defda430d5b7`; canonical Action Engine mutation authority. | [C6 final](CYCLE-06-FINAL-COMPLETION-REPORT.md) |
| C7 | PASS, 22 requirements / 6 packages / 4 waves / 32 surfaces; candidate `4058cd8c`. | [C7 final](CYCLE-07-FINAL-COMPLETION-REPORT.md) |
| C8 | PASS in approved limited-data mode. T01–T08 numeric predictions DISABLED; real-world calibration UNAVAILABLE. Architecture acceptance is not model-quality certification. | [C8 final](CYCLE-08-FINAL-COMPLETION-REPORT.md) |
| C9 | Four waves completed; final historical gate 10/10. Paid model-quality evidence must not be inferred from the offline implementation gate. | [C9 final](CYCLE-09-FINAL-COMPLETION-REPORT.md), [final gate](CYCLE-09-WAVE-4-AND-FINAL-GATE.md) |
| C10 | NOT STARTED in this programme; no autopilot implementation or completion claim is made here. | Current programme boundaries and owner instructions preserved in archive |

## D. Release state

**VERIFIED FROM EXECUTED LOCAL RECEIPT:** [DFF receipt verification](evidence/archive/2026-09-29_to_2026-10-05/LATEST-CANDIDATE-RECEIPT-VERIFICATION.json), original certificate receipt SHA256 `5f4d605a0e26ad8249ade9d6d25b3929835be42d40ab20089e426e40f1e459c0`. Refer to the [latest final report directory](evidence/archive/2026-09-29_to_2026-10-05/artifacts/current/ar1-single-operator-final-20261005/).

- Exact certified candidate: `dff728e85a97841dd72bd290992b888344780780`.
- Profile: `closed-input.no-handoff@1`; 0 profile-applicable false, 2 global false. `G6-6` and `G13-R8` remain STOP; `full165.closed-input` is unchanged and full-contract certification remains NO.
- Single-operator AR-1 preserves separate global authorization, exact candidate/certificate/profile/tenant, CAS, atomic audit, expiry/revoke, no plan/trial bypass and no HANDOFF. One real operator may approve and operate; `independentHumanReview: false` and null reviewer are explicit, with no fabricated reviewer or second self-signature pretending to be independent.
- The first one-tenant grant with duration at most 24h is a launch boundary, not a single-tenant platform model.
- Recorded final results: backend 5712; Widgets Live 443; runtime 424 PASS / 7 SKIP on Node 22/24; carrier 93; legacy Python 613. Mutation catalogue: 545 declarations, 542 applicable kills (359 build + 183 live), 2 declared pending and 1 equivalent. Do not flatten these categories into “545 killed”.
- Six hosted CI receipts pin DFF and success: run IDs `37238710215`, `37238710218`, `37238710222`, `37238710226`, `37238710237`, `37238713168`. These receipts were checked locally; the archive did not rerun GitHub certification.
- NS-1, L27, 9.6, BS-1, self-booking successor, profile isolation/revocation, packaging, migration clean replay, rollback and isolated grant/revoke/expiry are represented by the latest strict receipt set. Sanitized copies in this archive do not replace original receipt bytes for release admission.

**NOT DEPLOYED / NOT REVERIFIED:** no DFF deployment, production migration, trust installation, production authorization issuance or grant occurred in this archival task. The latest release reports record no production operations. A historical read-only preflight reported production release `20260929-recon-fix-eb43bc22` with health/readiness 200; production was not queried again here.

Two previously certified required migrations remain a production execution step according to the latest runbook: `20260929190000_client_link_challenge_json_v2` and `20260930120000_journal_detail_retained_date`. Their dry-run/replay proof is not evidence they were applied in production. No governance migration is inferred.

PWA and Capacitor payload packaging/parity were proven for the candidate. The latest iOS report records a signed development build without installation. Its provisioning validity ends at `2026-10-05T08:16:21Z`; a later installation must recheck signing validity. No installation or signing renewal is performed by this archive.

Actual operator-held private key custody/public trust material and access to a global platform-owner session remain owner/operator execution prerequisites. The agent does not create or retain a production private key. An explicit separate production execution authorization is still required. Therefore this archive does not declare production execution READY.

## E. Remaining work, separated by scope

| Scope | What is still distinct from the archived certification |
|---|---|
| FIRST REAL RELEASE | Real operator trust/custody and global session, current signing validity, separate owner authorization, backup/rollback preflight, approved production migrations and exact-byte deploy, narrow tenant grant, device installation and safe acceptance. A separate explicit approval is required before real SMS verification or YCLIENTS create/reschedule/cancel, followed by exactly-one-booking checks. None performed here. |
| FULL MAYA PRODUCT | Restricted profile certification covers its approved closed-input scope, not the full global contract. HANDOFF remains blocked pending its destination-owner authority contract. |
| C10 / AUTOPILOT | Not started or authorized by this archival task; no claim of autonomous full product completion. |
| ADDITIONAL AGENTS | Existing C9 agents do not imply all future agents are implemented or accepted; new scope requires its own contract and evidence. |
| MESSAGING / CAMPAIGNS | Existing communication owners and historical work are preserved. Full campaign product readiness is NOT REVERIFIED or certified by the restricted widget profile. |
| WEBSITE | `maya-os-site`, historical site/app assets and local community/publication work inside this repository are preserved as separate archival topics. Unmerged site work is not the React AChat release or a site deploy. Independent salon website repositories are listed separately, not silently merged. |
| MULTI-TENANT SCALE VALIDATION | Tenant isolation and cross-tenant refusal proofs do not establish real multi-salon load, operational rollout or every future tenant integration. |
| DESIGN POLISH | No design change or new polish claim; presentation remains as its candidate and historical branches define it. |
| HISTORICAL PRIVACY | Existing origin report contains a real owner's email. It is disclosed without reproducing the value; remediation of published history requires a separate owner decision. New archive copies redact identifiers. |

## F. Interpretation warning

**CERTIFIED != DEPLOYED**

**DEPLOYED != USER ACCEPTED**

**CHAPTER COMPLETE != FULL PRODUCT COMPLETE**

The archive preserves both successful and unsuccessful stages and their provenance. It neither upgrades an old checkpoint to a fresh certificate nor makes an archival branch a production candidate.
