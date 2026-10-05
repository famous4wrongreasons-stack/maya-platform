import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import {
  ActionEngineKernel,
  ActionEngineRuntimeService,
} from '../action-engine';
import { stableActionJson } from '../action-engine/action-engine.identity';
import { AuthRateLimitRepository } from '../auth/auth-rate-limit.repository';
import { normalizeRussianPhone } from '../common/phone.util';
import { CrmService } from '../crm/crm.service';
import { EncryptionService } from '../encryption/encryption.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantsService } from '../tenants/tenants.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { PublicBookingRepository } from './public-booking.repository';
import {
  PUBLIC_BOOKING_OPAQUE_REF_MAX,
  publicBookingPhoto,
  publicObject,
  publicText,
  type PublicBookingAttempt,
  type PublicBookingSession,
  type PublicBookingSite,
  type PublicBookingSnapshot,
} from './public-booking.types';

const COOKIE = '__Host-maya_guest_booking';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MINUTE = 60_000;
type Context = {
  session: PublicBookingSession;
  site: PublicBookingSite;
  secret: string;
};

@Injectable()
export class PublicBookingService {
  constructor(
    private readonly config: ConfigService,
    private readonly repo: PublicBookingRepository,
    private readonly encryption: EncryptionService,
    private readonly crm: CrmService,
    private readonly tenancy: TenantContextService,
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly tenants: TenantsService,
    private readonly limits: AuthRateLimitRepository,
    private readonly kernel: ActionEngineKernel,
    private readonly runtime: ActionEngineRuntimeService,
  ) {}

