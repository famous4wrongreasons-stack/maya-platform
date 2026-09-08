import { readFileSync } from 'node:fs';
import { join } from 'node:path';
function violations(source: string) {
 const body=source.slice(source.indexOf('async purgeExpiredPayloads('));
 const required=['canonicalUtcTransaction(this.prisma', 'RC_execution_set_resolved',
  'e."tenantId"=r."tenantId"', 'e."ownerReportRunId"=r.id',
  'r."payloadRetentionUntil"<=${now}', 'r."expiresAt"<=${now}',
  'LIMIT 200 FOR UPDATE OF r SKIP LOCKED', 'id: { in: candidates.map(row => row.id) }'];
 return required.filter(marker=>!body.includes(marker));
}
describe('R05 immutable report payload retention boundary',()=>{
 const source=readFileSync(join(__dirname,'owner-report.store.ts'),'utf8');
 it('uses exact tenant, both deadlines, resolved AE/CD and bounded locked owner rows',()=>expect(violations(source)).toEqual([]));
 it('rejects broad cleanup, UNKNOWN-blind predicate and missing tenant qualification',()=>{
  for(const marker of ['RC_execution_set_resolved','e."tenantId"=r."tenantId"','r."expiresAt"<=${now}','id: { in: candidates.map(row => row.id) }'])
   expect(violations(source.replaceAll(marker,'removed')).length).toBeGreaterThan(0);
 });
});
