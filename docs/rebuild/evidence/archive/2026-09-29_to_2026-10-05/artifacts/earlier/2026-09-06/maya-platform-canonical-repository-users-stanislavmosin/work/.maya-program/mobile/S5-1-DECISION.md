<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: a789090c78e3da8bc5b1d3259f65f954f9cff34f473bde4463d0a57c6feb6cc6 -->

# S5-1 — OWNER DECISION SHEET

**Prepared 2026-09-28. Source: `docs/rebuild/DECISION-SHEET-05-RELAY-GATE-RECONCILIATION.md` Appendix A
(re-verified read-only, first-hand). Nothing new is proposed here; this is the same proposal stated for a
yes or a no.**

---

## THE QUESTION

R3 moved five legacy bundles off the public roots into the private archive; the R01 relay release gate still
pins those five files at their old served location, so its `verify` step fails and `deploy.sh` stops at
`deploy.sh:103` — before anything is uploaded, on every backend release.

Do you reconcile the gate to the R3 state (the five entries become an "archived, off-root" role, every pinned
hash unchanged), restore the five files to public serving, or leave the deploy blocked?

State as of today, verified with the gate's own read-only discovery script: 37 of 42 pins byte-equal, 5
missing, and those 5 are R3's by sha256; their former URLs answer 404, 5 of 5; roots 3/3, symlinks 0, PHP
inventory 26/26, routing files 9/9.

---

## OPTION A — reconcile the gate to R3 *(recommended)*

- **Does:** the 5 entries take a new role `archived_offroot`. The gate then requires the file to be *absent*
  from every public root, its former URLs to deny (403/404/410), and a file with the pinned hash to exist in
  the private archive, found through an operator-local pointer on the host that is never committed. Every
  pinned hash stays exactly as it is; no byte is restored, no path enters the repository.
- **Costs:** ~40 lines in `relay-release.cjs`, 5 role fields in the manifest, spec-count updates, mutation
  tests (a restored file must throw, an altered archived byte must throw, a former URL answering 200 must
  throw, a manifest edited to hide the drift must still throw), one operator-local pointer placed on the
  host, independent canonical review as the R01 gate itself had — and one read-only archive read first.
- **Exposure:** stays **0**. R3's closure holds.
- **Gate ends up:** **stronger.** It gains an absence class (nothing is checked for absence today), 36 more
  denial probes (128 → 164), and an archive-equality class. Nothing is relaxed or removed.

## OPTION A+ — two tightenings that need no separate decision *(recommended alongside A)*

- **Does:** three-way `committed ↔ manifest ↔ live` equality for the routing files that have a committed
  repository source (two qualify today), and a strict shell/PWA candidate gate for static releases.
- **Costs:** ~30 lines, repository-only, shippable before or after A, independent of it.
- **Exposure:** stays 0.
- **Gate ends up:** **stronger.** A manifest-only edit "just to get green" starts failing mechanically
  instead of being forbidden only by a sentence in the governance doc, and static PWA assets get checked for
  the first time — today nothing checks them anywhere.

## OPTION B — restore the five files

- **Does:** restores the 5 from the R3 rollback manifest, so the gate goes green with no code change.
- **Costs:** the restore, plus — if they are then denied by routing rule instead — a change to a pinned
  routing file, i.e. the same class of gate change as A anyway, on top.
- **Exposure:** **0 → 5** publicly served legacy bundles. This reverses part of R3.
- **Gate ends up:** unchanged, bought with the exposure R3 closed.

## OPTION C — leave it

- **Does:** nothing. The failure stays safe (it stops before upload) and total.
- **Costs:** no backend release, no PWA publish, no phone test, for as long as it stands.
- **Exposure:** 0.
- **Gate ends up:** unchanged, and permanently red.

---

## RECOMMENDATION — **A, plus A+**

A keeps R3's exposure at 0 and every byte preserved, and every check it adds is a check the gate does not
have today. A+ costs two small repository changes and converts «do not change the manifest just to get a
green release» from a sentence into a mechanism. B pays for a green gate with the exposure R3 was run to
close. C leaves the release path dead.

---

## WHAT TO GRANT ALONGSIDE THE YES

1. **One read-only SSH read of the private archive** — hash the R3 rollback manifest and confirm it still
   equals the value already published in the repository, then confirm the 5 archived copies still hash equal
   to the 5 pins. Hash-only: no source read, no copy, no restore, no write. It must happen **before** A is
   implemented, because A's archive assertion must not be written blind.
2. **A separate, later approval for the production writes** — the fresh shell directory, its PWA files, and
   the edited routing file. Each one **upload first, then pin**, never pin-then-wait: `verify` asserts live
   equals pin, so a pin committed ahead of its upload fails every run until the upload lands.

Approval 1 is a read and can be given now. Approval 2 is not part of this yes.

---

## WHAT STAYS YOURS, DELIBERATELY NOT FOLDED IN

- **Whether the chat-first shell may take `/app/`.** It would repoint two pinned maintenance pages and, since
  the served legacy manifest declares `id: "/app/"`, update your existing legacy install in place rather than
  create a second one. **Recommendation: no — use a fresh path for the first phone test.**
- **What becomes of `build-mayaos-edge.sh`.** As written it copies the legacy `app.html` over the pinned
  maintenance page, so running it today would break that pin and re-publish the legacy PWA. It should be
  split (edge bundle vs shell bundle) or frozen. Naming the split is repository work; deciding that the
  legacy edge is no longer a publishable artefact is yours.

---

**Until S5-1 is answered, no backend release can ship — so the first phone test cannot happen even once the
lost host is recovered.**
