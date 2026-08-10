import { UserRole } from '../common/domain.enums';
import { MayaBrainRouterService } from './maya-brain-router.service';

describe('MayaBrainRouterService', () => {
  const service = new MayaBrainRouterService();

  it('routes a client booking to the admin persona', () => {
    expect(
      service.route(UserRole.CLIENT, 'Запиши меня завтра на стрижку'),
    ).toEqual({ persona: 'admin', intent: 'booking' });
  });

  it('forces admin persona when owner opens the client audience', () => {
    expect(
      service.route(UserRole.TENANT_ADMIN, 'Расскажи о барбершопе', 'client'),
    ).toEqual({ persona: 'admin', intent: 'general' });
  });

  it('routes owner finance questions to the director persona', () => {
    expect(
      service.route(UserRole.TENANT_OWNER, 'Какая выручка за месяц?'),
    ).toEqual({ persona: 'director', intent: 'finance' });
  });

  it('routes year-over-year questions to business analytics', () => {
    expect(
      service.route(UserRole.TENANT_OWNER, 'Сравни этот год с предыдущим'),
    ).toEqual({ persona: 'director', intent: 'business_analytics' });
  });

  it('routes schedule writes without changing the persona', () => {
    expect(
      service.route(UserRole.MANAGER, 'Поставь мастеру перерыв завтра'),
    ).toEqual({ persona: 'director', intent: 'schedule_management' });
  });

  it('keeps business improvement questions in verified analytics', () => {
    expect(
      service.route(
        UserRole.TENANT_OWNER,
        'Как правильно увеличить выручку и вернуть клиентов?',
      ),
    ).toEqual({ persona: 'director', intent: 'finance' });
  });

  it('routes service decline questions to business analytics', () => {
    expect(
      service.route(
        UserRole.TENANT_OWNER,
        'Какая услуга просела за этот месяц?',
      ),
    ).toEqual({ persona: 'director', intent: 'business_analytics' });
  });

  it('keeps a technical craft question out of the client persona', () => {
    expect(service.route(UserRole.STAFF, 'Как стричь кроп?')).toEqual({
      persona: 'director',
      intent: 'knowledge',
    });
    expect(service.route(UserRole.CLIENT, 'Как стричь кроп?')).toEqual({
      persona: 'admin',
      intent: 'general',
    });
  });

  /**
   * 🔴 Маршрутизация работает без единого флага.
   *
   * Прежний гейт (`MAYA_BRAIN_V1_ENABLED` + список поверхностей + список
   * арендаторов) выключал мозг по умолчанию, и владелец получал персону
   * клиента. Сервис не читает конфигурацию вовсе — сломать это молча нельзя.
   */
  it('needs no configuration to separate an owner from a client', () => {
    expect(service.route(UserRole.TENANT_OWNER, 'Привет').persona).toBe(
      'director',
    );
    expect(service.route(UserRole.CLIENT, 'Привет').persona).toBe('admin');
  });
});
