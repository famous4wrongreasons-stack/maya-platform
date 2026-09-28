# DECISION SHEET 05 — relay release gate after R3, and the one dated relay alias

**Status: OPEN — two items. Work outside these two items continues.**

Evidence: `evidence/maya-chat-first-ux/php-relay-copies-r4.json`. Exact hosts, paths and URLs are withheld from
this public repository. The owner-only R3 rollback manifest identifies every file.

---

## S5-1 · R3 broke the backend deploy gate. How should it be reconciled?

**What happened.** The R01 relay release gate (`maya-saas-backend/deploy/platform/beget-edge/relay-release.cjs`,
run by `deploy.sh` before upload, before activation and after cutover) pins seven HTML and backup files in place by
path and hash. Five of them were among R3's 44 publicly served legacy bundles:
- 3 `preserved_html`, historical PWA aliases;
- 2 `preserved_backup`, pre-maintenance app bundles.

R3 moved them to the non-public archive. Their archived bytes equal the gate's pins, 5 of 5. The gate still requires
them at their served location, so its `verify` step now fails. Everything else it checks passes:
- 26 of 26 PHP copies pinned;
- 10 of 10 active sources pass the whole-source guard;
- 128 of 128 denial probes answer 403;
- 9 of 9 routing files pinned.

**Consequence.** Every backend deploy through `deploy.sh` stops before upload with «R01 live relay baseline
расходится». Nothing is changed, so the failure is safe, but no backend release can ship until this is reconciled.
Serving the Maya Web Shell and taking any gate live in production both need a backend deploy.

**Whose defect.** Mine. The R3 pre-move checks did not consult this gate.

**Why it is not fixed unilaterally.** Both repairs touch a security release gate with an owner-approved authority
(«preserve maintenance and historical files», with independent canonical review). Its own governance says:
«do not change the manifest just to get a green release». Restoring the files reverses part of R3.

**Options.**
- **A · Reconcile the gate to the R3 state (recommended).** The five entries move to a new role, `archived_offroot`.
  The gate requires:
  - the file is absent from every public root;
  - its former URLs answer 403, 404 or 410;
  - a file with the pinned hash exists in the private archive, located through operator-local configuration that is
    not committed.

  Every pinned hash stays as it is. Cost: a change to gate code and manifest, reviewed independently the same way
  the R01 gate was, plus a mutation test proving a restored or altered copy fails.
- **B · Restore the five files from the R3 rollback manifest.** The gate goes green unchanged, but five legacy bundles
  are publicly served again: exposure goes from 0 to 5, against R3. Denying them by rule would change pinned routing
  files, so it would need the same kind of gate change as A.
- **C · Leave it.** Backend deploys stay blocked until a later ruling.

**Recommendation: A.** It keeps R3's exposure at 0 and every byte preserved. The gate's check becomes stronger, not
weaker: absence from public roots and denial at the former URLs are added. No path enters the repository.

---

## S5-2 · One dated alias of the full relay stays served. Is it obsolete?

**What is known.**
- The R01 gate registers it as an active full relay. Its hash is pinned, it passes the whole-source guard (no
  provider mutation call site and the R01 refusal in place), and it answers 200.
- It is a dated copy, with a date in its name. Its action names are a subset of the live relay's (93 of 95), with no
  extra outbound host, but its bodies differ: it carries 7 more write-method request options, so it may serve older
  implementations of the same business writes. The three-bundle probe's write-path check fails on exactly this file.
- Its known consumer, the PWA alias of the same date, is one of the files R3 archived. No HTML, JS, PHP or JSON file
  left in any of the three served roots references it (read-only search, 0 of 3 roots).

**What is not known.** Whether anything else calls it: an installed client, a bookmark, or an external integration.
No access log was read. That would be a separate production read.

**Ruling applied.** «Если невозможно доказать, что конкретный PHP artifact — obsolete copy, оставить его и STOP только
на нём.» It stays in place. Moving it would also trip S5-1's gate.

**Options.**
- **A · Keep it until the Maya Web Shell cutover (recommended),** then retire it together with the legacy relay
  under K16.
