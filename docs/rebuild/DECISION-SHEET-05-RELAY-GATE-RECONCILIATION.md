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
