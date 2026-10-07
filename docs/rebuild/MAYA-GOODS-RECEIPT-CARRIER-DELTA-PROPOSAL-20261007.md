# Goods receipt carrier boundary: exact proposed delta

Status: **PROPOSED / NOT ADMITTED**. Product goods/photo work is already authorized. This is a finite carrier-contract change, not another feature-permission question. The backend READ, request-local preview, reviewed versions and synthetic AE candidate continue independently. No frozen clause or widget allowlist is changed by this note.

## Exact existing fence

[FR-6d](MAYA-WIDGET-CONTRACT-V1.md) at line 1877 says: “All MONEY capabilities except the exact F32a descriptor are vetoed”; that descriptor admits only an OWNER-bound single-service fixed-RUB APPROVAL. The APPROVAL owner clause at line 3403 adds existing `AiApprovalRequest` only for F32a and its named `C9:catalog.service.price.update` ref. F32a catalogue-price configuration therefore cannot be stretched to stock receipt. [The existing descriptor](../../maya-saas-backend/src/widgets/pricing/service-price-widget.contract.ts) pins its exact capability/action/target/input/facets.

## Minimal proposed addition

Add one separately named, exact inventory receipt descriptor to FR-6d and the canonical APPROVAL-owner/pairing clauses. Preserve `MONEY(cap)` and the `financial` risk facet. Proposed pair: `C9:inventory.goods.receipt.prepare` (PROPOSE_ONLY) → `AE:crm.goods.receipt.create.v1`; action `create_crm_goods_receipt`, target `crm_goods_receipt`. No generic financial widget template or arbitrary provider endpoint.

| Dimension | Exact bound |
|---|---|
| Effect | One receipt line for one existing physical goods item, one company and one store; positive fractional quantity in one explicitly chosen catalog unit |
| Reviewed facts | `goods_id`, `store_id`, `quantity`, `unit_id`, `unit_cost`, `currency`, `price_kind=receipt_purchase_unit`, `received_at`; decimal strings, exact computed `line_total`, no rounding or inferred conversions |
| Current source binding | Server-resolved `company_id`, integration revision, current goods/store/permission/unit revision; factual names and chosen unit label; unknown source facts block admission |
| Provenance | `photo_sha256`, `source_line` (1–20), `review_version` (1–20); hash is correlation evidence, never permission or proof that OCR is correct; no original image, raw OCR or parser confidence in durable approval/effect |
| Decision authority | Existing `AiApprovalRequest` owner, exact payload hash and requester; current active TENANT_OWNER/BUSINESS_OWNER, tenant-wide membership, required features and current integration; foreign tenant/actor refused. Scoped branch membership remains refused until canonical company/branch mapping exists |
| Carrier admission | Session-verified owner principal, exact server-minted intent/approval echo and source-bound approval TTL; current canonical owner rechecks authority. Presentation and model output confer no authority |
| Concurrency/outcome | Immutable corrected versions supersede only pending versions; one admitted receipt per tenant/photo/line; one execution attempt; UNKNOWN/manual continuation never silently resends |
| Persistence | Existing AiApprovalRequest/R10/AE owners, inventory AE payload 30 days and audit 7×365 days. Approval TTL is 10 minutes, not deletion. No new photo/document store, schema, automatic purge or retention grant |

Payments, payout/refund/transfer, discounts, PAYMENT_HANDOFF, sale-price changes, absolute stock assignment, new SKU creation, batch/multi-line receipts, supplier/procurement accounting, consent, booking and autonomous effects stay outside this exception. Existing F32a is unchanged.

A normative decision would permit implementation of the finite carrier mapping and its own current React/HTTP proof; it would not establish OCR/model quality, provider write/readback acceptance, release certification or permission for a real external write. Until that decision and proof, goods money **UI COMMIT remains BLOCKED**. [Backend development checkpoint](MAYA-YCLIENTS-GOODS-VERTICAL-CHECKPOINT-20261007.md).
