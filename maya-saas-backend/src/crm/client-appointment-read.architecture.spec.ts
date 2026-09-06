import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { scanClientAppointmentRead as scan } from './client-appointment-read.architecture';

const root = resolve(__dirname, '..');
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(resolve(dir, entry.name))
      : [resolve(dir, entry.name)],
  );
}
describe('B26 permanent Client appointment read protection', () => {
  it('scans all production sources including account/cabinet/AI/channel paths', () => {
    for (const path of files(root).filter((file) => file.endsWith('.ts'))) {
      const file = relative(root, path);
      expect({
        file,
        failures: scan(file, readFileSync(path, 'utf8')),
      }).toEqual({ file, failures: [] });
    }
  });
  it.each([
    'return crm.getClientAppointments(tenantId, user.phone);',
    'await this.syncExternalClientAppointments(tenantId, userId, records);',
    'await tx.appointment.create({data});',
    'await tx.appointment.update({data});',
    'await tx.client.upsert({data});',
    'return tx.appointment.findMany({where:{tenantId, clientId}});',
    'return tx.appointment.findMany({where:{tenantId: t, mayaClientId: c}});',
  ])('rejects a future Client read bypass: %s', (body) => {
    expect(
      scan(
        'future/client-appointments.controller.ts',
        `class Future { getAppointments() { ${body} } }`,
      ),
    ).not.toEqual([]);
  });
  it('removing an authority predicate or read-only constraint fails', () => {
    const file = 'crm/client-appointment-read.service.ts';
    const source = readFileSync(resolve(root, file), 'utf8');
    for (const from of [
      'SET TRANSACTION READ ONLY',
      'revokedAt: null',
      'links.length !== 1',
      'mayaClientId: client.id',
      'principal?.userId !== userId',
    ])
      expect(scan(file, source.replaceAll(from, 'REMOVED'))).not.toEqual([]);
  });
});
