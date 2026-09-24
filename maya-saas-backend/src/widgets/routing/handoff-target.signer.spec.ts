import { HandoffTargetSigner } from './handoff-target.signer';

describe('U13b handoff target signer', () => {
  const seals = { signHandoff: jest.fn(() => 'signed-target') };
  const signer = new HandoffTargetSigner(seals as never);
  const base = {
    tenantId: 't1',
    principalProofHash: 'p'.repeat(64),
    widgetId: 'w1',
    intentTokenHash: 'i'.repeat(64),
    target: { class: 's', ref: { route: 'shell.account' } },
    issuedAt: new Date('2026-09-24T00:00:00.000Z'),
    expiresAt: new Date('2026-09-24T00:10:00.000Z'),
  };

  beforeEach(() => seals.signHandoff.mockClear());

  it('returns exactly the signed route key and opaque handle', () => {
    expect(signer.sign(base)).toEqual({
      route_key: 'shell.account',
      opaque_handle: 'signed-target',
    });
    expect(Object.keys(signer.sign(base) ?? {}).sort()).toEqual([
      'opaque_handle',
      'route_key',
    ]);
    expect(seals.signHandoff).toHaveBeenCalledWith(
      expect.stringContaining(base.intentTokenHash),
    );
    expect(seals.signHandoff).toHaveBeenCalledWith(
      expect.stringContaining(base.principalProofHash),
    );
  });

  it.each([
    null,
    {},
    { class: 'detail', ref: { route: 'shell.account' } },
    { class: 's', ref: {} },
    { class: 's', ref: { route: 42 } },
  ])('refuses malformed or non-handoff targets before signing', (target) => {
    expect(signer.sign({ ...base, target })).toBeNull();
    expect(seals.signHandoff).not.toHaveBeenCalled();
  });
});
