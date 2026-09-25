// P-DISCHARGE — A2.7's reviewable withdrawal. Structural and executable checks make removal of a
// named mechanism fail in the same commit that changed its §A1 and K1 ledger status.
import fs from 'node:fs';
import path from 'node:path';
import {
  MECHANISM_GAP_BY_PREF,
  isMechanismNormativePending,
} from '../../widget-contract/mechanism-gap-ledger.runtime';
import { BOOKING_ACTUATING_TEMPLATES_DISCHARGED } from '../booking/booking-discharge.runtime';
import {
  BOOKING_INTENT_TEMPLATE_REGISTRY,
  resolveBookingTemplateForSynthesis,
} from '../booking/booking-intent-template.registry';
import {
  IntentTemplateRefusal,
  resolveIntentTemplate,
} from '../emission/intent-template.registry';
import { AE_WIDGET_COMMIT_ALLOWLIST } from './ae-commit-allowlist.runtime';
import { AE_PROPOSE_PAIRING } from './propose-pairing';

const SRC = path.resolve(__dirname, '..');
const read = (relative: string): string =>
  fs.readFileSync(path.join(SRC, relative), 'utf8');
const DISCHARGED = Object.freeze([
  'P-01',
  'P-08',
  'P-16',
  'P-18',
  'P-23',
  'P-25',
  'P-26',
  'P-30',
]);
const proposalFor = (
  key: keyof typeof BOOKING_INTENT_TEMPLATE_REGISTRY,
): Parameters<typeof resolveBookingTemplateForSynthesis>[0] => {
  const row = BOOKING_INTENT_TEMPLATE_REGISTRY[key];
  return {
    proposal: {
      intent_template_key: row.key,
      capability: row.subject,
      argument_handles: Object.fromEntries(
        row.allowedArgumentHandles.map((handle) => [
          handle,
          `${handle}-opaque`,
        ]),
      ),
      role: row.role,
    },
    widgetKind: row.kind,
    deliveryChannel: 'pwa',
  };
};

describe('P-DISCHARGE — exact A2.7 booking discharge', () => {
  it('DIS-1 withdraws exactly the complete booking prerequisites and keeps siblings pending', () => {
    for (const pRef of DISCHARGED) {
      expect(MECHANISM_GAP_BY_PREF.get(pRef)?.status).toBe('[EXISTS]');
      expect(MECHANISM_GAP_BY_PREF.get(pRef)?.blocking_rules).toEqual([]);
      expect(isMechanismNormativePending(pRef)).toBe(false);
    }
    for (const pRef of [
      'P-02',
      'P-12',
      'P-17',
      'P-33',
      'P-35',
      'P-36',
      'P-37',
      'P-38',
      'P-39',
    ])
      expect(isMechanismNormativePending(pRef)).toBe(true);
  });

  it('DIS-1 pins each named mechanism to its canonical path', () => {
    expect(read('widgets.controller.ts')).toContain("@Post('intent')");
    expect(read('routing/effect-router.service.ts')).toContain(
      'bookingMinter.mint',
    );
    expect(read('control/control-registry.service.ts')).toContain(
      "export const CONTROL_KEYS = ['control.widget.dismiss'] as const;",
    );
    expect(read('emission/record-writer.ts')).toContain(
      'producedByIntentTokenHash: isBookingCommit\n' +
        '      ? booking.producedByIntentTokenHash\n' +
        '      : null,',
    );
    expect(read('authority/ae-commit-allowlist.runtime.ts')).toContain(
      'AE_WIDGET_COMMIT_ALLOWLIST',
    );
    expect(read('authority/propose-pairing.ts')).toContain(
      'AE_PROPOSE_PAIRING',
    );
    expect(read('gates/gate6.ts')).toContain("case 'AE'");
    expect(read('emission/record-writer.ts')).toContain('sourceCapabilityKey');
  });

  it('DIS-2 admits only the six closed server-owned booking templates', () => {
    expect(BOOKING_ACTUATING_TEMPLATES_DISCHARGED).toBe(true);
    const keys = Object.keys(BOOKING_INTENT_TEMPLATE_REGISTRY) as Array<
      keyof typeof BOOKING_INTENT_TEMPLATE_REGISTRY
    >;
    expect(keys).toEqual([
      'draft.booking.create@1',
      'refine.booking.reschedule@1',
      'refine.booking.cancel@1',
      'commit.booking.create@1',
      'commit.booking.reschedule@1',
      'commit.booking.cancel@1',
    ]);
    for (const key of keys)
      expect(resolveBookingTemplateForSynthesis(proposalFor(key)).key).toBe(
        key,
      );
    for (const aeKey of [
      'crm.appointment.create.v1',
      'crm.appointment.reschedule.v1',
      'crm.appointment.cancel.v1',
    ]) {
      expect(AE_WIDGET_COMMIT_ALLOWLIST[aeKey]).toMatchObject({
        confirmation_kind: 'BOOKING_CONFIRMATION',
        family: 'booking',
      });
    }
    const pairs = AE_PROPOSE_PAIRING.map((row) => [
      row.propose.key,
      row.ae.key,
    ]);
    expect(pairs).toEqual(
      expect.arrayContaining([
        ['appointments.own.create', 'crm.appointment.create.v1'],
        ['appointments.own.reschedule', 'crm.appointment.reschedule.v1'],
        ['appointments.own.cancel', 'crm.appointment.cancel.v1'],
      ]),
    );
  });

  it('DIS-3 generic mutation templates and voice/spoken siblings remain unavailable', () => {
    for (const key of [
      'draft.blocked@1',
      'request-approval.blocked@1',
      'commit.blocked@1',
    ])
      expect(() =>
        resolveIntentTemplate({
          proposal: { intent_template_key: key, role: 'primary' },
          widgetKind: 'METRIC',
          deliveryChannel: 'pwa',
        }),
      ).toThrow(
        new IntentTemplateRefusal('generic_actuating_template_forbidden'),
      );
    expect(MECHANISM_GAP_BY_PREF.get('P-37')?.status).not.toBe('[EXISTS]');
    expect(MECHANISM_GAP_BY_PREF.get('P-39')?.status).not.toBe('[EXISTS]');
  });
});
