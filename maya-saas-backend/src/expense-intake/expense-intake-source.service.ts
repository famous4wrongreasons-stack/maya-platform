import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LegacyStaffPrincipalController } from '../auth/legacy-staff-principal.controller';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { EXPENSE_INTAKE_CONTRACT } from './expense-reminder.contract';

export type ExpenseSource = {
  contract: typeof EXPENSE_INTAKE_CONTRACT;
  tenantId: string;
  sourceNamespace: string;
  provider: string;
  externalCompanyId: string;
  senderId: string;
  chatId: string;
  messageId: string;
  sourceContentHash: string;
  sourceAt: string;
  issuedAt: string;
  mode: 'standalone' | 'reply';
  replyToMessageId: string | null;
  reminderRunId: string | null;
  reminderSlotKey: string | null;
};
export type VerifiedExpenseSource = {
  source: ExpenseSource;
  actor: AuthenticatedUser;
  authIdentityId: string;
  sourceEventHash: string;
  sourceContentHash: string;
  sourceText: string | null;
};
const verified = new WeakSet<object>();
export function assertVerifiedExpenseSource(value: VerifiedExpenseSource) {
  if (!verified.has(value))
    throw new ForbiddenException(
      'Existing R02 authenticated source principal required',
    );
}

/** Transport-only source capsule. An authenticated bot may attest its incoming
 * event, but cannot admit a card or establish a human principal with its secret.
 * The encrypted fragment is submitted under an existing canonical Maya session. */