  private hash(namespace: string, value: unknown) {
    return this.encryption.opaqueReference(
      `public-booking:${namespace}`,
      stableActionJson(value),
    );
  }
  private site(key: string): PublicBookingSite {
    let sites: unknown;
    try {
      sites = JSON.parse(
        this.config.get<string>('PUBLIC_BOOKING_SITES') || '[]',
      );
    } catch {
      throw new ForbiddenException('PUBLIC_BOOKING_DISABLED');
    }
    if (!Array.isArray(sites))
      throw new ForbiddenException('PUBLIC_BOOKING_DISABLED');
    const matches = sites.filter(
      (s: PublicBookingSite) => s?.siteKey === key,
    ) as PublicBookingSite[];
    const s = matches[0];
    if (
      matches.length !== 1 ||
      !s.tenantId ||
      !s.branchId ||
      !s.consentVersion ||
      !s.consentUrl ||
      !Array.isArray(s.origins) ||
      !s.origins.length ||
      s.origins.some((origin) => {
        try {
          return (
            new URL(origin).origin !== origin ||
            (new URL(origin).protocol !== 'https:' &&
              !(
                this.config.get<string>('NODE_ENV') === 'test' &&
                new URL(origin).protocol === 'http:' &&
                ['localhost', '127.0.0.1'].includes(new URL(origin).hostname)
              ))
          );
        } catch {
          return true;
        }
      })
    )
      throw new ForbiddenException('PUBLIC_BOOKING_DISABLED');
    return s;
  }
  private origin(req: Request, site: PublicBookingSite) {
    if (
      typeof req.headers.origin !== 'string' ||
      !site.origins.includes(req.headers.origin)
    )
      throw new ForbiddenException('PUBLIC_BOOKING_ORIGIN_DENIED');
  }
  private cookie(req: Request): string | undefined {
    const values = (req.headers.cookie || '')
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.startsWith(`${COOKIE}=`));
    if (values.length !== 1) return undefined;
    const token = values[0].slice(COOKIE.length + 1);
    return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
  }
  private csrf(secret: string) {
    return this.hash('csrf', secret);
  }
  private async limit(
    req: Request,
    site: PublicBookingSite,
    kind: string,
    session?: string,
  ) {
    const action = `guest-${kind}`;
    const consumed = await this.limits.consume(
      [
        {
          action,
          policyKey: `${action}:ip`,
          scope: 'ip',
          subjectHash: this.hash('ip', [
            site.siteKey,
            req.ip || req.socket.remoteAddress || 'unknown',
          ]),
          tenantId: site.tenantId,
          windowSeconds: 60,
          maxAttempts: kind === 'session' ? 10 : 90,
        },
        ...(session
          ? [
              {
                action,
                policyKey: `${action}:session`,
                scope: 'identity' as const,
                subjectHash: this.hash('session-limit', session),
                tenantId: site.tenantId,
                windowSeconds: 60,
                maxAttempts: kind === 'create' ? 8 : 60,
              },
            ]
          : []),
      ],
      new Date(),
    );
    if (!consumed.allowed)
      throw new HttpException('PUBLIC_BOOKING_RATE_LIMITED', 429);
  }
  private async context(
    req: Request,
    write: boolean,
    kind = 'read',
  ): Promise<Context> {
    const secret = this.cookie(req);
    const session =
      secret && (await this.repo.session(this.hash('secret', secret)));
    if (
      !secret ||
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    )
      throw new ForbiddenException('PUBLIC_BOOKING_SESSION_UNAVAILABLE');
    const site = this.site(session.siteKey);
    this.origin(req, site);
    if (
      site.tenantId !== session.tenantId ||
      session.configHash !== this.hash('config', site)
    )
      throw new ForbiddenException('PUBLIC_BOOKING_SESSION_UNAVAILABLE');
    if (write) {
      const supplied = req.headers['x-csrf-token'];
      const expected = this.csrf(secret);
      if (
        typeof supplied !== 'string' ||
        supplied.length !== expected.length ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
      )
        throw new ForbiddenException('PUBLIC_BOOKING_CSRF_DENIED');
    }
    await this.limit(req, site, kind, session.id);
    return { session, site, secret };
  }
  private async facts(ctx: Context) {
    await this.tenants.assertLiveBookingEnabled(ctx.site.tenantId);
    for (const feature of [
      'booking',
      'booking.public',
      'crm.integration',
    ] as const)
      await this.entitlements.assertFeature(ctx.site.tenantId, feature);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: ctx.site.tenantId },
      select: { name: true, defaultTimezone: true },
    });
    const branch = await this.prisma.branch.findFirst({
      where: { id: ctx.site.branchId, tenantId: ctx.site.tenantId },
    });
    const target = await this.crm.canonicalClientBookingTarget(
      ctx.site.tenantId,
    );
    if (
      !tenant ||
      !branch ||
      target.source !== 'external' ||
      target.provider !== 'yclients' ||
      !target.companyId
    )
      throw new ForbiddenException('PUBLIC_BOOKING_DISABLED');
    // CRM slot owner uses the tenant timezone; refuse conflicting branch interpretation.
    if (branch.timezone && branch.timezone !== tenant.defaultTimezone)
      throw new ForbiddenException('PUBLIC_BOOKING_TIMEZONE_UNSUPPORTED');
    return { name: tenant.name, timezone: tenant.defaultTimezone, target };
  }
  private scoped<T>(ctx: Context, fn: () => Promise<T>) {
    return this.tenancy.runAsPublicTenant(ctx.session.tenantId, fn);
  }
  private seal(ctx: Context, kind: string, data: Record<string, unknown>) {
    const ref = this.encryption.encrypt(
      JSON.stringify({
        kind,
        session: ctx.session.id,
        expires: Date.now() + 15 * MINUTE,
        data,
      }),
    );
    if (ref.length > PUBLIC_BOOKING_OPAQUE_REF_MAX)
      throw new BadRequestException('PUBLIC_BOOKING_SELECTION_UNAVAILABLE');
    return ref;
  }
  private unseal(
    ctx: Context,
    kind: string,
    ref: unknown,
  ): Record<string, unknown> {
    try {
      const value = JSON.parse(
        this.encryption.decrypt(publicText(ref, PUBLIC_BOOKING_OPAQUE_REF_MAX)),
      ) as {
        kind: string;
        session: string;
        expires: number;
        data: Record<string, unknown>;
      };
      if (
        value.kind !== kind ||
        value.session !== ctx.session.id ||
        value.expires <= Date.now()
      )
        throw new Error();
      return value.data;
    } catch {
      throw new BadRequestException('PUBLIC_BOOKING_REFERENCE_UNAVAILABLE');
    }
  }
  async open(body: unknown, req: Request, res: Response) {
    const input = publicObject(body, ['siteKey']);
    const site = this.site(publicText(input.siteKey, 80));
    this.origin(req, site);
    await this.limit(req, site, 'session');
    let secret = this.cookie(req);
    let session = secret
      ? await this.repo.session(this.hash('secret', secret))
      : undefined;
    if (
      !session ||
      session.siteKey !== site.siteKey ||
      session.configHash !== this.hash('config', site) ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      secret = randomBytes(32).toString('base64url');
      session = {
        id: randomUUID(),
        tenantId: site.tenantId,
        siteKey: site.siteKey,
        configHash: this.hash('config', site),
        secretHash: this.hash('secret', secret),
        expiresAt: new Date(Date.now() + 24 * 60 * MINUTE),
        revokedAt: null,
      };
    }
    const ctx = { site, session, secret: secret! };
    return this.scoped(ctx, async () => {
      const facts = await this.facts(ctx);
      const staff = await this.crm.getStaff(site.tenantId);
      if (!(await this.repo.session(session.secretHash)))
        await this.repo.insertSession(session);
      res.cookie(COOKIE, secret, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
        expires: session.expiresAt,
      });
      return {
        contract: 'maya.website-guest-booking/1',
        csrfToken: this.csrf(secret!),
        expiresAt: session.expiresAt.toISOString(),
        site: { name: facts.name, timezone: facts.timezone },
        dateWindow: {
          from: this.localDate(new Date(), facts.timezone),
          through: this.localDate(
            new Date(Date.now() + 59 * 86400000),
            facts.timezone,
          ),
          availability: 'query_required',
        },
        staff: staff.map((s) => ({
          staffRef: this.seal(ctx, 'staff', { id: s.id }),
          name: s.name,
          photoUrl: publicBookingPhoto(s.avatar_url),
        })),
      };
    });
  }
  private async catalog(ctx: Context, staffId: string) {
    const staff = (await this.crm.getStaff(ctx.site.tenantId)).find(
      (s) => s.id === staffId,
    );
    if (!staff)
      throw new BadRequestException('PUBLIC_BOOKING_SELECTION_UNAVAILABLE');
    return {
      staff,
      services: await this.crm.getPublicBookingServices(
        ctx.site.tenantId,
        staffId,
      ),
    };
  }
  async services(query: unknown, req: Request) {
    const input = publicObject(query, ['staffRef']);
    const ctx = await this.context(req, false);
    return this.scoped(ctx, async () => {
      await this.facts(ctx);
      const staffId = publicText(this.unseal(ctx, 'staff', input.staffRef).id);
      const catalog = await this.catalog(ctx, staffId);
      return {
        services: catalog.services.map((s) => ({
          serviceRef: this.seal(ctx, 'service', { id: s.id, staffId }),
          name: s.name,
          durationMinutes: s.duration_minutes,
          priceMinor: Math.round(s.price * 100),
          currency: s.currency,
        })),
      };
    });
  }
  private localDate(date: Date, timezone: string) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
  private validateDate(date: string, timezone: string) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) ||
      new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date ||
      date < this.localDate(new Date(), timezone) ||
      date > this.localDate(new Date(Date.now() + 59 * 86400000), timezone)
    )
      throw new BadRequestException('PUBLIC_BOOKING_DATE_OUT_OF_RANGE');
  }
  private async selection(
    ctx: Context,
    staffId: string,
    serviceIds: string[],
    date: string,
  ) {
    const facts = await this.facts(ctx);
    this.validateDate(date, facts.timezone);
    const { staff, services } = await this.catalog(ctx, staffId);
    const selected = serviceIds.map((id) => services.find((s) => s.id === id));
    if (
      !serviceIds.length ||
      serviceIds.length > 10 ||
      new Set(serviceIds).size !== serviceIds.length ||
      selected.some((s) => !s)
    )
      throw new BadRequestException('PUBLIC_BOOKING_SELECTION_UNAVAILABLE');
    const chosen = selected.map((s) => s!);
    if (new Set(chosen.map((s) => s.currency)).size !== 1)
      throw new BadRequestException('PUBLIC_BOOKING_SELECTION_UNAVAILABLE');
    const slots = await this.crm.getAvailableSlots(ctx.site.tenantId, {
      date,
      staffId,
      serviceIds,
      branchId: ctx.site.branchId,
    });
    return {
      facts,
      staff,
      chosen,
      slots: slots.filter(
        (s) =>
          s.staff_id === staffId &&
          (!s.branch_id || s.branch_id === ctx.site.branchId) &&
          Date.parse(s.start) > Date.now() &&
          this.localDate(new Date(s.start), facts.timezone) === date,
      ),
    };
  }
  async availability(body: unknown, req: Request) {
    const input = publicObject(body, ['staffRef', 'serviceRefs', 'localDate']);
    const ctx = await this.context(req, true);
    return this.scoped(ctx, async () => {
      const staffId = publicText(this.unseal(ctx, 'staff', input.staffRef).id);
      if (!Array.isArray(input.serviceRefs) || input.serviceRefs.length > 10)
        throw new BadRequestException('PUBLIC_BOOKING_SELECTION_UNAVAILABLE');
      const serviceIds = input.serviceRefs
        .map((ref) => {
          const service = this.unseal(ctx, 'service', ref);
          if (service.staffId !== staffId)
            throw new BadRequestException(
              'PUBLIC_BOOKING_SELECTION_UNAVAILABLE',
            );
          return publicText(service.id);
        })
        .sort();
      const localDate = publicText(input.localDate, 10);
      const { facts, slots } = await this.selection(
        ctx,
        staffId,
        serviceIds,
        localDate,
      );
      return {
        timezone: facts.timezone,
        slots: slots.map((s) => ({
          slotRef: this.seal(ctx, 'slot', {
            staffId,
            serviceIds,
            localDate,
            start: s.start,
            end: s.end,
          }),
          startsAt: s.start,
          endsAt: s.end,
          label: new Intl.DateTimeFormat('en-GB', {
            timeZone: facts.timezone,
            hour: '2-digit',
            minute: '2-digit',
          }).format(new Date(s.start)),
        })),
      };
    });
  }
  private async snapshot(
    ctx: Context,
    slot: {
      staffId: string;
      serviceIds: string[];
      localDate: string;
      start: string;
      end: string;
    },
  ): Promise<PublicBookingSnapshot> {
    const { facts, staff, chosen, slots } = await this.selection(
      ctx,
      slot.staffId,
      slot.serviceIds,
      slot.localDate,
    );
    if (
      !slots.some(
        (s) =>
          Date.parse(s.start) === Date.parse(slot.start) &&
          Date.parse(s.end) === Date.parse(slot.end),
      )
    )
      throw new ConflictException('PUBLIC_BOOKING_SLOT_UNAVAILABLE');
    const durationMinutes = chosen.reduce((n, s) => n + s.duration_minutes, 0);
    if (
      Date.parse(slot.end) - Date.parse(slot.start) !==
      durationMinutes * MINUTE
    )
      throw new ConflictException('PUBLIC_BOOKING_DURATION_CHANGED');
    return {
      ...slot,
      timezone: facts.timezone,
      staffName: staff.name,
      serviceNames: chosen.map((s) => s.name),
      totalMinor: chosen.reduce((n, s) => n + Math.round(s.price * 100), 0),
      currency: chosen[0].currency,
      durationMinutes,
      calendarTarget: facts.target,
      consentVersion: ctx.site.consentVersion,
      consentUrl: ctx.site.consentUrl,
    };
  }
  async quote(body: unknown, req: Request) {
    const input = publicObject(body, ['slotRef']);
    const ctx = await this.context(req, true);
    return this.scoped(ctx, async () => {
      const data = this.unseal(ctx, 'slot', input.slotRef) as {
        staffId: string;
        serviceIds: string[];
        localDate: string;
        start: string;
        end: string;
      };
      const snapshot = await this.snapshot(ctx, data);
      const quote = {
        id: randomUUID(),
        sessionId: ctx.session.id,
        tenantId: ctx.session.tenantId,
        expiresAt: new Date(Date.now() + 5 * MINUTE),
        snapshotJson: snapshot,
      };
      await this.repo.insertQuote(quote);
      return {
        quoteRef: quote.id,
        expiresAt: quote.expiresAt.toISOString(),
        ...this.publicFacts(snapshot),
        consent: {
          documentVersion: ctx.site.consentVersion,
          documentUrl: ctx.site.consentUrl,
        },
      };
    });
  }
  private publicFacts(s: PublicBookingSnapshot) {
    return {
      staffName: s.staffName,
      serviceNames: s.serviceNames,
      startsAt: s.start,
      endsAt: s.end,
      timezone: s.timezone,
      totalMinor: s.totalMinor,
      currency: s.currency,
    };
  }
  private envelope(
    ref: string,
    state: string,
    code: string,
    booking: unknown = null,
  ) {
    return {
      attemptRef: ref,
      state,
      code,
      retryAfterSeconds: state === 'PENDING' || state === 'UNKNOWN' ? 3 : null,
      booking,
    };
  }
  async create(body: unknown, req: Request) {
    const ctx = await this.context(req, true, 'create');
    const nonce = publicText(req.headers['idempotency-key'], 36);
    if (!UUID.test(nonce))
      throw new BadRequestException('PUBLIC_BOOKING_INVALID_KEY');
    const existing = await this.repo.attempt(ctx.session, nonce);
    const requestHash = this.hash('request', body);
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new ConflictException('IDEMPOTENCY_CONFLICT');
      return this.result(ctx, existing);
    }
    return this.scoped(ctx, async () => {
      let candidate: PublicBookingAttempt | undefined;
      let dispatchStarted = false;
      let admitted = false;
      try {
        const input = publicObject(body, ['quoteRef', 'contact', 'consent']);
        const contact = publicObject(input.contact, ['name', 'phone']);
        const name = publicText(contact.name, 160);
        const phone = normalizeRussianPhone(publicText(contact.phone, 32));
        const consent = publicObject(input.consent, [
          'accepted',
          'documentVersion',
        ]);
        if (
          consent.accepted !== true ||
          consent.documentVersion !== ctx.site.consentVersion
        )
          throw new BadRequestException('PUBLIC_BOOKING_CONSENT_REQUIRED');
        const quote = await this.repo.quote(
          ctx.session,
          publicText(input.quoteRef, 36),
        );
        if (!quote || quote.expiresAt.getTime() <= Date.now())
          throw new BadRequestException('PUBLIC_BOOKING_QUOTE_EXPIRED');
        const s = quote.snapshotJson;
        const check = async () => {
          const current = await this.repo.session(ctx.session.secretHash);
          if (
            !current ||
            current.revokedAt ||
            current.expiresAt.getTime() <= Date.now() ||
            this.hash('config', this.site(current.siteKey)) !==
              current.configHash ||
            quote.expiresAt.getTime() <= Date.now()
          )
            throw new ForbiddenException('PUBLIC_BOOKING_QUOTE_EXPIRED');
          const fresh = await this.snapshot(ctx, {
            staffId: s.staffId,
            serviceIds: s.serviceIds,
            localDate: s.localDate,
            start: s.start,
            end: s.end,
          });
          if (stableActionJson(fresh) !== stableActionJson(s))
            throw new ConflictException('PUBLIC_BOOKING_QUOTE_CHANGED');
        };
        const id = randomUUID();
        const plan = await this.crm.preparePublicBooking(
          ctx.site.tenantId,
          {
            clientId: id,
            clientName: name,
            clientPhone: phone,
            branchId: ctx.site.branchId,
            staffId: s.staffId,
            serviceIds: s.serviceIds,
            start: s.start,
            durationMinutes: s.durationMinutes,
            creationMode: 'client',
            allowBusy: false,
            notifyBySmsHours: 0,
          },
          id,
          check,
        );
        const preview = this.kernel.previewExecution(plan.request);
        candidate = {
          id,
          sessionId: ctx.session.id,
          tenantId: ctx.session.tenantId,
          quoteId: quote.id,
          nonce,
          requestHash,
          intentHash: this.hash('intent', {
            phone,
            staffId: s.staffId,
            start: s.start,
            serviceIds: s.serviceIds,
            target: s.calendarTarget,
          }),
          normalizedInputHash: preview.normalizedInputHash,
          targetRef: preview.targetRef,
          preDispatchFailure: false,
          createdAt: new Date(),
        };
        if (!(await this.repo.insertAttempt(candidate))) {
          const winner = await this.repo.attempt(ctx.session, nonce);
          if (!winner || winner.requestHash !== requestHash)
            throw new ConflictException('IDEMPOTENCY_CONFLICT');
          return this.result(ctx, winner);
        }
        admitted = true;
        await check();
        dispatchStarted = true; // From here any missing outcome is ambiguous, including process loss.
        try {
          await this.runtime.executeWithReceipt(plan.request, {
            ...plan.handlers,
            authorizeIngress: check,
          });
        } catch {
          /* Read only the durable AE outcome, never infer failure from a thrown exception. */
        }
        return this.result(ctx, candidate);
      } catch (error) {
        if (dispatchStarted)
          return this.envelope(nonce, 'UNKNOWN', 'OUTCOME_UNRESOLVED');
        if (
          error instanceof ConflictException &&
          error.message === 'IDEMPOTENCY_CONFLICT'
        )
          throw error;
        if (candidate && admitted)
          await this.repo.rejectBeforeDispatch(candidate.id);
        // No dispatch was possible on this path. Keep the response finite and free of provider/PII detail.
        return this.envelope(
          nonce,
          'FAILED',
          admitted ? 'REJECTED_BEFORE_DISPATCH' : 'VALIDATION_REFUSED',
        );
      }
    });
  }
  async status(nonce: string, req: Request) {
    const ctx = await this.context(req, false);
    if (!UUID.test(nonce))
      throw new NotFoundException('PUBLIC_BOOKING_ATTEMPT_UNAVAILABLE');
    const attempt = await this.repo.attempt(ctx.session, nonce);
    if (!attempt)
      throw new NotFoundException('PUBLIC_BOOKING_ATTEMPT_UNAVAILABLE');
    return this.scoped(ctx, () => this.result(ctx, attempt, true));
  }
  private async result(
    ctx: Context,
    a: PublicBookingAttempt,
    readback = false,
  ) {
    if (a.preDispatchFailure)
      return this.envelope(a.nonce, 'FAILED', 'REJECTED_BEFORE_DISPATCH');
    let execution = await this.prisma.actionExecution.findFirst({
      where: {
        tenantId: a.tenantId,
        sourceType: 'public_booking',
        sourceRef: a.id,
        capability: 'crm.appointment.create.v1',
        normalizedInputHash: a.normalizedInputHash,
        targetRef: a.targetRef,
      },
      select: { id: true, state: true },
    });
    if (
      readback &&
      execution &&
      ['UNKNOWN', 'EXECUTING'].includes(execution.state)
    ) {
      const budget = await this.limits.consume(
        [
          {
            action: 'guest-readback',
            policyKey: 'guest-readback:attempt',
            scope: 'identity',
            subjectHash: this.hash('readback', a.id),
            tenantId: a.tenantId,
            windowSeconds: 60,
            maxAttempts: 2,
          },
        ],
        new Date(),
      );
      if (budget.allowed) {
        const quote = await this.repo.quote(ctx.session, a.quoteId);
        if (quote) {
          try {
            await this.crm.reconcilePublicBooking(
              a.tenantId,
              execution.id,
              a.id,
              quote.snapshotJson,
              ctx.site.branchId,
            );
          } catch {
            /* Failed source read is not a booking failure. */
          }
          execution = await this.prisma.actionExecution.findUnique({
            where: { id: execution.id },
            select: { id: true, state: true },
          });
        }
      }
    }
    if (execution?.state === 'SUCCEEDED') {
      const quote = await this.repo.quote(ctx.session, a.quoteId);
      if (quote)
        return this.envelope(a.nonce, 'SUCCEEDED', 'BOOKED', {
          ...this.publicFacts(quote.snapshotJson),
          receiptLabel: `Запись подтверждена · ${a.nonce.slice(0, 8).toUpperCase()}`,
        });
    }
    if (execution && ['FAILED', 'NOT_EXECUTED'].includes(execution.state))
      return this.envelope(a.nonce, 'FAILED', 'ACTION_REJECTED');
    return this.envelope(
      a.nonce,
      execution?.state === 'UNKNOWN' ||
        Date.now() - a.createdAt.getTime() > MINUTE
        ? 'UNKNOWN'
        : 'PENDING',
      'OUTCOME_UNRESOLVED',
    );
  }
}
