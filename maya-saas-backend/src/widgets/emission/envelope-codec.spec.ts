import { createHash } from 'node:crypto';
import { stableActionJson } from '../../action-engine/action-engine.identity';
import { envelopeBodyHash, envelopeBodyHashTerms } from './envelope.factory';

it('L5-H1: fractional-offset slot names use the same canonical codec as H7, not a parallel ASCII sort', () => {
  const envelope = {
    contract: 'maya.widget/1',
    kind: 'TIME_SLOT_SELECTOR',
    body_version: 1,
    body: { timezone: 'Asia/Kathmandu' },
    integrity: { cell_index_digest: 'cells' },
    provenance: {},
    limitations: [],
    intents: [],
    render: { render_tier: 'RICH_INTERACTIVE' },
    presentation: {
      a11y: {
        accessible_names: {
          'slot:a_b': '12:00',
          'slot:a-b': '12:30',
          'slot:aB': '13:00',
        },
      },
    },
  };
  const bytes = stableActionJson(envelopeBodyHashTerms(envelope));
  expect(envelopeBodyHash(envelope)).toBe(
    createHash('sha256').update(bytes).digest('hex'),
  );
});
