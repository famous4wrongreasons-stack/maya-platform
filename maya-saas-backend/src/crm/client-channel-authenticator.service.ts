import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';

import { EncryptionService } from '../encryption/encryption.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type {
  AuthenticatedClientChannel,
  ClientChannelAuthenticator,
} from './client-link-challenge.service';
import { clientChannelSubjectHash } from './client-channel-subject';

export type CurrentClientChannel = AuthenticatedClientChannel & {
  userId: string | null;
};

@Injectable()
export class ClientChannelAuthenticatorService implements ClientChannelAuthenticator {
  private readonly jwt = new JwtService();
  constructor(
    private readonly config: ConfigService,
    private readonly context: TenantContextService,
    private readonly encryption: EncryptionService,
  ) {}

  async authenticate(
    proof: string,
    tx: Prisma.TransactionClient,
  ): Promise<CurrentClientChannel> {
    if (typeof proof !== 'string' || proof.length > 4096)
      throw new ForbiddenException('Current channel authentication required');
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(proof) as Record<string, unknown>;
    } catch {
      throw new ForbiddenException('Invalid channel proof');
    }
    if (
      !input ||
      Array.isArray(input) ||
      Object.keys(input).sort().join(',') !== 'credential,type' ||
      typeof input.credential !== 'string'
    )
      throw new ForbiddenException(
        'Only current channel credentials are accepted',
      );
    const tenantId = this.context.requireTenantId();
    const [clock] = await tx.$queryRaw<Array<{ now: Date }>>(
      Prisma.sql`SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now`,
    );
    const proofHash = this.encryption.opaqueReference(
      'a18.channel-control.v1',
      proof,
    );
    if (input.type === 'maya_jwt') {
      let payload: {
        user_id: string;
        tenant_id: string;
        session_id: string;
        exp: number;
      };
      const secret = this.config.get<string>('JWT_SECRET');
      if (!secret)
        throw new ForbiddenException('Channel authentication unavailable');
      try {
        payload = this.jwt.verify(input.credential, {
          secret,
          algorithms: ['HS256'],
        });
      } catch {
        throw new ForbiddenException('Invalid Maya session');
      }
      if (
        !payload.user_id ||
        !payload.session_id ||
        payload.tenant_id !== tenantId ||
        !Number.isFinite(payload.exp)
      )
        throw new ForbiddenException('Tenant-qualified session required');
      const session = await tx.authSession.findUnique({
        where: { id: payload.session_id },
        include: { user: true, membership: true },
      });
      if (
        !session ||
        session.tenantId !== tenantId ||
        session.userId !== payload.user_id ||
        session.revokedAt ||
        session.expiresAt <= clock.now ||
        session.user.status !== 'active' ||
        session.membership?.status !== 'active'
      )
        throw new ForbiddenException('Maya session is no longer active');
      const validUntil = new Date(
        Math.min(payload.exp * 1000, session.expiresAt.getTime()),
      );
      if (validUntil <= clock.now)
        throw new ForbiddenException('Channel proof expired');
      return {
        tenantId,
        provider: 'maya_user',
        providerSubjectHash: clientChannelSubjectHash(
          this.encryption,
          'maya_user',
          session.userId,
        ),
        userId: session.userId,
        channelControlProofHash: proofHash,
        validUntil,
      };
    }
    const token = this.config.get<string>(
      'MAYA_CLIENT_CHANNEL_TELEGRAM_BOT_TOKEN',
    );
    if (!token)
      throw new ForbiddenException('Telegram channel verification unavailable');
    let fields: Record<string, string>;
    let key: Buffer;
    if (input.type === 'telegram_init_data') {
      const params = new URLSearchParams(input.credential);
      if ([...params.keys()].length !== new Set(params.keys()).size)
        throw new ForbiddenException('Duplicate Telegram proof keys');
      fields = Object.fromEntries(params.entries());
      key = createHmac('sha256', 'WebAppData').update(token).digest();
    } else if (input.type === 'telegram_widget') {
      let parsed: unknown;
      try {
        parsed = JSON.parse(input.credential);
      } catch {
        throw new ForbiddenException('Invalid Telegram widget proof');
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new ForbiddenException('Invalid Telegram widget proof');
      if (
        Object.values(parsed).some(
          (value) => typeof value !== 'string' && typeof value !== 'number',
        )
      )
        throw new ForbiddenException('Invalid Telegram fields');
      fields = Object.fromEntries(
        Object.entries(parsed).map(([name, value]) => [name, String(value)]),
      );
      key = createHash('sha256').update(token).digest();
    } else throw new ForbiddenException('Unsupported authenticated channel');
    const hash = fields.hash;
    const material = Object.entries(fields)
      .filter(([name]) => name !== 'hash')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => `${name}=${value}`)
      .join('\n');
    const expected = createHmac('sha256', key).update(material).digest();
    if (
      !/^[a-f0-9]{64}$/.test(hash ?? '') ||
      !timingSafeEqual(expected, Buffer.from(hash, 'hex'))
    )
      throw new ForbiddenException('Invalid Telegram signature');
    const authDate = Number(fields.auth_date);
    const now = clock.now.getTime() / 1000;
    // Preserve the existing Telegram login/init-data validity window; never infer Client identity from it.
    if (
      !Number.isSafeInteger(authDate) ||
      authDate > now ||
      now - authDate >= 86400
    )
      throw new ForbiddenException('Telegram authentication expired');
    let subject = fields.id;
    if (input.type === 'telegram_init_data') {
      try {
        subject = String((JSON.parse(fields.user) as { id: unknown }).id);
      } catch {
        throw new ForbiddenException('Telegram subject missing');
      }
    }
    if (!/^[1-9][0-9]{0,19}$/.test(subject ?? ''))
      throw new ForbiddenException('Telegram subject invalid');
    return {
      tenantId,
      provider: 'telegram',
      providerSubjectHash: clientChannelSubjectHash(
        this.encryption,
        'telegram',
        subject,
      ),
      userId: null,
      channelControlProofHash: proofHash,
      validUntil: new Date((authDate + 86400) * 1000),
    };
  }
}
