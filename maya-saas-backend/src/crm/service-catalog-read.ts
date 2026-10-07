import type { ServiceOffering } from '../domain';

export const SERVICE_CATALOG_READ_CONTRACT =
  'maya.service-catalog.read/1' as const;

/** Request-local facts for the existing catalog READ. Never the public /services DTO or a quote. */
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
