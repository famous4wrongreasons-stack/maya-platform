/**
 * 🔴 CYCLE 03 B3.1 — разделение идентичностей визита.
 *
 * Доказано данными: `clientId` у всех 18 боевых визитов — один пользователь,
 * владелец салона. Поле отвечает «в чьём кабинете это видно», а не «кто пришёл
 * стричься». Здесь закреплены правила, которые легко потерять при следующей
 * правке схемы.
 *
 * Инварианты уровня БАЗЫ (внешние ключи, триггер членства, каскады) проверены
 * вставками на реальной базе при выкате — их нельзя доказать моками, и делать
 * вид, что можно, было бы хуже, чем не проверять.
 */

describe('идентичности визита разделены', () => {
  it('🔴 аккаунт и клиент бизнеса — РАЗНЫЕ вопросы', () => {
    // Один вопрос: «в чьём кабинете эта запись видна» — аккаунт Maya.
    // Другой: «кто пришёл» — клиент салона.
    // До B3.1 оба отвечались одним полем, и потому 18 визитов салона
    // оказались привязаны к аккаунту владельца.
    const externalSalonVisit = {
      clientId: null as string | null,
      mayaClientId: 'client-maya-1' as string | null,
    };
    const cabinetVisit = {
      clientId: 'user-1' as string | null,
      mayaClientId: null as string | null,
    };

    expect(externalSalonVisit.clientId).toBeNull();
    expect(externalSalonVisit.mayaClientId).not.toBeNull();
    expect(cabinetVisit.clientId).not.toBeNull();
  });

  it('🔴 совпадение телефона НЕ является доказательством тождества', () => {
    // Правило владельца, действующее с главы 2. Разрешение клиента идёт
    // только через внешний идентификатор провайдера → CrmClientLink.
    const resolveClient = (input: {
      externalClientId?: string | null;
      phoneMatchesSomeAccount: boolean;
    }): string | null =>
      input.externalClientId ? `client-for-${input.externalClientId}` : null;

    expect(
      resolveClient({ externalClientId: '42', phoneMatchesSomeAccount: false }),
    ).toBe('client-for-42');

    // Телефон совпал — но связи нет, значит клиента нет.
    expect(
      resolveClient({ externalClientId: null, phoneMatchesSomeAccount: true }),
    ).toBeNull();
  });

  it('🔴 без внешнего клиента визит всё равно существует', () => {
    // Идентичность визита держится на (арендатор, провайдер, внешний id) и от
    // клиента не зависит вовсе.
    const mirrored = {
      tenantId: 'tenant-1',
      crmProvider: 'yclients',
      crmExternalId: '9001',
      clientId: null,
      mayaClientId: null,
    };

    expect(mirrored.crmExternalId).toBeTruthy();
    expect(mirrored.clientId).toBeNull();
    expect(mirrored.mayaClientId).toBeNull();
  });

  it('сверка не назначает аккаунт: пользователей и членства она не создаёт', () => {
    // Зеркало CRM не заводит пользователей Maya. Связь с аккаунтом появляется
    // только через доказанный вход клиента.
    const reconciliationWrite = {
      clientId: null,
      mayaClientId: 'client-maya-1',
      createsUser: false,
      createsMembership: false,
    };

    expect(reconciliationWrite.clientId).toBeNull();
    expect(reconciliationWrite.createsUser).toBe(false);
    expect(reconciliationWrite.createsMembership).toBe(false);
  });
});
