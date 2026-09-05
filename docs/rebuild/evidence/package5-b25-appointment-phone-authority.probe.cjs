/* Synthetic, no DB/network. Run with the backend directory as argv[2].
 * Executes real compiled reminder + inbox services. Capture only the call to
 * the existing Communication Delivery boundary; this does not send a message.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(process.argv[2]);
const { AppointmentNotificationsService } = require(path.join(root, 'dist/src/appointment-notifications/appointment-notifications.service'));
const { InboxService } = require(path.join(root, 'dist/src/inbox/inbox.service'));

async function probe(count, matching = true) {
  const calls = [];
  const delivered = [];
  const seen = new Set();
  let forbiddenAuthorityReads = 0;
  const forbidden = new Proxy({}, { get() { forbiddenAuthorityReads++; throw new Error('unexpected identity access'); } });
  const memberships = Array.from({ length: count }, (_, n) => ({ userId: `synthetic-account-${n}`, user: { phone: '+7 999 555-01-01' } }));
  const prisma = {
    tenant: { findMany: async () => [{ id: 'synthetic-tenant', slug: 'synthetic', defaultTimezone: 'UTC' }] },
    membership: { findMany: async query => { calls.push('active-membership-phone-read'); return memberships; } },
    appointmentNotificationSetting: { findUnique: async () => ({ enabled: true, leadTimesMinutes: [120] }) },
    inboxItem: { findFirst: async ({ where }) => seen.has(where.sourceEventId) ? { id: 'synthetic-stored' } : null },
    devicePushToken: { findMany: async () => [] },
    client: forbidden,
    clientChannelLink: forbidden,
    clientConsentFact: forbidden,
    customerProfile: forbidden,
  };
  const appointment = {
    id: 'crm-555', client: { id: 'unresolved-provider-client', name: 'synthetic private client' },
    provider: { id: 'synthetic-staff', name: 'synthetic private staff' }, branch: null,
    services: [{ id: 'synthetic-service', name: 'synthetic private service' }],
    start_at: '2030-01-01T11:00:00.000Z', end_at: '2030-01-01T12:00:00.000Z', status: 'confirmed',
  };
  const context = { assertTenantId: id => id, runAsSystemTenant: (_id, fn) => fn() };
  const communication = {
    deliverPackage2Inbox: async input => { delivered.push(input); seen.add(input.sourceEventId); return { status: 'delivered' }; },
    deliverPackage2Apns: async () => { throw new Error('unexpected provider attempt'); },
  };
  const inbox = new InboxService(prisma, context, {}, undefined, communication);
  const reminders = new AppointmentNotificationsService(prisma, {
    getJournal: async () => ({ appointments: [appointment] }),
    getAppointmentDetailForSystem: async () => ({ ...appointment, client_phone: matching ? '8 (999) 555-01-01' : '+7 999 555-02-02' }),
  }, inbox, context, { hasFeature: async () => true }, {});
  const first = await reminders.tick(new Date('2030-01-01T09:00:00.000Z'));
  const second = await reminders.tick(new Date('2030-01-01T09:00:00.000Z'));
  assert.equal(first.failed + second.failed, 0);
  assert.equal(delivered.length, matching ? count : 0);
  assert.equal(forbiddenAuthorityReads, 0);
  for (const row of delivered) {
    assert.equal(row.tenantId, 'synthetic-tenant');
    assert.equal(row.messageType, 'appointment_reminder');
    assert.equal(row.recipientIdentityRef, undefined);
    assert.ok(row.bodyText.includes('synthetic private service'));
    assert.equal(row.payload.appointment_id, appointment.id);
  }
  return { matchingAccounts: count, phoneMatches: matching, canonicalClientOrLinkRecordsInFixture: 0,
    privateReminderCommandsAtCanonicalDeliveryBoundary: delivered.length,
    clientLinkConsentPreferenceReads: forbiddenAuthorityReads,
    privateAppointmentProjectionPresent: delivered.every(row => row.bodyText.includes('synthetic private service')) && delivered.length > 0,
    secondTickAddsNoCallsWithExistingSourceFact: second.sent === 0,
    realDatabaseWrites: 0, realProviderCalls: 0 };
}

(async () => {
  const cases = [await probe(1), await probe(2), await probe(1, false)];
  console.log(JSON.stringify({ reproduced: true, execution: 'real compiled reminder and inbox services; mocked DB reads and final Communication Delivery boundary', cases,
    bareUnauthenticatedRequestTested: false, productionDataAccessed: false, realProductionMutations: 0 }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
