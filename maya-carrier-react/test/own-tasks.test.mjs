import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OwnTasksPanel } from './.bundle.mjs';
const view={phase:'ready',filter:'active',rows:[],activeCount:0,doneCount:0,possiblyCapped:false,notice:'',retryAt:null};
const render = patch => renderToStaticMarkup(createElement(OwnTasksPanel,{view:{...view,...patch},port:{filter(){throw Error('render must not act');},refresh(){throw Error('render must not read');}},close(){}}));
test('tasks render is inert, escapes all content, and exposes no command identity or control', () => {
  const html=render({rows:[{key:'private-row-id',title:'<img src=x onerror=evil()>',detail:'<script>evil()</script>',dueAt:'2026-10-14T09:00:00.000Z',completed:false}],activeCount:1});
  assert.ok(html.includes('&lt;img'));assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('private-row-id'));assert.ok(!/<img|<script|type="checkbox"|Завершить|Создать задачу/.test(html));
  assert.ok(html.includes('09:00 UTC'));assert.ok(html.includes('Задачи, назначенные вам'));
});
test('loading, denied and capped-filter-empty states never claim an empty authoritative full list', () => {
  for(const phase of ['loading','failed']) {
    const html=render({phase,notice:'Доступ запрещён'});
    assert.ok(!html.includes('Сейчас нет задач'));assert.ok(!html.includes('Готово · 0'));
    assert.ok(html.includes(phase==='loading'?'Загружаю':'Доступ запрещён'));
  }
  const capped=render({possiblyCapped:true,doneCount:50});
  assert.ok(capped.includes('50 последних'));assert.ok(capped.includes('В этой части списка'));
  assert.ok(!capped.includes('Сейчас нет задач'));
  assert.ok(render({retryAt:3000}).includes('disabled="">Обновить список'));
});
