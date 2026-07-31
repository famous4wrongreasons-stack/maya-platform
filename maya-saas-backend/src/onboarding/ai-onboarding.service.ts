import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

import type { AuthClientMetadata } from '../auth/auth-client-metadata';
import { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import { CalendarSource, CrmProvider } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import { InternalCalendarService } from '../internal-calendar/internal-calendar.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type {
  AiOnboardingBlueprint,
  AiOnboardingInterpretation,
  AiOnboardingMissingField,
} from './ai-onboarding.types';
import {
  getBusinessTemplate,
  listBusinessTemplates,
} from './business-templates';
import {
  getOnboardingCategory,
  listOnboardingCategories,
} from './onboarding-categories';
import {
  ConfirmAiOnboardingDraftDto,
  ContinueAiOnboardingDraftDto,
  CreateAiOnboardingDraftDto,
  DiscoverAiOnboardingCrmDto,
  ImportAiOnboardingCrmDto,
} from './dto/ai-onboarding.dto';
import { OnboardingService } from './onboarding.service';
import { ConversationalOnboardingInterpreter } from './conversational-onboarding-interpreter';
import { TrialActivationService } from './trial-activation.service';

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const RELEASE_CATEGORY_IDS = new Set(['solo_barber', 'business_barbershop']);

@Injectable()
export class AiOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly interpreter: ConversationalOnboardingInterpreter,
    private readonly onboardingService: OnboardingService,
    private readonly crmService: CrmService,
    private readonly internalCalendarService: InternalCalendarService,
    private readonly rateLimitService: AuthRateLimitService,
    private readonly tenantContext: TenantContextService,
    private readonly trialActivationService: TrialActivationService,
  ) {}

  listTemplates() {
    return {
      branding_mode: 'logo_only',
      onboarding_flow: {
        first_question: 'work_mode',
        work_modes: [
          { id: 'solo', label: 'Работаю на себя' },
          { id: 'business', label: 'У меня бизнес' },
        ],
      },
      categories: listOnboardingCategories().map((category) => ({
        id: category.id,
        work_mode: category.workMode,
        label: category.label,
        selection_message: category.selectionMessage,
        template_id: category.templateId,
        industry_preset_id: category.industryPresetId,
        provider_title: category.providerTitle,
        suggested_services: category.suggestedServices,
        available: RELEASE_CATEGORY_IDS.has(category.id),
        unavailable_reason: RELEASE_CATEGORY_IDS.has(category.id)
          ? null
          : 'Скоро. На первом этапе MAYA OS подключает только барберов и барбершопы.',
      })),
      templates: listBusinessTemplates().map((template) => ({
        id: template.id,
        name: template.name,
        description: template.description,
        industry_preset_id: template.industryPresetId,
        calendar_source: template.calendarSource,
        provider_title: template.providerTitle,
        suggested_services: template.suggestedServices,
        default_weekly_rules: template.defaultWeeklyRules,
      })),
    };
  }

  async createDraft(
    dto: CreateAiOnboardingDraftDto,
    metadata: Partial<AuthClientMetadata> = {},
  ) {
    await this.rateLimitService.assertPreflight('ai_onboarding', {
      clientIp: metadata.clientIp,
    });
    const activation = dto.trialActivationToken
      ? await this.trialActivationService.authorizePendingToken(
          dto.trialActivationToken,
        )
      : null;
    if (activation?.draft) {
      throw new ConflictException({
        message: 'Trial activation already has an onboarding draft',
        error: { code: 'trial_activation_draft_exists' },
      });
    }
    const interpretation = this.applyReleasePolicy(
      await this.interpreter.interpret(dto.message, undefined, dto.templateId),
    );
    const token = randomBytes(32).toString('base64url');
    const draft = await this.prisma.aiOnboardingDraft.create({
      data: {
        draftTokenHash: this.hashToken(token),
        templateId: interpretation.blueprint.templateId,
        blueprintJson: this.asJson(interpretation.blueprint),
        missingFieldsJson: interpretation.missingFields,
        inputDigest: this.digestInput(dto.message),
        lastAssistantMessage: interpretation.assistantMessage,
        quickRepliesJson: this.asJson(interpretation.quickReplies),
        lastConfidence: interpretation.confidence,
        needsClarification: interpretation.needsClarification,
        interpreterSource: interpretation.source,
        trialActivationId: activation?.id,
        expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
      },
    });

    return this.serializeDraft(draft, token, interpretation);
  }

  async continueDraft(
    draftId: string,
    dto: ContinueAiOnboardingDraftDto,
    metadata: Partial<AuthClientMetadata> = {},
  ) {
    await this.rateLimitService.assertPreflight('ai_onboarding', {
      clientIp: metadata.clientIp,
      identity: this.hashToken(dto.draftToken),
    });
    const draft = await this.getAuthorizedDraft(draftId, dto.draftToken);
    this.assertEditable(draft);
    const interpretation = this.applyReleasePolicy(
      await this.interpreter.interpret(
        dto.message,
        this.readBlueprint(draft.blueprintJson),
      ),
    );
    const updated = await this.prisma.aiOnboardingDraft.update({
      where: { id: draft.id },
      data: {
        templateId: interpretation.blueprint.templateId,
        blueprintJson: this.asJson(interpretation.blueprint),
        missingFieldsJson: interpretation.missingFields,
        inputDigest: this.digestInput(dto.message),
        lastAssistantMessage: interpretation.assistantMessage,
        quickRepliesJson: this.asJson(interpretation.quickReplies),
        lastConfidence: interpretation.confidence,
        needsClarification: interpretation.needsClarification,
        interpreterSource: interpretation.source,
        turnCount: { increment: 1 },
      },
    });

    return this.serializeDraft(updated, undefined, interpretation);
  }

  async readDraft(draftId: string, draftToken: string) {
    const draft = await this.getAuthorizedDraft(draftId, draftToken);
    this.assertNotExpired(draft);
    return this.serializeDraft(draft);
  }

  async discoverDraftCrm(
    draftId: string,
    dto: DiscoverAiOnboardingCrmDto,
    metadata: Partial<AuthClientMetadata> = {},
  ) {
    await this.rateLimitService.assertPreflight('ai_onboarding', {
      clientIp: metadata.clientIp,
      identity: this.hashToken(dto.draftToken),
    });
    const draft = await this.getAuthorizedDraft(draftId, dto.draftToken);
    this.assertEditable(draft);
    this.assertCrmOnboardingReady(this.readBlueprint(draft.blueprintJson));
    this.assertReleaseCrmProvider(dto.provider);

    return this.crmService.discoverCompaniesForCredential({
      provider: dto.provider,
      apiToken: dto.apiToken,
    });
  }

  async importDraftCrm(
    draftId: string,
    dto: ImportAiOnboardingCrmDto,
    metadata: Partial<AuthClientMetadata> = {},
  ) {
    await this.rateLimitService.assertPreflight('ai_onboarding', {
      clientIp: metadata.clientIp,
      identity: this.hashToken(dto.draftToken),
    });
    const draft = await this.getAuthorizedDraft(draftId, dto.draftToken);
    this.assertEditable(draft);
    const current = this.readBlueprint(draft.blueprintJson);
    this.assertCrmOnboardingReady(current);
    this.assertReleaseCrmProvider(dto.provider);

    const companyId = dto.companyId.trim();
    const numericCompanyId = Number(companyId);
    const preview = await this.crmService.previewCredentials(
      dto.provider,
      dto.apiToken,
      {
        companyId:
          Number.isFinite(numericCompanyId) && numericCompanyId > 0
            ? numericCompanyId
            : companyId,
      },
    );
    const company = preview.company;

    if (!company) {
      throw new BadRequestException({
        message: 'CRM did not return the selected business profile',
        error: {
          code: 'crm_company_profile_missing',
          message:
            'Не удалось загрузить данные выбранного филиала. Выберите его ещё раз.',
        },
      });
    }

    const blueprint: AiOnboardingBlueprint = {
      ...current,
      templateId: 'barbershop',
      businessName: company.title,
      businessNameDeferred: false,
      businessNameGenerated: false,
      summary: `Барбершоп «${company.title}» подключается к MAYA через CRM`,
      industryPresetId: 'barbershop',
      calendarSource: CalendarSource.EXTERNAL,
      calendarSourceConfirmed: true,
      providerCount: Math.max(1, preview.staff.count),
      providerTitle: 'Барбер',
      services: preview.services.items.map((service) => ({
        name: service.name,
        price: service.price,
        durationMinutes: service.duration_minutes,
      })),
      servicesDeferred: preview.services.count === 0,
      scheduleAssumed: false,
      crmImported: true,
      crmProvider: dto.provider,
      crmCompanyId: String(preview.company_id ?? company.id),
      crmLogoUrl: this.safeRemoteLogoUrl(company.logo_url),
      crmAddress: company.address,
      crmTimezone: company.timezone,
      crmScheduleLabel: company.schedule,
      crmServiceCount: preview.services.count,
      crmStaffCount: preview.staff.count,
    };
    const missingFields = this.getMissingFields(blueprint);
    const interpretation: AiOnboardingInterpretation = {
      assistantMessage:
        `Я проверила CRM и подтянула «${company.title}»: ` +
        `${preview.staff.count} специалистов, ${preview.services.count} услуг` +
        `${blueprint.crmLogoUrl ? ' и логотип' : ''}. Проверьте данные и укажите контакты владельца.`,
      blueprint,
      confidence: 1,
      missingFields,
      needsClarification: missingFields.length > 0,
      quickReplies:
        missingFields.length === 0
          ? [
              {
                label: 'Проверить и продолжить',
                message: '',
                action: 'confirm',
              },
            ]
          : [],
      source: 'safe_fallback',
    };
    const updated = await this.prisma.aiOnboardingDraft.update({
      where: { id: draft.id },
      data: {
        templateId: blueprint.templateId,
        blueprintJson: this.asJson(blueprint),
        missingFieldsJson: missingFields,
        inputDigest: this.digestInput(`${dto.provider}:${companyId}`),
        lastAssistantMessage: interpretation.assistantMessage,
        quickRepliesJson: this.asJson(interpretation.quickReplies),
        lastConfidence: interpretation.confidence,
        needsClarification: interpretation.needsClarification,
        interpreterSource: interpretation.source,
        turnCount: { increment: 1 },
      },
    });

    return this.serializeDraft(updated, undefined, interpretation);
  }

  async confirmDraft(
    draftId: string,
    dto: ConfirmAiOnboardingDraftDto,
    metadata: Partial<AuthClientMetadata> = {},
  ) {
    const draft = await this.getAuthorizedDraft(draftId, dto.draftToken);
    this.assertEditable(draft);
    let blueprint = this.applyConfirmationOverrides(
      this.readBlueprint(draft.blueprintJson),
      dto,
    );
    blueprint = this.materializeDeferredBusinessName(blueprint, dto.ownerName);
    const missingFields = this.getMissingFields(blueprint);
    if (missingFields.length > 0) {
      throw new BadRequestException({
        message: 'AI onboarding draft is incomplete',
        error: {
          code: 'ai_onboarding_incomplete',
          message:
            'Complete the confirmation card before creating the business',
          missing_fields: missingFields,
        },
      });
    }

    const claimed = await this.prisma.aiOnboardingDraft.updateMany({
      where: {
        id: draft.id,
        status: 'draft',
        expiresAt: { gt: new Date() },
      },
      data: {
        status: 'confirming',
        blueprintJson: this.asJson(blueprint),
        missingFieldsJson: [],
      },
    });
    if (claimed.count !== 1) {
      throw new ConflictException({
        message: 'AI onboarding draft is already being confirmed',
        error: { code: 'ai_onboarding_confirmation_in_progress' },
      });
    }

    let createdTenantId: string | null = null;
    try {
      const businessName = blueprint.businessName!;
      const signup = await this.onboardingService.createTrialSignup(
        {
          name: businessName,
          slug: await this.createAvailableSlug(businessName),
          ownerEmail: dto.ownerEmail,
          ownerName: dto.ownerName,
          ownerPhone: dto.ownerPhone,
          password: dto.password,
          trialActivationToken: dto.trialActivationToken,
          industryPresetId: blueprint.industryPresetId,
          calendarSource: blueprint.calendarSource,
          branchName: businessName,
          branchAddress: blueprint.crmAddress ?? undefined,
          branchTimezone: blueprint.crmTimezone ?? undefined,
        },
        metadata,
        { expectedActivationId: draft.trialActivationId },
      );
      createdTenantId = signup.tenant.id;

      if (blueprint.crmImported) {
        await this.prisma.brandingSettings.update({
          where: { tenantId: createdTenantId },
          data: {
            appName: businessName,
            logoUrl: blueprint.crmLogoUrl ?? undefined,
          },
        });
      }

      if (blueprint.calendarSource === CalendarSource.INTERNAL) {
        await this.tenantContext.runAsSystemTenant(createdTenantId, () =>
          this.provisionInternalCalendar(createdTenantId!, blueprint),
        );
      }

      await this.prisma.aiOnboardingDraft.update({
        where: { id: draft.id },
        data: {
          status: 'confirmed',
          confirmedTenantId: createdTenantId,
          blueprintJson: this.asJson(blueprint),
        },
      });

      return {
        ...signup,
        ai_onboarding: {
          draft_id: draft.id,
          template_id: blueprint.templateId,
          blueprint,
        },
        branding_mode: 'logo_only',
        next_step:
          blueprint.calendarSource === CalendarSource.EXTERNAL
            ? 'connect_crm'
            : 'upload_logo_or_open_app',
      };
    } catch (error) {
      if (createdTenantId) {
        await this.trialActivationService.releaseCompletedTenant(
          createdTenantId,
        );
        await this.prisma.tenant.delete({
          where: { id: createdTenantId },
        });
      }
      await this.prisma.aiOnboardingDraft.updateMany({
        where: { id: draft.id, status: 'confirming' },
        data: { status: 'draft', confirmedTenantId: null },
      });
      throw error;
    }
  }

  private async provisionInternalCalendar(
    tenantId: string,
    blueprint: AiOnboardingBlueprint,
  ) {
    const setup = await this.internalCalendarService.getSetup(tenantId);
    const ownerProvider = setup.providers[0];
    if (!ownerProvider) {
      throw new ConflictException('Owner provider was not created');
    }

    await this.internalCalendarService.updateProvider(
      tenantId,
      ownerProvider.id,
      {
        title: blueprint.providerTitle,
      },
    );
    const providers = [ownerProvider];
    for (let index = 1; index < blueprint.providerCount!; index += 1) {
      providers.push(
        await this.internalCalendarService.createProvider(tenantId, {
          displayName: `${blueprint.providerTitle} ${index + 1}`,
          title: blueprint.providerTitle,
        }),
      );
    }

    for (const service of blueprint.services) {
      await this.internalCalendarService.createService(tenantId, {
        name: service.name,
        price: service.price,
        durationMinutes: service.durationMinutes,
      });
    }

    for (const provider of providers) {
      await this.internalCalendarService.replaceWeeklyAvailability(
        tenantId,
        provider.id,
        blueprint.weeklyRules,
      );
    }
  }

  private applyConfirmationOverrides(
    current: AiOnboardingBlueprint,
    dto: ConfirmAiOnboardingDraftDto,
  ): AiOnboardingBlueprint {
    if (current.crmImported) {
      return current;
    }

    const template = getBusinessTemplate(dto.templateId ?? current.templateId);
    const category = getOnboardingCategory(current.categoryId);
    const businessName = dto.businessName?.trim() || current.businessName;
    const services =
      dto.services?.map((service) => ({ ...service })) ?? current.services;
    return {
      ...current,
      templateId: template.id,
      industryPresetId: category?.industryPresetId ?? template.industryPresetId,
      providerTitle: category?.providerTitle ?? template.providerTitle,
      businessName,
      businessNameDeferred: businessName
        ? false
        : (current.businessNameDeferred ?? false),
      businessNameGenerated: businessName
        ? false
        : (current.businessNameGenerated ?? false),
      calendarSource: dto.calendarSource ?? current.calendarSource,
      calendarSourceConfirmed: dto.calendarSource
        ? true
        : (current.calendarSourceConfirmed ?? false),
      providerCount: dto.providerCount ?? current.providerCount,
      services,
      servicesDeferred:
        services.length > 0
          ? false
          : dto.services
            ? true
            : (current.servicesDeferred ?? false),
      weeklyRules:
        dto.weeklyRules?.map((rule) => ({ ...rule })) ?? current.weeklyRules,
      scheduleAssumed: dto.weeklyRules ? false : current.scheduleAssumed,
    };
  }

  private materializeDeferredBusinessName(
    blueprint: AiOnboardingBlueprint,
    ownerName: string,
  ): AiOnboardingBlueprint {
    if (blueprint.businessName?.trim() || !blueprint.businessNameDeferred) {
      return blueprint;
    }

    const category = getOnboardingCategory(blueprint.categoryId);
    const fallbackName =
      blueprint.workMode === 'solo'
        ? ownerName.trim()
        : (category?.label ?? 'Мой бизнес');

    return {
      ...blueprint,
      businessName: fallbackName,
      businessNameGenerated: true,
    };
  }

  private getMissingFields(
    blueprint: AiOnboardingBlueprint,
  ): AiOnboardingMissingField[] {
    if (this.legacyHttpSmokeEnabled()) {
      const missing: AiOnboardingMissingField[] = [];
      if (!blueprint.workMode) missing.push('work_mode');
      if (!blueprint.categoryId) missing.push('category');
      if (!blueprint.businessName?.trim() && !blueprint.businessNameDeferred) {
        missing.push('business_name');
      }
      if (!blueprint.providerCount) missing.push('provider_count');
      if (blueprint.services.length === 0 && !blueprint.servicesDeferred) {
        missing.push('services');
      }
      if (!blueprint.calendarSourceConfirmed) missing.push('calendar_source');
      return missing;
    }

    const missing: AiOnboardingMissingField[] = [];
    if (!blueprint.workMode) missing.push('work_mode');
    if (
      !blueprint.categoryId ||
      !RELEASE_CATEGORY_IDS.has(blueprint.categoryId)
    ) {
      missing.push('category');
    }
    if (!blueprint.calendarSourceConfirmed) {
      missing.push('calendar_source');
      return missing;
    }
    if (
      blueprint.calendarSource !== CalendarSource.EXTERNAL ||
      !blueprint.crmImported
    ) {
      missing.push('crm_import');
      return missing;
    }
    if (!blueprint.businessName?.trim() && !blueprint.businessNameDeferred) {
      missing.push('business_name');
    }
    return missing;
  }

  private applyReleasePolicy(
    interpretation: AiOnboardingInterpretation,
  ): AiOnboardingInterpretation {
    if (this.legacyHttpSmokeEnabled()) {
      return interpretation;
    }

    let blueprint = { ...interpretation.blueprint };

    if (!blueprint.workMode) {
      return interpretation;
    }

    const category = getOnboardingCategory(blueprint.categoryId);
    if (!category || !RELEASE_CATEGORY_IDS.has(category.id)) {
      const unsupportedSelected = Boolean(blueprint.categoryId);
      blueprint = {
        ...blueprint,
        categoryId: null,
        crmImported: false,
        crmCompanyId: null,
        crmLogoUrl: null,
      };
      const options = listOnboardingCategories()
        .filter((item) => item.workMode === blueprint.workMode)
        .map((item) => ({
          label: RELEASE_CATEGORY_IDS.has(item.id)
            ? item.label
            : `${item.label} · Скоро`,
          message: item.selectionMessage,
          action: RELEASE_CATEGORY_IDS.has(item.id)
            ? undefined
            : ('disabled' as const),
          templateId: item.templateId,
        }));

      return {
        ...interpretation,
        assistantMessage: unsupportedSelected
          ? 'Эта сфера появится позже. Сейчас тестовая версия MAYA OS подключает только барберов и барбершопы.'
          : blueprint.workMode === 'solo'
            ? 'Чем вы занимаетесь? На первом этапе доступен барбер, остальные профессии появятся позже.'
            : 'Какой у вас бизнес? На первом этапе доступен барбершоп, остальные сферы появятся позже.',
        blueprint,
        missingFields: ['category'],
        needsClarification: true,
        quickReplies: options,
      };
    }

    blueprint = {
      ...blueprint,
      templateId: 'barbershop',
      industryPresetId: 'barbershop',
      providerTitle: 'Барбер',
      services: blueprint.crmImported ? blueprint.services : [],
      servicesDeferred: blueprint.crmImported
        ? blueprint.servicesDeferred
        : true,
      providerCount: blueprint.crmImported ? blueprint.providerCount : null,
    };

    if (
      !blueprint.calendarSourceConfirmed ||
      blueprint.calendarSource !== CalendarSource.EXTERNAL
    ) {
      blueprint = {
        ...blueprint,
        calendarSource: CalendarSource.EXTERNAL,
        calendarSourceConfirmed: false,
        crmImported: false,
      };
      return {
        ...interpretation,
        assistantMessage:
          'У вас есть YClients или Altegio? Сейчас запуск MAYA OS доступен только с CRM: она сама подтянет название, специалистов, услуги, расписание и логотип.',
        blueprint,
        missingFields: ['calendar_source'],
        needsClarification: true,
        quickReplies: [
          {
            label: 'Есть CRM',
            message: 'У меня есть CRM',
            action: 'connect_crm',
          },
          {
            label: 'Работаю без CRM · Скоро',
            message: '',
            action: 'disabled',
          },
        ],
      };
    }

    if (!blueprint.crmImported) {
      return {
        ...interpretation,
        assistantMessage:
          'Подключим CRM сейчас. Токен вводится в защищённом поле и не попадает в переписку.',
        blueprint,
        missingFields: ['crm_import'],
        needsClarification: true,
        quickReplies: [
          {
            label: 'Подключить CRM',
            message: '',
            action: 'connect_crm',
          },
        ],
      };
    }

    const missingFields = this.getMissingFields(blueprint);
    return {
      ...interpretation,
      blueprint,
      missingFields,
      needsClarification: missingFields.length > 0,
      assistantMessage:
        missingFields.length === 0
          ? 'Данные CRM загружены. Проверьте карточку и укажите контакты владельца.'
          : interpretation.assistantMessage,
      quickReplies:
        missingFields.length === 0
          ? [
              {
                label: 'Проверить и продолжить',
                message: '',
                action: 'confirm',
              },
            ]
          : interpretation.quickReplies,
    };
  }

  private legacyHttpSmokeEnabled(): boolean {
    return (
      process.env.NODE_ENV === 'test' &&
      process.env.HTTP_SMOKE_ENABLE_LEGACY_AI_ONBOARDING === 'true'
    );
  }

  private assertCrmOnboardingReady(blueprint: AiOnboardingBlueprint): void {
    if (
      !blueprint.categoryId ||
      !RELEASE_CATEGORY_IDS.has(blueprint.categoryId)
    ) {
      throw new BadRequestException({
        message: 'Barbershop category must be selected before CRM connection',
        error: {
          code: 'ai_onboarding_category_required',
          message: 'Сначала выберите «Барбер» или «Барбершоп».',
        },
      });
    }
  }

  private assertReleaseCrmProvider(provider: CrmProvider): void {
    if (provider === CrmProvider.YCLIENTS || provider === CrmProvider.ALTEGIO) {
      return;
    }

    throw new BadRequestException({
      message: 'CRM provider is not available in the barbershop release',
      error: {
        code: 'crm_provider_not_available',
        provider,
        message: 'Сейчас доступны только YClients и Altegio.',
      },
    });
  }

  private safeRemoteLogoUrl(value: string | null): string | null {
    if (!value) {
      return null;
    }

    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.toString() : null;
    } catch {
      return null;
    }
  }

  private async getAuthorizedDraft(draftId: string, token: string) {
    const draft = await this.prisma.aiOnboardingDraft.findUnique({
      where: { id: draftId },
    });
    if (!draft) {
      throw new NotFoundException('AI onboarding draft not found');
    }

    const expected = Buffer.from(draft.draftTokenHash, 'hex');
    const actual = Buffer.from(this.hashToken(token), 'hex');
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw new UnauthorizedException({
        message: 'Invalid AI onboarding draft token',
        error: { code: 'invalid_ai_onboarding_token' },
      });
    }

    return draft;
  }

  private assertEditable(draft: { status: string; expiresAt: Date }) {
    this.assertNotExpired(draft);
    if (draft.status !== 'draft') {
      throw new ConflictException({
        message: 'AI onboarding draft is not editable',
        error: { code: 'ai_onboarding_not_editable', status: draft.status },
      });
    }
  }

  private assertNotExpired(draft: { expiresAt: Date }) {
    if (draft.expiresAt.getTime() <= Date.now()) {
      throw new GoneException({
        message: 'AI onboarding draft has expired',
        error: { code: 'ai_onboarding_expired' },
      });
    }
  }

  private async createAvailableSlug(name: string): Promise<string> {
    const base = this.slugify(name) || `maya-${randomBytes(4).toString('hex')}`;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const existing = await this.prisma.tenant.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!existing) return slug;
    }
    return `${base}-${randomBytes(4).toString('hex')}`;
  }

  private slugify(value: string): string {
    const transliterated = value
      .toLowerCase()
      .split('')
      .map((character) => CYRILLIC_TO_LATIN[character] ?? character)
      .join('');
    return transliterated
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }

  private readBlueprint(value: unknown): AiOnboardingBlueprint {
    return value as AiOnboardingBlueprint;
  }

  private asJson(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }

  private serializeDraft(
    draft: {
      id: string;
      status: string;
      blueprintJson: unknown;
      missingFieldsJson: unknown;
      expiresAt: Date;
      confirmedTenantId: string | null;
      trialActivationId?: string | null;
      lastAssistantMessage?: string | null;
      lastConfidence?: number | null;
      needsClarification?: boolean;
      quickRepliesJson?: unknown;
      interpreterSource?: string;
      turnCount?: number;
    },
    draftToken?: string,
    interpretation?: AiOnboardingInterpretation,
  ) {
    return {
      draft_id: draft.id,
      draft_token: draftToken,
      status: draft.status,
      assistant_message:
        interpretation?.assistantMessage ?? draft.lastAssistantMessage ?? null,
      confidence: interpretation?.confidence ?? draft.lastConfidence ?? null,
      needs_clarification:
        interpretation?.needsClarification ?? draft.needsClarification ?? false,
      quick_replies:
        interpretation?.quickReplies ??
        this.readQuickReplies(draft.quickRepliesJson),
      interpreter_source:
        interpretation?.source ?? draft.interpreterSource ?? 'safe_fallback',
      turn_count: draft.turnCount ?? 1,
      blueprint: this.readBlueprint(draft.blueprintJson),
      missing_fields: draft.missingFieldsJson,
      expires_at: draft.expiresAt,
      confirmed_tenant_id: draft.confirmedTenantId,
      trial_activation_id: draft.trialActivationId ?? null,
    };
  }

  private hashToken(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private digestInput(value: string): string {
    return createHash('sha256').update(value.trim()).digest('hex');
  }

  private readQuickReplies(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};
