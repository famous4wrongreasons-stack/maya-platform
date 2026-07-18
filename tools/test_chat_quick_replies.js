const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TARGETS = [
  path.join(ROOT, 'сайт и приложение', 'app.html'),
  '/Users/stanislavmosin/Desktop/maya-ios/www/index.html',
];

function loadQuickReplies(file, surface) {
  const html = fs.readFileSync(file, 'utf8');
  const start = html.indexOf('  const QUICKS =');
  const end = html.indexOf('  function quickActionTarget', start);
  assert(start >= 0 && end > start, `quick reply block not found in ${file}`);
  const block = html.slice(start, end) + '\nreturn { chatSuggest };';
  const owner = surface === 'owner';
  const storage = {
    getItem(key) {
      if (owner && key.indexOf('me_saas_auth_v2:') === 0) {
        return JSON.stringify({
          token: 'test-token',
          tenant_slug: 'demo',
          user: { role: 'tenant_owner' },
        });
      }
      return null;
    },
  };
  const windowStub = {
    __ME_SAAS_CTX: owner ? { ns: 'demo', slug: 'demo' } : null,
    __meCurMode: surface === 'staff' ? 'staff' : 'client',
    APP_DATA: {
      services: {
        main: [
          ['Мужская стрижка'],
          ['Моделирование бороды'],
          ['Уход'],
        ],
      },
      masters: {
        top: [['Стас'], ['Илья']],
        senior: [['Алексей']],
      },
      subs: [],
      certs: [2000, 3000, 5000],
    },
  };
  return {
    api: new Function('window', 'localStorage', 'sessionStorage', block)(
      windowStub,
      storage,
      storage,
    ),
    html,
  };
}

function expectReplies(file, surface, mayaText, expected) {
  const loaded = loadQuickReplies(file, surface);
  const actual = loaded.api.chatSuggest(mayaText, [{ role: 'user', text: 'test' }]);
  assert.deepStrictEqual(actual, expected, `${path.basename(file)}: ${mayaText}`);
}

const sharedCases = [
  [
    'staff',
    'В рабочем чате я не записываю клиентов. Откройте кабинет клиента.',
    [],
  ],
  ['staff', 'Выручка за месяц — 500 000 ₽. Валовая прибыль — 200 000 ₽.', []],
  ['staff', 'Запускаем реактивацию клиентов сейчас?', ['Запустить', 'Не сейчас']],
  [
    'staff',
    'Предлагаю варианты:\n1. Отправить напоминание — без скидки\n2. Подготовить предложение — со скидкой\nЧто выбираем?',
    ['Отправить напоминание', 'Подготовить предложение'],
  ],
  [
    'staff',
    'Показатели:\n- Выручка — 500 000 ₽\n- Валовая прибыль — 200 000 ₽\nЧто делаем дальше?',
    [],
  ],
  [
    'staff',
    'Что выбираем: отправить напоминание, подготовить предложение или отложить?',
    ['отправить напоминание', 'подготовить предложение', 'отложить'],
  ],
  [
    'staff',
    'Могу предложить: отправить сообщение, позвонить клиентам или отложить. Что выбираем?',
    ['отправить сообщение', 'позвонить клиентам', 'отложить'],
  ],
  ['staff', 'Как лучше поступить?', []],
  ['client', 'Помочь с записью или подсказать по услугам?', ['Записаться', 'Показать услуги']],
  [
    'client',
    'Всё верно, подтверждаете запись?',
    ['Да, подтверждаю', 'Изменить время', 'Другой мастер', 'Другая услуга'],
  ],
  [
    'client',
    'Добавить моделирование бороды или уход?',
    ['Добавить бороду', 'Добавить уход', 'Без дополнений'],
  ],
  ['client', 'Свободны 18:00 и 19:30. Какое время подходит?', ['18:00', '19:30', 'Другое время']],
  ['client', '18:00 или 19:30?', ['18:00', '19:30']],
  ['client', 'Стас или Илья?', ['Стас', 'Илья']],
  ['client', 'Стрижка стоит 2 000 ₽ и занимает около часа.', []],
];

for (const file of TARGETS) {
  for (const testCase of sharedCases) expectReplies(file, ...testCase);
  const html = fs.readFileSync(file, 'utf8');
  assert(
    html.includes("!last.text || last.action || last.aiApproval"),
    `action-card quick reply guard missing in ${file}`,
  );
}

const pwa = TARGETS[0];
expectReplies(
  pwa,
  'owner',
  'За какой период показать аналитику?',
  ['Сегодня', 'Эта неделя', 'Этот месяц', 'Прошлый месяц'],
);
expectReplies(pwa, 'owner', 'Выручка — 500 000 ₽. Валовая прибыль — 200 000 ₽.', []);
expectReplies(pwa, 'owner', 'Хотите, чтобы я разложила результат по мастерам?', ['Да', 'Нет']);

console.log(`Quick reply scenarios passed for ${TARGETS.length} app bundles.`);
