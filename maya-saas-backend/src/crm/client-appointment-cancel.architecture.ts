import ts from 'typescript';

/** Permanent B29 Client-originated Appointment mutation guard.
 * Verified Client → Appointment.mayaClientId ownership → Action Engine.
 * Test exclusions are filename-qualified.
 */
export function scanClientAppointmentCancel(
  file: string,
  source: string,
): string[] {
  if (file.endsWith('.spec.ts') || file.endsWith('.architecture.ts')) return [];
  const failures: string[] = [];
  const dedicated = file.endsWith('client-appointment-cancel.service.ts');
  const initiator =
    file.endsWith('appointments.controller.ts') ||
    file.endsWith('appointments.service.ts') ||
    file.endsWith('ai-tool-handler.service.ts');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node) => {
    if (ts.isMethodDeclaration(node) && node.body) {
      const name = node.name.getText(ast);
      const clientCancel =
        dedicated ||
        (file.endsWith('appointments.controller.ts') &&
          name === 'cancelAppointment') ||
        (file.endsWith('appointments.service.ts') &&
          name === 'cancelForClient') ||
        (file.endsWith('ai-tool-handler.service.ts') &&
          name === 'cancelOwnAppointment');
      if (!clientCancel) {
        ts.forEachChild(node, visit);
        return;
      }
      const body = node.body.getText(ast);
      if (
        /findForClient|updateForClient|get_or_create_client|findClientByPhone|phoneMatch|chat_id/.test(
          body,
        )
      )
        failures.push(`${name}: legacy User/phone/chat authority`);
      if (initiator && /appointment\.(?:update|updateMany|create)\(/.test(body))
        failures.push(`${name}: direct Appointment mutation from initiator`);
      if (
        initiator &&
        /adapter\.cancelAppointment|cancelInCrmForClient|crmService\.cancelAppointment\(/.test(
          body,
        )
      )
        failures.push(`${name}: direct provider mutation from initiator`);
      if (
        (name === 'cancelForClient' || name === 'cancelAppointment') &&
        !/clientAppointmentCanceler\.forAccount|cancelForClient\(/.test(body)
      )
        failures.push(`${name}: missing verified Client cancel initiator`);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (dedicated) {
    for (const required of [
      'clientChannelSubjectHash(',
      'links.length !== 1',
      'revokedAt: null',
      'mayaClientId: client.id',
      'executeInternalAppointmentCancelWithReceipt',
      'executeCancelAppointmentWithReceipt',
    ])
      if (!source.includes(required))
        failures.push(`Required cancel authority missing: ${required}`);
    if (/findForClient|updateForClient/.test(source))
      failures.push('Dedicated canceler still uses User association lookup');
  }
  if (
    file === 'appointments/appointments.service.ts' &&
    !source.includes('this.clientAppointmentCanceler.forAccount(')
  )
    failures.push('HTTP cancel must use verified Client canceler');
  return failures;
}
