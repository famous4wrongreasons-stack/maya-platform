/** Test-only CRM edge. Non-thenable so async CrmService may return it normally. */
export function occupancyFixtureEdge<T extends object>(
  reads: T,
  unexpected: (key: string) => void,
): T {
  return new Proxy(reads, {
    get(target, key, receiver) {
      if (key === 'then') return undefined;
      if (typeof key === 'symbol' || key in target)
        return Reflect.get(target, key, receiver) as unknown;
      unexpected(String(key));
      throw new Error(`Unapproved synthetic CRM operation: ${String(key)}`);
    },
  });
}
