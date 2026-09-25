import fs from 'node:fs';
import path from 'node:path';

describe('P-MINT-BOOK architecture', () => {
  const root = path.resolve(__dirname, '..');

  it('keeps effect/target semantics in the closed server registry', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'booking-intent-template.registry.ts'),
      'utf8',
    );
    expect(source).toContain("'crm.appointment.create.v1'");
    expect(source).toContain("'crm.appointment.reschedule.v1'");
    expect(source).toContain("'crm.appointment.cancel.v1'");
    expect(source).not.toMatch(/endpoint|route:\s*['"]\/api|generic/i);
  });

  it('has one commit edge and no provider import in the widget runtime', () => {
    const adapter = fs.readFileSync(
      path.join(root, 'owner-ports/commit-booking.adapter.ts'),
      'utf8',
    );
    expect(adapter).toContain('ClientAppointmentCreateService');
    expect(adapter).toContain('ClientAppointmentRescheduleService');
    expect(adapter).toContain('ClientAppointmentCancelService');
    expect(adapter).not.toMatch(/YClients|yclients|createAppointment\(/);
  });

  it('records the exact booking discharge without opening a generic mutation registry', () => {
    const discharge = fs.readFileSync(
      path.join(__dirname, 'booking-discharge.runtime.ts'),
      'utf8',
    );
    expect(discharge).toContain('= true as boolean');
    const commonRegistry = fs.readFileSync(
      path.resolve(__dirname, '..', 'emission/intent-template.registry.ts'),
      'utf8',
    );
    expect(commonRegistry).toContain('generic_actuating_template_forbidden');
    expect(commonRegistry).not.toContain("effect: 'COMMIT'");
  });
});
