import type { CrmPendingLocator } from '../../../maya-chat-shell/src/shell/local-crm-setup.ts';
import type { CrmOperationLocator } from '../../../maya-chat-shell/src/net/types.ts';

// A browser URL carries only a non-authorizing operation locator. The authenticated server
// resolves its tenant/actor scope; credentials, source facts and consent never enter the URL.
export function createCrmPendingLocation(host: { readonly href: () => string; readonly replace: (relative: string) => void }): CrmPendingLocator {
  const valid = (value: CrmOperationLocator) => ['install', 'activate'].includes(value.operation) && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.requestId);
  const read = (): CrmOperationLocator | 'invalid' | null => {
    const url = new URL(host.href());
    const kinds = url.searchParams.getAll('crm_operation'), ids = url.searchParams.getAll('crm_request');
    if (!kinds.length && !ids.length) return null;
    if (kinds.length !== 1 || ids.length !== 1 || !['install', 'activate'].includes(kinds[0] ?? '') || !ids[0]) return 'invalid';
    const value: CrmOperationLocator = { operation: kinds[0] as 'install' | 'activate', requestId: ids[0] };
    return valid(value) ? value : 'invalid';
  };
  const replace = (url: URL) => host.replace(url.pathname + url.search + url.hash);
  return {
    read,
    save(value) {
      if (!valid(value) || read() !== null) return false;
      const url = new URL(host.href());
      url.searchParams.set('crm_operation', value.operation);
      url.searchParams.set('crm_request', value.requestId);
      replace(url);
      const observed = read();
      return observed !== null && observed !== 'invalid' && observed.operation === value.operation && observed.requestId === value.requestId;
    },
    clear(value) {
      const observed = read();
      if (observed === null || observed === 'invalid' || observed.operation !== value.operation || observed.requestId !== value.requestId) return false;
      const url = new URL(host.href());
      url.searchParams.delete('crm_operation'); url.searchParams.delete('crm_request');
      replace(url);
      return read() === null;
    },
  };
}
