import type { FactUsed } from '../../widget-contract/envelope';
import type { BookingConfirmationPreview } from '../booking/booking-confirmation-minter.port';
import type { PrincipalView } from '../gate.types';
import { BookingConfirmationMinterService } from './booking-confirmation-minter.service';
import type { MintRequest } from './emitter.service';
import { buildEnvelopeWithoutSeal } from './envelope.factory';
import { presentBookingSelector } from '../booking/booking-selector.presenter';

const visibleEnvelope = (request: MintRequest) =>
  buildEnvelopeWithoutSeal({
    widgetId: 'widget-1',
    tenantId: 't1',
    turnId: 'turn-1',
    kind: request.kind,
    body: request.body,
    intents: [],
    input: request.composerInput,
    principal: principal(),
    fitting: {
      profileId: 'pwa/1',
      tier: 'RICH_INTERACTIVE',
      textEquivalent: JSON.stringify(request.body),
      emitted: [],
      intentsMinted: 0,
      intentsWithheld: [],
      bodyReductions: [],
      textEquivalentIsCanonical: true,
    },
    deliveryChannel: 'pwa',
    freshnessClass: 'live',
    piiClass: 'none',
    issuedAt: new Date('2026-09-25T12:00:00.000Z'),
    expiresAt: new Date('2026-09-25T12:10:00.000Z'),
    ttlSeconds: 600,
    limitations: [],
  });

const principal = (): PrincipalView => ({
  authority: {
    kind: 'USER',
    tenantId: 't1',
    userId: 'user-1',
    membershipId: 'membership-1',
    clientId: 'client-1',
    channelLinkId: null,
    branchRefs: [],
    staffRef: null,
    proofHash: 'p'.repeat(64),
  },
  role: null,
  presentationMode: 'client',
  verificationLevel: 'SESSION_VERIFIED',
  proofHash: 'p'.repeat(64),
});

const canonicalFact = (): FactUsed => ({
  capability: 'appointments.own.create',
  status: 'measured',
  as_of: '2026-09-25T12:00:00.000Z',
  evidence_refs: ['quote:canonical-owner'],
  completeness: {
    status: 'COMPLETE',
    requestedScopeHash: 's'.repeat(64),
    returnedCount: 1,
    totalCount: 1,
    hasMore: false,
    cursorRef: null,
    truncated: false,
    reasonCodes: [],
  },
});

const preview = (fact: FactUsed): BookingConfirmationPreview => ({
  subject: 'create',
  sourceCapabilityKey: 'appointments.own.create',
  frozenArgumentHandles: {
    service: 'service-handle',
    staff: 'staff-handle',
    slot: 'slot-handle',
  },
  draftRef: 'draft-1',
  appointmentRef: null,
  producingIntentTokenHash: null,
  when: '2026-09-26T10:00:00.000Z',
  whenPrevious: null,
  serviceLabel: 'Service',
  staffLabel: 'Staff',
  durationMinutes: 60,
  priceKopecks: 150000,
  currency: 'RUB',
  fact,
});

