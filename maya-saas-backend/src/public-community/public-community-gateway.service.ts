import { createHmac, timingSafeEqual } from 'node:crypto';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { stableActionJson } from '../action-engine/action-engine.identity';
import { communityDigest, communityId, communityObject } from './public-community.contract';

export type CommunityGateway = { sourceGatewayId: string; tenantId: string; staticPublicationKeys: string[]; publishedPostNamespace: boolean; brandName: string; secretEnv: string };
export type VerifiedCommunitySource = { readonly sourceGatewayId: string; readonly tenantId: string; readonly visitorSubjectHash: string; readonly publicationKey: string };
/** Configured source transport scope only. It grants no User/Client/moderator authority. */
@Injectable()
export class PublicCommunityGatewayService {
  private readonly admitted = new WeakSet<object>();
  constructor(private readonly config: ConfigService) {}
  private mappings(): CommunityGateway[] {
    let rows: unknown; try { rows = JSON.parse(this.config.get<string>('PUBLIC_COMMUNITY_GATEWAYS') ?? '[]'); } catch { throw new ForbiddenException('Community gateway mapping is invalid'); }
    if (!Array.isArray(rows)) throw new ForbiddenException('Community gateway mapping is invalid');
    const ids = new Set<string>();
    return rows.map(raw => {
      const x = communityObject(raw, ['sourceGatewayId', 'tenantId', 'staticPublicationKeys', 'publishedPostNamespace', 'brandName', 'secretEnv']);
      communityId(x.sourceGatewayId); communityId(x.tenantId);
      if (ids.has(String(x.sourceGatewayId)) || !Array.isArray(x.staticPublicationKeys) || x.staticPublicationKeys.some(k => typeof k !== 'string' || !/^[a-z0-9-]{1,100}$/.test(k)) || typeof x.publishedPostNamespace !== 'boolean' || typeof x.brandName !== 'string' || !x.brandName.trim() || x.brandName.length > 160 || typeof x.secretEnv !== 'string' || !/^[A-Z][A-Z0-9_]+$/.test(x.secretEnv)) throw new ForbiddenException('Community gateway mapping is ambiguous or invalid');
      ids.add(String(x.sourceGatewayId)); return x as unknown as CommunityGateway;
    });
  }
  mapping(sourceGatewayId: string, tenantId?: string) {
    const rows = this.mappings().filter(x => x.sourceGatewayId === sourceGatewayId && (!tenantId || x.tenantId === tenantId));
    if (rows.length !== 1) throw new ForbiddenException('Exact configured community source required'); return rows[0];
  }
  verify(value: unknown, timestamp: string | undefined, signature: string | undefined) {
    const body = communityObject(value, ['sourceGatewayId', 'operation', 'publicationKey', 'publicationPublished', 'visitorSubjectHash', 'command', 'requestKey']);
    const mapping = this.mapping(communityId(body.sourceGatewayId));
    const secret = this.config.get<string>(mapping.secretEnv);
    if (!secret || secret.length < 24 || !timestamp || !/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 90 || !signature || !/^[a-f0-9]{64}$/.test(signature)) throw new ForbiddenException('Verified community source transport required');
    const expected = createHmac('sha256', secret).update(`maya.community-source/1:${timestamp}:`).update(stableActionJson(body)).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw new ForbiddenException('Verified community source transport required');
    const publicationKey = communityId(body.publicationKey);
    if (body.publicationPublished !== true || (!mapping.staticPublicationKeys.includes(publicationKey) && !(mapping.publishedPostNamespace && /^post-[a-f0-9]{32}$/.test(publicationKey)))) throw new ForbiddenException('Only configured published community scope is admitted');
    if (!['status', 'comment', 'like', 'view'].includes(String(body.operation))) throw new ForbiddenException('Source transport grants no moderator capability');
    const source: VerifiedCommunitySource = Object.freeze({ sourceGatewayId: mapping.sourceGatewayId, tenantId: mapping.tenantId, publicationKey, visitorSubjectHash: communityDigest(body.visitorSubjectHash) });
    this.admitted.add(source);
    return { source, operation: body.operation as 'status' | 'comment' | 'like' | 'view', command: body.command, requestKey: body.requestKey };
  }
  assertVerified(source: VerifiedCommunitySource) {
    if (!this.admitted.has(source)) throw new ForbiddenException('Unverified anonymous source');
    this.mapping(source.sourceGatewayId, source.tenantId);
  }
}
