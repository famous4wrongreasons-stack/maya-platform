import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkspaceReadsPanel } from './.bundle.mjs';
const view={workspace:'feed',phase:'ready',feed:[],reports:[],unreadOnly:false,possiblyCapped:false,order:'recent',layout:'list',detail:null,markingRead:null,notice:'',retryAt:null};
const forbidden=()=>{throw Error('render must be inert');};
const port=Object.fromEntries(['refresh','filterUnread','layout','order','read','back','markRead'].map(k=>[k,forbidden]));
const render=patch=>renderToStaticMarkup(createElement(WorkspaceReadsPanel,{view:{...view,...patch},port,close:forbidden}));
test('feed is inert plain text with explicit UTC/read state; no links, save or implicit acknowledgment',()=>{
  const html=render({feed:[{key:'private-id',title:'<img src=x>',body:'<script>evil()</script> https://unsafe.invalid',unread:true,createdAt:'2026-10-13T09:00:00.000Z'}]});
  assert.ok(html.includes('&lt;img'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('09:00 UTC'));assert.ok(html.includes('Не прочитано'));
  assert.ok(!/private-id|<img|<script|href=|Сохранить|Обсудить/.test(html));
});
test('library always discloses pre-filter cap; report reader escapes body and never sends to model',()=>{
  for(const reports of [[],[{key:'private-run',title:'<b>Report</b>',type:'daily_report',period:'2026-10-12'}]]){
    const html=render({workspace:'library',reports});assert.ok(html.includes('последних 100'));assert.ok(!html.includes('private-run'));
  }
  const html=render({workspace:'library',detail:{phase:'ready',report:{title:'<img>',type:'daily_report',period:'2026-10-12',timezone:'Europe/Moscow',body:'<script>private</script>\nhttps://unsafe.invalid'}}});
  assert.ok(html.includes('12.10.2026'));assert.ok(html.includes('Europe/Moscow'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!/<script|<img|href=|Обсудить|Скачать/.test(html));
});
test('denial/loading are not empty success; rate limit disables refresh and feed cap is disclosed',()=>{
  for(const phase of ['loading','failed']){const html=render({phase,notice:'Недоступно'});assert.ok(!html.includes('пока пусто'));assert.ok(html.includes(phase==='loading'?'Загружаю':'Недоступно'));}
  assert.ok(render({retryAt:4}).includes('disabled="">Обновить список'));assert.ok(render({possiblyCapped:true}).includes('50 последних'));
});

test('only unread feed rows offer explicit acknowledgement; pending blocks both write and refresh',()=>{
 const row={key:'private-id',title:'Уведомление',body:'Текст',unread:true,createdAt:'2026-10-13T09:00:00.000Z'};
 const ready=render({feed:[row]});assert.ok(ready.includes('Отметить прочитанным'));assert.ok(!ready.includes('disabled="">Отметить'));assert.ok(!ready.includes('private-id'));
 assert.ok(!render({feed:[{...row,unread:false}]}).includes('>Отметить прочитанным'));
 const busy=render({feed:[row],markingRead:row.key,notice:'Сохраняю отметку…'});
 assert.ok(busy.includes('aria-busy="true"'));assert.ok(busy.includes('disabled="">Отметить прочитанным'));assert.ok(busy.includes('disabled="">Обновить список'));assert.ok(busy.includes('Не прочитано'));
 assert.ok(render({unreadOnly:true}).includes('В этой части ленты нет непрочитанных'));
 assert.ok(render({notice:'Не удалось подтвердить отметку.',possiblyCapped:true}).includes('Не удалось подтвердить отметку. Показана часть ленты'));
});

test('report sheet is labelled, inert on render and driven only by canonical detail',()=>{
 const row={key:'private-run',title:'Сохранённый отчёт',type:'daily_report',period:'2026-10-12'};
 const html=render({workspace:'library',reports:[row],detail:{phase:'loading',title:row.title}});
 assert.match(html,/<dialog[^>]*aria-modal="true"[^>]*aria-labelledby="[^"]+"[^>]*aria-busy="true"/);
 assert.doesNotMatch(html,/<dialog[^>]* open|companion-report-body|private-run/);
 assert.match(html,/companion-report-list/);assert.match(html,/Открываю отчёт…/);
 assert.match(html,/aria-label="Закрыть отчёт"/);assert.match(html,/← К списку отчётов/);
 assert.doesNotMatch(render({workspace:'library',reports:[row]}),/companion-report-heading|companion-report-body/);
});

test('library view uses a labelled passive sheet with the current runtime preferences',()=>{
 const html=render({workspace:'library',layout:'grid',order:'title'});
 assert.match(html,/aria-label="Вид библиотеки" aria-haspopup="dialog"/);
 assert.match(html,/<dialog[^>]*class="companion-library-menu"[^>]*aria-labelledby="maya-library-view-title"[^>]*aria-modal="true"/);
 assert.match(html,/aria-label="Сетка" aria-pressed="true"/);
 assert.match(html,/aria-label="По названию" aria-pressed="true"/);
 assert.doesNotMatch(html,/<dialog[^>]* open/);
 assert.match(render({workspace:'library',phase:'failed'}),/aria-label="По дате" disabled=""/);
});
