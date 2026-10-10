/** Presentation choices only; the existing onboarding owner validates/stores IANA. */
export interface TimezoneChoice { readonly value: string; readonly label: string }

const cities: Readonly<Record<string, string>> = {
  UTC: 'Всемирное время',
  'Europe/Kaliningrad': 'Калининград', 'Europe/Moscow': 'Москва, Ставрополь',
  'Europe/Kirov': 'Киров', 'Europe/Volgograd': 'Волгоград',
  'Europe/Astrakhan': 'Астрахань', 'Europe/Samara': 'Самара',
  'Europe/Saratov': 'Саратов', 'Europe/Ulyanovsk': 'Ульяновск',
  'Asia/Yekaterinburg': 'Екатеринбург', 'Asia/Omsk': 'Омск',
  'Asia/Novosibirsk': 'Новосибирск', 'Asia/Barnaul': 'Барнаул',
  'Asia/Tomsk': 'Томск', 'Asia/Novokuznetsk': 'Новокузнецк',
  'Asia/Krasnoyarsk': 'Красноярск', 'Asia/Irkutsk': 'Иркутск',
  'Asia/Chita': 'Чита', 'Asia/Yakutsk': 'Якутск', 'Asia/Khandyga': 'Хандыга',
  'Asia/Vladivostok': 'Владивосток', 'Asia/Ust-Nera': 'Усть-Нера',
  'Asia/Magadan': 'Магадан', 'Asia/Sakhalin': 'Сахалин',
  'Asia/Srednekolymsk': 'Среднеколымск', 'Asia/Kamchatka': 'Петропавловск-Камчатский',
  'Asia/Anadyr': 'Анадырь', 'Europe/Minsk': 'Минск',
  'Europe/Kiev': 'Киев', 'Europe/Kyiv': 'Киев', 'Asia/Almaty': 'Алматы',
  'Asia/Tashkent': 'Ташкент', 'Asia/Bishkek': 'Бишкек',
  'Asia/Tbilisi': 'Тбилиси', 'Asia/Yerevan': 'Ереван', 'Asia/Baku': 'Баку',
  'Europe/Istanbul': 'Стамбул', 'Asia/Dubai': 'Дубай',
  'Europe/London': 'Лондон', 'Europe/Berlin': 'Берлин', 'Europe/Paris': 'Париж',
  'Europe/Rome': 'Рим', 'Europe/Madrid': 'Мадрид', 'Europe/Warsaw': 'Варшава',
  'Asia/Jerusalem': 'Иерусалим', 'Asia/Kolkata': 'Дели, Калькутта',
  'Asia/Calcutta': 'Дели, Калькутта', 'Asia/Kathmandu': 'Катманду',
  'Asia/Katmandu': 'Катманду', 'Asia/Bangkok': 'Бангкок',
  'Asia/Shanghai': 'Шанхай, Пекин', 'Asia/Tokyo': 'Токио',
  'Asia/Singapore': 'Сингапур', 'Australia/Sydney': 'Сидней',
  'America/New_York': 'Нью-Йорк', 'America/Chicago': 'Чикаго',
  'America/Los_Angeles': 'Лос-Анджелес', 'America/Toronto': 'Торонто',
  'America/Sao_Paulo': 'Сан-Паулу', 'Pacific/Auckland': 'Окленд',
  'Africa/Cairo': 'Каир', 'Africa/Johannesburg': 'Йоханнесбург',
};

export function timezoneChoices(at = new Date(), supported?: readonly string[]): readonly TimezoneChoice[] {
  const available = supported ?? (typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : Object.keys(cities));
  const choices: TimezoneChoice[] = [];
  for (const value of new Set(['UTC', ...available])) {
    try {
      const offset = new Intl.DateTimeFormat('en', { timeZone: value, timeZoneName: 'shortOffset' }).formatToParts(at).find(part => part.type === 'timeZoneName')?.value;
      if (!offset || !/^GMT(?:[+-]\d{1,2}(?::\d{2})?)?$/.test(offset)) continue;
      const city = cities[value] ?? value.split('/').slice(1).join(' / ').replaceAll('_', ' ');
      if (city) choices.push({ value, label: `${city} — ${offset.replace('GMT', 'UTC')}` });
    } catch { /* An unsupported zone is not offered. No fallback selection. */ }
  }
  return choices.sort((a, b) => a.label.localeCompare(b.label, 'ru') || a.value.localeCompare(b.value));
}

export function deviceTimezoneChoice(choices: readonly TimezoneChoice[], zone?: string): TimezoneChoice | null {
  try {
    const detected = zone ?? new Intl.DateTimeFormat().resolvedOptions().timeZone;
    const canonical = new Intl.DateTimeFormat('en', { timeZone: detected }).resolvedOptions().timeZone;
    return choices.find(choice => choice.value === detected || new Intl.DateTimeFormat('en', { timeZone: choice.value }).resolvedOptions().timeZone === canonical) ?? null;
  } catch { return null; }
}