describe('P-MINT-BOOK confirmation minter', () => {
  it('FBE2E-2 links create confirmation to its selector while copying the exact canonical owner fact', async () => {
    const fact = canonicalFact();
    const emitBookingConfirmation = jest.fn(
      async (
        request: MintRequest,
        linkage: unknown,
        now: Date,
        supersedesWidgetId: string | null,
      ) => {
        void request;
        void linkage;
        void now;
        void supersedesWidgetId;
        return Promise.resolve({
          envelope: { contract: 'maya.widget.envelope/1' },
        } as never);
      },
    );
    const service = new BookingConfirmationMinterService(
      {
        widgetEmission: {
          findFirst: jest.fn().mockResolvedValue({
            turnId: 'turn-1',
            turn: { conversationId: 'conversation-1' },
          }),
        },
      } as never,
      { emitBookingConfirmation } as never,
    );

    await service.mint({
      tenantId: 't1',
      predecessorWidgetId: 'widget-1',
      principal: principal(),
      deliveryChannel: 'pwa',
      now: new Date('2026-09-25T12:00:00.000Z'),
      preview: preview(fact),
    });

    expect(emitBookingConfirmation).toHaveBeenCalledTimes(1);
    const request = emitBookingConfirmation.mock.calls[0]?.[0];
    expect(request.composerInput.facts).toEqual([fact]);
    expect(request.composerInput.facts[0]).toBe(fact);
    expect(request.composerInput.facts_origin).toEqual(['copied']);
    expect(request.composerInput.origin.emitter).toBe('capability_read');
    expect(emitBookingConfirmation.mock.calls[0]?.[3]).toBe('widget-1');
    const rendered = visibleEnvelope(request);
    const equivalent = rendered.presentation.text_equivalent;
    expect(equivalent.body).toBe('');
    const prose = { ...equivalent, body: equivalent.itemized.join('\n') };
    expect(prose.headline).toBe('Проверка записи');
    expect(prose.body).toContain('Услуга: Service');
    expect(prose.body).toContain('Мастер: Staff');
    expect(prose.body).toContain('60 мин');
    expect(prose.body).toContain('1500 RUB');
    expect(prose.body).toContain('По данным системы записи');
    expect(prose.body).not.toMatch(
      /draft-1|service-handle|Canonical booking owner|BOOKING_CONFIRMATION|Запись подтверждена/,
    );
    expect(rendered.provenance.facts_used).toEqual([fact]);
    const amount = {
      ...(request.body.price_total as object),
      state: 'UNAVAILABLE',
      label: 'Сумма недоступна',
      basis: 'Источник суммы',
    };
    const extraLine = visibleEnvelope({
      ...request,
      body: {
        ...request.body,
        lines: [
          {
            label: { phrase_key: 'test', rendered: 'Услуга' },
            detail: { state: 'KNOWN', label: 'Service' },
            measures: [amount],
          },
        ],
      },
    }).presentation.text_equivalent;
    expect(extraLine.itemized.join('\n')).toContain(
      'Сумма недоступна (Источник суммы)',
    );

    for (const kind of ['SERVICE_SELECTOR', 'STAFF_SELECTOR'] as const) {
      const selector = presentBookingSelector({
        tenantId: 't1',
        kind,
        inherited: { service: 'opaque-service-handle' },
        mint: () => 'opaque-do-not-render',
        source: {
          services: [
            { id: 's1', name: 'Service', duration_minutes: 60, price: 1500 },
          ],
          staff: [{ id: 'm1', name: 'Staff' }],
        },
      })!;
      const body = selector.body as unknown as Record<string, unknown>;
      const option = (body.options as Array<Record<string, unknown>>)[0];
      option.enabled = { state: 'PENDING', label: 'Доступность уточняется' };
      option.badges = [{ phrase_key: 'test', rendered: 'Особые условия' }];
      option.media = {
        kind: 'image',
        ref: 'private-media-handle',
        alt: { phrase_key: 'test', rendered: 'Описание изображения' },
      };
      option.measures = [amount];
      if (kind === 'SERVICE_SELECTOR') {
        option.requires_consultation = {
          state: 'PARTIAL',
          label: 'Уточните необходимость консультации',
        };
        body.total_preview = { ...amount, label: 'Общая стоимость неизвестна' };
      } else {
        body.any_staff_option = {
          label: { state: 'KNOWN', label: 'Любой мастер' },
          enabled: { state: 'UNAVAILABLE', label: 'Выбор пока недоступен' },
          badges: [],
          measures: [],
          media: null,
        };
      }
      const te = visibleEnvelope({ ...request, kind, body }).presentation
        .text_equivalent;
      expect(te.body).toBe('');
      const text = te.itemized.join('\n');
      for (const fact of [
        'Доступность уточняется',
        'Особые условия',
        'Описание изображения',
        'Сумма недоступна',
        'Источник суммы',
      ])
        expect(text).toContain(fact);
      for (const fact of kind === 'SERVICE_SELECTOR'
        ? ['Уточните необходимость консультации', 'Общая стоимость неизвестна']
        : ['Любой мастер', 'Выбор пока недоступен'])
        expect(text).toContain(fact);
      expect(text).not.toMatch(
        /opaque-do-not-render|private-media-handle|"state"/,
      );
    }
  });

  it('renders missing canonical price as not measured instead of inventing zero', async () => {
    const emitBookingConfirmation = jest.fn(
      async (
        request: MintRequest,
        linkage: unknown,
        now: Date,
        supersedesWidgetId: string | null,
      ) => {
        void request;
        void linkage;
        void now;
        void supersedesWidgetId;
        return Promise.resolve({ envelope: {} } as never);
      },
    );
    const service = new BookingConfirmationMinterService(
      {
        widgetEmission: {
          findFirst: jest.fn().mockResolvedValue({
            turnId: 'turn-1',
            turn: { conversationId: 'conversation-1' },
          }),
        },
      } as never,
      { emitBookingConfirmation } as never,
    );

    await service.mint({
      tenantId: 't1',
      predecessorWidgetId: 'widget-1',
      principal: principal(),
      deliveryChannel: 'pwa',
      now: new Date('2026-09-25T12:00:00.000Z'),
      preview: { ...preview(canonicalFact()), priceKopecks: null },
    });

    const request = emitBookingConfirmation.mock.calls[0]?.[0];
    expect(request.body.price_total).toEqual(
      expect.objectContaining({
        state: 'NOT_MEASURED',
        value: null,
        reason_code: 'NOT_COLLECTED',
      }),
    );
    const withNotice = {
      ...request,
      body: {
        ...request.body,
        policy_notices: [
          { phrase_key: 'test.policy', rendered: 'Оплата при посещении.' },
        ],
      },
    };
    const equivalent = visibleEnvelope(withNotice).presentation.text_equivalent;
    const prose = { ...equivalent, body: equivalent.itemized.join('\n') };
    expect(prose.body).toContain('Стоимость: Нет данных');
    expect(prose.body).toContain('Оплата при посещении.');
    expect(prose.body).toContain('По данным системы записи');
    expect(prose.body).not.toContain('Стоимость: 0');
  });
});
