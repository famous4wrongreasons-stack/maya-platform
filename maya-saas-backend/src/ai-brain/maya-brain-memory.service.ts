import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

import { AuditLogService } from '../audit-log/audit-log.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import type { MayaBrainMemoryPreference } from './maya-brain.types';

type PreferenceKey = MayaBrainMemoryPreference['key'];

const ALLOWED_VALUES: Record<PreferenceKey, Set<string>> = {
  response_detail: new Set(['compact', 'detailed']),
  emoji: new Set(['on', 'off']),
  address_form: new Set(['formal', 'informal']),
  language: new Set(['ru', 'en']),
};

@Injectable()
export class MayaBrainMemoryService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly auditLog: AuditLogService,
  ) {}

  async captureExplicitPreferences(
    user: AuthenticatedUser,
    text: string,
  ): Promise<MayaBrainMemoryPreference[]> {
    const tenantId = this.requireTenant(user);
    const detected = this.detect(text);
    if (detected.length === 0) {
      return [];
    }
    const retentionDays = this.retentionDays();
    const expiresAt = new Date(
      Date.now() + retentionDays * 24 * 60 * 60 * 1_000,
    );
    for (const preference of detected) {
      this.assertAllowed(preference);
      await this.prisma.aiMemoryFact.upsert({
        where: {
          tenantId_subjectUserId_scope_key: {
            tenantId,
            subjectUserId: user.userId,
            scope: 'user_preference',
            key: preference.key,
          },
        },
        create: {
          tenantId,
          subjectUserId: user.userId,
          scope: 'user_preference',
          key: preference.key,
          encryptedValue: this.encryption.encrypt(preference.value),
          valueHash: this.hash(preference.value),
          source: 'explicit_chat_preference',
          confidence: 100,
          retentionDays,
          expiresAt,
        },
        update: {
          encryptedValue: this.encryption.encrypt(preference.value),
          valueHash: this.hash(preference.value),
          source: 'explicit_chat_preference',
          confidence: 100,
          retentionDays,
          expiresAt,
          deletedAt: null,
        },
      });
    }
    await this.auditLog.log({
      tenantId,
      userId: user.userId,
      action: 'ai.memory_preferences_updated',
      entityType: 'ai_memory',
      entityId: user.userId,
      metadata: { keys: detected.map((item) => item.key) },
    });
    return detected;
  }

  async list(user: AuthenticatedUser): Promise<MayaBrainMemoryPreference[]> {
    const tenantId = this.requireTenant(user);
    const rows = await this.prisma.aiMemoryFact.findMany({
      where: {
        tenantId,
        subjectUserId: user.userId,
        scope: 'user_preference',
        deletedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { key: true, encryptedValue: true },
      orderBy: { key: 'asc' },
      take: 16,
    });
    const result: MayaBrainMemoryPreference[] = [];
    for (const row of rows) {
      if (!(row.key in ALLOWED_VALUES)) {
        continue;
      }
      try {
        const preference: MayaBrainMemoryPreference = {
          key: row.key as PreferenceKey,
          value: this.encryption.decrypt(row.encryptedValue),
        };
        this.assertAllowed(preference);
        result.push(preference);
      } catch {
        continue;
      }
    }
    return result;
  }

  async forget(user: AuthenticatedUser): Promise<number> {
    const tenantId = this.requireTenant(user);
    const result = await this.prisma.aiMemoryFact.updateMany({
      where: {
        tenantId,
        subjectUserId: user.userId,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });
    await this.auditLog.log({
      tenantId,
      userId: user.userId,
      action: 'ai.memory_forgotten',
      entityType: 'ai_memory',
      entityId: user.userId,
      metadata: { deleted_count: result.count },
    });
    return result.count;
  }

  private detect(raw: string): MayaBrainMemoryPreference[] {
    const text = raw.toLowerCase().replace(/ё/g, 'е');
    const result = new Map<PreferenceKey, string>();
    if (/(отвечай|пиши).{0,20}(?:кратко|короче)|без\s+воды/i.test(text)) {
      result.set('response_detail', 'compact');
    }
    if (/(отвечай|пиши).{0,20}(?:подробнее|развернуто|детально)/i.test(text)) {
      result.set('response_detail', 'detailed');
    }
    if (/(без|не\s+используй).{0,12}(?:эмодзи|смайл)/i.test(text)) {
      result.set('emoji', 'off');
    }
    if (/(можно|используй|добавляй).{0,12}(?:эмодзи|смайл)/i.test(text)) {
      result.set('emoji', 'on');
    }
    if (/(обращайся|говори).{0,12}на\s+вы/i.test(text)) {
      result.set('address_form', 'formal');
    }
    if (/(обращайся|говори).{0,12}на\s+ты/i.test(text)) {
      result.set('address_form', 'informal');
    }
    if (/(отвечай|пиши|говори).{0,16}(?:по-?русски|на\s+русском)/i.test(text)) {
      result.set('language', 'ru');
    }
    if (
      /(отвечай|пиши|говори).{0,16}(?:по-?английски|на\s+английском)/i.test(
        text,
      )
    ) {
      result.set('language', 'en');
    }
    return [...result].map(([key, value]) => ({ key, value }));
  }

  private assertAllowed(preference: MayaBrainMemoryPreference): void {
    if (!ALLOWED_VALUES[preference.key].has(preference.value)) {
      throw new Error('ai_memory_value_not_allowed');
    }
  }

  private retentionDays(): number {
    const raw = this.configService.get<string>(
      'AI_BRAIN_MEMORY_RETENTION_DAYS',
    );
    const value = raw ? Number(raw) : 180;
    if (!Number.isInteger(value) || value < 7 || value > 365) {
      throw new Error('ai_brain_memory_retention_invalid');
    }
    return value;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private requireTenant(user: AuthenticatedUser): string {
    if (!user.tenantId) {
      throw new Error('ai_brain_tenant_required');
    }
    return user.tenantId;
  }
}
