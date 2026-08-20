import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 🔴 Cycle 04 closure §5. У календарного вопроса один владелец.
 *
 * Разбор речи в период живёт в `ReportingPeriodResolver`, и наступление
 * календарного дня решает пояс бизнеса. Стоит любому потребителю — тексту,
 * инструменту, HTTP или сводке — начать переинтерпретировать календарь
 * самостоятельно, и «за 20 августа» снова начнёт означать разное на разных
 * поверхностях.
 */

const read = (relative: string) =>
  readFileSync(join(__dirname, '..', relative), 'utf8');

const withoutComments = (code: string) =>
  code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

describe('Граница владельца периода', () => {
  it('резолвер не спрашивает календарь у UTC', () => {
    const source = withoutComments(
      read('ai-tools/reporting-period.resolver.ts'),
    );
    for (const forbidden of [
      'now.getUTCFullYear()',
      'now.getUTCMonth()',
      'now.getUTCDate()',
    ]) {
      expect(source).not.toContain(forbidden);
    }
    // Деловое «сегодня» считается одной функцией и одной реализацией.
    expect(source).toContain('private static businessToday(');
    expect(source).toContain('localCalendarDate(timezone, now)');
  });

  it('боевые вызовы резолвера передают пояс бизнеса', () => {
    const core = withoutComments(read('ai-tools/ai-core.service.ts'));
    const calls = [
      ...core.matchAll(
        /ReportingPeriodResolver\.(resolve|hardenToolArguments)\(([\s\S]*?)\n\s*\);/g,
      ),
    ];
    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const call of calls) {
      const body = call[2];
      // Единственное исключение — проверка «названа ли вообще дата» в поиске
      // предыдущей реплики: календарь там не строится.
      const isExplicitProbe = body.includes('message.content');
      if (isExplicitProbe) continue;
      expect(body).toContain('businessTimezone');
    }
  });

  it('потребители не разбирают календарь сами', () => {
    // Названия месяцев и разбор дат принадлежат резолверу. Если они появятся
    // у потребителя, у периода станет два владельца.
    for (const relative of [
      'analytics/operations-analytics.controller.ts',
      'owner-reports/owner-reports.service.ts',
      'business-state/business-state.service.ts',
      'ai-tools/chat-report-card.ts',
    ]) {
      const source = withoutComments(read(relative));
      expect(source).not.toMatch(/август|сентябр|январ|феврал/i);
      expect(source).not.toContain('named_month');
      expect(source).not.toContain('named_range');
    }
  });
});
