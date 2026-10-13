import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IdeasPanel } from './.bundle.mjs';
const row={finding:{kind:'unsupported'},key:'PRIVATE_RESULT',digest:'PRIVATE_DIGEST',revision:1,kind:'OBSERVED_VALUE',scope:'tenant',available:true,current:true,message:'<script>test</script>',coverage:'PARTIAL',qualification:'SOURCE_LABELLED',asOf:'2026-10-14T08:00:00.000Z',expiresAt:'2099-10-15T08:00:00.000Z',from:'2026-10-01T00:00:00.000Z',to:'2026-10-14T08:00:00.000Z',timezone:'Europe/Moscow'};
const forbidden=()=>{throw Error('inert render');};
const render=patch=>renderToStaticMarkup(createElement(IdeasPanel,{view:{phase:'ready',rows:[row],detail:null,reading:false,possiblyCapped:false,notice:'',retryAt:null,...patch},port:{refresh:forbidden,read:forbidden,back:forbidden},close:forbidden}));
test('Ideas reference content is informational and inert; no fake plan/task/contact button or private locator',()=>{const html=render({});assert.ok(html.includes('Готовые рекомендации и планы действий пока не подключены'));assert.ok(html.includes('Часть данных отсутствует'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('последних 25'));assert.ok(!/PRIVATE|<script|href=|Добавить в задачи|Отправить|Обсудить с/.test(html));});
test('Ideas detail includes bounds, UTC times, original timezone and qualification without numerical inference',()=>{const html=render({detail:row});for(const phrase of ['Сведения с отметкой источника','Europe/Moscow','08:00 UTC','Срок просмотра','не даёт разрешения'])assert.ok(html.includes(phrase),phrase);assert.ok(!html.includes('PRIVATE'));assert.ok(render({detail:{...row,available:false,current:false}}).includes('Сейчас недоступен'));});
test('Ideas failure/loading do not masquerade as empty success; refresh is disabled by rate limit',()=>{for(const phase of ['failed','loading']){const html=render({phase,rows:[],notice:'Недоступно'});assert.ok(!html.includes('Пока нет доступных'));}assert.ok(render({retryAt:123}).includes('disabled="">Обновить расчёты'));assert.ok(render({rows:[],possiblyCapped:true}).includes('Это часть списка.'));});

const htmlFor=finding=>render({detail:{...row,finding}}).replaceAll('<!-- -->','');
test('Ideas values show exact kopecks without floating point truncation or currency mixing',()=>{
 for(const [value,expected] of [['0','0,00 ₽'],['-150','−1,50 ₽'],['9007199254740993','90 071 992 547 409,93 ₽']])assert.ok(htmlFor({kind:'observation',basis:'confirmed_cash',currency:'RUB',value}).includes(expected),expected);
 const foreign=htmlFor({kind:'observation',basis:'confirmed_cash',currency:'JPY',value:'123'});assert.ok(foreign.includes('123 минимальных денежных единиц JPY'));assert.ok(!foreign.includes('₽'));
 assert.ok(htmlFor({kind:'observation',basis:'observed_attended_count',currency:null,value:'3'}).includes('Подтверждённые посещения'));
});
test('Ideas value meanings retain money proxy conditional and policy limitations',()=>{
 for(const [basis,phrase] of [['confirmed_cash','без вычета возвратов'],['confirmed_refunds','а не поступления'],['confirmed_cash_net_linked_refunds','это не прибыль'],['booked_value','не означает, что оплата уже получена'],['provider_reported_gross','не подтверждает полученные деньги']])assert.ok(htmlFor({kind:'observation',basis,currency:'RUB',value:'100'}).includes(phrase));
 for(const met of [true,false]){const html=htmlFor({kind:'policy',met});assert.ok(html.includes(met?'Условие правила выполнено':'Условие правила не выполнено'));assert.ok(html.includes('не согласие клиента'));assert.ok(html.includes('Параметры этого правила не подтверждены'));}
 const html=htmlFor({kind:'scenario',value:'250000',currency:'RUB',horizonEnd:row.expiresAt});for(const text of ['При сохранении этой записи','не полученная оплата','не ожидаемый доход','Горизонт сценария'])assert.ok(html.includes(text));
});
test('Ideas invalid unsupported and unavailable values never render zero or stale scalar',()=>{
 assert.ok(htmlFor({kind:'invalid'}).includes('Не удалось проверить формат'));
 assert.ok(htmlFor({kind:'unsupported'}).includes('пока не поддерживается'));
 assert.ok(htmlFor({kind:'unavailable'}).includes('отсутствие не означает ноль'));
 const html=render({detail:{...row,available:false,finding:{kind:'observation',basis:'confirmed_cash',currency:'RUB',value:'87654321'}}});assert.ok(!html.includes('876'));assert.ok(!html.includes('₽'));
});

const parameters=(patch={})=>({elapsed:{unit:'day',count:37},comparison:'gt',evidence:'proven_attendance',minimumCoverage:'PARTIAL',serviceScope:{restricted:false,count:0},timezone:'Europe/Moscow',...patch});
test('Ideas rule explanation preserves strict elapsed-day semantics coverage and literal false result',()=>{
 const html=htmlFor({kind:'policy',met:false,parameters:parameters()});
 for(const phrase of ['37 дней','строго после','истёкшие 24 часа','допускает частичное','не ограничено отдельными услугами','Условие правила не выполнено','не согласие клиента'])assert.ok(html.includes(phrase),phrase);
 assert.ok(!html.includes('включительно'));
});
test('Ideas rule explanation preserves inclusive calendar months timezone month end and bounded services',()=>{
 const html=htmlFor({kind:'policy',met:true,parameters:parameters({elapsed:{unit:'calendar_month',count:2},comparison:'gte',minimumCoverage:'COMPLETE',serviceScope:{restricted:true,count:3}})});
 for(const phrase of ['2 календарных месяца','включительно','Europe/Moscow','последним днём месяца','требует полного','набором услуг (3)','названия услуг здесь не раскрыты'])assert.ok(html.includes(phrase),phrase);
 assert.ok(!html.includes('24 часа'));assert.ok(!html.includes('строго после'));assert.ok(!/60 дней|PRIVATE|Отправить|Добавить в задачи/.test(html));
});
test('Ideas rule counts retain plural meaning and unavailable result cannot expose parameters',()=>{
 for(const [count,word] of [[1,'день'],[2,'дня'],[5,'дней'],[11,'дней'],[21,'день'],[22,'дня'],[111,'дней']])assert.ok(htmlFor({kind:'policy',met:true,parameters:parameters({elapsed:{unit:'day',count}})}).includes(`${count} ${word}`));
 const html=render({detail:{...row,current:false,available:false,finding:{kind:'policy',met:true,parameters:parameters()}}});assert.ok(!html.includes('37'));assert.ok(!html.includes('Условие правила выполнено'));
});

test('Ideas rule list stays compact and keeps exact threshold; complete explanation is in detail',()=>{
 const html=render({rows:[{...row,finding:{kind:'policy',met:true,parameters:parameters()}}]}).replaceAll('<!-- -->','');
 assert.ok(html.includes('Интервал: 37 дней (по 24 часа)'));assert.ok(html.includes('Граница срока не включена'));assert.ok(!html.includes('Правило допускает частичное'));
 assert.ok(html.includes('Посмотреть основание'));
});
