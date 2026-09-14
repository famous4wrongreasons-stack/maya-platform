import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { scanBackgroundCommunicationSource as scan } from './background-communication.architecture';
const root = resolve(__dirname, '..');
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((x) =>
    x.isDirectory() ? files(resolve(dir, x.name)) : [resolve(dir, x.name)],
  );
}
describe('B25 permanent background communication guard', () => {
  it('scans every production scheduler and reminder source', () => {
    for (const path of files(root).filter((f) => f.endsWith('.ts')))
      expect({
        file: relative(root, path),
        failures: scan(relative(root, path), readFileSync(path, 'utf8')),
      }).toEqual({ file: relative(root, path), failures: [] });
  });
  it.each([
    'phoneMatchKey(detail.client_phone)',
    'user.phone',
    'get_or_create_client(id)',
    'bot.sendMessage(chat_id,payload)',
    'this.prisma.client.create({data})',
    'this.prisma.inboxItem.upsert({data})',
  ])('rejects background bypass: %s', (source) =>
    expect(scan('future/future.scheduler.ts', source)).not.toEqual([]),
  );
  it('removed authority, raw User association or fallback fails', () => {
    const file =
        'appointment-notifications/appointment-reminder-orchestrator.service.ts',
      s = readFileSync(resolve(root, file), 'utf8');
    for (const mutation of [
      s.replaceAll('appointment.mayaClientId', 'appointment.clientId'),
      s.replace('this.ingress.createExecution(', 'legacy.execute('),
      s.replace('a.scheduleHash !== p.scheduleHash', 'false'),
      s.replace('endpoint.identityRef !== value.recipientIdentityRef', 'false'),
      s + '\nfailed.catch(()=>webPush.deliverReminder(dispatch,true));',
    ])
      expect(scan(file, mutation)).not.toEqual([]);
  });
});
