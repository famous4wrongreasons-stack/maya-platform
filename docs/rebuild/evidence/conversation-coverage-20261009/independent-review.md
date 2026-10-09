# Independent review — conversation coverage proposal

Date: 2026-10-09T08:47:10.725071+00:00
Disposition: **qualified no blocker in the two proposal/inventory artifacts**. Docs-only preparation; no executable 48-case profile or execution authority is established.

Source: isolated `maya-conversation-coverage` worktree at `b74d62851de075a48f2c10bf5da48524c8ca0e47`. Review consisted only of local reads, Git blob comparison and JSON/hash/count verification. No tests, services, network, credential input, permit/claim or paid calls; no repository edits. The separate frozen batch worktree was not changed.

Verified:

- All six source-file SHA256 pins match both current bytes and exact source-commit Git blobs. All48 canonical row hashes resolve uniquely to the identified source row; all81 user turns match source text exactly. Case IDs and source roles are preserved. No assistant gold/conversation text is copied into proposal cases; original row hashes may bind source metadata including assistant rows, which is provenance only.
- Counts are exact: **48 cases /81 user turns**, case roles **13 client /23 owner /12 admin**. First9 are the unchanged frozen union cases;15 are selected existing current-candidate rows;10 are historical dev multi-turn rows;14 are historical dev single-turn rows.
- **33 distinct source-family references** match the listed union. The explicit disclaimer correctly treats these as provenance identifiers, not empirical independence,48 independent trials or held-out quality. Near variants and reused lineage remain known development material.
- Inventory statistics independently recompute: utterances11,352 rows /946 families, dev1,116 /93 families; multi-turn1,050 rows /175 families, dev96 /16 families. Role/style/archetype/domain counts and family split-overlap=false match source data. Both600-row adversarial/contrastive files contain test rows only; zero rows from either are selected. All24 newly selected historical rows are dev. No new corpus rows or assistant answers are generated.
- Existing executable readiness is honestly separated:9 union dry-executable cases,15 rows backed by the separate current-candidate dry fixture path,24 needing finite fixture/assessment work. `current-candidate-http.probe-spec.ts:415` freezes its own24-case corpus and selects groups; its budget is explicitly `OFFLINE_SYNTHETIC_ONLY` at473. This does not make the selected15 rows executable under core-union or turn48/81 into an admitted profile. `core-conversation-profile.mjs` still contains only the existing closed A/B/union profiles.

Limits to retain:

`scopeUnchanged` correctly keeps frozen9/18/$6/36/30min awaiting the separate owner response. Both proposal authority flags are false. Labels such as capability_readiness=ready and source intents are review hints, not current role/tool/source permission. Mutation-language cases (confirmation, reschedule, cancel) are proposed user input only; any future execution must retain existing preview/approval/AE boundaries. Separate UNKNOWN controls are not counted as corpus dialogues or proof this48-case proposal has run. This is neither full MAYA coverage nor language acceptance.

The compact main document was not yet present during this review; no claim is made about unseen wording. No artifact discrepancy or necessary source correction was found.

Artifact hashes:

- `frozen-proposal.json`: `7e3e94694b98c9ad56f7aa7f7ff63a835058621d3ca159b4458421da95399ba8`.
- `corpus-inventory.json`: `79b3cd7c601d4b0aa85908154e5afa2a7c199e154e8b5a8b05508ed8f4c05cef`.

## Final document follow-up (2026-10-09T08:49:26.949703+00:00)

The main document `docs/rebuild/MAYA-CONVERSATION-COVERAGE-PROPOSAL-20261009.md` is now independently reviewed: **qualified no blocker for this docs-only proposal**. Two wording findings were corrected: it now distinguishes32 overall domains from30 dev domains (churn/loyalty absent from dev), and the ADMIN paragraph says archived outputs locally reproduce the refusal path while the historical error body was not recorded. It no longer claims unique historical causation from missing evidence.

The expanded inventory was independently recalculated:32-domain overall role matrix,10,443 unique utterance texts,86 overall intents/74 dev intents and the exact two domains absent from dev all match source rows. Selection/source bytes are unchanged; the earlier inventory hash above is historical, and the final inventory SHA256 is `1236a85b9b493c6d59552aa2709166548c646dfaafd75b4257931ac8bef5095b`. Proposal SHA256 remains `7e3e94694b98c9ad56f7aa7f7ff63a835058621d3ca159b4458421da95399ba8`.

The document correctly separates executable closed9 union, existing24/33 keyless corpus adapter and non-executable48/81 selection. Package counts9/18+15/20+10/29+14/14 and family-reference categories13+11+8+1 match. It preserves pending owner scope, no new profile/cap/permit/paid action, no test-split selection, no empirical-independence claim and no general MAYA acceptance claim. Corpus labels and mutation-language turns do not supply authority.

Historical cost arithmetic independently recomputed and matches displayed rounding:81 responses cache$1.678629744/no-cache$1.9035324/max-reserve$11.60552448;98 responses$2.030934752/$2.3030392/$14.04125184;162 responses$3.357259488/$3.8070648/$23.21104896. Rates are historical, not freshly verified;162 is an illustration, not a chosen cap or proven maximum model stages. No price lookup was performed.

Keychain remains an unimplemented, separately controlled proposal with no access performed and an explicit same-UID/code-identity limitation; it does not claim OS-enforced broker-only isolation. Owner continuation preserves the distinction between invalid actual archived output and separately synthetic accepted continuation.

Main-document SHA256 at review: `ee5aed60ee99c21664c2cf83887a31abbe0bc4ae10fb98e0877a3f512c20b716`. The artifact-only review is preserved above; this follow-up supersedes its statement that the main document had not yet been available. No repository files or frozen batch sources were changed by this reviewer.
