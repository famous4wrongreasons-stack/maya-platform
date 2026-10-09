import { priceMinor } from '../crm/yclients-service-price.contract';

type Service = { id: string; name: string };
export type ServicePriceChatBinding =
  | {
      kind: 'resolved';
      arguments: { service_id: string; price_rubles: number };
    }
  | {
      kind: 'clarify';
      reason:
        | 'source_unavailable'
        | 'exact_service_required'
        | 'exact_price_required';
    };

const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/\s+/gu, ' ')
    .trim();
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const boundary = (value: string) =>
  new RegExp(
    `(^|[^\\p{L}\\p{N}_])${escaped(normalize(value))}(?=$|[^\\p{L}\\p{N}_])`,
    'u',
  );
const command = (value: string) =>
  /(?:^|\s)(?:установи(?:ть)?|измени(?:ть)?|поставь|поставить|сделай|сделать|задай|задать|обнови(?:ть)?|подготовь изменение|подготовить изменение|set|change|update)(?=$|\s)/u.test(
    value,
  ) && /(?:цен[ауы]|стоимост|price)/u.test(value);
const relative = (value: string) =>
  /[%+*/=]|процент|тыс(?:яч)?|скидк|дороже|дешевле|прибав|убав|плюс|минус|(?:увелич|подним|подня|сниз|уменьш)[^.!?]*\sна\s|\b(?:usd|eur)\b|доллар|евро|[$€]/u.test(
    value,
  );

/** Only a stated fixed decimal amount: never compute a percentage, delta, or range. */
function amount(value: string): { rubles: number; rest: string } | null {
  if (relative(value) || /(?:^|\s)[-−]\s*\d/u.test(value)) return null;
  const matches = [
    ...value.matchAll(
      /(?<![\p{L}\p{N}.,])(?:\d{1,3}(?: \d{3})+|\d+)(?:[.,]\d{1,2})?(?![\p{L}\p{N}]|[.,]\d)/gu,
    ),
  ];
  if (matches.length !== 1) return null;
  const match = matches[0];
  const text = match[0].replace(/ /g, '').replace(',', '.');
  try {
    const rubles = priceMinor(text) / 100;
    if (rubles > 1_000_000_000) return null;
    return {
      rubles,
      rest: `${value.slice(0, match.index)} ${value.slice(match.index + match[0].length)}`,
    };
  } catch {
    return null;
  }
}

/** A price-only revision may inherit one previously explicit service. Any unknown noun
 * ends inheritance, so "а массаж 1900" cannot silently change the previous haircut. */
