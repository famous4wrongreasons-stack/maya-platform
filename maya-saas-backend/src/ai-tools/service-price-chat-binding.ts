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
  /(?:^|\s)(?:установи(?:ть)?|измени(?:ть)?|поставь|поставить|сделай|сделать|задай|задать|обнови(?:ть)?|set|change|update)(?=$|\s)/u.test(
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
    'цена',
    'цену',
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

/** User text binds intent; the freshly read tenant catalog binds the service identity.
 * The model's proposed service/amount are deliberately not inputs to this function. */
export function bindServicePriceChat(input: {
  userMessages: readonly string[];
  serviceSource: unknown;
}): ServicePriceChatBinding {
  const source = input.serviceSource;
  if (!source || typeof source !== 'object' || Array.isArray(source))
    return { kind: 'clarify', reason: 'source_unavailable' };
  const rows = (source as Record<string, unknown>).services;
  if (!Array.isArray(rows) || !rows.length || rows.length > 10_000)
    return { kind: 'clarify', reason: 'source_unavailable' };
  const services: Service[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row))
      return { kind: 'clarify', reason: 'source_unavailable' };
    const { id, name } = row as Record<string, unknown>;
    if (
      typeof id !== 'string' ||
      !/^[1-9]\d{0,14}$/.test(id) ||
      typeof name !== 'string' ||
      !name.trim() ||
      name.length > 240
    )
      return { kind: 'clarify', reason: 'source_unavailable' };
    services.push({ id, name });
  }
  if (new Set(services.map((row) => row.id)).size !== services.length)
    return { kind: 'clarify', reason: 'source_unavailable' };
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
