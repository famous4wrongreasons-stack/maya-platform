import type { ServiceOffering } from '../domain';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { stableActionJson } from '../action-engine/action-engine.identity';
import type { ClientBookingCalendarTarget } from '../action-engine/client-booking-intent.contract';

export const SERVICE_CATALOG_READ_CONTRACT =
  'maya.service-catalog.read/1' as const;

/** Request-local CRM facts. A catalog item is not a confirmed booking quote. */
export interface ServiceCatalogReadItem {
  id: string;
  name: string;
  price: number | null;
  price_min: number | null;
  price_max: number | null;
  duration_minutes: number | null;
  currency: string | null;
  category: string | null;
  limitations: string[];
}
export interface ServiceCatalogRead {
  contract: typeof SERVICE_CATALOG_READ_CONTRACT;
  source: 'internal_calendar' | 'external_crm' | 'synthetic';
  scope: 'active_services' | 'public_booking_catalog';
  as_of: string;
  /** Neither source visibility nor bounded downstream lists certify completeness. */
  catalog_exhaustive: false;
  services: ServiceCatalogReadItem[];
}
export function assertCatalogIdentities(
  items: readonly { id: string; name: string }[],
): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (!item.id.trim() || !item.name.trim() || ids.has(item.id))
      throw new Error('service_catalog_identity_unavailable');
    ids.add(item.id);
  }
}
export function observedServiceCatalog(
  services: readonly ServiceOffering[],
  source: 'internal_calendar' | 'synthetic',
): ServiceCatalogRead {
  assertCatalogIdentities(services);
  return {
    contract: SERVICE_CATALOG_READ_CONTRACT,
    source,
    scope: 'active_services',
    as_of: new Date().toISOString(),
    catalog_exhaustive: false,
    services: services.map((s) => ({
      id: s.id,
      name: s.name,
      price: s.price,
      price_min: s.price,
      price_max: s.price,
      duration_minutes: s.duration_minutes,
      currency: s.currency,
      category: s.category ?? null,
      limitations: [],
    })),
  };
}

/** Narrow a factual catalog to the exact services a new booking can describe.
 * Unknowns remain readable in the catalog, but cannot become booking terms. */
export function requireBookableServiceFacts(
  catalog: ServiceCatalogRead,
  serviceIds: readonly string[],
): ServiceOffering[] {
  const ids = [...new Set(serviceIds)];
  if (!ids.length)
    throw new BadRequestException({ error: { code: 'service_not_found' } });
  const selected = ids.map((id) => {
    const matches = catalog.services.filter((service) => service.id === id);
    if (matches.length !== 1)
      throw new BadRequestException({ error: { code: 'service_not_found' } });
    const service = matches[0];
    if (
      !service.name.trim() ||
      typeof service.price !== 'number' ||
      !Number.isFinite(service.price) ||
      service.price < 0 ||
      service.price_min !== service.price ||
      service.price_max !== service.price ||
      typeof service.duration_minutes !== 'number' ||
      !Number.isFinite(service.duration_minutes) ||
      service.duration_minutes <= 0 ||
      typeof service.currency !== 'string' ||
      !/^[A-Z]{3}$/.test(service.currency)
    )
      throw new ServiceUnavailableException({
        error: { code: 'booking_service_facts_unavailable' },
      });
    return {
      id: service.id,
      name: service.name,
      price: service.price,
      duration_minutes: service.duration_minutes,
      currency: service.currency,
      ...(service.category === null ? {} : { category: service.category }),
    };
  });
  if (new Set(selected.map((service) => service.currency)).size !== 1)
    throw new ServiceUnavailableException({
      error: { code: 'booking_service_facts_unavailable' },
    });
  return selected;
}

export const BOOKING_FACTS_EVIDENCE_PREFIX = 'booking-service-facts:v1:';

/** Optimistic business-terms precondition, never authority or execution identity. */
export function bookingServiceFactsFingerprint(
  selection: {
    tenantId: string;
    clientId: string;
    calendarTarget: ClientBookingCalendarTarget;
    branchId: string | null;
    staffId: string;
    start: string;
    timezone: string;
    /** Optional immutable source revision for explicitly bound native bookings. */
    branchSourceRevision?: string;
  },
  services: readonly ServiceOffering[],
): string {
  return createHash('sha256')
    .update(
      stableActionJson({
        contract: 'maya.booking-service-facts/1',
        ...selection,
        services: [...services]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((s) => ({
            id: s.id,
            name: s.name,
            price: s.price,
            currency: s.currency,
            durationMinutes: s.duration_minutes,
          })),
      }),
    )
    .digest('hex');
}
