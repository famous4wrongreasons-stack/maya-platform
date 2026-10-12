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

  it('uses a server bootstrap reader without environment writes or tenant-config authority', async () => {
    delete process.env.YCLIENTS_PARTNER_TOKEN;
    const factory = new CrmAdapterFactory();
    const token = 'SYNTHETIC_PIPE_PARTNER_ONLY';
    factory.installPartnerTokenReader(() => token);
    factory.onModuleInit();
    const adapter = factory.create(CrmProvider.YCLIENTS, {
      provider: CrmProvider.YCLIENTS,
      apiToken: 'synthetic-user-token',
      settings: { partnerToken: 'caller-substitution-refused' },
    });
    await adapter.discoverCompanies?.();
    const init = (global.fetch as jest.MockedFunction<typeof fetch>).mock
      .calls[0][1];
    expect(init).toBeDefined();
    expect(new Headers(init?.headers).get('Authorization')).toContain(token);
    expect(new Headers(init?.headers).get('Authorization')).not.toContain(
      'caller-substitution',
    );
    expect(process.env.YCLIENTS_PARTNER_TOKEN).toBeUndefined();
    expect(() => factory.installPartnerTokenReader(() => token)).toThrow();
  });

  it('revoked or empty bootstrap credentials never fall back to an ambient token', () => {
    const factory = new CrmAdapterFactory();
    let current = true;
    factory.installPartnerTokenReader(() =>
      current ? 'SYNTHETIC_PIPE_PARTNER_ONLY' : '',
    );
    const config = {
      provider: CrmProvider.YCLIENTS,
      apiToken: 'synthetic-user-token',
      settings: {},
    };
    expect(() => factory.create(CrmProvider.YCLIENTS, config)).not.toThrow();
    current = false;
    expect(() => factory.create(CrmProvider.YCLIENTS, config)).toThrow(
      'CRM credential unavailable',
    );
    expect(() => factory.create(CrmProvider.ALTEGIO, config)).toThrow(
      'CRM credential unavailable',
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
