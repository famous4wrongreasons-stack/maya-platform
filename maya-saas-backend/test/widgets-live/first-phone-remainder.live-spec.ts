import { firstPhoneSourceCensus } from './support/first-phone-source-census';
import { recordJestEvidence } from './support/evidence';
import {
  NO_PRICE_GOODS_PROFILE,
  PRICE_GOODS_DUTIES,
} from '../../src/entitlements/widget-release-profile.contract';

describe('First phone approval remainder [BUILD/RI; no HTTP approval carrier]', () => {
  it('FP-REMAINDER-U proves existing approval carrier absence and generic mint refusal without excluding whole clauses', () => {
    expect(firstPhoneSourceCensus()).toMatchObject({
      remainingApprovalCarrier: false,
      b35OwnerPreserved: true,
    });
    // Separate branch IDs are accepted only with the fixed branch inventory.
    // The default global collector cannot credit them to any of the 165 rows.
    if (process.env.WIDGETS_EVIDENCE_PROFILE === NO_PRICE_GOODS_PROFILE)
      recordJestEvidence({
        testId: 'FP-REMAINDER-U',
        recordHash: null,
        triggerTraceId: null,
        stoppedAtGate: null,
        gatesRun: null,
        labels: ['[U-proof]'],
        clauses: PRICE_GOODS_DUTIES.filter((id) => id !== 'G7-FR6d').map(
          (id) => `FP-${id}`,
        ),
        claim: 'U',
      });
  });
});
