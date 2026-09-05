# Package 5 post-Wave-6 remainder — B13 contract mapping stopped for owner decision

Accepted owner checkpoint `2f647179`. Waves 1–6 remain accepted 6/6. B7–B11
remain accepted production baselines. B12 runtime commit `3ea401a5` is deployed
in the active PWA and backend release
`/opt/maya-saas/releases/20260905-p5-b12-3ea401a5`.

1. The four B12 paths are mapped to their existing P4-03/P4-06 actions and
   owners. No new action or schema was introduced.
2. `/api/client/book-with-loyalty` and `/api/cert/create` fail closed in the
   legacy PWA. `/api/panel/redeem` is read-only for lookup and fails closed on
   confirmation. YClients record-delete no longer invokes a direct loyalty
   refund.
3. The active PWA `loyalty.py` and `database.py` contain the accepted Package 4
   fail-closed guards. The exact active runtime validator passes.
4. The backend deployment gate now validates the active PWA before migrations.
   Synthetic later PWA loyalty, gift-certificate and refund writes all break
   the ratchet.
5. Targeted proof passed 41 suites / 275 tests plus 5/5 runtime-guard
   regressions. Mandatory deployment regression passed 337 suites / 2781
   tests. Health/readiness passed, error logs are empty, pending migrations are
   0 and drift is NONE. No real production business/provider mutation was used
   for proof.
6. The complete 13-family Final Gate restarted from scratch and stopped at new
   blocker **B13**. Active published legacy control-plane endpoints still own
   direct A16, A22 and A26 mutations.
7. Exact B13 paths are `/api/panel/team`, `/api/panel/managers`,
   `/api/panel/plan_target` and `/api/god/subscribers`. They mutate legacy staff
   binding/roles, manager authority, the owner business target and legacy
   subscriber/tenant lifecycle state directly in SQLite.
8. This is Package 5 Final Gate remediation, not P4-11 or Wave 7. B13 was not
   changed because the Final Gate requires STOP on a new bypass.

Package 5 remains FAIL/NO. The exact B13 comparison found unmapped operations,
so no runtime or schema implementation started. The minimum choices are recorded
in `package5-b13-control-plane-contract-v1-proposal.md`:

1. retire legacy staff bind-code create/reset or approve a verified canonical
   staff-channel linking contract;
2. retire legacy cashier/raw-Telegram manager authority or approve the missing
   canonical capabilities;
3. narrow plan target to the existing monthly finance preference and reject
   daily/growth modes, or approve a tenant growth-goal aggregate;
4. make GOD subscribers a canonical read projection and retire legacy writes,
   or restrict it to exact TrialActivation/suspend/reactivate initiation.

After owner approval, the same B13 Final Remediation cycle may remove direct
SQLite ownership, add active-PWA and published-proxy ratchets, prove
retry/concurrency/tenant and authority isolation, deploy without real
staff/settings/tenant mutations, and restart the full 13-family Final Gate from
the beginning. If an option requiring a new contract/schema is selected, return
that bounded proposal before implementation.

Preserve B7–B12, all Waves 1–6, D1-A…D7-A, P02/P03 holds, Client ownership,
immutable evidence, the tenant hard-delete prohibition, Package 2 Communication
Delivery, Package 4 value ownership and AC6 A30 ownership. Do not create P4-11,
Wave 7, start Chapter 7 or declare Chapter 6 complete. All 17 old databases
remain untouched; owned processes, watchers, Chrome and temporary databases
are zero.
