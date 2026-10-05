<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: 8a1d913967cd3d45f8340642cf0cd3596c2e3826fdd14db34908de58372fb828 -->

# Decision 2 — the canonical backend repoint. Runbook, prepared, NOT executed.

**Approved architecture: reserved/static public IP + a real DNS name, `api.mayaos.ru`.
No new `nip.io` production hostname.**

Nothing in this document has been carried out. Every step carries its rollback and its health proof,
as ruled. The chain is: existing VM → reserved IP → `api.mayaos.ru` → TLS → relay/upstream → live
verifiers → `mayaos.ru/api`.

---

## Two prerequisites that are yours, because no credential for either exists here

Measured, not assumed: `yc` is not installed and there is no `~/.config/yandex-cloud`; the Beget
account has no DNS CLI, no stored API credential and no script that calls `api.beget.com`. Only SSH
keys exist here.

| # | Yours | Where | Why it must come first |
|---|---|---|---|
| **P1** | Reserve the instance's current address `89.169.160.55`, converting it from ephemeral to static | Yandex Cloud console | An ephemeral address is what caused this outage. Reserving it before pointing a name at it means the name never has to move again. |
| **P2** | Create `api.mayaos.ru` **A → the reserved address**, TTL 600 | Beget DNS panel | ACME HTTP-01 cannot issue a certificate for a name that does not resolve to the host. |

Do **not** create an AAAA record — the VM has no public IPv6, and an AAAA would black-hole clients
that prefer it.

**A deadline that is already running.** Both `nip.io` certificates renew by HTTP-01, and
`*.111.88.148.206.nip.io` resolves by construction to the third party's address, so **they can never
renew again**. `maya.111.88.148.206.nip.io` expires **2026-10-31**. After that date the relay's TLS
leg fails even if nothing else changes.

---

## Step 1 — TLS for the new name. Additive: the old vhosts keep serving.

On the VM, over the Beget jump. A new vhost is added beside the existing ones; nothing is removed
until step 4.

```
sudo certbot --nginx -d api.mayaos.ru --non-interactive --agree-tos -m <owner email>
sudo nginx -t
```

The vhost proxies to the same place the two `nip.io` vhosts already do: `http://127.0.0.1:3107`.

- **Rollback:** `sudo rm /etc/nginx/sites-enabled/api.mayaos.ru && sudo nginx -t && sudo systemctl reload nginx`.
  The certificate may stay; an unused certificate harms nothing. The old path is untouched throughout.
- **Health proof:** `certbot certificates` lists `api.mayaos.ru` as VALID · `nginx -t` rc 0 ·
  from outside, `curl -s -o /dev/null -w '%{http_code}' https://api.mayaos.ru/api/health/ready` → **200**
  · and the two `nip.io` names still answer exactly as before.

## Step 2 — the repository pass. One commit, because the gate couples it.

Nine call sites, and they must move together:

| file | change |
|---|---|
| `deploy/platform/beget-edge/maya-platform-api.php:4` | `MAYA_PLATFORM_UPSTREAM` → `https://api.mayaos.ru/api` |
| `сайт и приложение/maya-native-api.php:5` | `MAYA_NATIVE_UPSTREAM` → same |
| `deploy/live-widgets/api.111.88.148.206.nip.io.{http,https}.conf` | **renamed** to `api.mayaos.ru.*`; `server_name` and both `ssl_certificate*` paths rewritten |
| `deploy/platform/maya-platform-staging.{http,https}.nginx.conf` | same substitution |
| `deploy/vps/deploy.sh:34` | `HOST="[REDACTED EMAIL]"` |
| `deploy/platform/chapter7-consumers/verify-live.cjs:7` | SSH target → `[REDACTED EMAIL]` |
| `deploy/platform/chapter8-consumers/verify-live.cjs:5` | SSH target → `[REDACTED EMAIL]` |
| `deploy/platform/beget-edge/relay-release-manifest.json` | **re-pin** the two relay hashes |

**Why one commit.** Both relay PHP files are pinned entries of the release gate (`role: relay_php`),
so editing them changes their `sha256`; and since S5-1's A+ hardening the committed routing files are
checked three ways — committed source ↔ manifest pin ↔ live file. Split across commits, the gate is
red in a way that hides real failures. Order inside the pass: edit → re-pin → run the two architecture
suites → deploy (step 3) → verify against live.

Using the hostname rather than the reserved IP for the SSH targets is deliberate: it removes the last
address literal, which is what **"старый `111.88.148.206` удалить из всех active routing/config/
verifier targets"** actually requires.

- **Rollback:** `git revert` of the single commit.
- **Health proof:** `npx jest --testPathPatterns beget` → 4 suites green · `npm run typecheck` ·
  `npm run lint` · prettier.

**Not touched, deliberately:** the read-only inventories under `docs/rebuild/evidence/`, the three
security audits, `PROJECT_MEMORY.md`, the `CLAUDE_LIVE_*` records and `РОТАЦИЯ_КЛЮЧЕЙ.md` all name the
old address as a *measurement of what was true*. Rewriting them would forge the record. Two more are
deliberate: `maya-chat-shell/test/serve.test.mjs:302` uses the old address as a **rejected** origin in
a negative test, and `test/fixtures/beget/api-proxy.sanitized.php` is a frozen fixture that moves only
when its live file is redeployed.

## Step 3 — deploy the two relay files to the hosting account

Before touching either, take a byte-verified copy of the live file, because the rollback target is a
hash, not a hand edit.

- **Rollback:** restore the copy and confirm its `sha256` equals the pin that the manifest carried
  before step 2.
- **Health proof:** `https://mayaos.ru/api/health/ready` → **200** from outside — the number that is
  **502** today — and `relay-release.cjs verify` → PASS with the same shape as now (42 entries,
  5 archived off-root, 164 denial probes), the two relay hashes matching their new pins.

## Step 4 — retire the `nip.io` vhosts. Only after step 3 holds.

Disable the two `sites-enabled` symlinks and reload. Until this step both paths answer, which is what
makes steps 1–3 reversible at any point.

- **Rollback:** re-create the two symlinks, `nginx -t`, reload.
- **Health proof:** `mayaos.ru/api` still 200 · **NIP.IO PRODUCTION DEPENDENCY: 0** ·
  `grep -rl 111.88.148.206` over active config and verifier targets returns nothing.

## The third blocker, independent of both halves

The relay gate's archive class locates the private archive through `MAYA_R01_ARCHIVE_DIR`. With no
pointer file on the deploy host the gate fails closed at `deploy.sh:99` — correct behaviour, but it
means one operator-local pointer file must exist under the existing mode-0700 private evidence
directory before the next deploy. That is a host write, so it is yours; no path or value belongs in
this repository.

---

## Order of the whole recovery, with what gates what

1. **Decision 1** — one A record. Independent of everything here, and the most urgent item, because
   it is what ends the personal-data exposure and restores webhook delivery.
2. **Decision 3** — the reconciliation fix. Done in the repository and proven; it reaches production
   only through a deploy, which is why it waits on this runbook.
3. **P1 + P2** — yours.
4. **Steps 1–4** above.
5. **The deploy** of the fix, which is the first deploy this path has allowed since 2026-09-23.
6. **Then, and only then**, the single widened reconciliation — and only after its dry-run scope and
   counts have been shown and its external-effect question answered.

**STOP. Nothing here is executed. Each step waits on its predecessor's health proof.**
