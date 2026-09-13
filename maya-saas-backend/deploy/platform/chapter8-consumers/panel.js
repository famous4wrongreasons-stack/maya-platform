/* C8 shared consumer: displays server-qualified values; never scores, trains or contacts. */
function meC8DisplayValue(value) {
  if (!value || value.value == null) return 'Нет подтверждённых данных';
  if (typeof value.value === 'boolean') return value.value ? 'Да' : 'Нет';
  if (value.unit === 'money_minor') {
    if (!/^-?(0|[1-9][0-9]*)$/.test(String(value.value)) || !/^[A-Z]{3}$/.test(value.currency || '')) return 'Сумма недоступна';
    var s = String(value.value), neg = s.charAt(0) === '-'; if (neg) s = s.slice(1);
    s = s.padStart(3, '0'); return (neg ? '−' : '') + s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + s.slice(-2) + ' ' + value.currency;
  }
  return String(value.value);
}
function meC8BasisLabel(basis) {
  return ({ confirmed_cash: 'Подтверждённые поступления', confirmed_refunds: 'Подтверждённые возвраты',
    confirmed_cash_net_linked_refunds: 'Поступления за вычетом связанных возвратов', booked_value: 'Стоимость записанного',
    provider_reported_gross: 'Оборот по данным CRM', observed_attended_count: 'Доказанные посещения',
    named_policy_comparators: 'Порядок по подтверждённому правилу', proven_attendance: 'Давность доказанного визита' })[basis] || 'Оценка по подтверждённому правилу';
}
function AMayaValuationPanel(props) {
  var e = React.createElement, t = props.t;
  var state = React.useState({ open: false, busy: false, error: '', readiness: null, items: [], cursor: null, capability: '' }), s = state[0], set = state[1];
  var mounted = React.useRef(true);
  React.useEffect(function () { mounted.current = true; return function () { mounted.current = false; }; }, []);
  function patch(p) { if (mounted.current) set(function (old) { return Object.assign({}, old, p); }); }
  function load(cursor) {
    patch({ open: true, busy: true, error: '' });
    Promise.all([props.request('/analytics/valuation-models/readiness'), props.request('/analytics/valuations?limit=20' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''))]).then(function (r) {
      if (!r[0] || r[0].contract !== 'c8.readiness/1' || !r[1] || r[1].contract !== 'c8.valuation.list/1') throw new Error('unavailable');
      patch({ busy: false, readiness: r[0], items: r[1].items, cursor: r[1].nextCursor });
    }).catch(function () { patch({ busy: false, items: [], error: 'Оценки сейчас недоступны. Проверьте доступ к аналитике и повторите позже.' }); });
  }
  function calculate() {
    if (!s.readiness || s.busy || s.capability.indexOf('ranking/') !== 0) return;
    patch({ busy: true, error: '' });
    props.request('/analytics/valuations/compute', { subjectKind: 'tenant', subjectId: s.readiness.tenantId, capability: s.capability, branchIds: s.readiness.branchId ? [s.readiness.branchId] : [] }).then(function (r) {
      if (!r || r.contract !== 'c8.valuation.read/1') throw new Error('unavailable');
      patch({ busy: false, items: [r], cursor: null });
    }).catch(function () { patch({ busy: false, items: [], error: 'Расчёт не завершён: данные, правило или доступ требуют проверки. Сохранённые результаты доступны отдельно.' }); });
  }
  function nextRank(r) {
    if(s.busy || !r.ranking || r.ranking.nextOffset == null)return;
    patch({busy:true,error:''});
    props.request('/analytics/valuations/'+encodeURIComponent(r.id)+'?offset='+r.ranking.nextOffset).then(function(row){
      if(!row||row.contract!=='c8.valuation.read/1')throw new Error('unavailable');
      patch({busy:false,items:s.items.map(function(x){return x.id===r.id?row:x;})});
    }).catch(function(){patch({busy:false,items:[],error:'Список сейчас недоступен. Обновите результаты.'});});
  }
  var button = { border: '1px solid ' + t.line, borderRadius: 999, background: 'transparent', color: t.ink, padding: '10px 14px', fontFamily: BODY, fontSize: 12, cursor: 'pointer', minHeight: 40 };
  var text = { fontFamily: BODY, fontSize: 12, lineHeight: 1.5, color: t.dim, overflowWrap: 'anywhere' };
  var rules = s.readiness ? (s.readiness.capabilities || []).filter(function (c) { return c.indexOf('ranking/') === 0; }) : [];
  return e('section', { 'data-c8-consumer': 'limited-data-v1', style: { borderTop: '1px solid ' + t.line, marginTop: 20, paddingTop: 16 } },
    e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } },
      e('h3', { style: { margin: 0, fontFamily: BODY, fontWeight: 600, fontSize: 14, color: t.ink } }, 'Ценность клиентов и прогнозы'),
      e('button', { type: 'button', style: button, disabled: s.busy, 'aria-expanded': s.open, onClick: function () { s.open ? patch({ open: false }) : load(null); } }, s.open ? 'Свернуть' : 'Посмотреть')),
    s.open ? e('div', null,
      e('p', { style: text }, 'Оценка опирается на проверенные факты и правила организации. Она не даёт разрешения связаться с клиентом.'),
      s.busy ? e('p', { role: 'status', style: text }, 'Проверяем результаты…') : null,
      s.error ? e('p', { role: 'alert', style: text }, s.error) : null,
      s.readiness ? e('p', { style: text }, s.readiness.message) : null,
      s.readiness && !s.readiness.configured ? e('p', { style: text }, 'Правила оценки ещё не подтверждены владельцем. Maya не выбирает пороги ценности или давности визита самостоятельно.') : null,
      rules.length ? e('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '12px 0' } },
        e('label', { style: text }, 'Подтверждённое правило ', e('select', { 'aria-label': 'Правило ранжирования', value: s.capability, onChange: function (ev) { patch({ capability: ev.target.value }); }, style: Object.assign({}, button, { maxWidth: '100%', borderRadius: 10 }) },
          e('option', { value: '' }, 'Выберите правило'), rules.map(function (c) { return e('option', { key: c, value: c }, c.slice(8).replace(/_/g, ' ')); }))),
        e('button', { type: 'button', disabled: s.busy || !s.capability, style: button, onClick: calculate }, 'Рассчитать список')) : null,
      !s.busy && !s.error && !s.items.length ? e('p', { style: text }, 'Сохранённых оценок в разрешённой области пока нет. Это не означает нулевую ценность клиентов.') : null,
      s.items.map(function (r, index) {
        var values = r.available && Array.isArray(r.values) ? r.values : [];
        return e('article', { key: r.id, style: { padding: '14px 0', borderBottom: '1px solid ' + t.line } },
          e('div', { style: Object.assign({}, text, { fontWeight: 600, color: t.ink }) }, meC8BasisLabel(r.basis)),
          e('div', { style: text }, r.available ? 'По состоянию на ' + new Date(r.asOf).toLocaleString('ru-RU') : r.message),
          e('div', { style: text }, r.completeness === 'COMPLETE' ? 'Полнота подтверждена' : 'Данные неполные — учитывайте ограничения'),
          values.map(function (v, n) { return e('div', { key: n, style: Object.assign({}, text, { marginTop: 5, color: t.ink }) }, meC8BasisLabel(v.basis || r.basis) + ': ' + meC8DisplayValue(v)); }),
          r.ranking && r.available ? e('div', null,
            e('p', { style: text }, 'В списке: ' + r.ranking.total + '. Отдельно без достаточных данных: ' + r.ranking.excludedCount + '.'),
            e('ol', { style: Object.assign({}, text, { paddingLeft: 24 }) }, r.ranking.members.map(function (m) {
              return e('li', { key: m.subjectId, value: m.position }, 'Клиент · ' + String(m.subjectId).slice(-8), (m.indicators || []).map(function (x, i) { return e('div', { key: i }, meC8BasisLabel(x.basis) + ': ' + (x.values || []).map(meC8DisplayValue).join('; ') + (x.completeness === 'COMPLETE' ? '' : ' · неполная история')); }));
            })), r.ranking.nextOffset != null ? e('button', {type:'button',style:button,disabled:s.busy,onClick:function(){nextRank(r);}}, 'Следующие клиенты') : null) : null,
          e('details', { style: Object.assign({}, text, { marginTop: 8 }) }, e('summary', null, 'Основание и ограничения'),
            e('p', null, 'Правило: ' + r.rule.key + ', версия ' + r.rule.version + '. Период: ' + new Date(r.period.from).toLocaleDateString('ru-RU') + ' — ' + new Date(r.period.to).toLocaleDateString('ru-RU') + ' (' + r.period.timezone + ').'),
            e('p', null, r.current ? 'Источники и правило актуальны.' : 'Это сохранённый снимок. Его нельзя использовать как актуальную оценку.'),
            e('p', null, 'Вероятность возврата недоступна и не подставляется вместо отсутствующих данных. Отправка сообщений здесь не выполняется.')));
      }),
      e('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 } },
        e('button', { type: 'button', style: button, disabled: s.busy, onClick: function () { load(null); } }, 'Обновить результаты'),
        s.cursor ? e('button', { type: 'button', style: button, disabled: s.busy, onClick: function () { load(s.cursor); } }, 'Следующая страница') : null)) : null);
}
