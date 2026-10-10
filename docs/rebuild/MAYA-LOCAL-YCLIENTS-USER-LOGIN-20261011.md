# Local YCLIENTS user login — 2026-10-11

This is a local connection checkpoint, not production release or real-provider acceptance.
Base: `4c8aecec45f3bd6148814ff33ea6b5766a6d6412`, existing branch
`codex/maya-local-crm-setup-20261010`. No other checkout or parallel implementation.

## Observed owner attempt

The fresh retained session recorded two company-list HTTP 200 / connect HTTP 400
`crm_company_not_found` outcomes. The owner confirmed entering a **partner** token
in the **user** token field. The first company selection was the partner account
number; the actual salon company was verified separately in the owner's existing
YCLIENTS tab. No successful valid-user-token attempt has occurred. The older
checkpoint's missing diagnostic code remains historical UNKNOWN, not rewritten.
Owner DB integration and Action Engine counts were zero. The owned session was
stopped with its existing database and keys preserved. No customer data is archived here.

The owner expressly approved one-time login/password authorization to the official
YCLIENTS API, in addition to the already-authorized company/service/team reads.
Passwords and tokens must never be requested in chat.

## Narrow implementation

- Existing React setup offers token-user mode or **Войти в YCLIENTS**. Login/password
  exist in active DOM refs and transient request material, never React view state,
  URL recovery identity or storage. Submit, switch, close/load/signout and unmount
  clear the fields. Activation/import retain their separate explicit consent.
- Existing qualified `POST /integrations/crm/connect` accepts exactly one credential
  source. Production/default profile refuse the new login source. It requires
  development + `read_setup_v1` + explicit `owner_login_v1` session opt-in.
- Existing A17 owner rereads current tenant membership, owned branch, expected
  configuration version and existing imported-identity fence before auth. It then
  executes one exact `POST https://api.yclients.com/api/v1/auth`, partner-only header,
  redirects refused, bounded time/body, no retry and closed error codes.
- Only `data.user_token` lowers to existing encryption/fingerprint/preview/A17.
  No new credential table, endpoint, side channel or authority owner. Returned
  token is never exposed to presentation. Original ID/CAS/read-status-first recovery
  remain mandatory; a new exchanged token cannot override already pinned material.
- Existing launcher gains explicit `--allow-user-auth`; saved environment and keys
  are unchanged. One exchange per current connect request, at most three per bounded
  session. No startup/background auth. Other provider writes, customer/record reads,
  OTP, notifications and models remain forbidden. Diagnostic profile refuses auth.
- Closed trace adds only the `auth` route enum, never credential/body/error text.
  Explicit grant was for local connection only, not a general production login flow.

## Executed proof and limits

[Sanitized summary](evidence/maya-yclients-user-login-20261011/summary.json) identifies
local raw receipts by SHA256. Synthetic HTTP + actual isolated PostgreSQL proved
wrong-password NOT_OBSERVED with no persistence, explicit same-ID correction,
encrypted user-token installation exactly once, no activation and zero redispatch
on status reads. The existing 20-case connect matrix also passed. Actual React
browser proof passed 40 checks with cleanup and no provider calls.

Targeted auth/A17 63 PASS; launcher 51 PASS; carrier full 136 PASS. Actual current
build/type checks pass. Broader tests are **not all green**: CRM/Wave3 1385 PASS /
9 FAIL; runtime 710 PASS / 7 SKIP / 1 FAIL. The nine unchanged reschedule test
failures and runtime self-test's four exact fixture mismatches reproduce using a
test-only export of the pre-change committed sources. No source reset or second
implementation was used. These failures were not waived or changed to obtain green.
They are separate from local setup and prevent claiming full release certification.

Real credentials have not been used for this new path. A real successful company
check/save, separately approved activation/import, and persisted owner recovery
remain unproven. This pass neither fixes nor qualifies appointment mutations.

## Owner handoff

Use the existing same-database, pinned, hidden-input terminal launcher with the
explicit local authorization flag. The agent cannot operate Terminal: automatic
approval previously rejected that action and no alternate transport is permitted.
Owner starts it manually; partner token is entered only in the hidden terminal
prompt. Agent then opens the existing local setup operation. Owner selects
**Войти в YCLIENTS**, enters their YCLIENTS login/password only in the form,
selects the confirmed company and existing branch, and explicitly submits.
No activation/import occurs merely from saving. A failed or uncertain request
retains its original locator and requires a status read before an explicit retry.
Do not copy private inputs, database backups or raw owner receipts to Git.

Publishing is not retried: prior push actions were rejected by automatic review;
no alternate command/transport is used to bypass those rejections.
