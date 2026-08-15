import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

import { AuditLogService } from '../audit-log/audit-log.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

const MEMORY_SCOPE = 'explicit_user_note';
const MEMORY_SOURCE = 'explicit_remember_command';
const MAX_MEMORY_NOTE_CHARS = 800;
const MAX_MODEL_MEMORY_FACTS = 24;
const MEMORY_RETENTION_DAYS = 36_500;

const REMEMBER_COMMAND_PATTERN =
  /^\s*запомни(?:\s+пожалуйста)?[\s,:;—–-]*(.*)$/iu;
const LIST_MEMORY_PATTERN =
  /^\s*(?:что\s+(?:ты\s+)?запомнила|покажи(?:\s+мне)?(?:,?\s+что)?\s+ты\s+запомнила|покажи\s+память|моя\s+память)\s*[?.!]*\s*$/iu;
const CLEAR_MEMORY_PATTERN =
  /^\s*(?:забудь\s+(?:все|всё)(?:,?\s+что\s+(?:ты\s+)?запомнила)?|очисти\s+(?:мою\s+)?память)\s*[?.!]*\s*$/iu;
const EXPENSE_LIKE_NOTE_PATTERN =
  /(аренд|расход|реклам|налог|коммунал|закуп|материал|трат)/iu;
const SENSITIVE_MEMORY_PATTERNS = [
  /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/iu,
  /(?<!\d)\+?\d[\d\s().-]{7,}\d(?!\d)/u,
  /\b\d(?:[ -]?\d){11,18}\b/u,
  /\b(?:api[\s_-]*key|api[\s_-]*token|access[\s_-]*token|refresh[\s_-]*token|bearer|secret|password|passwd|апи[\s_-]*ключ|апи[\s_-]*токен|токен|пароль|секрет)\b/iu,
  /\b(?:меня\s+зовут|моя\s+фамилия|мой\s+телефон|моя\s+почта|номер\s+карты)\b/iu,
];

export interface AiMemoryCommandResult {
  reply: string;
  kind: 'remembered' | 'listed' | 'cleared' | 'rejected';
}

@Injectable()
export class AiMemoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly encryption: EncryptionService,
    private readonly auditLog: AuditLogService,
  ) {}

  async handleExplicitCommand(
    tenantId: string,
    userId: string,
    rawText: string,
  ): Promise<AiMemoryCommandResult | null> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const text = rawText.trim();

    if (LIST_MEMORY_PATTERN.test(text)) {
      const facts = await this.listForModel(scopedTenantId, userId);
      return {
        kind: 'listed',
        reply:
          facts.length === 0
            ? 'Пока у меня нет сохранённых заметок. Напишите: «ЗАПОМНИ …».'
            : `Вот что я запомнила:\n${facts.map((fact) => `• ${fact}`).join('\n')}`,
      };
    }

    if (CLEAR_MEMORY_PATTERN.test(text)) {
      const result = await this.prisma.aiMemoryFact.updateMany({
        where: {
          tenantId: scopedTenantId,
          subjectUserId: userId,
          scope: MEMORY_SCOPE,
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      });
      await this.auditLog.log({
        tenantId: scopedTenantId,
        userId,
        action: 'ai.memory.cleared',
        entityType: 'ai_memory',
        entityId: userId,
        metadata: { scope: MEMORY_SCOPE, deleted_count: result.count },
      });
      return {
        kind: 'cleared',
        reply: 'Удалила все ваши заметки из памяти MAYA.',
      };
    }

    const remember = text.match(REMEMBER_COMMAND_PATTERN);
    if (!remember) {
      return null;
    }

    const note = this.normalizeNote(remember[1] ?? '');
    if (!note) {
      return {
        kind: 'rejected',
        reply: 'Что именно запомнить? Напишите это после слова «ЗАПОМНИ».',
      };
    }
    if (note.length > MAX_MEMORY_NOTE_CHARS) {
      return {
        kind: 'rejected',
        reply: `Заметка слишком длинная. Оставьте до ${MAX_MEMORY_NOTE_CHARS} символов и повторите команду.`,
      };
    }
    if (SENSITIVE_MEMORY_PATTERNS.some((pattern) => pattern.test(note))) {
      return {
        kind: 'rejected',
        reply:
          'Я не сохраняю в памяти пароли, токены, контактные и платёжные данные. Это защита вашей безопасности.',
      };
    }

    const valueHash = this.hash(note);
    const key = `note:${valueHash.slice(0, 24)}`;
    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + MEMORY_RETENTION_DAYS);
    const fact = await this.prisma.aiMemoryFact.upsert({
      where: {
        tenantId_subjectUserId_scope_key: {
          tenantId: scopedTenantId,
          subjectUserId: userId,
          scope: MEMORY_SCOPE,
          key,
        },
      },
      create: {
        tenantId: scopedTenantId,
        subjectUserId: userId,
        scope: MEMORY_SCOPE,
        key,
        encryptedValue: this.encryption.encrypt(note),
        valueHash,
        source: MEMORY_SOURCE,
        confidence: 100,
        retentionDays: MEMORY_RETENTION_DAYS,
        expiresAt,
      },
      update: {
        encryptedValue: this.encryption.encrypt(note),
        valueHash,
        source: MEMORY_SOURCE,
        confidence: 100,
        retentionDays: MEMORY_RETENTION_DAYS,
        expiresAt,
        deletedAt: null,
      },
    });
    await this.auditLog.log({
      tenantId: scopedTenantId,
      userId,
      action: 'ai.memory.remembered',
      entityType: 'ai_memory_fact',
      entityId: fact.id,
      metadata: { scope: MEMORY_SCOPE, key, value_hash: valueHash },
    });

    const expenseHint = EXPENSE_LIKE_NOTE_PATTERN.test(note)
      ? ' В памяти это заметка, а не проводка. Чтобы сумма участвовала в расчёте прибыли, напишите: «Запиши расход: …» — и подтвердите карточку.'
      : '';
    return {
      kind: 'remembered',
      reply: `Запомнила: ${note}.${expenseHint}`,
    };
  }

  async listForModel(tenantId: string, userId: string): Promise<string[]> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const facts = await this.prisma.aiMemoryFact.findMany({
      where: {
        tenantId: scopedTenantId,
        subjectUserId: userId,
        scope: MEMORY_SCOPE,
        deletedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { updatedAt: 'desc' },
      take: MAX_MODEL_MEMORY_FACTS,
      select: { encryptedValue: true },
    });

    return facts.flatMap((fact) => {
      try {
        return [this.encryption.decrypt(fact.encryptedValue)];
      } catch {
        return [];
      }
    });
  }

  private normalizeNote(value: string): string {
    return Array.from(value, (character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : character;
    })
      .join('')
      .replace(/\s+/gu, ' ')
      .trim();
  }

  private hash(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }
}
