import { ConfigService } from '@nestjs/config';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { PrismaService } from '../prisma/prisma.service';
import type { AiCoreChatDto } from '../ai-tools/dto/ai-core-chat.dto';
import { MayaBrainKnowledgeService } from './maya-brain-knowledge.service';
import { MayaBrainMemoryService } from './maya-brain-memory.service';
import { MayaBrainPromptRegistryService } from './maya-brain-prompt-registry.service';
import { MayaBrainRouterService } from './maya-brain-router.service';
import { MayaBrainService } from './maya-brain.service';

describe('MayaBrainService', () => {
  const user: AuthenticatedUser = {
    userId: 'user-a',
    sessionId: 'auth-session-a',
    tenantId: 'tenant-a',
    role: UserRole.TENANT_OWNER,
    email: 'owner@example.test',
    branchId: null,
    membershipId: 'membership-a',
    membershipStatus: 'active',
  };
  const dto: AiCoreChatDto = {
    surface: 'native',
    requestId: 'request-12345678',
    brainSessionId: 'native-session-12345678',
    messages: [{ role: 'user', content: 'Отвечай кратко' }],
  };

  it('does not persist or alter context when the canary is disabled', async () => {
    const mocks = createService({ MAYA_BRAIN_V1_ENABLED: 'false' });

    const result = await mocks.service.prepare(user, dto, dto.messages);

    expect(result).toMatchObject({
      active: false,
      promptVersion: 'legacy',
      sessionId: 'disabled-request-12345678',
      preferences: [],
      knowledge: [],
    });
    expect(mocks.memory.captureExplicitPreferences).not.toHaveBeenCalled();
    expect(mocks.memory.list).not.toHaveBeenCalled();
    expect(mocks.knowledge.search).not.toHaveBeenCalled();
    expect(mocks.prisma.aiBrainSession.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.aiBrainSession.upsert).not.toHaveBeenCalled();
  });

  it('keeps web on the legacy path during a native-only canary', async () => {
    const mocks = createService({
      MAYA_BRAIN_V1_ENABLED: 'true',
      MAYA_BRAIN_V1_SURFACES: 'native',
      MAYA_BRAIN_V1_TENANT_IDS: 'tenant-a',
    });

    await expect(
      mocks.service.prepare(user, { ...dto, surface: 'web' }, dto.messages),
    ).resolves.toMatchObject({ active: false, promptVersion: 'legacy' });
    expect(mocks.prisma.aiBrainSession.upsert).not.toHaveBeenCalled();
  });

  it('fails closed when a canary tenant allowlist is missing', async () => {
    const mocks = createService({
      MAYA_BRAIN_V1_ENABLED: 'true',
      MAYA_BRAIN_V1_SURFACES: 'native',
    });

    await expect(
      mocks.service.prepare(user, dto, dto.messages),
    ).resolves.toMatchObject({ active: false, promptVersion: 'legacy' });
    expect(mocks.prisma.aiBrainSession.upsert).not.toHaveBeenCalled();
  });

  it('stores only a hashed session key and a structured plan for native canary', async () => {
    const mocks = createService({
      MAYA_BRAIN_V1_ENABLED: 'true',
      MAYA_BRAIN_V1_SURFACES: 'native',
      MAYA_BRAIN_V1_TENANT_IDS: 'tenant-a',
    });
    mocks.memory.list.mockResolvedValue([
      { key: 'response_detail', value: 'compact' },
    ]);
    mocks.prisma.aiBrainSession.upsert.mockResolvedValue({
      id: 'brain-session-a',
    });

    const result = await mocks.service.prepare(user, dto, dto.messages);

    expect(result).toMatchObject({
      active: true,
      sessionId: 'brain-session-a',
      promptVersion: 'maya-brain-v1.0.0',
    });
    const upsertCalls = mocks.prisma.aiBrainSession.upsert.mock
      .calls as unknown as Array<
      [
        {
          create: {
            tenantId: string;
            actorUserId: string;
            surface: string;
            lastRequestId: string;
            sessionKeyHash: string;
            planJson: unknown;
          };
        },
      ]
    >;
    const call = upsertCalls[0]?.[0];
    expect(call?.create).toMatchObject({
      tenantId: 'tenant-a',
      actorUserId: 'user-a',
      surface: 'native',
      lastRequestId: 'request-12345678',
      planJson: {
        status: 'active',
        steps: [{ key: 'respond', status: 'pending' }],
      },
    });
    expect(call?.create.sessionKeyHash).toMatch(/^[a-f0-9]{64}$/);
    const persisted = JSON.stringify(call);
    expect(persisted).not.toContain('Отвечай кратко');
    expect(persisted).not.toContain('native-session-12345678');
  });

  it('does not write outcomes for a disabled context', async () => {
    const mocks = createService({ MAYA_BRAIN_V1_ENABLED: 'false' });
    const context = await mocks.service.prepare(user, dto, dto.messages);

    await expect(
      mocks.service.recordOutcome(context, {
        toolNames: [],
        approvalRequired: false,
        blocked: false,
        citedIds: [],
      }),
    ).resolves.toEqual(context.plan);
    expect(mocks.prisma.aiBrainSession.updateMany).not.toHaveBeenCalled();
  });

  function createService(values: Record<string, string>) {
    const config = {
      get: jest.fn((name: string) => values[name]),
    };
    const prisma = {
      aiBrainSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const memory = {
      captureExplicitPreferences: jest.fn().mockResolvedValue([]),
      list: jest.fn().mockResolvedValue([]),
    };
    const knowledge = {
      search: jest.fn().mockResolvedValue([]),
    };
    const service = new MayaBrainService(
      config as unknown as ConfigService,
      prisma as unknown as PrismaService,
      new MayaBrainRouterService(),
      memory as unknown as MayaBrainMemoryService,
      knowledge as unknown as MayaBrainKnowledgeService,
      new MayaBrainPromptRegistryService(),
    );
    return { knowledge, memory, prisma, service };
  }
});
