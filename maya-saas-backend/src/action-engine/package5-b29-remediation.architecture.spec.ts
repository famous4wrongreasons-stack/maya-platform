import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('Package 5 B29 Client appointment cancel remediation', () => {
  it('keeps HTTP cancel as a verified Client initiator without User association authority', () => {
    const controller = read(
      'maya-saas-backend/src/appointments/appointments.controller.ts',
    );
    const service = read(
      'maya-saas-backend/src/appointments/appointments.service.ts',
    );
    const canceler = read(
      'maya-saas-backend/src/crm/client-appointment-cancel.service.ts',
    );
    const start = service.indexOf('async cancelForClient(');
    const end = service.indexOf('async rescheduleForClient(', start);
    const cancel = service.slice(start, end);
    expect(controller).toContain('this.appointmentsService.cancelForClient(');
    expect(cancel).toContain('this.clientAppointmentCanceler.forAccount(');
    expect(cancel).not.toMatch(/findForClient|updateForClient/);
    expect(cancel).not.toMatch(
      /appointmentRepository\.update|cancelInCrmForClient|crmService\.cancelAppointment\(/,
    );
    expect(canceler).toContain('mayaClientId: client.id');
    expect(canceler).toContain('executeInternalAppointmentCancelWithReceipt');
    expect(canceler).toContain('executeCancelAppointmentWithReceipt');
    expect(canceler).not.toMatch(
      /findForClient|updateForClient|clientId: userId/,
    );
  });

  it('executes internal and CRM-backed cancel through the existing cancel_appointment action', () => {
    const crm = read('maya-saas-backend/src/crm/crm.service.ts');
    const internal = crm.slice(
      crm.indexOf('async executeInternalAppointmentCancelWithReceipt('),
      crm.indexOf('private persistCancelledAppointmentMirror('),
    );
    const plan = crm.slice(
      crm.indexOf('private async cancelAppointmentActionPlan('),
      crm.indexOf('async executeInternalAppointmentCancelWithReceipt('),
    );
    expect(internal).toContain("capability: 'crm.appointment.cancel.v1'");
    expect(internal).toContain('await invocation.authorizationCheck?.()');
    expect(internal).toContain('persistInternalCancelledAppointment(');
    expect(internal).toContain('mayaClientId');
    expect(plan).toContain('await invocation.authorizationCheck?.()');
    expect(plan).toContain('adapter.cancelAppointment(');
    expect(plan).toContain('persistCancelledAppointmentMirror(');
    expect(plan).toContain("outcome: 'PROVEN_NOT_EXECUTED'");
  });

  it('keeps AI cancel on the same verified Client initiator', () => {
    const source = read(
      'maya-saas-backend/src/ai-tools/ai-tool-handler.service.ts',
    );
    const start = source.indexOf('private async cancelOwnAppointment(');
    const end = source.indexOf('private async createOwnAppointment(', start);
    const method = source.slice(start, end);
    expect(method).toContain('this.appointmentsService.cancelForClient(');
    expect(method).not.toMatch(
      /findForClient|updateForClient|mayaClientId: principal/,
    );
  });
});