@Injectable()
export class ExpenseIntakeSourceService {
  private readonly reader: LegacyStaffPrincipalController;
  constructor(
    private readonly prisma: PrismaService,
    private readonly bridge: BridgeSourceService,
    private readonly context: TenantContextService,
    private readonly encryption: EncryptionService,
    private readonly config: ConfigService,
  ) {
    this.reader = new LegacyStaffPrincipalController(prisma, bridge, context);
  }
  async capsule(secret: string | undefined, value: unknown, now = new Date()) {
    this.bridge.assertBridgeSecret(
      secret,
      'MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN',
      {
        disabled: 'expense_source_disabled',
        unauthorized: 'expense_source_unauthorized',
      },
    );
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException('Exact original expense source required');
    const b = value as Record<string, unknown>;
    if (
      Object.keys(b).sort().join(',') !==
      'chatId,chatType,externalCompanyId,forwarded,messageId,mode,provider,reminderRunId,reminderSlotKey,replyToMessageId,senderId,sourceAt,sourceText'
    )
      throw new BadRequestException('Unexpected expense source fields');
    const provider = typeof b.provider === 'string' ? b.provider : '',
      externalCompanyId =
        typeof b.externalCompanyId === 'string' ? b.externalCompanyId : '';
    const binding = this.bridge.assertBridgeIntegrationBinding(
      { provider, externalCompanyId },
      {
        provider: 'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_PROVIDER',
        externalCompanyId: 'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_COMPANY_ID',
      },
      {
        disabled: 'expense_source_binding_disabled',
        mismatch: 'expense_source_binding_mismatch',
      },
    );
    const installation = await this.bridge.resolveTenantByIntegration(
      binding,
      'expense_source_tenant_unresolved',
    );
    if (
      b.chatType !== 'private' ||
      b.forwarded !== false ||
      b.senderId !== b.chatId ||
      ![b.senderId, b.chatId, b.messageId].every(
        (v) => typeof v === 'string' && /^[1-9][0-9]{0,19}$/.test(v),
      ) ||
      !['standalone', 'reply'].includes(String(b.mode)) ||
      typeof b.sourceText !== 'string' ||
      !b.sourceText.trim() ||
      b.sourceText.length > 8000 ||
      typeof b.sourceAt !== 'string' ||
      !Number.isFinite(Date.parse(b.sourceAt)) ||
      new Date(b.sourceAt).toISOString() !== b.sourceAt ||
      Date.parse(b.sourceAt) > now.getTime() + 60000 ||
      Date.parse(b.sourceAt) < now.getTime() - 10 * 60000
    )
      throw new ForbiddenException(
        'Fresh original private expense command required',
      );
    if (
      b.replyToMessageId !== null &&
      (typeof b.replyToMessageId !== 'string' ||
        !/^[1-9][0-9]{0,19}$/.test(b.replyToMessageId))
    )
      throw new BadRequestException('Exact reply reference required');
    if (
      (b.reminderRunId === null) !== (b.reminderSlotKey === null) ||
      (b.reminderRunId !== null &&
        (typeof b.reminderRunId !== 'string' ||
          !/^[A-Za-z0-9_-]{8,128}$/.test(b.reminderRunId) ||
          typeof b.reminderSlotKey !== 'string' ||
          !/^[a-f0-9]{64}$/.test(b.reminderSlotKey)))
    )
      throw new BadRequestException('Exact reminder context required');
    if (
      (b.mode === 'standalone' &&
        (b.replyToMessageId !== null || b.reminderRunId !== null)) ||
      (b.mode === 'reply' &&
        b.replyToMessageId === null &&
        b.reminderRunId === null)
    )
      throw new BadRequestException(
        'Explicit standalone or reminder reply required',
      );
    const source: ExpenseSource = {
      contract: EXPENSE_INTAKE_CONTRACT,
      tenantId: installation.tenantId,
      sourceNamespace: `telegram:${binding.provider}:${binding.externalCompanyId}`,
      provider: binding.provider,
      externalCompanyId: binding.externalCompanyId,
      senderId: String(b.senderId),
      chatId: String(b.chatId),
      messageId: String(b.messageId),
      sourceContentHash: this.encryption.opaqueReference(
        'maya.expense-source-content/1',
        JSON.stringify(b.sourceText.normalize('NFC')),
      ),
      sourceAt: b.sourceAt,
      issuedAt: now.toISOString(),
      mode: b.mode as ExpenseSource['mode'],
      replyToMessageId: b.replyToMessageId,
      reminderRunId: b.reminderRunId,
      reminderSlotKey: b.reminderSlotKey as string | null,
    };
    return {
      contract: EXPENSE_INTAKE_CONTRACT,
      capsule: this.encryption.encrypt(JSON.stringify(source)),
      businessMutations: 0,
      approvalCreated: false,
    };
  }
  async verify(
    actor: AuthenticatedUser,
    capsule: unknown,
    sourceText?: unknown,
  ): Promise<VerifiedExpenseSource> {
    if (typeof capsule !== 'string' || capsule.length > 20000)
      throw new BadRequestException('Bounded expense source capsule required');
    let source: ExpenseSource;
    try {
      source = JSON.parse(this.encryption.decrypt(capsule)) as ExpenseSource;
    } catch {
      throw new ForbiddenException('Unverified expense source');
    }
    if (
      source.contract !== EXPENSE_INTAKE_CONTRACT ||
      source.tenantId !== actor.tenantId ||
      !['tenant_owner', 'business_owner'].includes(actor.role)
    )
      throw new ForbiddenException('Exact canonical expense owner required');
    // Reuse the deployed R02 resolver, including session, Membership and
    // CrmStaffAccess checks. The bridge does not replace any of these checks.
    const p = await this.reader.read(
      actor,
      this.config.get<string>('MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN'),
      {
        provider: source.provider,
        externalCompanyId: source.externalCompanyId,
      },
    );
    if (
      p.platform ||
      p.tenantId !== source.tenantId ||
      p.userId !== actor.userId ||
      p.telegramId !== source.senderId ||
      !p.authIdentityId ||
      p.membershipId !== actor.membershipId
    )
      throw new ForbiddenException(
        'Source sender must equal the verified R02 User/tenant/AuthIdentity',
      );
    if (
      sourceText !== undefined &&
      (typeof sourceText !== 'string' ||
        sourceText.length > 8000 ||
        this.encryption.opaqueReference(
          'maya.expense-source-content/1',
          JSON.stringify(sourceText.normalize('NFC')),
        ) !== source.sourceContentHash)
    )
      throw new ForbiddenException(
        'Exact original expense source text required',
      );
    const value = {
      source,
      actor: Object.freeze({ ...actor }),
      authIdentityId: p.authIdentityId,
      sourceText:
        typeof sourceText === 'string' ? sourceText.normalize('NFC') : null,
      sourceEventHash: this.encryption.opaqueReference(
        'maya.expense-source-event/1',
        JSON.stringify([
          source.sourceNamespace,
          source.tenantId,
          actor.userId,
          source.chatId,
          source.messageId,
        ]),
      ),
      sourceContentHash: source.sourceContentHash,
    };
    Object.freeze(source);
    Object.freeze(value);
    verified.add(value);
    return value;
  }
}
