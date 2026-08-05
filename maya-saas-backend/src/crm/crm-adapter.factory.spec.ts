import { CrmProvider } from '../common/domain.enums';
import { CrmAdapterFactory } from './crm-adapter.factory';

describe('CrmAdapterFactory', () => {
  const originalFetch = global.fetch;
  const originalPartnerToken = process.env.YCLIENTS_PARTNER_TOKEN;
  const originalYclientsBaseUrl = process.env.YCLIENTS_BASE_URL;
  const originalAltegioBaseUrl = process.env.ALTEGIO_BASE_URL;

  beforeEach(() => {
    process.env.YCLIENTS_PARTNER_TOKEN = 'partner-token';
    process.env.YCLIENTS_BASE_URL = 'https://yclients.example/api/v1';
    process.env.ALTEGIO_BASE_URL = 'https://altegio.example/api/v1';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ data: [] })),
    }) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    restoreEnv('YCLIENTS_PARTNER_TOKEN', originalPartnerToken);
    restoreEnv('YCLIENTS_BASE_URL', originalYclientsBaseUrl);
    restoreEnv('ALTEGIO_BASE_URL', originalAltegioBaseUrl);
    jest.restoreAllMocks();
  });

  it('routes YClients requests to the YClients API host', async () => {
    const adapter = new CrmAdapterFactory().create(CrmProvider.YCLIENTS, {
      provider: CrmProvider.YCLIENTS,
      apiToken: 'user-token',
      settings: {},
    });

    await adapter.discoverCompanies?.();

    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    const [input] = fetchMock.mock.calls[0] ?? [];
    expect(requestUrl(input)).toBe(
      'https://yclients.example/api/v1/companies?my=1',
    );
  });

  it('routes Altegio requests to the Altegio API host', async () => {
    const adapter = new CrmAdapterFactory().create(CrmProvider.ALTEGIO, {
      provider: CrmProvider.ALTEGIO,
      apiToken: 'user-token',
      settings: {},
    });

    await adapter.discoverCompanies?.();

    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    const [input] = fetchMock.mock.calls[0] ?? [];
    expect(requestUrl(input)).toBe(
      'https://altegio.example/api/v1/companies?my=1',
    );
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function requestUrl(input: RequestInfo | URL | undefined): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input?.url ?? '';
}
