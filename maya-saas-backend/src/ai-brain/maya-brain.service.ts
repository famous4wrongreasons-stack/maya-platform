import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import type { AiCoreMessage } from '../ai-tools/ai-core.types';
import type { AiCoreChatDto } from '../ai-tools/dto/ai-core-chat.dto';
import { MayaBrainKnowledgeService } from './maya-brain-knowledge.service';
import { MayaBrainMemoryService } from './maya-brain-memory.service';
import { MayaBrainPromptRegistryService } from './maya-brain-prompt-registry.service';
import { MayaBrainRouterService } from './maya-brain-router.service';
import type {
  MayaBrainCitation,
  MayaBrainContext,
  MayaBrainPlan,
} from './maya-brain.types';

@Injectable()
export class MayaBrainService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly router: MayaBrainRouterService,
    private readonly memory: MayaBrainMemoryService,
    private readonly knowledge: MayaBrainKnowledgeService,
    private readonly prompts: MayaBrainPromptRegistryService,
  ) {}

  async prepare(
    user: AuthenticatedUser,
    dto: AiCoreChatDto,
    messages: AiCoreMessage[],
  ): Promise<MayaBrainContext> {
    const tenantId = this.requireTenant(user);
    const text = this.latestUserText(messages);
    const route = this.router.route(user.role, text);
    await this.memory.captureExplicitPreferences(user, text);
    const preferences = await this.memory.list(user);
    const knowledge = route.knowledgeRequired
      ? await this.knowledge.search(user, text)
      : [];
    const prompt = this.prompts.resolve(route.profile);
    const key = dto.brainSessionId ?? `${user.sessionId}:${dto.surface}`;
    const sessionKeyHash = createHash('sha256')
      .update(`${tenantId}\0${user.userId}\0${key}`)
      .digest('hex');
    const previous = await this.prisma.aiBrainSession.findUnique({
      where: {
        tenantId_actorUserId_sessionKeyHash: {
          tenantId,
          actorUserId: user.userId,
          sessionKeyHash,
        },
      },
      select: { id: true, intent: true, planJson: true },
    });
    const plan =
      previous?.intent === route.intent
        ? this.restorePlan(previous.planJson, route.plan)
        : route.plan;
    const session = await this.prisma.aiBrainSession.upsert({
      where: {
        tenantId_actorUserId_sessionKeyHash: {
          tenantId,
          actorUserId: user.userId,
          sessionKeyHash,
        },
      },
      create: {
        tenantId,
        actorUserId: user.userId,
        sessionKeyHash,
        surface: dto.surface,
        profile: route.profile,
        intent: route.intent,
        planJson: plan,
        lastRequestId: dto.requestId,
        turnCount: 1,
        expiresAt: this.sessionExpiry(),
      },
      update: {
        surface: dto.surface,
        profile: route.profile,
        intent: route.intent,
        status: 'active',
        planJson: plan,
        lastRequestId: dto.requestId,
        turnCount: { increment: 1 },
        expiresAt: this.sessionExpiry(),
      },
      select: { id: true },
    });
    return {
      ...route,
      plan,
      sessionId: session.id,
      promptVersion: prompt.version,
      profileInstructions: prompt.instructions,
      preferences,
      knowledge,
    };
  }

  async recordOutcome(
    context: MayaBrainContext,
    options: {
      toolNames: string[];
      approvalRequired: boolean;
      blocked: boolean;
      citedIds: string[];
    },
  ): Promise<MayaBrainPlan> {
    const terminal =
      context.intent === 'general' ||
      context.intent === 'support' ||
      (context.intent === 'knowledge' && options.citedIds.length > 0) ||
      (['finance', 'business_analytics', 'catalog', 'loyalty'].includes(
        context.intent,
      ) &&
        options.toolNames.length > 0);
    const status: MayaBrainPlan['status'] = options.blocked
      ? 'blocked'
      : options.approvalRequired
        ? 'awaiting_approval'
        : terminal
          ? 'completed'
          : 'active';
    const plan: MayaBrainPlan = {
      status,
      steps: context.plan.steps.map((step, index) => ({
        ...step,
        status:
          status === 'completed' ||
          (status === 'awaiting_approval' && index < context.plan.steps.length)
            ? 'completed'
            : step.status,
      })),
    };
    await this.prisma.aiBrainSession.updateMany({
      where: { id: context.sessionId },
      data: {
        status,
        planJson: {
          ...plan,
          last_tools: [...new Set(options.toolNames)].slice(0, 8),
          cited_source_count: options.citedIds.length,
        },
      },
    });
    return plan;
  }

  citations(
    context: MayaBrainContext,
    citationIds: string[],
  ): MayaBrainCitation[] {
    const requested = new Set(citationIds);
    return context.knowledge
      .filter((item) => requested.has(item.citationId))
      .map((item) => ({
        id: item.citationId,
        source_id: item.sourceId,
        title: item.title,
      }));
  }

  private restorePlan(value: unknown, fallback: MayaBrainPlan): MayaBrainPlan {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return fallback;
    }
    const record = value as Record<string, unknown>;
    const steps = Array.isArray(record.steps) ? record.steps : null;
    if (!steps) return fallback;
    const allowedStatuses = new Set(['pending', 'ready', 'completed', 'blocked']);
    const restored = steps
      .map((item) => {
        if (item === null || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }
        const step = item as Record<string, unknown>;
        if (
          typeof step.key !== 'string' ||
          typeof step.status !== 'string' ||
          !allowedStatuses.has(step.status)
        ) {
          return null;
        }
        return {
          key: step.key,
          status: step.status as 'pending' | 'ready' | 'completed' | 'blocked',
        };
      })
      .filter((item): item is MayaBrainPlan['steps'][number] => item !== null);
    return restored.length === fallback.steps.length
      ? { status: 'active', steps: restored }
      : fallback;
  }

  private latestUserText(messages: AiCoreMessage[]): string {
    return [...messages]
      .reverse()
      .find((message) => message.role === 'user')
      ?.content.trim() ?? '';
  }

  private sessionExpiry(): Date {
    const raw = this.configService.get<string>('AI_BRAIN_SESSION_TTL_HOURS');
    const hours = raw ? Number(raw) : 24;
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
      throw new Error('ai_brain_session_ttl_invalid');
    }
    return new Date(Date.now() + hours * 60 * 60 * 1_000);
  }

  private requireTenant(user: AuthenticatedUser): string {
    if (!user.tenantId) {
      throw new Error('ai_brain_tenant_required');
    }
    return user.tenantId;
  }
}
