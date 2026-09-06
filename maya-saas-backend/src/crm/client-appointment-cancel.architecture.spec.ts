import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { scanClientAppointmentCancel as scan } from './client-appointment-cancel.architecture';

const root = resolve(__dirname, '..');
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(resolve(dir, entry.name))
      : [resolve(dir, entry.name)],
  );
}

describe('B29/B30 permanent Client appointment command protection', () => {
  it('scans all production sources including HTTP, AI and channel paths', () => {
    for (const path of files(root).filter((file) => file.endsWith('.ts'))) {
      const file = relative(root, path);
      expect({
        file,
        failures: scan(file, readFileSync(path, 'utf8')),
      }).toEqual({ file, failures: [] });
    }
  });

  it.each([
    'return this.appointmentRepository.findForClient(id, userId);',
    'await this.appointmentRepository.updateForClient(id, userId, { status: "canceled" });',
    'await adapter.cancelAppointment({ tenantId, externalId });',
    'await this.crmService.cancelAppointment(tenantId, externalId);',
  ])('rejects a future Client cancel bypass: %s', (body) => {
    expect(
      scan(
        'appointments/appointments.service.ts',
        `class Future { async cancelForClient() { ${body} } }`,
      ),
    ).not.toEqual([]);
  });

  it.each([
    'return this.appointmentRepository.findForClient(id, userId);',
    'await this.appointmentRepository.updateForClient(id, userId, { startAt: new Date() });',
    'await adapter.rescheduleAppointment({ tenantId, externalId, start });',
    'await this.crmService.rescheduleAppointment(tenantId, params);',
  ])('rejects a future Client reschedule bypass: %s', (body) => {
    expect(
      scan(
        'appointments/appointments.service.ts',
        `class Future { async rescheduleForClient() { ${body} } }`,
      ),
    ).not.toEqual([]);
  });

  it('removing an ownership predicate or Action Engine executor fails', () => {
    const file = 'crm/client-appointment-cancel.service.ts';
    const source = readFileSync(resolve(root, file), 'utf8');
    for (const from of [
      'revokedAt: null',
      'links.length !== 1',
      'mayaClientId: client.id',
      'executeInternalAppointmentCancelWithReceipt',
    ])
      expect(scan(file, source.replaceAll(from, 'REMOVED'))).not.toEqual([]);
  });

  it('removing a reschedule ownership predicate or Action Engine executor fails', () => {
    const file = 'crm/client-appointment-reschedule.service.ts';
    const source = readFileSync(resolve(root, file), 'utf8');
    for (const from of [
      'revokedAt: null',
      'links.length !== 1',
      'mayaClientId: client.id',
      'executeInternalAppointmentRescheduleWithReceipt',
    ])
      expect(scan(file, source.replaceAll(from, 'REMOVED'))).not.toEqual([]);
  });
});
