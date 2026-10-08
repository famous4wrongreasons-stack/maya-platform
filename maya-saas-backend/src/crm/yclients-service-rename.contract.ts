import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { goodsId } from './yclients-goods-read';
import {
  servicePriceHash,
  servicePriceSnapshot,
} from './yclients-service-price.contract';

/** Application bounds, not a claimed provider title maxLength. */
export const SERVICE_RENAME_TITLE_MAX_LENGTH = 240;
export const SERVICE_RENAME_SOURCE_MAX_BYTES = 64 * 1024;
const controls = /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u;

export function serviceRenameTitle(value: unknown): string {
  if (
    typeof value !== 'string' ||
    controls.test(value) ||
    !value.trim() ||
    value.trim().length > SERVICE_RENAME_TITLE_MAX_LENGTH
  )
    throw new BadRequestException({
      error: { code: 'service_rename_title_invalid' },
    });
  return value.trim();
}
export function serviceRenameId(value: unknown): string {
  try {
    return goodsId(value);
  } catch {
    throw new BadRequestException({
      error: { code: 'service_rename_id_invalid' },
    });
  }
}
export function serviceRenameRevision(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    throw new BadRequestException({
      error: { code: 'service_rename_source_revision_invalid' },
    });
  return value;
}
export function serviceRenameUnavailable(code: string, cause?: unknown): never {
  throw new ServiceUnavailableException(
    {
      message:
        'Не удалось проверить актуальные данные услуги YCLIENTS. Изменение не выполнялось.',
      error: { code },
    },
    { cause },
  );
}
export function serviceRenameSourceChanged(): never {
  throw new ConflictException({
    error: { code: 'service_rename_source_changed' },
  });
}

export interface ServiceRenameSnapshot {
  contract: 'maya.yclients-service-rename.snapshot/1';
  companyId: string;
  serviceId: string;
  title: string;
  bookingTitle: string;
  asOf: string;
  revision: string;
  preservedFieldsHash: string;
  /** Internal qualification only. Not a writable contract and never a chat projection. */
  preservedPayload: Readonly<Record<string, unknown>>;
}
export interface ServiceRenamePreview {
  contract: 'maya.service-rename.preview/1';
  source: 'external_crm';
  scope: 'single_existing_service_title';
  as_of: string;
  company_id: string;
  service_id: string;
  old_title: string;
  new_title: string;
  booking_title: string;
  source_revision: string;
  current_revision: string;
  preserved_fields_hash: string;
  blocked_reason: 'approval_lane_not_registered';
  preview_only: true;
  noSideEffects: true;
  limitations: string[];
}

/** Separate title permission, never the price-edit flag. The pinned 2026-10-08
 * capture remains SHA256 9ba4c2deca4197aeee333c95b4d641f19073ef91b40279b0fc83651bd502157b. */
export function serviceRenamePermissions(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    serviceRenameUnavailable('service_rename_provider_permission_denied');
  const settings = (value as Record<string, unknown>).settings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings))
    serviceRenameUnavailable('service_rename_provider_permission_denied');
  const fields = [
    'settings_services_access',
    'services_edit',
    'settings_services_edit_title_access',
  ] as const;
  if (fields.some((key) => (settings as Record<string, unknown>)[key] !== true))
    serviceRenameUnavailable('service_rename_provider_permission_denied');
  return servicePriceHash(Object.fromEntries(fields.map((key) => [key, true])));
}

/** The existing price qualifier is reused only as conservative source-shape
 * validation. This snapshot has no financial effect or writer admission. */
export function serviceRenameSnapshot(
  raw: unknown,
  companyId: string,
  serviceId: string,
  currency: string,
): ServiceRenameSnapshot {
  try {
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      Buffer.byteLength(JSON.stringify(raw), 'utf8') >
        SERVICE_RENAME_SOURCE_MAX_BYTES
    )
      throw new Error('bounded_service_source_required');
    const source = raw as Record<string, unknown>;
    if (
      source.active !== true &&
      source.active !== 1 &&
      source.active !== '1' &&
      source.active !== 'true'
    )
      throw new Error('active_service_source_required');
    const qualified = servicePriceSnapshot(raw, companyId, serviceId, currency);
    const bookingTitle = qualified.patchBody.booking_title;
    if (
      typeof bookingTitle !== 'string' ||
      !bookingTitle.trim() ||
      bookingTitle.length > SERVICE_RENAME_TITLE_MAX_LENGTH ||
      controls.test(bookingTitle) ||
      controls.test(qualified.name)
    )
      throw new Error('explicit_bounded_service_labels_required');
    const { title: observedTitle, ...observedPreserved } = source;
    const { title: requestTitle, ...qualifiedPreserved } = qualified.patchBody;
    void observedTitle;
    void requestTitle;
    // Include prices and every observed non-title field. A price lane's
    // nonPriceHash would omit protected prices and include the changed title.
    const preservedFieldsHash = servicePriceHash({
      companyId: qualified.companyId,
      serviceId: qualified.serviceId,
      observed: observedPreserved,
      qualified: qualifiedPreserved,
    });
    return {
      contract: 'maya.yclients-service-rename.snapshot/1',
      companyId: qualified.companyId,
      serviceId: qualified.serviceId,
      title: qualified.name,
      bookingTitle,
      asOf: new Date().toISOString(),
      revision: servicePriceHash({
        contract: 'maya.yclients-service-rename.snapshot/1',
        observedRevision: qualified.revision,
        preservedFieldsHash,
      }),
      preservedFieldsHash,
      preservedPayload: Object.freeze({ ...qualified.patchBody }),
    };
  } catch (error) {
    serviceRenameUnavailable('service_rename_unsupported_source', error);
  }
}

export function serviceRenamePreview(
  snapshot: ServiceRenameSnapshot,
  newTitle: string,
  sourceRevision: string,
): ServiceRenamePreview {
  const title = serviceRenameTitle(newTitle);
  if (snapshot.title === title)
    throw new ConflictException({
      error: { code: 'service_rename_already_current' },
    });
  return {
    contract: 'maya.service-rename.preview/1',
    source: 'external_crm',
    scope: 'single_existing_service_title',
    as_of: snapshot.asOf,
    company_id: snapshot.companyId,
    service_id: snapshot.serviceId,
    old_title: snapshot.title,
    new_title: title,
    booking_title: snapshot.bookingTitle,
    source_revision: serviceRenameRevision(sourceRevision),
    current_revision: snapshot.revision,
    preserved_fields_hash: snapshot.preservedFieldsHash,
    blocked_reason: 'approval_lane_not_registered',
    preview_only: true,
    noSideEffects: true,
    limitations: [
      'fixed_rub_local_individual_service_scope',
      'print_title_effective_label_not_qualified',
      'future_write_preservation_not_qualified',
      'preview_does_not_authorize_mutation',
    ],
  };
}
