import { SuccessorMinterService } from './successor-minter.service';

const proof = 'a'.repeat(64);
const input = {
  tenantId: 'tenant',
  predecessorWidgetId: 'prior',
  predecessorIntentTokenHash: 'token',
  principal: { authority: { tenantId: 'tenant' }, proofHash: proof },
};
const predecessor = () => ({
  widgetId: 'prior',
  turnId: 'turn',
  kind: 'SCHEDULE',
  lifecycleState: 'SUPERSEDED',
  supersededByWidgetId: 'next',
  deliveryChannel: 'pwa',
  textEquivalentJson: {},
  erasedAt: null,
  turn: { conversationId: 'conversation', erasedAt: null },
  intentRecords: [{ principalProofHash: proof, erasedAt: null }],
  renderReceipts: [
    {
      deliveryChannel: 'pwa',
      erasedAt: null,
      composedEnvelopeJson: {
        provenance: { source_capability: 'operations.journal.read' },
      },
    },
  ],
});
const fixture = (allow: (widget: string) => boolean) => {
  const findFirst = jest
    .fn()
    .mockResolvedValueOnce(predecessor())
    .mockResolvedValue({
      widgetId: 'next',
      renderReceipts: [{ emittedEnvelopeJson: { contract: 'stored' } }],
    });
  const access = {
    bindMint: jest.fn(),
    admits: jest.fn(),
    canProject: jest.fn((_: string, widget: string) =>
      Promise.resolve(allow(widget)),
    ),
  };
  return {
    findFirst,
    access,
    service: new SuccessorMinterService(
      { widgetEmission: { findFirst } } as never,
      {} as never,
      access,
    ),
  };
};
describe('PROFILE stored successor release admission [BUILD]', () => {
  it('PROFILE-SUCCESSOR returns the existing successor only while both admissions remain current', async () => {
    const f = fixture(() => true);
    await expect(f.service.mint(input as never)).resolves.toEqual({
      widgetId: 'next',
      envelope: { contract: 'stored' },
    });
    expect(f.access.canProject.mock.calls.map((call) => call[1])).toEqual([
      'prior',
      'next',
    ]);
  });
  it('PROFILE-PREDECESSOR refuses a withdrawn predecessor without following its stored successor', async () => {
    const f = fixture(() => false);
    await expect(f.service.mint(input as never)).resolves.toBeNull();
    expect(f.findFirst).toHaveBeenCalledTimes(1);
  });
  it('PROFILE-LINKED refuses the stored successor when its own grant is no longer current', async () => {
    const f = fixture((widget) => widget === 'prior');
    await expect(f.service.mint(input as never)).resolves.toBeNull();
    expect(f.findFirst).toHaveBeenCalledTimes(2);
  });
});