- **B · Authorise a read-only access-log check** over a stated window. Zero hits would make it a confirmed obsolete
  copy, to be moved by the R3 procedure with the gate reconciled as in S5-1 A.
- **C · Deny it now by a routing rule.** This is a hosting change to a pinned routing file, and would break any
  unknown caller.

---

# Appendix A — S5-1 resolution proposal (2026-09-28, re-verified read-only)

### S5-1 · Resolution proposal (2026-09-28, read-only verification)

**State re-verified, not assumed.** A read-only run of the gate's own discovery script over the live
account: 37 of 42 pinned artefacts byte-equal, **5 missing**; roots 3/3, symlinks 0, scan errors 0, PHP
inventory 26/26 exact, routing files 9/9 exact. The 5 are R3's, matched by sha256 against
`legacy-bundle-remediation-r3.json`. Their former URLs answer **404** today (5 of 5, canonical origin).
`deploy.sh` fails at the first of three gate calls (`deploy.sh:103`), before upload. Unchanged from the
sheet's account; now first-hand.

**Not stated before, and it matters.** Reconciling the 5 entries is *not* enough for a phone test. Four
further gate interactions sit on the same path: `/app/index.html` is a pinned artefact on both hosts and is
the maintenance page (`cb27000739b1…`), so the shell cannot be served there without repointing a pin; a new
`.htaccess` would break routing-file set equality, but the mayaos.ru root `.htaccess` **is** the committed
`beget-edge/.htaccess` byte-for-byte, so per-path headers need a hash update and no new file; the live
response for `service-worker.js` contradicts that committed file (`max-age=604800` against `no-store`), so
headers must be measured on the wire; and `verify-edge-candidate.cjs:31` refuses a shell-only release input.
Static PWA files themselves are free — a manifest, a worker and seven icons are served at `/app/` today and
the gate does not pin any of them.

**Options.**

| | What it does | Exposure | Cost | Gate ends up |
|---|---|---|---|---|
| **A (recommended)** | 5 entries become `archived_offroot`: absent from every public root, former URLs deny, pinned hash present in the private archive. Every hash unchanged. | stays **0** | ~40 lines in `relay-release.cjs` + 5 role fields + spec counts + mutation tests + one operator-local pointer on the host; independent canonical review; one read-only archive read first | **stronger**: +absence class, +36 denial probes (128→164), +archive equality class |
| **A+ (recommended additions, no new decision needed)** | three-way committed↔manifest↔live equality for repository-owned routing files; a strict shell/PWA candidate gate | stays 0 | ~30 lines, repository-only, shippable before or after A | **stronger**: a manifest-only edit «to get green» starts failing; static assets get checked for the first time |
| **B** | restore the 5 from the R3 rollback manifest | **0 → 5** publicly served legacy bundles, against R3 | denying them by rule changes a pinned routing file anyway → the same gate change as A, plus the restore | unchanged, at the price of the exposure R3 closed |
| **C** | leave it | 0 | no backend release; no phone test; no PWA publish | unchanged |

**Recommendation: A, plus A+.** A keeps R3's exposure at 0 and every byte preserved, and every check it
adds is a check the gate does not have today. A+ costs two small repository changes and converts the
governance sentence «do not change the manifest just to get a green release» into a mechanism.

**Two things to grant alongside the yes:** (1) one read-only SSH read of the archive, to confirm the
rollback manifest still hashes to `f93c0520…` and the 5 archived copies still hash equal — A's archive
assertion should not be written blind; (2) a separate, later approval for the production writes (the fresh
shell directory, its PWA files, the edited `.htaccess`), each ordered upload-then-pin, never pin-then-wait.

**Still the owner's, and deliberately not folded into A:** whether the shell may take `/app/` (it repoints
two pinned maintenance pages and updates the existing legacy install in place — recommendation: no, use a
fresh path for the first test), and what becomes of `build-mayaos-edge.sh`, which as written would
re-publish the legacy PWA over the pinned maintenance page.
