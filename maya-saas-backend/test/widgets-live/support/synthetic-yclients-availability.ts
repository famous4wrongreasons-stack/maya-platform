/** Real YclientsCRMAdapter availability + a finite in-process provider response.
 * This edge never calls a network transport and supplies no branch mapping. */
import assert from 'node:assert/strict';
import { CrmProvider } from '../../../src/common/domain.enums';
import { YclientsCRMAdapter } from '../../../src/crm/adapters/yclients-crm.adapter';

const origin = 'https://synthetic-yc-availability.invalid';
export function syntheticYclientsAvailability(companyId: string, day: string) {
  assert.match(companyId, /^\d+$/);
  assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
  // Owned HTTP runner has no provider environment. Do not copy any credential.
  assert.equal(process.env.YCLIENTS_PARTNER_TOKEN, undefined);
  let adapter: YclientsCRMAdapter;
  process.env.YCLIENTS_PARTNER_TOKEN = 'SYNTHETIC_PARTNER_NOT_A_CREDENTIAL';
  try {
    adapter = new YclientsCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'SYNTHETIC_USER_NOT_A_CREDENTIAL',
      baseUrl: origin + '/api/v1',
      settings: { companyId },
    });
  } finally {
    delete process.env.YCLIENTS_PARTNER_TOKEN;
  }
  let reads = 0;
  return {
    adapter,
    get reads() {
      return reads;
    },
    respond(
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ): Response | undefined {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (url.origin !== origin) return undefined;
      assert.equal(init?.method, 'GET');
      assert.equal(init.body, undefined);
      assert.equal(url.pathname, `/api/v1/book_times/${companyId}/71/${day}`);
      assert.equal(
        JSON.stringify([...url.searchParams]),
        JSON.stringify([
          ['date', day],
          ['service_ids[]', '81'],
        ]),
      );
      assert.equal(
        new Headers(init.headers).get('authorization'),
        'Bearer SYNTHETIC_PARTNER_NOT_A_CREDENTIAL, User SYNTHETIC_USER_NOT_A_CREDENTIAL',
      );
      reads++;
      return new Response(
        JSON.stringify({
          success: true,
          data: [
            { time: '17:00', datetime: day + 'T17:00:00', seance_length: 1800 },
          ],
        }),
      );
    },
  };
}
