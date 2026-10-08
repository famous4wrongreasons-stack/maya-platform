# Explicit photo line review in current MAYA chat — 2026-10-08

Development continuation of [goods search](MAYA-YCLIENTS-GOODS-SEARCH-CHECKPOINT-20261008.md) and the already approved F32b/F74b GR-PC1 receipt lane. This slice wires an ephemeral photo and one reviewed line to the existing canonical chat approval. It does not grant real OCR, provider receipt admission, background initiation or a new financial subtype.

## Useful path

The current React chat opens an explicit image picker. One PNG/JPEG/WebP, at most 2 MiB, goes through the headless client's sole authenticated multipart exchange. The original filename is replaced by a fixed transport filename; no image URL, media widget, TeamAttachment, document store or browser storage is introduced. The backend clears its input Buffer in `finally`. Signature and size checks are bounded input checks, not full image-decoder qualification.

Preview produces up to 20 provisional lines. Their decimal strings, unknown unit/price meaning and source line remain visible for review. Confidence never selects a product or grants authority. The owner chooses one line, explicitly searches existing goods through C9, chooses an item and explicitly reads its details. Categories cannot become receipt items. Search does not automatically read all candidate details.

Quantity, catalog unit, store, purchase unit cost, currency and received-at time require explicit review. Neither sale prices nor catalog purchase prices fill invoice fields. No unit conversion or arithmetic is performed by presentation. The existing approval owner computes the exact line total and presents the final immutable facts. The current item reader supplies store IDs without names or an exhaustive store list, so the form asks for the exact YCLIENTS store ID; final ownership and permissions still belong to CRM/AE.

Review creates a real persisted authenticated chat turn describing preparation. The existing goods runtime receives that turn and T-2a, then the existing widget owner emits its sealed APPROVAL. The headless conversation applies the existing resolution mechanism. It does not restore historical controls or manufacture a new approval. Only the existing explicit approval decision can enter the permitted AE receipt path.

## Identity and lifecycle

- The opaque existing `goodsReadIdentity` source revision travels from preview through search, detail and review. It is held inside the headless workflow, checked before creating a turn or performing a source READ, then checked again after awaited work. A changed company/integration, source or current authority cannot silently replace the reviewed source.
- The server derives the review turn identity from photo SHA-256, source line and review version; the canonical timeline adds tenant and actor identity. The caller request ID is transport correlation. Existing goods idempotency and exact payload hash reject different facts for the same version. Corrections require a separate explicit reviewed version.
- `goodsReviewOnly` is limited to `inventory.goods.receipt.prepare`. Approved/executing proposals return an inert held result; this ingress cannot resume `executeApproved`. Completed results use existing read-only history semantics and do not create a fresh actionable card or assert a new success.
- Upload, source reads and review share the current conversation's one-flight boundary. Cancellation, privacy freeze and signout clear ephemeral state and reject late continuations. UNKNOWN does not retry or advance a version automatically. Held/completed states do not accept local corrections.
- Original bytes and unreviewed draft fields are not persisted. Reviewed proposals and canonical timeline/audit use existing owners and existing lifecycle. No schema, retention or purge decision is introduced.

## Remaining exact gates

`GoodsPhotoParser` has no configured OCR transport and returns `goods_photo_parser_not_configured`. Any successful extraction in local proof is an explicitly injected synthetic parser, not OCR or real-model acceptance. A real gate still requires an approved image/OCR transport and document-data handling contract, decoder/resource bounds and error behavior, then authorized representative-document acceptance. The existing text AiCore transport is not repurposed for invoice images. No real document or paid/external call is authorized by this checkpoint.

Real YCLIENTS receipt admission remains separately blocked by the documented uncertainty in `storages_ids` / `storages_transactions_types` permission qualification. The UI does not relax that gate. No SKU creation, supplier accounting, full warehouse system, batch receipt, sale-price update or inferred stock unit is included.

A crash between fresh approval creation and chat-origin binding can leave an unbound pending approval. Replay deliberately refuses with `goods_receipt_chat_projection_unavailable`; no reparenting or recovery of this window is claimed. Atomic origin admission would require further work in the existing owner. Reload clears ephemeral review state; it does not guess the next review version.

Multi-company/branch source migration remains the separate [pending schema decision](MAYA-YCLIENTS-MULTI-COMPANY-SCHEMA-DELTA-20261008.md). The existing single-company binding is unchanged. This is not C10 completion or permission for background autonomy. Website, production, phone, push and merge are outside this work.

## Validation

Runtime commit: `3829590932f7efb456438a0d94446f9e6eb6fca1`. [Archived evidence](evidence/maya-development-integration-20261006/goods-photo-20261008/README.md) preserves exact runtime/harness hashes, successful and failed attempts, independent review and actual screenshots.

- **327 local tests PASS**: 171 backend tests / 8 suites, 143 headless shell tests and 13 React presentation tests. Backend/probe/carrier types, scoped lint and builds pass. Carrier ratchets: 61 refused / 43 admitted; contracts: 31 pass with the existing 4 pending; K3: 10/10. This is the documented union of completed gates in local-attempt2 and local-attempt3, not a relabeling of the failed attempts. Five browser network-guard tests also pass.
- **Actual current React + HTTP + fresh PostgreSQL: 20 checkpoints PASS** in browser-attempt4. Explicit upload/line selection/search/item/review, canonical rejection, corrected immutable version 2 and one explicit canonical approval are exercised through the real UI. Four native search/item GETs use finite synthetic transport; three synthetic parser calls and three real persisted approval records are observed. Exactly one synthetic AE receipt dispatch occurs after explicit approval; none occur during upload, preparation, rejection, cancellation or response loss. Outbound and unrelated business writes remain zero.
- **Separate actual HTTP + fresh PostgreSQL: 10 checkpoints PASS** in http-attempt1. Default unconfigured parser returns 503; changed source revision refuses all three continuation routes before C9/source reads or approval; revocation during extraction suppresses preview and clears its buffer. Explicit approval and its replay produce one synthetic effect. This mode adds two finite native GETs and two injected parser calls; it is a separate run, not additional browser checkpoints.
- Browser cancellation clears the form and suppresses the delayed parser result. A deliberately lost real HTTP 201 review response leaves one pending proposal and disables resubmission; it is **not an AE UNKNOWN**. Reload/re-login retains the successful canonical receipt without another goods or intent call. Current authority revocation returns 401/403 without renewed parser/source work. Browser reload is not a backend/process restart claim.
- Source bytes for both successful proof modes match the committed runtime and remain unchanged through execution. All 18 owned process groups across five proof attempts are closed/absent; their five PostgreSQL clusters are stopped. Failed fixture attempts remain archived as failures. No unrelated service was stopped.

Independent code review qualifies the finite implementation; proof review is archived separately. Screenshots were inspected for the actual controls/results. Existing header/composer overlap and the plain draft form remain visible; this is functional acceptance, not completion of the paused design lane. No real OCR, live YCLIENTS, real model, production, phone or website acceptance is claimed.
