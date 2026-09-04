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
import { PrismaService } from '../prisma/prisma.service';
import type { AiOnboardingBlueprint } from './ai-onboarding.types';
import { AiOnboardingService } from './ai-onboarding.service';
import { ConversationalOnboardingInterpreter } from './conversational-onboarding-interpreter';
import { CanonicalTrialOnboardingService } from './canonical-trial-onboarding.service';
import { AiConfirmationCoordinatorService } from './ai-confirmation-coordinator.service';
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
      ownerSession: jest.fn().mockResolvedValue({
        tenant: { id: 'tenant-1' },
        user: { id: 'owner-1' },
      }),
      confirm: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        ownerUserId: 'owner-1',
        ai_onboarding: {
          status: 'waiting_for_crm',
          next_step: 'connect_crm',
        },
      }),
    };
    const crm = {
      discoverCompaniesForCredential: jest.fn(),
      previewCredentials: jest.fn(),
    };
    const safeInterpreter = new SafeOnboardingInterpreter();
    const interpreter = new ConversationalOnboardingInterpreter(
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
      safeInterpreter,
    );
    const service = new AiOnboardingService(
      prisma as unknown as PrismaService,
      interpreter,
      onboarding as unknown as CanonicalTrialOnboardingService,
      onboarding as unknown as AiConfirmationCoordinatorService,
      crm as unknown as CrmService,
      rateLimit as unknown as AuthRateLimitService,
      { authorizePendingToken: jest.fn() } as unknown as TrialActivationService,
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

  it('propagates receipt conflicts without resetting the draft or deleting a tenant', async () => {
    const { service, prisma, onboarding } = createService();
    prisma.aiOnboardingDraft.findUnique.mockResolvedValue({
      id: 'draft-1',
      revision: 0,
      status: 'confirming',
      draftTokenHash: createHash('sha256').update('d'.repeat(43)).digest('hex'),
      expiresAt: new Date(Date.now() + 10000),
      blueprintJson: completeBlueprint,
    });
    onboarding.confirm.mockRejectedValue(
      new ConflictException('Changed receipt'),
    );
    await expect(
      service.confirmDraft('draft-1', {
        expectedDraftRevision: 0,
        draftToken: 'd'.repeat(43),
        trialActivationToken: 'a'.repeat(43),
        ownerEmail: 'owner@example.invalid',
        ownerName: 'Owner',
        ownerPhone: '+79990001001',
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.aiOnboardingDraft.updateMany).not.toHaveBeenCalled();
    expect(prisma.tenant.delete).not.toHaveBeenCalled();
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
        expectedDraftRevision: 0,
        trialActivationToken: 'a'.repeat(43),
        draftToken: token,
        ownerEmail: 'owner@example.ru',
        ownerName: 'Владелец',
        ownerPhone: '+79990000000',
        ownerExternalStaffId: 'staff-verified',
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
    expect(onboarding.confirm).not.toHaveBeenCalled();
  });

  it('requires the owner to select their verified CRM employee profile', async () => {
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
              .update('yclients:503759:staff-owner')
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
        expectedDraftRevision: 0,
        trialActivationToken: 'a'.repeat(43),
        draftToken: token,
        ownerEmail: 'owner@example.ru',
        ownerName: 'Владелец',
        ownerPhone: '+79990000000',
      }),
    ).rejects.toMatchObject({
      response: {
        error: { code: 'crm_team_owner_required' },
      },
    });
    expect(claimDraft).not.toHaveBeenCalled();
    expect(onboarding.confirm).not.toHaveBeenCalled();
  });

  it('delegates duplicate confirmation to the receipt and selects only its reserved owner', async () => {
    const { service, prisma, onboarding } = createService();
    prisma.aiOnboardingDraft.findUnique.mockResolvedValue({
      id: 'draft-1',
      revision: 0,
      status: 'confirming',
      draftTokenHash: createHash('sha256').update('d'.repeat(43)).digest('hex'),
      expiresAt: new Date(Date.now() + 10000),
      blueprintJson: completeBlueprint,
    });
    const dto = {
      expectedDraftRevision: 0,
      draftToken: 'd'.repeat(43),
      trialActivationToken: 'a'.repeat(43),
      ownerEmail: 'owner@example.invalid',
      ownerName: 'Owner',
      ownerPhone: '+79990001001',
    };
    const result = await service.confirmDraft('draft-1', dto);
    expect(onboarding.confirm).toHaveBeenCalledWith(
      'draft-1',
      dto,
      completeBlueprint,
      expect.any(String),
    );
    expect(onboarding.ownerSession).toHaveBeenCalledWith(
      'tenant-1',
      'owner-1',
      {},
    );
    expect(result.ai_onboarding.status).toBe('waiting_for_crm');
    expect(prisma.tenant.delete).not.toHaveBeenCalled();
  });
});
