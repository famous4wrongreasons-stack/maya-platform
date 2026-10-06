import {
  scheduleTemplate,
  SCHEDULE_AE,
  SCHEDULE_TEMPLATE,
} from './schedule-intent-template';
import { resolveIntentTemplate } from './intent-template.registry';
import type { IntentProposal } from '../../widget-contract/derived-shapes';
const proposal: IntentProposal = {
  intent_template_key: SCHEDULE_TEMPLATE,
  capability: { space: 'AE', key: SCHEDULE_AE },
  role: 'primary',
  argument_handles: { approval: 'opaque-a', payload: 'opaque-b' },
};
describe('exact schedule confirmation recipe', () => {
  it.each(['pwa', 'native-shell'])(
    'admits only the declared recipe on %s',
    (channel) => {
      expect(
        scheduleTemplate(proposal, 'SETTINGS_DRAFT', channel),
      ).toMatchObject({ effect: 'COMMIT', singleUse: true, inputSchema: null });
    },
  );
  it.each([
    { ...proposal, capability: { space: 'AE', key: 'invented' } },
    {
      ...proposal,
      argument_handles: { approval: 'a', payload: 'b', slots: 'raw' },
    },
    { ...proposal, role: 'secondary' },
  ])('refuses altered semantics', (value) => {
    expect(() =>
      scheduleTemplate(value as IntentProposal, 'SETTINGS_DRAFT', 'pwa'),
    ).toThrow();
  });
  it('does not admit the new recipe through the generic minter', () => {
    expect(() =>
      resolveIntentTemplate({
        proposal,
        widgetKind: 'SETTINGS_DRAFT',
        deliveryChannel: 'pwa',
      }),
    ).toThrow();
  });
  it('never reuses the booking confirmation kind', () => {
    expect(() =>
      scheduleTemplate(proposal, 'BOOKING_CONFIRMATION', 'pwa'),
    ).toThrow();
  });
});
