# YCLIENTS management: finite decisions before new writes

The next implemented safe capability is existing Admin public consultation through `catalog.staff.read`. The external management capabilities below remain product scope, but their execution admission is not inferred from that scope. No external business API or model was called. Pricing and schedule stay with their existing owners.

## Inspected owners and official shape

- A27 inventory create/update/archive is an existing Action Engine owner, but `package5-wave4.service.ts` executes against local `TenantCatalogItem`. Its `priceKopecks` and absolute `quantity` are not a YCLIENTS goods receipt contract.
- A28 staff/service setup explicitly calls `assertInternalCalendar`. The existing YCLIENTS staff/service readers do not authorize management writes. The existing pricing and schedule lanes are independent.
- Chat `AiCoreChatDto` accepts text messages; it has no attached photo/source-document ingress. Existing widget draft/approval patterns do not grant a generic new AE action or document-retention class. F32a remains bounded to its approved subtype.
- [Official YCLIENTS API documentation](https://developers.yclients.com/ru/) inspected on 2026-10-07 separates goods catalog creation from stock operations. Goods fields distinguish `cost` (sale price), `actual_cost` (cost price), sale/write-off units and their ratio. A goods transaction has separate `amount`, `cost_per_unit`, total `cost` and `operation_unit_type`; a stock operation also selects type, store and date. The documentation also exposes staff creation/update and service creation/binding operations, including deprecated alternatives. The operation schema calls its array `goods_transactions`, while its example uses `transactions`; this mismatch must be resolved before executable provider acceptance.

[Compact API shape and downloaded-source hash](evidence/maya-development-integration-20261006/yclients-management-preflight/official-api-shape.json) record public documentation, not provider acceptance. No idempotency guarantee is inferred from these schemas.

## Goods from an order/receipt photo — exact decision

Requested product scope is extracting/uploading goods, quantity and price from an owner-supplied photo. Procurement, supplier records, purchase orders and payment are excluded.

Approve a finite contract covering the following before implementing a new persisted ingress or external executor:

1. Choose effects explicitly: goods catalog create/update only, stock receipt delta only, or both as separate approved actions. Never reinterpret a photographed quantity as an absolute stock balance. Name the existing AE owner extension and the exact YCLIENTS operation/readback for each effect.
2. Name tenant/branch/store authority, permitted actor roles and feature admission. Bind an approved draft to immutable source-document/version and current catalog/store/unit selections; revalidate at execution. A displayed preview is not authority.
3. Define photo/OCR ingress, consent/data boundary, retention/deletion, version and audit references. OCR produces suggestions only. Uncertain fields, ambiguous item matches, units, missing currency, or conflicting totals require human review; no silent default or arbitrary OCR-confidence threshold.
4. Separate sale price, cost/purchase price, unit price and line total. Record which source field supports each proposed value. Require explicit price meaning and unit conversion; never infer sale price from a receipt total or replace a catalog price silently. Limit item count and file size in the admitted contract.
5. Define dedupe and restart semantics across image, draft and exact approved version. Specify lost-response UNKNOWN, authoritative readback/reconciliation and partial multi-item failure; never retry a potentially applied external write blindly.
6. Define the permitted preview/approval surface and exact signed fields/actions. No generic widget or C10 background permission is added by approving an OCR draft.

Until those decisions exist, stop only photo persistence/new provider action registration/execution. Read-only source inspection and existing public consultation can proceed. A disabled autonomous trigger is not a substitute for this authority.

## External staff/service management — exact decision

Authorize finite YCLIENTS create/update operations, actor/branch rights, quotas, source-qualified draft and explicit approval through the existing AE. Resolve required/provider-owned identifiers and service/staff bindings, current-state conflict/readback and UNKNOWN recovery. Do not extend internal-only A28 by removing its guard. Exclude schedule and price changes already owned by their current lanes. No external writes are implemented by this brief.

## Compact remaining domains

| Domain | Next real gap / decision |
|---|---|
| Admin public consultation | Remove inferred profile facts; qualify current source and legacy receipt replay. Existing READ only. |
| Goods photo → YCLIENTS | Source-document ingress/retention plus finite AE effect/unit/price/UNKNOWN contract above. |
| YCLIENTS staff/service management | External AE owner admission and explicit preview/approval/readback contract. |
| Client onboarding and original-channel Admin | Trusted initial Client binding and canonical inbound/reply identity; OTP alone is insufficient. |
| Occupancy / Lifecycle / BI | Current explicit and bounded semantic slices have local evidence; broad real-model/provider quality remains unaccepted. No contact/campaign authority is inferred. |
| C10 initiation | Policy-bound machine principal and scoped admission decision; no expiring user event masquerading as background authority. |
| Delivery / device / release | Separate real provider/model/paid/production and reachable HTTPS/device authorization; no claim from local proofs. |

This is a decision brief, not a new approved normative contract or evidence that C10 is complete. `NOT_ISSUED`.
