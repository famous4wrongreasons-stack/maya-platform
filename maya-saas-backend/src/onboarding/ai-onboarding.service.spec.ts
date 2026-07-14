import {
  ConflictException,
  GoneException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

import { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import { CalendarSource } from '../common/domain.enums';
import { InternalCalendarService } from '../internal-calendar/internal-calendar.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { AiOnboardingBlueprint } from './ai-onboarding.types';
import { AiOnboardingService } from './ai-onboarding.service';
import { ConversationalOnboardingInterpreter } from './conversational-onboarding-interpreter';
import { OnboardingService } from './onboarding.service';
import { SafeOnboardingInterpreter } from './safe-onboarding-interpreter';
import { TrialActivationService } from './trial-activation.service';

describe('AiOnboardingService', () => {
  type DraftCreateMock = jest.MockedFunction<
    (args: {
      data: Record<string, unknown>;
    }) => Promise<Record<string, unknown>>
  >;
  const completeBlueprint: AiOnboardingBlueprint = {
    templateId: 'wellness',
    workMode: 'solo',
    categoryId: 'solo_massage_therapist',
    businessName: 'Мягкая сила',
    summary: 'Один специалист со своим расписанием и услугами',
    industryPresetId: 'general_service',
    calendarSource: CalendarSource.INTERNAL,
    calendarSourceConfirmed: true,
    providerCount: 1,
    providerTitle: 'Массажист',
    services: [{ name: 'Массаж', price: 3000, durationMinutes: 60 }],
    weeklyRules: [{ weekday: 1, startTime: '09:00', endTime: '18:00' }],
    scheduleAssumed: true,
  };

  it('exposes separate solo and business category catalogs', () => {
    const { service } = createService();

    const catalog = service.listTemplates();

    expect(catalog.onboarding_flow.first_question).toBe('work_mode');
    expect(catalog.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'solo_barber', work_mode: 'solo' }),
        expect.objectContaining({
          id: 'business_barbershop',
          work_mode: 'business',
        }),
      ]),
    );
  });

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
    const safeInterpreter = new SafeOnboardingInterpreter();
    const interpreter = new ConversationalOnboardingInterpreter(
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
      safeInterpreter,
    );
    const service = new AiOnboardingService(
      prisma as unknown as PrismaService,
      interpreter,
      onboarding as unknown as OnboardingService,
      internalCalendar as InternalCalendarService,
      rateLimit as unknown as AuthRateLimitService,
      new TenantContextService(),
      {
        authorizePendingToken: jest.fn(),
        releaseCompletedTenant: jest.fn(),
      } as unknown as TrialActivationService,
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
        ownerName: 'Владелец',
        ownerPhone: '+79990000000',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(onboarding.createTrialSignup).not.toHaveBeenCalled();
  });

  it('uses the owner name internally when a solo specialist skipped a brand name', async () => {
    const token = 'a'.repeat(43);
    const deferredBlueprint: AiOnboardingBlueprint = {
      ...completeBlueprint,
      businessName: null,
      businessNameDeferred: true,
    };
    const claimDraft = jest.fn().mockResolvedValue({ count: 0 });
    const { service } = createService({
      findDraft: jest.fn().mockResolvedValue({
        id: 'draft-1',
        status: 'draft',
        draftTokenHash: createHash('sha256').update(token).digest('hex'),
        blueprintJson: deferredBlueprint,
        missingFieldsJson: [],
        expiresAt: new Date(Date.now() + 60_000),
        confirmedTenantId: null,
      }),
      claimDraft,
    });

    await expect(
      service.confirmDraft('draft-1', {
        draftToken: token,
        ownerEmail: 'owner@example.ru',
        ownerName: 'Артем',
        ownerPhone: '+79990000000',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(claimDraft).toHaveBeenCalled();
    const typedClaimDraft = claimDraft as jest.MockedFunction<
      (args: {
        data?: { blueprintJson?: AiOnboardingBlueprint };
      }) => Promise<{ count: number }>
    >;
    const claim = typedClaimDraft.mock.calls[0]?.[0];
    expect(claim.data?.blueprintJson).toMatchObject({
      businessName: 'Артем',
      businessNameDeferred: true,
      businessNameGenerated: true,
    });
  });
});
