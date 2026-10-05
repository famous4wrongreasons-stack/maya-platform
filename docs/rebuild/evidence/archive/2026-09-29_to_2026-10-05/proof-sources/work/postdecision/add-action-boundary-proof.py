from pathlib import Path
root=Path(__file__).resolve().parents[2]/'work/widget-release/maya-saas-backend'
p=root/'src/widgets/routing/g13-action-boundary.architecture.spec.ts'
p.write_text("""import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// F76 is a whole Action Engine ownership boundary, including request and policy
// types. No widget fields may become part of its authority or mutation input.
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? sources(join(dir, entry.name)) :
      entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [join(dir, entry.name)] : []);
}
describe('G13 F33/F76 canonical action boundary', () => {
  it('WR-F76 keeps widget kind and confirmation subject outside every Action Engine source', () => {
    const files = sources(join(__dirname, '../../action-engine'));
    expect(files.length).toBeGreaterThan(50);
    const leaks = files.filter(file => /widget_kind|widgetKind|confirmation_subject|confirmationSubject/.test(readFileSync(file, 'utf8')));
    expect(leaks).toEqual([]);
  });
});
""")
p=root/'test/widgets-live/support/fixtures.ts'
s=p.read_text().replace('          capability: true,\n          state: true,','          capability: true,\n          sourceType: true,\n          state: true,')
p.write_text(s)
p=root/'test/widgets-live/support/release-booking-proof.ts';s=p.read_text()
a="""      commitBody = body;
"""
b="""      // These fields cannot override the server-owned action source or cross
      // F76 into canonical action input. Refused before any durable execution.
      for (const extra of [{ sourceType: 'agent_task' }, { widget_kind: 'BOOKING_CONFIRMATION' }, { confirmation_subject: 'cancel' }]) {
        const forged = await post('/widgets/intent', { ...body, ...extra });
        requireProof(forged.status === 400, 'F33/F76 caller metadata is refused');
      }
      requireProof((await ctx.fixtures.bookingProofState(tenant)).executions.length === 0, 'F33/F76 forged metadata has no owner effect');
      commitBody = body;
"""
assert s.count(a)==1;s=s.replace(a,b)
a="""    ae.capability === 'crm.appointment.create.v1' &&
"""
b="""    ae.sourceType === 'authenticated_request' &&
    ae.capability === 'crm.appointment.create.v1' &&
"""
assert s.count(a)==1;s=s.replace(a,b)
a='  return proofs;'
b="""  const commitProof = proofs.find(p => p.testId === 'WR-COMMIT-CREATE');
  requireProof(commitProof, 'F33/F76 production-minted COMMIT provenance');
  proofs.push({ ...commitProof, testId: 'WR-COMMIT-ACTION-BOUNDARY', clauses: ['G13-I7'] });
  return proofs;"""
assert s.count(a)==1;s=s.replace(a,b);p.write_text(s)
p=root/'test/widgets-live/wr-release.live-spec.ts';s=p.read_text().replace('expect(proofs).toHaveLength(2);','expect(proofs).toHaveLength(3);');p.write_text(s)
import json
m=[{'id':'AB-M1','file':'src/action-engine/action-engine.contract.ts','find':'export interface TrustedActionExecutionRequestV1 {','replace':'export interface TrustedActionExecutionRequestV1 {\n  widget_kind?: string;','killers':['WR-F76'],'expect':'build-killed'},
{'id':'AB-M2','file':'src/widgets/owner-ports/commit-booking.adapter.ts','find':"          request.source.type !== 'authenticated_request' ||\n          request.callerIdempotency?.key !== expectedKey",'replace':'          false','killers':['N11'],'expect':'build-killed'}]
for row in m: assert (root/row['file']).read_text().count(row['find'])==1,row['id']
(root/'test/widgets-live/mutations/gateAB.json').write_text(json.dumps(m,indent=2)+'\n')
