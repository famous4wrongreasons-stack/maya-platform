// K3 — the one tenant fence of the widget stores.
//
// The stores were one service for one reason: a tenant fence repeated in several files will
// eventually be repeated wrong. U0 (D-6) split them into sub-stores behind the `WidgetStoresService`
// facade, so the fence moved here, once, and every store file imports it. `scoped()` is the only way
// a tenant id enters a store query's `where`.

/**
 * The only place a tenant id enters a store query's `where`. An empty tenant is refused before any
 * query is built, so "is this tenant-fenced?" has one answer instead of one per method.
 */
export const scoped = <T extends object>(
  tenantId: string,
  where: T,
): T & { tenantId: string } => {
  if (!tenantId) throw new Error('widget store: refusing an unscoped query');
  return { ...where, tenantId };
};
