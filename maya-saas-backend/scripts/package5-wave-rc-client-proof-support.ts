import {createHash,randomUUID} from 'node:crypto';
import {ActionEngineRuntimeService} from '../src/action-engine';
import {CommunicationDeliveryService} from '../src/communication-delivery';
import {ClientChannelRuntimeService} from '../src/crm/client-channel-runtime.service';
import type {ClientChannelAuthenticatorService,CurrentClientChannel} from '../src/crm/client-channel-authenticator.service';
import {clientChannelSubjectHash} from '../src/crm/client-channel-subject';
import {ClientWantedSlotService} from '../src/crm/client-wanted-slot.service';
import {EncryptionService} from '../src/encryption/encryption.service';
import type {CrmService} from '../src/crm/crm.service';
import type {Package5Wave3CanonicalCutoverService} from '../src/package5-wave3/package5-wave3-canonical-cutover.service';
import {config,context,db,engine,ingress} from './package5-wave-rc-proof-support';
export const encryption=new EncryptionService(config);
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const channelProofs=new Map<string,CurrentClientChannel>();
export const authenticator={authenticate:(proof:string)=>channelProofs.has(proof)?Promise.resolve(channelProofs.get(proof)!):Promise.reject(Error('Verified synthetic channel required'))} as unknown as ClientChannelAuthenticatorService;
export const channelRuntime=new ClientChannelRuntimeService(db,context,authenticator,encryption,{} as Package5Wave3CanonicalCutoverService,{} as CrmService);
const communication=new CommunicationDeliveryService(db,new ActionEngineRuntimeService(engine,ingress),config);
export const wanted=()=>new ClientWantedSlotService(db,context,authenticator,channelRuntime,ingress,engine,encryption,communication);
const scope=<T>(tenantId:string,work:()=>T)=>context.runAsSystemTenant(tenantId,work);
type Base = Awaited<ReturnType<typeof baseFixture>>;

export async function baseFixture(label: string) {
  const tenantId = `b9_${label}_${randomUUID()}`;
  await db.tenant.create({
    data: {
      id: tenantId,
      slug: tenantId,
      name: `B9 ${label}`,
      status: 'active',
    },
  });
  const branch = await db.branch.create({
    data: { tenantId, name: 'B9 branch', timezone: 'Europe/Moscow' },
  });
  const staff = await db.staff.create({
    data: {
      tenantId,
      branchId: branch.id,
      encryptedDisplayName: encryption.encrypt('Synthetic staff'),
      active: true,
    },
  });
  await db.staffProviderLink.create({
    data: {
      tenantId,
      staffId: staff.id,
      provider: 'yclients',
      externalId: `staff-${label}`,
    },
  });
  return { tenantId, branch, staff, externalStaffId: `staff-${label}` };
}

export async function clientFixture(base: Base, label: string, withEndpoint = true) {
  const client = await db.client.create({ data: { tenantId: base.tenantId } });
  const address = String(7_000_000_000 + channelProofs.size + 1);
  const providerSubjectHash = clientChannelSubjectHash(
    encryption,
    'telegram',
    address,
  );
  const verificationIdentityHash = digest(['verification', label, client.id]);
  const evidence = {
    contract: 'a18.client-channel-verification.v1',
    verifier: 'package5-b9-runtime-proof',
    channelControlProofHash: digest(['channel', label, client.id]),
    clientAuthorityProofHash: digest(['authority', label, client.id]),
    verificationIdentityHash,
    tenantId: base.tenantId,
    provider: 'telegram',
    providerSubjectHash,
    clientId: client.id,
  };
  const link = await db.clientChannelLink.create({
    data: {
      tenantId: base.tenantId,
      clientId: client.id,
      provider: 'telegram',
      providerSubjectHash,
      verificationMethod: 'explicit_verified_challenge',
      verificationIdentityHash,
      verificationEvidenceJson: evidence,
      verificationEvidenceHash: digest(evidence),
    },
  });
  const proof = `verified-b9-channel-${randomUUID()}`;
  channelProofs.set(proof, {
    tenantId: base.tenantId,
    provider: 'telegram',
    providerSubjectHash,
    deliveryAddress: address,
    userId: null,
    channelControlProofHash: evidence.channelControlProofHash,
    validUntil: new Date(Date.now() + 3600_000),
  });
  await db.customerProfile.create({
    data: {
      tenantId: base.tenantId,
      clientId: client.id,
      privacyConsentAt: new Date(),
    },
  });
  if (withEndpoint)
    await scope(base.tenantId, () =>
      channelRuntime.refreshDeliveryAddress(proof),
    );
  return { client, link, proof, address, providerSubjectHash };
}

export const command = (base: Base, start: Date, key: string = randomUUID()) => ({
  desiredStartAt: start.toISOString(),
  externalStaffId: base.externalStaffId,
  idempotencyKey: `b9-proof:${key}`,
});

