type Reply = { reply: string; status: 'verified' | 'blocked' };

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

// Existing public catalog fields only. Never infer history, ratings, service
// qualification or availability from the salon/staff name or list position.
function text(value: unknown, max = 240): string | null {
  if (typeof value !== 'string') return null;
  const clean = value
    .replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean && clean.length <= max ? clean : null;
}

export function publicConsultationReply(
  value: unknown,
  mode: 'staff' | 'salon',
  stale = false,
): Reply {
  const data = record(value);
  if (stale || data.stale === true)
    return {
      reply:
        'Публичный каталог помечен как устаревший. Актуальные сведения о салоне и мастерах сейчас не подтверждены.',
      status: 'blocked',
    };
  const salon = record(data.salon);
  const name = text(salon.name);
  const lines: string[] = [];
  if (name) lines.push(`Название в профиле: ${name}.`);
  if (mode === 'salon') {
    for (const [key, label] of [
      ['city', 'Город'],
      ['address', 'Адрес'],
      ['phone', 'Контактный телефон'],
      ['tagline', 'Описание'],
    ]) {
      const field = text(salon[key]);
      if (field) lines.push(`${label} в профиле: ${field}.`);
    }
    const about = Array.isArray(salon.about)
      ? salon.about
          .slice(0, 8)
          .map((entry) => text(entry, 500))
          .filter(Boolean)
      : [];
    if (about.length)
      lines.push(`Из сохранённого описания салона:\n${about.join('\n')}`);
    // No derived age, guessed opening date or relative "six years" claim.
    const founded = text(salon.founded_hint);
    if (founded && /^\d{4}$/.test(founded))
      lines.push(`Год основания в профиле: ${founded}.`);
    if (!lines.length)
      return {
        reply:
          'Публичные сведения о салоне в полученном профиле не заполнены. Адрес, контакты и историю по названию определить нельзя.',
        status: 'blocked',
      };
    lines.push(
      'Это сохранённые сведения профиля. Отсутствующие подробности по ним не установлены.',
    );
    return { reply: lines.join('\n\n'), status: 'verified' };
  }
  if (!Array.isArray(data.staff))
    return {
      reply:
        'Не удалось получить публичный список мастеров. Это не означает, что в салоне нет сотрудников.',
      status: 'blocked',
    };
  const rows = data.staff.slice(0, 20).flatMap((value) => {
    const row = record(value),
      name = text(row.name);
    if (!name) return [];
    const details = [
      ...new Set([text(row.title), text(row.specialization)].filter(Boolean)),
    ];
    return [`${name}${details.length ? ` — ${details.join('; ')}` : ''}`];
  });
  if (!rows.length && data.staff.length)
    return {
      reply:
        'Полученный каталог не содержит пригодных для показа имён мастеров. Состав команды сейчас не подтверждён.',
      status: 'blocked',
    };
  lines.push(
    rows.length
      ? `Мастера в полученном публичном каталоге:\n${rows.join('\n')}`
      : 'В полученном публичном каталоге нет записей о мастерах.',
  );
  if (rows.length < data.staff.length)
    lines.push(
      'Показана часть полученного каталога; некоторые записи не показаны.',
    );
  lines.push(
    'Принадлежность к конкретному филиалу, возможность выполнить выбранную услугу и свободное время этим списком не подтверждаются.',
  );
  return { reply: lines.join('\n\n'), status: 'verified' };
}