function priceOnly(value: string): boolean {
  const parsed = amount(value);
  if (!parsed) return false;
  const allowed = new Set([
    'установи',
    'установить',
    'измени',
    'изменить',
    'поставь',
    'поставить',
    'сделай',
    'сделать',
    'задай',
    'задать',
    'обнови',
    'обновить',
    'подготовь',
    'подготовить',
    'изменение',
    'цена',
    'цену',
    'цены',
    'стоимость',
    'новую',
    'фиксированную',
    'услуга',
    'услуги',
    'услугу',
    'для',
    'в',
    'yclients',
    'рублей',
    'рубля',
    'рубль',
    'руб',
    'rub',
    'нет',
    'лучше',
    'давай',
    'тогда',
    'пусть',
    'будет',
    'теперь',
    'точно',
    'пожалуйста',
    'на',
    'до',
    'а',
    'set',
    'change',
    'update',
    'price',
    'to',
  ]);
  return parsed.rest
    .replace(/[,.:;!«»„“”"'₽—-]/gu, ' ')
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .every((word) => allowed.has(word));
}

function serviceIn(value: string, services: Service[]): Service | null {
  const matches = services.filter((service) =>
    boundary(service.name).test(value),
  );
  return matches.length === 1 ? matches[0] : null;
}

/** The same qualification applies to a current command and a historical anchor.
 * Mentioning a service in a refused/deferred command cannot authorize a follow-up. */
function fixedPrice(value: string, service: Service): number | null {
  if (/(?:^|\s)не\s|отмен|не надо|не нужно/u.test(value)) return null;
  const withoutService = value.replace(boundary(service.name), ' ');
  const parsed = amount(withoutService);
  return parsed && priceOnly(withoutService) ? parsed.rubles : null;
}

function currentServices(source: unknown): Service[] | null {
  if (!source || typeof source !== 'object' || Array.isArray(source))
    return null;
  const rows = (source as Record<string, unknown>).services;
  if (!Array.isArray(rows) || !rows.length || rows.length > 10_000) return null;
  const services: Service[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    const { id, name } = row as Record<string, unknown>;
    if (
      typeof id !== 'string' ||
      !/^[1-9]\d{0,14}$/.test(id) ||
      typeof name !== 'string' ||
      !name.trim() ||
      name.length > 240
    )
      return null;
    services.push({ id, name });
  }
  if (new Set(services.map((row) => row.id)).size !== services.length)
    return null;
  return services;
}

/** User text binds intent; the freshly read tenant catalog binds the service identity.
 * The model's proposed service/amount are deliberately not inputs to this function. */
export function bindServicePriceChat(input: {
  userMessages: readonly string[];
  serviceSource: unknown;
}): ServicePriceChatBinding {
  const services = currentServices(input.serviceSource);
  if (!services) return { kind: 'clarify', reason: 'source_unavailable' };
  const messages = input.userMessages.slice(-12).map(normalize);
  const latest = messages.at(-1) ?? '';
  if (/(?:^|\s)не\s|отмен|не надо|не нужно/u.test(latest))
    return { kind: 'clarify', reason: 'exact_price_required' };
  let selected = serviceIn(latest, services);
  let authorized = command(latest);
  if (!selected && priceOnly(latest)) {
    for (let index = messages.length - 2; index >= 0; index -= 1) {
      const previous = messages[index];
      const previousService = serviceIn(previous, services);
      if (
        previousService &&
        command(previous) &&
        fixedPrice(previous, previousService) !== null
      ) {
        selected = previousService;
        authorized = true;
        break;
      }
      if (!priceOnly(previous)) break;
    }
  }
  if (!selected || !authorized)
    return { kind: 'clarify', reason: 'exact_service_required' };
  const price = fixedPrice(latest, selected);
  if (price === null)
    return { kind: 'clarify', reason: 'exact_price_required' };
  return {
    kind: 'resolved',
    arguments: { service_id: selected.id, price_rubles: price },
  };
}

export function servicePriceClarification(
  reason: Extract<ServicePriceChatBinding, { kind: 'clarify' }>['reason'],
): string {
  if (reason === 'source_unavailable')
    return 'Не удалось проверить каталог YCLIENTS. Изменение цены пока не подготовлено.';
  if (reason === 'exact_price_required')
    return 'Назовите одну точную новую цену в рублях. Проценты, прибавки и диапазоны этим действием не рассчитываю.';
  return 'Укажите точное название одной услуги из каталога и новую цену в рублях: например, «Установи цену услуги „название из каталога“ — сумма». Изменение пока не подготовлено.';
}

/** Finite preferences in the existing encrypted conversation context. No approval,
 * dispatch token or prior current-price fact is restored from this marker. */
export type ServicePricePreference = {
  version: 'maya.service-price-preference/1';
  tenantId: string;
  userId: string;
  sourceRevision: string;
  requestedPrice: number;
  service: Service | null;
};
export type ServicePriceScope = Pick<
  ServicePricePreference,
  'tenantId' | 'userId' | 'sourceRevision'
>;

export function retainedServicePrice(
  value: unknown,
  scope: ServicePriceScope,
): ServicePricePreference | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as ServicePricePreference;
  if (
    item.version !== 'maya.service-price-preference/1' ||
    item.tenantId !== scope.tenantId ||
    item.userId !== scope.userId ||
    item.sourceRevision !== scope.sourceRevision
  )
    return null;
  if (
    typeof item.requestedPrice !== 'number' ||
    !Number.isFinite(item.requestedPrice) ||
    item.requestedPrice < 0 ||
    item.requestedPrice > 1_000_000_000
  )
    return null;
  try {
    if (priceMinor(item.requestedPrice) / 100 !== item.requestedPrice)
      return null;
  } catch {
    return null;
  }
  if (
    item.service !== null &&
    (!item.service ||
      typeof item.service !== 'object' ||
      typeof item.service.id !== 'string' ||
      !/^[1-9]\d{0,14}$/.test(item.service.id) ||
      typeof item.service.name !== 'string' ||
      !item.service.name.trim() ||
      item.service.name.length > 240)
  )
    return null;
  return {
    version: item.version,
    ...scope,
    requestedPrice: item.requestedPrice,
    service: item.service
      ? { id: item.service.id, name: item.service.name }
      : null,
  };
}

// An unresolved noun never becomes a service identity. Retain only a raw fixed
// amount from a finite preparation request, then ask explicitly which service.
function unresolvedPriceRequest(value: string): number | null {
  const parsed = amount(value);
  if (
    !parsed ||
    /(?:^|\s)(?:не|если|когда|после|потом|завтра|через|только|отмени)(?=$|\s)/u.test(
      value,
    )
  )
    return null;
  const prefix =
    /^(?:подготовь изменение|подготовить изменение|установи(?:ть)?|измени(?:ть)?|поставь|поставить|сделай|сделать|задай|задать|обнови(?:ть)?)\s+(?:цен[ауы]|стоимость)\s+/u;
  if (!prefix.test(value)) return null;
  const numeric = value.search(/\d/u);
  const before = value
    .slice(0, numeric)
    .replace(prefix, '')
    .replace(/\s+(?:на|до)\s*$/u, '')
    .trim();
  if (!before || before.length > 260 || !/^[\p{L}\s«»„“”"'—-]+$/u.test(before))
    return null;
  if (
    /(?:^|\s)(?:в|для|у|при|к|с|по|после|через|филиал[а-я]*|мастер[а-я]*|сотрудник[а-я]*)(?=$|\s)/u.test(
      before,
    )
  )
    return null;
  return priceOnly(value.slice(numeric)) ? parsed.rubles : null;
}

export function bindServicePriceTurn(input: {
  text: string;
  serviceSource: unknown;
  scope: ServicePriceScope;
  previous: ServicePricePreference | null;
}): {
  binding: ServicePriceChatBinding;
  preference: ServicePricePreference | null;
  reply?: string;
} {
  const services = currentServices(input.serviceSource);
  const clarify = (
    reason: Extract<ServicePriceChatBinding, { kind: 'clarify' }>['reason'],
    preference: ServicePricePreference | null = null,
  ) => ({
    binding: { kind: 'clarify' as const, reason },
    preference,
    reply:
      preference && preference.service === null
        ? `Для какой услуги подготовить цену ${preference.requestedPrice.toLocaleString('ru-RU')} ₽? Укажите точное название из каталога.`
        : servicePriceClarification(reason),
  });
  if (!services) return clarify('source_unavailable');
  const text = normalize(input.text);
  if (/(?:^|\s)не\s|отмен|не надо|не нужно/u.test(text))
    return clarify('exact_price_required');
  const preference = (
    price: number,
    service: Service | null,
  ): ServicePricePreference => ({
    version: 'maya.service-price-preference/1',
    ...input.scope,
    requestedPrice: price,
    service,
  });
  const resolve = (service: Service, price: number) => ({
    binding: {
      kind: 'resolved' as const,
      arguments: { service_id: service.id, price_rubles: price },
    },
    preference: preference(price, service),
  });
  // A complete new command starts its own proposal, even after another service.
  const direct = bindServicePriceChat({
    userMessages: [input.text],
    serviceSource: input.serviceSource,
  });
  if (direct.kind === 'resolved')
    return resolve(
      services.find((row) => row.id === direct.arguments.service_id)!,
      direct.arguments.price_rubles,
    );
  const previous = retainedServicePrice(input.previous, input.scope);
  if (previous) {
    if (
      previous.service &&
      !services.some(
        (row) =>
          row.id === previous.service!.id &&
          row.name === previous.service!.name,
      )
    )
      return clarify('source_unavailable');
    if (priceOnly(text)) {
      const price = amount(text)!.rubles;
      return previous.service
        ? resolve(previous.service, price)
        : clarify('exact_service_required', preference(price, null));
    }
    const title = text
      .replace(/^(?:услуга|услугу|услуги)\s+/u, '')
      .replace(/[«»„“”"'.,!]/gu, '')
      .trim();
    const exact = services.filter((row) => normalize(row.name) === title);
    if (previous.service === null && exact.length === 1)
      return resolve(exact[0], previous.requestedPrice);
    // A service-only replacement never inherits the prior service's price or card.
    if (previous.service !== null && exact.length === 1)
      return clarify('exact_price_required');
  }
  if (direct.kind === 'clarify' && direct.reason === 'exact_service_required') {
    const price = unresolvedPriceRequest(text);
    if (price !== null)
      return clarify('exact_service_required', preference(price, null));
  }
  return clarify(
    direct.kind === 'clarify' ? direct.reason : 'exact_price_required',
  );
}
