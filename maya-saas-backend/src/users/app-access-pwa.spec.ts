import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const pwa = readFileSync(
  resolve(__dirname, '../../../сайт и приложение/app.html'),
  'utf8',
);
const accessCode = pwa.slice(
  pwa.indexOf("var ME_APP_MODES = ['platform', 'owner', 'staff', 'client'];"),
  pwa.indexOf('function meAppAccessOpenMode('),
);

function browser(savedMode?: string) {
  const storage = new Map<string, string>();
  const key = 'me_app_mode_v1:tenant-1:user-1';
  if (savedMode) storage.set(key, savedMode);
  const localStorage = {
    getItem: jest.fn((name: string) => storage.get(name) ?? null),
    setItem: jest.fn((name: string, value: string) => storage.set(name, value)),
    removeItem: jest.fn((name: string) => storage.delete(name)),
  };
  const window = {} as Record<string, unknown>;
  const api = runInNewContext(
    `${accessCode}; ({
      normalize: meAppAccessNormalize,
      resolve: meAppAccessResolveFromMe,
      selectable: meAppAccessSelectableModes
    })`,
    { window, localStorage },
  ) as {
    normalize: (raw: unknown) => {
      available_modes: Array<{
        mode: string;
        access: string;
        profile_linked: boolean;
      }>;
    };
    resolve: (
      user: Record<string, unknown>,
      opts?: Record<string, unknown>,
    ) => { mode: string; descriptor: { access: string }; saved: boolean };
    selectable: (access: unknown) => Array<{ mode: string }>;
  };
  return { ...api, storage, localStorage, key };
}

const ownerWithUnlinkedClient = {
  id: 'user-1',
  tenant: { id: 'tenant-1' },
  app_access: {
    schema_version: 1,
    default_mode: 'owner',
    can_switch_mode: true,
    chooser_required: true,
    available_modes: [
      {
        mode: 'owner',
        access: 'granted',
        tenant_id: 'tenant-1',
        role: 'tenant_owner',
        profile_linked: true,
      },
      {
        mode: 'client',
        access: 'granted',
        tenant_id: 'tenant-1',
        role: 'tenant_owner',
        profile_linked: false,
      },
    ],
  },
};

describe('PWA app-access recovery for an unlinked Client surface', () => {
  it('downgrades an unlinked Client descriptor to read-only preview', () => {
    const { normalize } = browser();
    const access = normalize(ownerWithUnlinkedClient.app_access);

    expect(access.available_modes[1]).toEqual(
      expect.objectContaining({
        mode: 'client',
        access: 'preview',
        profile_linked: false,
      }),
    );
  });

  it('clears a stale Client choice and restores the granted owner mode', () => {
    const b = browser('client');

    expect(b.resolve(ownerWithUnlinkedClient, { skipChooser: true })).toEqual(
      expect.objectContaining({ mode: 'owner', saved: false }),
    );
    expect(b.storage.has(b.key)).toBe(false);
    expect(b.localStorage.removeItem).toHaveBeenCalledWith(b.key);
  });

  it('does not let an explicit Client-preview choice trap a business account', () => {
    const b = browser();

    expect(
      b.resolve(ownerWithUnlinkedClient, {
        forceMode: 'client',
        skipChooser: true,
      }).mode,
    ).toBe('owner');
  });

  it('keeps a Client-only account in safe preview without granting private access', () => {
    const b = browser();
    const client = {
      id: 'user-1',
      tenant: { id: 'tenant-1' },
      app_access: {
        schema_version: 1,
        default_mode: 'client',
        can_switch_mode: false,
        chooser_required: false,
        available_modes: [
          {
            mode: 'client',
            access: 'granted',
            tenant_id: 'tenant-1',
            role: 'client',
            profile_linked: false,
          },
        ],
      },
    };

    const resolved = b.resolve(client, { skipChooser: true });
    expect(resolved.mode).toBe('client');
    expect(resolved.descriptor.access).toBe('preview');
  });

  it('preserves a verified Client mode', () => {
    const b = browser('client');
    const verified = {
      ...ownerWithUnlinkedClient,
      app_access: {
        ...ownerWithUnlinkedClient.app_access,
        available_modes: ownerWithUnlinkedClient.app_access.available_modes.map(
          (mode) =>
            mode.mode === 'client' ? { ...mode, profile_linked: true } : mode,
        ),
      },
    };

    const resolved = b.resolve(verified, { skipChooser: true });
    expect(resolved.mode).toBe('client');
    expect(resolved.descriptor.access).toBe('granted');
    expect(resolved.saved).toBe(true);
  });

  it('never opens the blocking consent transition over Client preview', () => {
    const consent = pwa.slice(
      pwa.indexOf('function AMayaConsent()'),
      pwa.indexOf('window.AMayaConsent = AMayaConsent;'),
    );

    expect(consent).toContain("client.access === 'preview'");
    expect(consent.indexOf("client.access === 'preview'")).toBeLessThan(
      consent.indexOf("authedFetch('/client-channel/status')"),
    );
  });
});
