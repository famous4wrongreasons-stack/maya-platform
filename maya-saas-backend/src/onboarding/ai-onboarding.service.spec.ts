import {
  BadRequestException,
  ConflictException,
  GoneException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

import { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import { CalendarSource, CrmProvider, UserRole } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import { InternalCalendarService } from '../internal-calendar/internal-calendar.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { UsersService } from '../users/users.service';
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
  type DraftUpdateMock = jest.MockedFunction<
    (args: {
      data: Record<string, unknown>;
    }) => Promise<Record<string, unknown>>
  >;
  const completeBlueprint: AiOnboardingBlueprint = {
    templateId: 'barbershop',
    workMode: 'business',
    categoryId: 'business_barbershop',
    businessName: 'Мужская эстетика',
    summary: 'Барбершоп с подключённой CRM',
    industryPresetId: 'barbershop',
    calendarSource: CalendarSource.EXTERNAL,
    calendarSourceConfirmed: true,
    providerCount: 5,
    providerTitle: 'Барбер',
    services: [{ name: 'Мужская стрижка', price: 2000, durationMinutes: 60 }],
    weeklyRules: [{ weekday: 1, startTime: '09:00', endTime: '18:00' }],
    scheduleAssumed: false,
    crmImported: true,
    crmProvider: 'yclients',
    crmCompanyId: '503759',
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
    const updateDraft: DraftUpdateMock = jest.fn();
    const prisma = {
      aiOnboardingDraft: {
        create: createDraft,
        findUnique: findDraft,
        update: updateDraft,
        updateMany: claimDraft,
      },
      tenant: {
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
    };
    const rateLimit = { assertPreflight: jest.fn() };
    const onboarding = {
      createTrialSignup: jest.fn(),
      resumeConfirmedTrialSignup: jest.fn(),
    };
    const crm = {
      discoverCompaniesForCredential: jest.fn(),
      previewCredentials: jest.fn(),
    };
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
      crm as unknown as CrmService,
      internalCalendar as InternalCalendarService,
      rateLimit as unknown as AuthRateLimitService,
      new TenantContextService(),
      {
        authorizePendingToken: jest.fn(),
        releaseCompletedTenant: jest.fn(),
      } as unknown as TrialActivationService,
      {
        provisionCrmTeamAccess: jest.fn(),
      } as unknown as UsersService,
    );

    return {
      service,
      prisma,
      rateLimit,
      onboarding,
      crm,
      createDraft,
      updateDraft,
    };
  }

  it('keeps only barber categories active in the release catalog', () => {
    const { service } = createService();
    const catalog = service.listTemplates();
    const soloBarber = catalog.categories.find(
      (category) => category.id === 'solo_barber',
    );
    const beautySalon = catalog.categories.find(
      (category) => category.id === 'business_beauty_salon',
    );

    expect(soloBarber).toMatchObject({ available: true });
    expect(beautySalon?.available).toBe(false);
    expect(beautySalon?.unavailable_reason).toContain('только барберов');
  });

  it('asks for CRM immediately after a barbershop is selected', async () => {
    const { service } = createService();

    const result = await service.createDraft({
      message: 'У меня барбершоп',
    });

    expect(result.blueprint).toMatchObject({
      categoryId: 'business_barbershop',
      calendarSource: CalendarSource.EXTERNAL,
      calendarSourceConfirmed: false,
      crmImported: false,
      services: [],
      providerCount: null,
    });
    expect(result.missing_fields).toEqual(['calendar_source']);
    expect(result.quick_replies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Есть CRM',
          action: 'connect_crm',
        }),
        expect.objectContaining({
          action: 'disabled',
        }),
      ]),
    );
  });

  it('imports a CRM profile without persisting the raw token', async () => {
    const token = 'a'.repeat(43);
    const draftBlueprint: AiOnboardingBlueprint = {
      ...completeBlueprint,
      businessName: null,
      providerCount: null,
      services: [],
      calendarSourceConfirmed: true,
      crmImported: false,
      crmCompanyId: null,
    };
    const { service, crm, updateDraft } = createService({
      findDraft: jest.fn().mockResolvedValue({
        id: 'draft-1',
        status: 'draft',
        draftTokenHash: createHash('sha256').update(token).digest('hex'),
        blueprintJson: draftBlueprint,
        missingFieldsJson: ['crm_import'],
        expiresAt: new Date(Date.now() + 60_000),
        confirmedTenantId: null,
      }),
    });
    crm.previewCredentials.mockResolvedValue({
      provider: 'yclients',
      company_id: 503759,
      company: {
        id: '503759',
        title: 'Мужская Эстетика',
        address: 'Ставрополь',
        logo_url: 'https://example.com/logo.png',
        timezone: 'Europe/Moscow',
        schedule: '10:00-21:00',
      },
      services: {
        count: 1,
        items: [
          {
            id: '1',
            name: 'Мужская стрижка',
            price: 2000,
            duration_minutes: 60,
            currency: 'RUB',
          },
        ],
      },
      staff: {
        count: 1,
        items: [{ id: 'staff-1', name: 'Илья', title: 'Барбер' }],
      },
      team: {
        count: 2,
        items: [
          {
            id: 'staff-1',
            name: 'Илья',
            title: 'Барбер',
            bookable: true,
            suggested_role: 'staff',
          },
          {
            id: 'staff-2',
            name: 'Антон',
            title: 'Администратор',
            bookable: false,
            suggested_role: 'administrator',
          },
        ],
      },
      warnings: [],
    });
    updateDraft.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'draft-1',
        status: 'draft',
        confirmedTenantId: null,
        expiresAt: new Date(Date.now() + 60_000),
        ...data,
      }),
    );

    const result = await service.importDraftCrm('draft-1', {
      draftToken: token,
      provider: CrmProvider.YCLIENTS,
      apiToken: 'raw-user-token',
      companyId: '503759',
    });

    expect(result.blueprint).toMatchObject({
      businessName: 'Мужская Эстетика',
      providerCount: 1,
      crmImported: true,
      crmCompanyId: '503759',
      crmLogoUrl: 'https://example.com/logo.png',
    });
    expect(result.missing_fields).toEqual([]);
    expect(JSON.stringify(updateDraft.mock.calls[0]?.[0])).not.toContain(
      'raw-user-token',
    );
    expect(JSON.stringify(updateDraft.mock.calls[0]?.[0])).not.toContain(
      'Илья',
    );
    expect(result.crm_staff).toEqual([
      expect.objectContaining({
        external_staff_id: 'staff-1',
        display_name: 'Илья',
      }),
      expect.objectContaining({
        external_staff_id: 'staff-2',
        display_name: 'Антон',
        suggested_role: 'administrator',
      }),
    ]);
  });

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

  it('rejects a CRM staff identity that was not verified for the imported branch', async () => {
    const token = 'a'.repeat(43);
    const claimDraft = jest.fn();
    const { service, onboarding } = createService({
      findDraft: jest.fn().mockResolvedValue({
        id: 'draft-1',
        status: 'draft',
        draftTokenHash: createHash('sha256').update(token).digest('hex'),
        blueprintJson: {
          ...completeBlueprint,
          crmStaffIdentityHashes: [
            createHash('sha256')
              .update('yclients:503759:staff-verified')
              .digest('hex'),
          ],
        },
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
        ownerName: 'Владелец',
        ownerPhone: '+79990000000',
        teamMembers: [
          {
            externalStaffId: 'staff-from-another-branch',
            displayName: 'Чужой мастер',
            role: UserRole.STAFF,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(claimDraft).not.toHaveBeenCalled();
    expect(onboarding.createTrialSignup).not.toHaveBeenCalled();
  });

  it('resumes the confirmed business instead of consuming another signup', async () => {
    const token = 'a'.repeat(43);
    const { service, onboarding } = createService({
      findDraft: jest.fn().mockResolvedValue({
        id: 'draft-1',
        status: 'confirmed',
        draftTokenHash: createHash('sha256').update(token).digest('hex'),
        blueprintJson: completeBlueprint,
        missingFieldsJson: [],
        expiresAt: new Date(Date.now() + 60_000),
        confirmedTenantId: 'tenant-1',
      }),
    });
    onboarding.resumeConfirmedTrialSignup.mockResolvedValue({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      tenant: { id: 'tenant-1', slug: 'muzhskaya-estetika' },
      user: { id: 'owner-1', role: 'tenant_admin' },
    });

    const result = await service.confirmDraft('draft-1', {
      draftToken: token,
      ownerEmail: 'owner@example.ru',
      ownerName: 'Владелец',
      ownerPhone: '+79990000000',
    });

    expect(onboarding.resumeConfirmedTrialSignup).toHaveBeenCalledWith(
      'tenant-1',
      'owner@example.ru',
      {},
    );
    expect(onboarding.createTrialSignup).not.toHaveBeenCalled();
    expect(result.ai_onboarding).toMatchObject({
      draft_id: 'draft-1',
      resumed: true,
    });
  });

  it('uses the owner name internally when a solo specialist skipped a brand name', async () => {
    const token = 'a'.repeat(43);
    const deferredBlueprint: AiOnboardingBlueprint = {
      ...completeBlueprint,
      workMode: 'solo',
      categoryId: 'solo_barber',
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
