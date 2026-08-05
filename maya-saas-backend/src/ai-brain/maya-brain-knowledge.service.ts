import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

import { AuditLogService } from '../audit-log/audit-log.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateKnowledgeSourceDto } from './dto/create-knowledge-source.dto';
import type { MayaBrainKnowledgeItem } from './maya-brain.types';

const STOP_WORDS = new Set([
  'без',
  'был',
  'быть',
  'вам',
  'вас',
  'для',
  'его',
  'еще',
  'как',
  'или',
  'она',
  'они',
  'при',
  'про',
  'это',
  'что',
  'чтобы',
  'the',
  'and',
  'with',
]);

@Injectable()
export class MayaBrainKnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateKnowledgeSourceDto) {
    const tenantId = this.requireTenant(user);
    const title = this.clean(dto.title);
    const content = this.clean(dto.content);
    this.assertSafe(title);
    this.assertSafe(content);
    const contentHash = this.hash(`${title}\0${content}`);
    const existing = await this.prisma.aiKnowledgeSource.findUnique({
      where: { tenantId_contentHash: { tenantId, contentHash } },
      select: { id: true },
    });
    if (existing) {
      return { id: existing.id, created: false };
    }
    const chunks = this.chunks(content);
    const source = await this.prisma.aiKnowledgeSource.create({
      data: {
        tenantId,
        createdByUserId: user.userId,
        createdByTenantId: tenantId,
        encryptedTitle: this.encryption.encrypt(title),
        sourceType: dto.sourceType ?? 'procedure',
        locale: dto.locale ?? 'ru-RU',
        audienceRolesJson: [...new Set(dto.audienceRoles)],
        contentHash,
        chunks: {
          create: chunks.map((chunk, ordinal) => ({
            tenantId,
            ordinal,
            encryptedContent: this.encryption.encrypt(chunk),
            contentHash: this.hash(chunk),
          })),
        },
      },
      select: { id: true },
    });
    await this.auditLog.log({
      tenantId,
      userId: user.userId,
      action: 'ai.knowledge_source_created',
      entityType: 'ai_knowledge_source',
      entityId: source.id,
      metadata: {
        source_type: dto.sourceType ?? 'procedure',
        audience_roles: [...new Set(dto.audienceRoles)],
        chunk_count: chunks.length,
      },
    });
    return { id: source.id, created: true };
  }

  async list(user: AuthenticatedUser) {
    const tenantId = this.requireTenant(user);
    const rows = await this.prisma.aiKnowledgeSource.findMany({
      where: { tenantId },
      select: {
        id: true,
        encryptedTitle: true,
        sourceType: true,
        locale: true,
        status: true,
        audienceRolesJson: true,
        effectiveAt: true,
        expiresAt: true,
        createdAt: true,
        _count: { select: { chunks: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      title: this.encryption.decrypt(row.encryptedTitle),
      source_type: row.sourceType,
      locale: row.locale,
      status: row.status,
      audience_roles: this.roles(row.audienceRolesJson),
      effective_at: row.effectiveAt,
      expires_at: row.expiresAt,
      created_at: row.createdAt,
      chunk_count: row._count.chunks,
    }));
  }

  async archive(user: AuthenticatedUser, sourceId: string): Promise<boolean> {
    const tenantId = this.requireTenant(user);
    if (!/^c[a-z0-9]{8,64}$/i.test(sourceId)) {
      throw new BadRequestException('Invalid knowledge source ID');
    }
    const result = await this.prisma.aiKnowledgeSource.updateMany({
      where: { id: sourceId, tenantId, status: 'active' },
      data: { status: 'archived' },
    });
    if (result.count > 0) {
      await this.auditLog.log({
        tenantId,
        userId: user.userId,
        action: 'ai.knowledge_source_archived',
        entityType: 'ai_knowledge_source',
        entityId: sourceId,
        metadata: {},
      });
    }
    return result.count > 0;
  }

  async search(
    user: AuthenticatedUser,
    query: string,
  ): Promise<MayaBrainKnowledgeItem[]> {
    const tenantId = this.requireTenant(user);
    const queryTokens = this.tokens(query);
    if (queryTokens.length === 0) {
      return [];
    }
    const now = new Date();
    const sources = await this.prisma.aiKnowledgeSource.findMany({
      where: {
        tenantId,
        status: 'active',
        effectiveAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
        encryptedTitle: true,
        audienceRolesJson: true,
        chunks: {
          select: { id: true, encryptedContent: true, ordinal: true },
          orderBy: { ordinal: 'asc' },
          take: 40,
        },
      },
      orderBy: { effectiveAt: 'desc' },
      take: 30,
    });
    const scored: Array<MayaBrainKnowledgeItem & { score: number }> = [];
    for (const source of sources) {
      if (!this.roles(source.audienceRolesJson).includes(user.role)) {
        continue;
      }
      let title: string;
      try {
        title = this.encryption.decrypt(source.encryptedTitle);
      } catch {
        continue;
      }
      const titleTokens = new Set(this.tokens(title));
      for (const chunk of source.chunks) {
        let content: string;
        try {
          content = this.encryption.decrypt(chunk.encryptedContent);
        } catch {
          continue;
        }
        const normalized = content.toLowerCase().replace(/ё/g, 'е');
        let score = 0;
        for (const token of queryTokens) {
          if (titleTokens.has(token)) score += 4;
          if (normalized.includes(token)) score += 1;
        }
        if (score === 0) continue;
        scored.push({
          citationId: `kb:${source.id}:${chunk.id}`,
          sourceId: source.id,
          title,
          excerpt: this.excerpt(content, queryTokens),
          score,
        });
      }
    }
    return scored
      .sort((left, right) => right.score - left.score)
      .slice(0, 4)
      .map((item) => ({
        citationId: item.citationId,
        sourceId: item.sourceId,
        title: item.title,
        excerpt: item.excerpt,
      }));
  }

  private assertSafe(value: string): void {
    const unsafe =
      /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?\d[\s().-]*){10,}|\b(?:bearer|api[_ -]?key|secret|password|token)\b\s*[:=]|\bsk-[A-Za-z0-9_-]{12,}/i;
    if (unsafe.test(value)) {
      throw new BadRequestException({
        message: 'Knowledge source contains personal or secret data.',
        error: { code: 'ai_knowledge_sensitive_content' },
      });
    }
  }

  private chunks(content: string): string[] {
    const paragraphs = content
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);
    const result: string[] = [];
    let current = '';
    for (const paragraph of paragraphs) {
      if ((current + '\n\n' + paragraph).trim().length <= 1_200) {
        current = (current + '\n\n' + paragraph).trim();
        continue;
      }
      if (current) result.push(current);
      if (paragraph.length <= 1_200) {
        current = paragraph;
        continue;
      }
      for (let offset = 0; offset < paragraph.length; offset += 1_100) {
        result.push(paragraph.slice(offset, offset + 1_200));
      }
      current = '';
    }
    if (current) result.push(current);
    return result.slice(0, 80);
  }

  private excerpt(content: string, tokens: string[]): string {
    const normalized = content.toLowerCase().replace(/ё/g, 'е');
    const positions = tokens
      .map((token) => normalized.indexOf(token))
      .filter((position) => position >= 0);
    const position = positions.length > 0 ? Math.min(...positions) : 0;
    const start = Math.max(0, position - 160);
    const prefix = start > 0 ? '…' : '';
    const suffix = start + 600 < content.length ? '…' : '';
    return `${prefix}${content.slice(start, start + 600).trim()}${suffix}`;
  }

  private tokens(value: string): string[] {
    return [
      ...new Set(
        (
          value
            .toLowerCase()
            .replace(/ё/g, 'е')
            .match(/[a-zа-я0-9]{3,}/g) ?? []
        )
          .filter((token) => !STOP_WORDS.has(token))
          .slice(0, 24),
      ),
    ];
  }

  private roles(value: unknown): UserRole[] {
    if (!Array.isArray(value)) return [];
    const allowed = new Set(Object.values(UserRole));
    return value.filter(
      (role): role is UserRole =>
        typeof role === 'string' && allowed.has(role as UserRole),
    );
  }

  private clean(value: string): string {
    return value
      .replace(/\r\n/g, '\n')
      .replace(/[\t ]+\n/g, '\n')
      .trim();
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
