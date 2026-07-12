import {
  ConflictException,
  GoneException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';

import { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import { CalendarSource } from '../common/domain.enums';
import { InternalCalendarService } from '../internal-calendar/internal-calendar.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { AiOnboardingBlueprint } from './ai-onboarding.types';
import { AiOnboardingService } from './ai-onboarding.service';
import { OnboardingService } from './onboarding.service';
import { SafeOnboardingInterpreter } from './safe-onboarding-interpreter';

describe('AiOnboardingService', () => {
  type DraftCreateMock = jest.MockedFunction<
    (args: {
      data: Record<string, unknown>;
    }) => Promise<Record<string, unknown>>
  >;
  const completeBlueprint: AiOnboardingBlueprint = {
    templateId: 'solo_specialist',
    businessName: 'Мягкая сила',
    summary: 'Один специалист со своим расписанием и услугами',
    industryPresetId: 'solo_specialist',
    calendarSource: CalendarSource.INTERNAL,
    providerCount: 1,
    providerTitle: 'Специалист',
    services: [{ name: 'Массаж', price: 3000, durationMinutes: 60 }],
    weeklyRules: [{ weekday: 1, startTime: '09:00', endTime: '18:00' }],
    scheduleAssumed: true,
  };

  function createService(
    overrides: {
      createDraft?: DraftCreateMock;
      findDraft?: jest.Mock;
      claimDraft?: jest.Mock;
    } = {},
  ) {
    const createDraft: DraftCreateMock =
      overrides.createDraft ??
      jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'draft-1',
          status: 'draft',
          confirmedTenantId: null,
          ...data,
        }),
      );
    const findDraft = overrides.findDraft ?? jest.fn();
    const claimDraft = overrides.claimDraft ?? jest.fn();
    const prisma = {
      aiOnboardingDraft: {
        create: createDraft,
        findUnique: findDraft,
        update: jest.fn(),
        updateMany: claimDraft,
      },
      tenant: {
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
    };
    const rateLimit = { assertPreflight: jest.fn() };
    const onboarding = { createTrialSignup: jest.fn() };
    const internalCalendar = {};
    const service = new AiOnboardingService(
      prisma as unknown as PrismaService,
      new SafeOnboardingInterpreter(),
      onboarding as unknown as OnboardingService,
      internalCalendar as InternalCalendarService,
      rateLimit as unknown as AuthRateLimitService,
      new TenantContextService(),
    );

    return { service, prisma, rateLimit, onboarding, createDraft };
  }

  it('persists only a structured blueprint and input digest, never the raw story', async () => {
    const { service, createDraft } = createService();
    const story =
      'Я частный массажист, работаю одна. Название Мягкая сила. Мой телефон +79991234567. Услуги: массаж 3000 руб 60 минут.';

    const result = await service.createDraft({ message: story });
    const persisted = createDraft.mock.calls[0]?.[0].data;
    expect(persisted).toBeDefined();

    expect(JSON.stringify(persisted)).not.toContain(story);
    expect(JSON.stringify(persisted.blueprintJson)).not.toContain(
      '+79991234567',
    );
    expect(persisted.inputDigest).toBe(
      createHash('sha256').update(story).digest('hex'),
    );
    expect(persisted.draftTokenHash).not.toBe(result.draft_token);
    expect(result.draft_token).toHaveLength(43);
  });

  it('rejects an invalid draft token', async () => {
    const token = 'a'.repeat(43);
    const { service } = createService({
      findDraft: jest.fn().mockResolvedValue({
        id: 'draft-1',
        status: 'draft',
        draftTokenHash: createHash('sha256').update(token).digest('hex'),
        blueprintJson: completeBlueprint,
        missingFieldsJson: [],
        expiresAt: new Date(Date.now() + 60_000),
        confirmedTenantId: null,
      }),
    });

    await expect(
      service.readDraft('draft-1', 'b'.repeat(43)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired draft even with the correct token', async () => {
    const token = 'a'.repeat(43);
    const { service } = createService({
      findDraft: jest.fn().mockResolvedValue({
        id: 'draft-1',
        status: 'draft',
        draftTokenHash: createHash('sha256').update(token).digest('hex'),
        blueprintJson: completeBlueprint,
        missingFieldsJson: [],
        expiresAt: new Date(Date.now() - 1),
        confirmedTenantId: null,
      }),
    });

    await expect(service.readDraft('draft-1', token)).rejects.toBeInstanceOf(
      GoneException,
    );
  });

  it('does not create a second tenant when another confirmation owns the draft', async () => {
    const token = 'a'.repeat(43);
    const { service, onboarding } = createService({
      findDraft: jest.fn().mockResolvedValue({
        id: 'draft-1',
        status: 'draft',
        draftTokenHash: createHash('sha256').update(token).digest('hex'),
        blueprintJson: completeBlueprint,
        missingFieldsJson: [],
        expiresAt: new Date(Date.now() + 60_000),
        confirmedTenantId: null,
      }),
      claimDraft: jest.fn().mockResolvedValue({ count: 0 }),
    });

    await expect(
      service.confirmDraft('draft-1', {
        draftToken: token,
        ownerEmail: 'owner@example.ru',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(onboarding.createTrialSignup).not.toHaveBeenCalled();
  });
});
