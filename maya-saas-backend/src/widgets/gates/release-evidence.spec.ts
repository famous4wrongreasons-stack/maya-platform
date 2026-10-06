import { emittable } from '../../widget-contract/owner-classes';
import { ActionCapabilityRegistry } from '../../action-engine/action-engine.registry';
import {
  MONEY,
  AE_WIDGET_COMMIT_ALLOWLIST as RUNTIME_ALLOWLIST,
} from '../authority/ae-commit-allowlist.runtime';
import fs from 'node:fs';
import path from 'node:path';
import { AE_WIDGET_COMMIT_ALLOWLIST } from '../booking/booking-allowlist';
import {
  AE_PROPOSE_PAIRING,
  hasExactlyOnePairing,
  pairingForAe,
} from '../authority/propose-pairing';

const widgets = path.resolve(__dirname, '..');
const read = (name: string) =>
  fs.readFileSync(path.join(widgets, name), 'utf8');
const sources = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory()
      ? sources(p)
      : e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')
        ? [p]
        : [];
  });

describe('Final release evidence scope', () => {
  it('WF-PAIR-ALL every allowlisted booking subject has exactly one canonical confirmation pairing', () => {
    expect(AE_WIDGET_COMMIT_ALLOWLIST.map((r) => r.ae).sort()).toEqual([
      'crm.appointment.cancel.v1',
      'crm.appointment.create.v1',
      'crm.appointment.reschedule.v1',
    ]);
    for (const row of AE_WIDGET_COMMIT_ALLOWLIST) {
      expect(row.confirmationKind).toBe('BOOKING_CONFIRMATION');
      expect(
        AE_PROPOSE_PAIRING.filter((p) => p.ae.key === row.ae),
      ).toHaveLength(1);
      expect(hasExactlyOnePairing(row.ae)).toBe(true);
      expect(pairingForAe(row.ae)?.propose.key).toBe(
        `appointments.own.${row.ae.split('.')[2]}`,
      );
    }
  });

  it('WF-U-R1A-ABSENCE current production confirmation entry uses the typed PWA path; a future spoken producer invalidates this U receipt', () => {
    // PKT:471 / Sheet 07 S7-3. Voice profiles exist; the absence claim is
    // specifically a production-minted SPOKEN COMMIT, not absence of voice code.
    const all = sources(path.resolve(widgets, '..'));
    const calls = all.filter((p) =>
      /\.emitBookingConfirmation\s*\(/.test(fs.readFileSync(p, 'utf8')),
    );
    expect(calls.map((p) => path.relative(widgets, p))).toEqual([
      'emission/booking-confirmation-minter.service.ts',
    ]);
    expect(read('emission/booking-confirmation-minter.service.ts')).toContain(
      'requiresReadback: false,',
    );
    expect(read('emission/booking-confirmation-minter.service.ts')).toContain(
      'deliveryChannel: input.deliveryChannel,',
    );
    expect(read('routing/effect-router.service.ts')).toContain(
      'deliveryChannel: input.routing.answeringChannel,',
    );
    expect(read('routing/routing-input.ts')).toContain(
      'answeringChannel: ctx.carrier,',
    );
    expect(read('intent-submit-args.ts')).toContain("carrier: 'pwa',");
    expect(read('widgets.controller.ts')).toContain(
      'this.gateway.submit(intentSubmitArgs(dto, actor))',
    );
    const minterUsers = all.filter((p) =>
      /\.bookingMinter\.mint\s*\(/.test(fs.readFileSync(p, 'utf8')),
    );
    expect(minterUsers.map((p) => path.relative(widgets, p))).toEqual([
      'routing/effect-router.service.ts',
    ]);
    expect(read('gates/gate-8r.owners.ts')).toContain(
      'isReadbackAffirmation: null',
    );
  });
});

// Current V1.4 candidate: the exact catalogue-price subtype is the sole MONEY
// addition. This structural check does not issue new §4.5 release evidence.
it('AR-FR6D-SCOPE pins only YC-SP1 inside MONEY and retains the payment emission gap', () => {
  const registry = new ActionCapabilityRegistry();
  expect(Object.keys(RUNTIME_ALLOWLIST)).toHaveLength(11);
  const money = Object.keys(RUNTIME_ALLOWLIST).filter((key) =>
    MONEY(registry.get(key)),
  );
  expect(money).toEqual(['crm.service.fixed-price.update.v1']);
  expect(RUNTIME_ALLOWLIST[money[0]]).toMatchObject({
    family: 'catalogue_price_configuration',
    confirmation_kind: 'APPROVAL',
    min_verification: 'SESSION_VERIFIED',
    propose: { space: 'C9', key: 'catalog.service.price.update' },
  });
  expect(emittable('PAYMENT_HANDOFF')).toBe(false);
});
