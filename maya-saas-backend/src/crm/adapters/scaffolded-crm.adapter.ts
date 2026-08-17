import { CrmUnsupportedCapabilityError } from '../crm-request.errors';
import type {
  AvailableSlot,
  CancelledAppointment,
  ClientAppointmentsParams,
  ClientLoyaltySnapshot,
  CRMAdapter,
  CrmAdapterConfig,
  CreateAppointmentParams,
  CreatedAppointment,
  RescheduledAppointment,
  ServiceItem,
  StaffMember,
} from '../crm-adapter.interface';

/**
 * Каркас адаптера: провайдер объявлен, но ни одна возможность не реализована.
 *
 * 🔴 Зачем общий примитив. Три каркасных адаптера были копиями по 104 строки —
 * различались только именем провайдера в тексте ошибки. Одинаковый код в трёх
 * местах означает, что расходиться они будут тоже поодиночке: именно так один
 * из них и оказался единственным, кто вместо отказа возвращал пустой массив.
 *
 * 🔴 Главный инвариант, который держит этот класс:
 *
 *     `[]` = возможность поддерживается, запрос выполнен, результатов нет.
 *     «не умею» = отдельный явный исход, а НЕ пустой успех.
 *
 * Наследование здесь намеренно плоское — один слой без иерархии. Задача класса
 * не «обобщить провайдеров», а не дать трём заглушкам разойтись.
 *
 * `testConnection` НЕ бросает: он и должен честно отвечать «не подключусь», а
 * не падать. Эта семантика существовала до P6 и сохранена дословно.
 */
export abstract class ScaffoldedCrmAdapter implements CRMAdapter {
  constructor(
    protected readonly config: CrmAdapterConfig,
    /** Имя для сообщения человеку. Решения по нему не принимаются. */
    private readonly displayName: string,
  ) {}

  /**
   * Единственный способ, которым каркас отвечает на обязательный метод.
   *
   * 🔴 Возвращает ОТКЛОНЁННЫЙ ПРОМИС, а не бросает синхронно. Прежние заглушки
   * отвечали `Promise.reject(...)`, и вызывающий вправе рассчитывать на
   * `.catch()` у возвращённого значения. Синхронный `throw` прошёл бы мимо него
   * и всплыл в неожиданном месте — это молчаливая смена контракта вызова.
   */
  private unsupported<T>(capability: string): Promise<T> {
    return Promise.reject(
      new CrmUnsupportedCapabilityError(capability, this.config.provider),
    );
  }

  getServices(tenantId: string): Promise<ServiceItem[]> {
    void tenantId;
    return this.unsupported('getServices');
  }

  getStaff(tenantId: string): Promise<StaffMember[]> {
    void tenantId;
    return this.unsupported('getStaff');
  }

  getAvailableSlots(params: {
    tenantId: string;
    date: string;
    staffId?: string;
    serviceIds?: string[];
    branchId?: string;
  }): Promise<AvailableSlot[]> {
    void params;
    return this.unsupported('getAvailableSlots');
  }

  createAppointment(
    params: CreateAppointmentParams,
  ): Promise<CreatedAppointment> {
    void params;
    return this.unsupported('createAppointment');
  }

  cancelAppointment(params: {
    tenantId: string;
    externalId: string;
  }): Promise<CancelledAppointment> {
    void params;
    return this.unsupported('cancelAppointment');
  }

  rescheduleAppointment(params: {
    tenantId: string;
    externalId: string;
    start: string;
    staffId?: string;
    serviceIds?: string[];
    notes?: string | null;
  }): Promise<RescheduledAppointment> {
    void params;
    return this.unsupported('rescheduleAppointment');
  }

  /**
   * 🔴 ЗДЕСЬ БЫЛА ЕДИНСТВЕННАЯ ЛОЖЬ из девяти обязательных методов.
   *
   * Раньше возвращался `Promise.resolve([])`, и вызывающий
   * (`appointments.service.ts`, синхронизация записей клиента) не мог отличить
   * «провайдер не умеет» от «у клиента нет записей». Данные при этом не
   * терялись — синхронизация просто ничего не добавляла, — но утверждение было
   * ложным.
   */
  getClientAppointments(
    params: ClientAppointmentsParams,
  ): Promise<CreatedAppointment[]> {
    void params;
    return this.unsupported('getClientAppointments');
  }

  getClientLoyalty(params: {
    tenantId: string;
    phone: string;
  }): Promise<ClientLoyaltySnapshot | null> {
    void params;
    return this.unsupported('getClientLoyalty');
  }

  /**
   * Честный отказ, а не исключение: вопрос «подключишься?» имеет нормальный
   * отрицательный ответ. Семантика сохранена дословно с до-P6 состояния.
   */
  testConnection(tenantId: string) {
    void tenantId;
    return Promise.resolve({
      ok: false,
      provider: this.config.provider,
      message: `${this.displayName} adapter placeholder is present but real API calls are not implemented yet`,
    });
  }
}
