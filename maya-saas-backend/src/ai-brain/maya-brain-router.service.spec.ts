import { UserRole } from '../common/domain.enums';
import { MayaBrainRouterService } from './maya-brain-router.service';

describe('MayaBrainRouterService', () => {
  const service = new MayaBrainRouterService();

  it('routes a client booking to Maya Admin', () => {
    expect(
      service.route(UserRole.CLIENT, 'Запиши меня завтра на стрижку'),
    ).toMatchObject({
      persona: 'admin',
      profile: 'maya_admin',
      intent: 'booking',
      knowledgeRequired: false,
    });
  });

  it('routes owner finance questions to Maya Finance', () => {
    expect(
      service.route(UserRole.TENANT_OWNER, 'Какая выручка за месяц?'),
    ).toMatchObject({
      persona: 'director',
      profile: 'maya_finance',
      intent: 'finance',
    });
  });

  it('routes year-over-year questions to verified business analytics', () => {
    expect(
      service.route(UserRole.TENANT_OWNER, 'Сравни этот год с предыдущим'),
    ).toMatchObject({
      persona: 'director',
      profile: 'maya_analytics',
      intent: 'business_analytics',
    });
  });

  it('marks procedural answers as knowledge-grounded', () => {
    const result = service.route(
      UserRole.STAFF,
      'Как правильно работает процедура закрытия смены?',
    );

    expect(result).toMatchObject({
      profile: 'maya_os',
      intent: 'knowledge',
      knowledgeRequired: true,
    });
    expect(result.plan.steps.map((step) => step.key)).toEqual([
      'retrieve_sources',
      'answer_with_citations',
    ]);
  });

  it('routes schedule writes to Maya Admin without changing permissions', () => {
    expect(
      service.route(UserRole.MANAGER, 'Поставь мастеру перерыв завтра'),
    ).toMatchObject({
      profile: 'maya_admin',
      intent: 'schedule_management',
    });
  });
});
