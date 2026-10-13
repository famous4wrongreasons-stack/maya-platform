import { useEffect, useRef } from 'react';
import type { IdeasView, IdeasPort } from '../../../maya-chat-shell/src/shell/ideas.ts';
import type { IdeaRead, IdeaRuleParameters } from '../../../maya-chat-shell/src/net/types.ts';
const titles = { OBSERVED_VALUE: 'Что показывают факты', POLICY_SIGNAL: 'Проверка по правилу салона', PREDICTION: 'Прогноз пока недоступен', SCENARIO: 'Условный сценарий', RANKING: 'Сравнение по заданному правилу' };
const scopes = { client: 'Отдельный клиент', appointment: 'Отдельная запись', staff: 'Сотрудник', tenant: 'Салон', branch: 'Филиал', cohort: 'Группа' };
const coverage = { COMPLETE: 'Полные данные в пределах расчёта', PARTIAL: 'Часть данных отсутствует', UNAVAILABLE: 'Данные недоступны', NOT_MEASURED: 'Данные не измерены' };
const qualification = { VERIFIED: 'Основание проверено', SOURCE_LABELLED: 'Сведения с отметкой источника', UNQUALIFIED: 'Основание не подтверждено' };
const date = (value: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) + ' UTC';
const status = (row: IdeaRead) => row.available && row.current ? 'Доступен при последней проверке' : 'Сейчас недоступен';
const bases = {
  confirmed_cash: ['Подтверждённые поступления', 'Это поступления за указанный период, без вычета возвратов. Это не прибыль и не прогноз.'],
  confirmed_refunds: ['Подтверждённые возвраты', 'Это возвраты за указанный период, а не поступления или прибыль.'],
  confirmed_cash_net_linked_refunds: ['Поступления за вычетом связанных возвратов', 'Учтены только связанные возвраты. Расходы здесь не вычитаются — это не прибыль.'],
  booked_value: ['Стоимость записей', 'Сумма по записям не означает, что оплата уже получена. Это не прибыль и не прогноз.'],
  provider_reported_gross: ['Сумма по данным источника', 'Показатель передан источником. Он не подтверждает полученные деньги, прибыль или ценность клиента.'],
  observed_attended_count: ['Подтверждённые посещения', 'Число состоявшихся визитов в пределах указанного периода и охвата данных.'],
} as const;
const group = (value: string) => value.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
// Exact string formatting; RUB kopecks are the existing Measurement minor-unit contract.
// Other currencies retain their explicit source unit; no inferred exponent or conversion.
const amount = (value: string, currency: string | null) => {
  if (currency === null) return group(value);
  if (currency !== 'RUB') return group(value) + ' минимальных денежных единиц ' + currency;
  const sign = value.startsWith('-') ? '−' : '', digits = value.replace(/^-/, '').padStart(3, '0');
  return sign + group(digits.slice(0, -2)) + ',' + digits.slice(-2) + ' ₽';
};
/** Wording of the existing C8/C9 contract only; this view never computes a deadline or met. */
function RuleParameters({ parameters: p, compact }: { readonly parameters: IdeaRuleParameters | null; readonly compact: boolean }) {
  if (!p) return <p>Параметры этого правила не подтверждены в ответе сервера. Порог не подставляется из другого расчёта.</p>;
  const n = p.elapsed.count, plural = n % 100 >= 11 && n % 100 <= 14 ? 2 : n % 10 === 1 ? 0 : n % 10 >= 2 && n % 10 <= 4 ? 1 : 2;
  const unit = p.elapsed.unit === 'day' ? ['день', 'дня', 'дней'][plural] : ['календарный месяц', 'календарных месяца', 'календарных месяцев'][plural];
  if (compact) return <p className="companion-idea-rule-summary">Интервал: {n} {unit}{p.elapsed.unit === 'day' ? ' (по 24 часа)' : ` (${p.timezone})`}. {p.comparison === 'gt' ? 'Граница срока не включена.' : 'Граница срока включена.'}</p>;
  return <div className="companion-idea-rule">
    <p>Интервал правила: {n} {unit} с последнего подтверждённого посещения.</p>
    <p>{p.comparison === 'gt' ? 'Условие выполняется строго после окончания этого интервала.' : 'Условие выполняется с момента окончания этого интервала включительно.'}</p>
    <p>{p.elapsed.unit === 'day' ? 'День здесь — истёкшие 24 часа.' : `Месяцы отсчитываются по местному времени (${p.timezone}), с ограничением даты последним днём месяца.`}</p>
    <p>{p.minimumCoverage === 'COMPLETE' ? 'Правило требует полного покрытия исходных данных.' : 'Правило допускает частичное покрытие исходных данных.'}</p>
    <p>{p.serviceScope.restricted ? `Правило ограничено настроенным набором услуг (${p.serviceScope.count}); названия услуг здесь не раскрыты.` : 'Правило не ограничено отдельными услугами.'}</p>
  </div>;
}
function Finding({ row, expanded = false }: { readonly row: IdeaRead; readonly expanded?: boolean }) {
  const f = row.finding;
  if (!row.available || !row.current || f.kind === 'unavailable') return <p>Значение сейчас недоступно. Его отсутствие не означает ноль.</p>;
  if (f.kind === 'unsupported' || f.kind === 'invalid') return <p>{f.kind === 'invalid' ? 'Не удалось проверить формат значения.' : 'Просмотр значений этого расчёта пока не поддерживается.'} Основание и ограничения можно посмотреть ниже.</p>;
  if (f.kind === 'observation') return <div className="companion-idea-value"><p>{bases[f.basis][0]}</p><p className="companion-idea-number">{amount(f.value, f.currency)}</p><p>{bases[f.basis][1]}</p></div>;
  if (f.kind === 'policy') return <div className="companion-idea-value"><p className="companion-idea-number">{f.met ? 'Условие правила выполнено' : 'Условие правила не выполнено'}</p><p>Сигнал по правилу салона о давности подтверждённого визита. Это не прогноз возвращения и не согласие клиента на сообщения.</p><RuleParameters parameters={f.parameters} compact={!expanded} /></div>;
  return <div className="companion-idea-value"><p>Условная стоимость существующей записи</p><p className="companion-idea-number">{amount(f.value, f.currency)}</p><p>При сохранении этой записи. Это не полученная оплата, не ожидаемый доход и не обещание прироста.</p><p>Горизонт сценария: {date(f.horizonEnd)}</p></div>;
}
/** Source inspection only. No inferred recommendations, numerical forecast or plan writer. */
export function IdeasPanel({ view, port, close }: { readonly view: IdeasView; readonly port: Pick<IdeasPort, 'refresh' | 'read' | 'back'>; readonly close: () => void }) {
  const heading = useRef<HTMLHeadingElement | null>(null), detail = view.detail;
  useEffect(() => { const f = window.requestAnimationFrame(() => heading.current?.focus({ preventScroll: true })); return () => window.cancelAnimationFrame(f); }, [view.phase, detail]);
  return <section className="companion-ideas" aria-labelledby="maya-ideas-heading" aria-busy={view.phase === 'loading'} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (detail || view.reading) port.back(); else close(); } }}>
    <div className="companion-tasks-heading"><h2 id="maya-ideas-heading" ref={heading} tabIndex={-1}>{detail ? 'О расчёте' : 'Идеи'}</h2><button type="button" className="companion-circle" aria-label="Вернуться к разговору" onClick={close}>×</button></div>
    <p className="companion-tasks-subtitle">Сначала разберёмся в данных.</p>
    <p role="status" className="companion-tasks-status">{view.phase === 'loading' ? view.reading ? 'Проверяю доступность расчёта…' : 'Загружаю расчёты…' : view.notice}</p>
    {detail ? <article className="companion-idea-detail">
      <button type="button" className="companion-read-back" onClick={() => port.back()}>← К расчётам</button>
      <h3>{titles[detail.kind]}</h3><p className="companion-read-meta">{scopes[detail.scope]} · {status(detail)}</p>
      <p>{detail.message}</p><Finding row={detail} expanded />
      <div className="companion-idea-facts"><p className="companion-idea-label">Данные на</p><p>{date(detail.asOf)}</p><p className="companion-idea-label">Период</p><p>{date(detail.from)} — {date(detail.to)}</p><p className="companion-idea-label">Часовой пояс расчёта</p><p>{detail.timezone}</p><p className="companion-idea-label">Полнота</p><p>{coverage[detail.coverage]}</p><p className="companion-idea-label">Основание</p><p>{qualification[detail.qualification]}</p><p className="companion-idea-label">Срок просмотра</p><p>До {date(detail.expiresAt)}</p></div>
      <p className="companion-tasks-scope">Это сведения о сохранённом расчёте. Имена и контакты здесь не показаны. Расчёт не даёт разрешения на сообщения клиентам или другие действия.</p>
    </article> : <>
      <p className="companion-tasks-scope">Здесь можно проверить основание и актуальность сохранённых расчётов. Готовые рекомендации и планы действий пока не подключены.</p>
      <h3 className="companion-ideas-label">ОСНОВА ДЛЯ РЕШЕНИЙ</h3>
      {view.phase === 'ready' && !view.rows.length && !view.notice ? <div className="companion-tasks-empty"><h3>Пока нет доступных расчётов</h3><p>Когда появятся сохранённые результаты, вы сможете посмотреть их здесь.</p></div> : null}
      <ul className="companion-ideas-list">{view.rows.map(row => <li key={row.key}><span className="companion-idea-icon" aria-hidden="true">◇</span><div><p className="companion-read-meta">{scopes[row.scope]} · {status(row)}</p><h3>{titles[row.kind]}</h3><p>{row.message}</p><Finding row={row} /><p className="companion-read-meta">{coverage[row.coverage]} · {qualification[row.qualification]} · {date(row.asOf)}</p><button type="button" onClick={() => void port.read(row.key)}>Посмотреть основание <span aria-hidden="true">↗</span></button></div></li>)}</ul>
      {view.phase === 'ready' ? <p className="companion-tasks-scope">{view.possiblyCapped ? 'Это часть списка.' : 'В показанной части списка больше результатов нет.'} Показаны доступные расчёты из последних 25 результатов; часть может быть скрыта из-за ограничений доступа или актуальности. Список не обновляется сам.</p> : null}
    </>}
    <div className="companion-tasks-footer"><button type="button" disabled={view.phase === 'loading' || view.retryAt !== null} onClick={() => void port.refresh()}>Обновить расчёты</button><button type="button" onClick={close}>К разговору с Maya ↗</button></div>
  </section>;
}
