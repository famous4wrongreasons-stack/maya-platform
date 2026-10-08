# Service rename: bounded READ preview

Source inspected: `d90243a6cb655a82de1ceb347f25cddfd04de074`, 2026-10-08. This is an implementation design for an explicit owner request, with no writer, Action Engine capability, widget authority, provider mutation, schema or new store.

## Existing source and reuse boundary

- `src/crm/adapters/yclients-crm.adapter.ts:getServicePriceSnapshot` performs an uncached permission GET and exact service GET. Its pricing permission is not a title permission.
- `src/crm/yclients-service-price.contract.ts:servicePriceSnapshot` qualifies the complete preservation payload: fixed RUB price, local/non-chain individual service, required request fields, explicit technical break, bounded dates, and plain staff links. Reuse this pure qualification only; do not loosen or call the price writer.
- `updateServiceFixedPrice` demonstrates why a partial PATCH is unsafe: required fields and omission defaults need preservation. Its `nonPriceHash` cannot prove a rename: it includes title and excludes prices. Rename needs a separate hash excluding only primary title and retaining prices plus all observed unrelated source fields.
- The public booking catalog cannot supply this management snapshot or authorize editing.

Official API review by the API agent confirms current GET/PATCH `company/{company_id}/services/{service_id}` and the three title permissions under `settings`: `settings_services_access`, `services_edit`, `settings_services_edit_title_access`. No price-edit grant is required for this READ-only title preview. The latest retrieved OpenAPI serialization matches SHA256 `9ba4c2deca4197aeee333c95b4d641f19073ef91b40279b0fc83651bd502157b`.

The API has no documented title maxLength. A 240-character title bound is an application limit. Empty booking/print titles inherit primary title; byte equality of an empty value cannot demonstrate preservation of the effective label. Nonempty booking title is already required by the existing qualifier. Explicit print-title preservation must be qualified from the GET/PATCH contract or reported as a limitation before a future writer is considered.

## Finite owner ports

```ts
CRMAdapter.readServiceRenameSnapshot?(serviceId: string, deadlineAt?: number): Promise<ServiceRenameSnapshot>;
CrmService.serviceRenameReadIdentity(tenantId: string, userId: string): Promise<string>;
CrmService.previewServiceRenameForActor(
  tenantId: string, userId: string, serviceId: string,
  newTitle: string, expectedRevision: string,
): Promise<ServiceRenamePreview>;
```

The optional adapter method is a READ port. It does not require an implemented writer. A missing implementation is unavailable, never a local-catalog fallback.

New pure helpers validate IDs and explicit title, derive the separate immutable rename snapshot and project a closed preview. The internal snapshot may carry the qualified preservation body; no raw provider body, supplier/notes/staff arrays or write payload is returned to chat.

Preview fields:

```ts
{
  contract: 'maya.service-rename.preview/1',
  source: 'external_crm',
  scope: 'single_existing_service_title',
  as_of: string,
  company_id: string,
  service_id: string,
  old_title: string,
  new_title: string,
  booking_title: string,
  source_revision: string,       // opaque expected-current metadata witness
  current_revision: string,      // exact observed service snapshot
  preserved_fields_hash: string, // all observed non-title fields, including prices
  blocked_reason: 'approval_lane_not_registered',
  preview_only: true,
  noSideEffects: true,
  limitations: string[],
}
```

Final API review: service `print_title` is absent from GET/PATCH schemas and occurs only in a PATCH response example. It is therefore not added to the internal preservation payload or public projection. The preview explicitly carries `print_title_effective_label_not_qualified` and `future_write_preservation_not_qualified`; no effective printed-label preservation is claimed. Money/duration/staff numeric bytes and internal patch payloads are excluded from the chat projection. A hash is evidence, never edit authority. Equal old/new title is a refused no-op or a clearly identified unchanged preview, never success of an edit.

## Current authorization and source witness

1. Validate explicit service ID/title and the expected lowercase SHA256 source revision before provider work.
2. Use current tenant context and actor ID. Require active tenant, user and membership with TENANT_OWNER/BUSINESS_OWNER; reject branch-scoped membership. Check `ai.owner` and `crm.integration` features with the existing EntitlementsService.
3. Require external calendar and the active native YCLIENTS stored integration. The metadata witness includes tenant/integration identity, status, settings, base URL and an existing opaque credential reference, plus any configured company-to-branch binding/current branch facts. It contains no credential bytes in output.
4. If a binding exists, normalize it and verify the exact branch belongs to this tenant and matches the stored company. Reject malformed/deleted/foreign mappings. An unbound tenant-wide company retains the established owner scope and makes no branch attribution claim. No request can select a different company or branch.
5. Compare the expected source revision before the adapter read. Adapter uses a single bounded sequence under one 20-second deadline: permission GET, exact service GET, permission recheck. No retries, alternate endpoint, list search, PATCH or default values. Preserve raw numeric tokens for source qualification; require success:true and exactly one requested identity.
6. Re-resolve current actor/features/calendar/integration/branch after provider awaits. Compare source identity and returned company/service before exposing the preview. Runtime must repeat the metadata witness check on cached READ and after awaited persistence/presentation, as in the existing goods READ pattern.

Conservative qualification of fixed-price RUB/non-chain/non-group data is a local implementation scope, not a statement that YCLIENTS requires those properties for renaming. Incomplete GET data remains unavailable: the published GET schema omits several PATCH-required fields, so neither missing fields nor defaults may be fabricated.

## Exact proposed file scope

- New `src/crm/yclients-service-rename.contract.ts` and `.spec.ts`.
- `src/crm/crm-adapter.interface.ts`: optional typed READ only.
- `src/crm/adapters/yclients-crm.adapter.ts`: native bounded READ method only; new `src/crm/adapters/yclients-service-rename.spec.ts`.
- `src/crm/crm.service.ts`: finite current owner/source identity and preview methods; new `src/crm/service-rename-actor.spec.ts`.
- Root/other agent owns tool registry/C9/runtime/AiCore integration. No writer/AE/widget files in this work slice.

## Focused test plan and limits

- Pure contract: exact title-only diff, nonempty protected labels, prices/duration/staff/date/technical-break included in preservation hash, unsupported/oversized/incomplete source refuses, exact ID, control/length bounds, unknown extras never projected.
- Adapter: exact native paths; title-edit grant true with price-edit false still permits READ; title grant missing/false/string refuses; permission change after detail refuses; exact array/success/identity; one deadline; only bounded GETs; no cache/retry/fallback or mutation.
- CRM owner: before-read and during-await changes in tenant/user/membership/role/branch/features/calendar/integration/credentials/company/binding refuse; foreign tenant/actor refuses; missing adapter and mismatched result refuse; preview is closed and carries only evidence/blocked status.

No tests, servers, providers, model calls or gates were run during the design phase. Synthetic targeted specs will be authored and root runs them in its serial slot. A functional preview is not an approved rename or live-provider acceptance.
