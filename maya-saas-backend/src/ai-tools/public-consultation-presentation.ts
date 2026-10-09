type Reply = { reply: string; status: 'verified' | 'blocked' };

export function publicCompanyField(
  value: unknown,
): 'profile' | 'name' | 'address' | null {
  if (value === undefined || value === null) return 'profile';
  if (typeof value !== 'string') return null;
  const field = value.trim().toLowerCase();
  if (['name', 'title', 'название'].includes(field)) return 'name';
  if (['address', 'адрес'].includes(field)) return 'address';
  return null;
}

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

/** Presentation of the exact scoped CRM result. A marker is evidence correlation,
 * not authority; the CRM owner and runtime already checked current access/source. */
export function publicCompanyProfileReply(
  executionValue: unknown,
  expected: { branchId: string; sourceRevision: string },
  field: 'profile' | 'name' | 'address',
): Reply {
  const unavailable: Reply = {
    reply:
      'Не удалось подтвердить адрес или название указанного филиала по текущим данным CRM.',
    status: 'blocked',
  };
  const execution = record(executionValue),
    data = record(execution.result);
  const scope = record(data.public_scope),
    salon = record(data.salon);
  if (
    execution.status !== 'completed' ||
    (execution.stale !== undefined && execution.stale !== false) ||
    (execution.replayed !== undefined &&
      typeof execution.replayed !== 'boolean') ||
    Object.keys(data).length !== 2 ||
    !Object.hasOwn(data, 'salon') ||
    Object.keys(scope).length !== 5 ||
    scope.contract !== 'maya.company-public-profile.read/1' ||
    scope.projection !== 'company_profile' ||
    scope.branch_id !== expected.branchId ||
    scope.source_revision !== expected.sourceRevision ||
    typeof scope.company_id !== 'string' ||
    !/^\d{1,15}$/.test(scope.company_id) ||
    Object.keys(salon).length !== 2 ||
    !Object.hasOwn(salon, 'name') ||
    !Object.hasOwn(salon, 'address') ||
    (salon.name !== null && typeof salon.name !== 'string') ||
    (salon.address !== null && typeof salon.address !== 'string')
  )
    return unavailable;
  const name = text(salon.name),
    address = text(salon.address, 512);
  // An invalid nonempty value is unavailable, not proof that a field is absent.
  if (
    (!name && typeof salon.name === 'string' && salon.name.trim() !== '') ||
    (!address &&
      typeof salon.address === 'string' &&
      salon.address.trim() !== '')
  )
    return unavailable;
  const saved =
    execution.replayed === true ? ['Сохранённый результат проверки.'] : [];
  const missing = (description: string): Reply => ({
    reply: [
      ...saved,
      `В прочитанном профиле CRM этого филиала ${description}.`,
    ].join('\n'),
    status: 'verified',
  });
  if (field === 'address' && !address) return missing('адрес не указан');
  if (field === 'name' && !name) return missing('название не указано');
  if (!name && !address) return missing('название и адрес не указаны');
  const lines = [
    ...saved,
    'По данным CRM для выбранного филиала:',
    ...(name && field !== 'address' ? [`Название в профиле: ${name}.`] : []),
    ...(address && field !== 'name' ? [`Адрес в профиле: ${address}.`] : []),
  ];
  return { reply: lines.join('\n'), status: 'verified' };
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
