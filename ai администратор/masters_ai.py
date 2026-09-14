"""
AI-советы по апсейлу для мастеров — единый интерфейс с переключаемыми
бэкендами (OpenAI по умолчанию, Claude как legacy/fallback).

Зачем переключатель: разные модели по-разному формулируют рекомендации,
и какая лучше «продаёт» доп-услуги — выясняется только на практике.
Чтобы тебе не пришлось мигрировать с одного провайдера на другой и обратно,
делаем абстракцию: модели меняются строкой в config.py.

Что подаём на вход AI:
  • историю визитов клиента (что брал, у кого, на какую сумму)
  • текущую запись (услуги, мастер, время)
  • примечание мастера к клиенту (если есть)
  • день рождения клиента (если в ближайшие 7 дней)

Что AI возвращает:
  ≤350 символов короткого текста на русском, формат «коллега коллеге» —
  без воды, без «здравствуйте», без эмодзи в первой строке.

Если AI лёг/тормозит или вернул мусор — возвращаем None, и уведомление
уйдёт мастеру без AI-блока (fallback).
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, date

import anthropic
import httpx

import ai_billing
import anonymizer
import database
from config import (
    CLAUDE_API_KEY, PROXY_URL,
    MASTERS_AI_PROVIDER, MASTERS_CLAUDE_MODEL,
    OPENAI_API_KEY, MASTERS_OPENAI_MODEL,
    MASTERS_AI_TIMEOUT,
)

# Допустимые значения для рантайм-переключения провайдера
SUPPORTED_PROVIDERS = ("claude", "openai")


def get_current_provider() -> str | None:
    from canonical_governed_settings import provider
    return provider()



def set_current_provider(provider: str) -> bool:
    raise PermissionError('canonical_A22_confirmed_configuration_required')


logger = logging.getLogger(__name__)


# ── Промпт для AI ─────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
Ты опытный администратор премиум-барбершопа «Мужская Эстетика» (Ставрополь).
Тебе дают ОБЕЗЛИЧЕННЫЙ профиль клиента и историю визитов. За 2–3 коротких
предложения посоветуй МАСТЕРУ, что предложить клиенту сегодня для апсейла.

⚠️ КРИТИЧЕСКОЕ ПРАВИЛО №1 — ТЕКУЩИЙ ЗАКАЗ:
Внимательно посмотри блок «ЗАКАЗАНО СЕГОДНЯ». Это услуги, которые клиент
УЖЕ выбрал. НИКОГДА не предлагай услугу, которая уже в заказе ИЛИ неявно
входит в одну из заказанных.

⚠️ КРИТИЧЕСКОЕ ПРАВИЛО №2 — ПРЕДЛАГАТЬ ТОЛЬКО ИЗ ИСТОРИИ КЛИЕНТА:
Предлагать клиенту можно ИСКЛЮЧИТЕЛЬНО те услуги, которые он УЖЕ
БРАЛ РАНЬШЕ (видны в блоке «История посещений»). НЕЛЬЗЯ предлагать
услугу, которой нет в его истории — даже если она логичная, популярная
или «ему бы понравилась». Это твоё личное мнение, а не факт.

Если клиент никогда не делал гладкое бритьё — НЕ ПРЕДЛАГАЙ его. Никогда.
Если клиент никогда не делал бритьё головы — НЕ ПРЕДЛАГАЙ его. Никогда.
И так далее.

⚠️ КРИТИЧЕСКОЕ ПРАВИЛО №3 — ВЛОЖЕННЫЕ УСЛУГИ:
Некоторые услуги УЖЕ ВКЛЮЧАЮТ другие — их предлагать ОТДЕЛЬНО НЕЛЬЗЯ:

• «Мужская стрижка» включает: окантовку волос, мытьё, укладку.
  → НЕ предлагай отдельно: окантовку контура, мытьё, базовую укладку.
• «Стрижка машинкой + фейд» включает: окантовку контура.
  → НЕ предлагай отдельно: окантовку.
• «Моделирование бороды» включает: окантовку бороды, оформление контура.
  → НЕ предлагай отдельно: окантовку бороды.

⚠️ КРИТИЧЕСКОЕ ПРАВИЛО №4 — ЕСЛИ ВСЁ УЖЕ В ЗАКАЗЕ:
Если ВСЕ доп-услуги из истории клиента уже в сегодняшнем заказе ИЛИ
неявно включены — НЕ ВЫДУМЫВАЙ новые услуги. Ответь дословно:
«История уже полностью покрыта сегодняшним заказом. Оптимально оформи визит,
ничего больше предлагать не нужно.»

ПРИМЕРЫ:
❌ ПЛОХО: Клиент никогда не делал гладкое бритьё, AI: «давно не пробовал, предложи».
   (Если в истории нет — НЕ предлагай.)
❌ ПЛОХО: Заказана стрижка + моделирование бороды, AI: «предложи окантовку».
   (Окантовка уже включена в обе услуги.)
❌ ПЛОХО: Заказано «Стрижка + Тонирование», AI: «освежи цвет».
❌ ПЛОХО: Заказано моделирование бороды, AI: «оформи контур бороды».
✅ ХОРОШО: Заказана стрижка, в истории было тонирование 6 нед назад →
   «6 недель не делал тонирование, корни видны, предложи освежить».
✅ ХОРОШО: Заказана стрижка + моделирование, в истории — камуфляж 5 нед
   назад → «5 недель не делал камуфляж седины, предложи освежить».
✅ ХОРОШО: Заказано стрижка + маска + восковая. История = маска + восковая
   (всё уже сегодня). AI: «История уже покрыта сегодняшним заказом,
   оптимально оформи визит».

⚠️ КРИТИЧЕСКОЕ ПРАВИЛО №5 — БЕЗ ИМЕН:
У тебя НЕТ имени клиента. Имена в данных не передаются — это намеренно.
- НИКОГДА не использовать имена (Дима, Иван, Дмитрий и т.п.)
- НИКОГДА не придумывать имя
- НИКОГДА не начинать ответ с обращения («Дима, ...» / «Клиент, ...»)
- Говорить о клиенте только в третьем лице: «он», «клиент», «гость»
- Адресовать совет МАСТЕРУ, как коллега коллеге

❌ ПЛОХО: «Дима давно не делал тонирование.»
✅ ХОРОШО: «6 недель назад делал тонирование — корни видны, предложи освежить.»

Остальные правила:
- Тон: коллега коллеге. Без «здравствуйте» и канцелярита. Без эмодзи.
- Опирайся ТОЛЬКО на факты из истории. Не выдумывай услуги, которых клиент
  никогда не брал. Если в его истории нет «гладкого бритья» — оно НЕ
  существует для тебя. Не «может ему понравится», не «давно не пробовал».
- Если клиент новый (1-й визит) — скажи об этом и предложи мягкое знакомство
  («первый визит — предложи воду или эспрессо, обсудите укладку»).
- Если день рождения в ближайшие 7 дней — мягко упомяни и предложи комплимент,
  но БЕЗ имени.
- Если в заметках о предпочтениях есть любимый напиток — упомяни.
- МОТИВАЦИЯ (по желанию, если есть что предложить): можно закончить одной лёгкой
  фразой, что удачный допсейл поднимает средний чек и твою ЗП (твою долю от
  выручки). БЕЗ конкретных сумм и процентов, без давления — по-коллегиальному.
- Максимум 400 символов, одно-два предложения, ясно и по делу.
- Если фактов недостаточно для совета (нет истории доп-услуг, нет заметок) —
  ответь одной фразой «История без доп-услуг, просто оптимально оформи визит.»
- Если ВСЁ из истории клиента уже в сегодняшнем заказе — ответь:
  «История уже полностью покрыта сегодняшним заказом, оптимально оформи визит.»
  Не выдумывай новые услуги «потому что хочется что-то предложить».

Не используй markdown, кавычки, нумерацию — только обычный текст.\
"""


def _format_history_for_ai(history: list[dict], current_record: dict) -> str:
    """
    Готовит ОБЕЗЛИЧЕННЫЙ контекст для модели.

    AI хостится в США (OpenAI/Anthropic), и трансграничная передача ПД клиентов
    под 152-ФЗ требует согласия. Чтобы не передавать персональные данные
    наружу, убираем: имя, фамилию, телефон, точную дату рождения, имена
    мастеров. Оставляем только то, что НУЖНО для совета по апсейлу:
    профиль активности и предпочтений без идентификаторов.
    """
    client = current_record.get("client") or {}

    lines = ["# Профиль клиента (обезличенный)"]
    visits = (
        client.get("visits")
        or client.get("visits_count")
        or client.get("visit_count")
        or 0
    )
    lines.append(f"Всего визитов: {visits}")
    if client.get("spent"):
        lines.append(f"Потратил всего: {client['spent']} ₽")

    # ДР: показываем ТОЛЬКО факт «скоро др», без даты — не передаём
    # идентифицирующую информацию в AI.
    bday_raw = client.get("birth_date") or client.get("birthday")
    if bday_raw:
        try:
            bday = datetime.strptime(bday_raw[:10], "%Y-%m-%d").date()
            today = date.today()
            this_year_bday = bday.replace(year=today.year)
            if this_year_bday < today:
                this_year_bday = bday.replace(year=today.year + 1)
            days_until = (this_year_bday - today).days
            if 0 <= days_until <= 7:
                lines.append(f"⚠ День рождения в ближайшие {days_until} дней")
        except Exception:
            pass

    # 152-ФЗ: comment/important_notes — свободный текст из YClients, мастер мог
    # вписать туда ФИО/телефон; обезличиваем перед отправкой в LLM (OpenAI/Claude, США).
    if client.get("comment"):
        lines.append(f"Заметки о предпочтениях: {anonymizer.redact_pii(client['comment'])}")
    if client.get("important_notes"):
        lines.append(f"Важные пометки: {anonymizer.redact_pii(client['important_notes'])}")

    when_raw = current_record.get("date") or current_record.get("datetime") or ""
    services = current_record.get("services") or []

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Блок «ЗАКАЗАНО СЕГОДНЯ» — самое заметное место в инпуте.
    # AI на него реагирует лучше, чем на маленькую секцию «Текущая запись».
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    lines.append("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    lines.append("⚠️ ЗАКАЗАНО СЕГОДНЯ (НЕ ПРЕДЛАГАТЬ!)")
    lines.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    if isinstance(when_raw, str) and len(when_raw) >= 16:
        lines.append(f"Время визита: {when_raw[:16]}")
    if services:
        for s in services:
            price = s.get("cost") or s.get("price") or 0
            lines.append(f"  ✗ {s.get('title', '?')} — {price} ₽ (УЖЕ В ЗАКАЗЕ)")
    else:
        lines.append("  (услуги не указаны)")

    lines.append("\n# История посещений (предлагай только отсюда, и только то, чего НЕТ в сегодняшнем заказе)")
    if not history:
        lines.append("(нет данных — клиент новый)")
    else:
        for visit in history[:10]:
            dt = visit.get("date") or visit.get("datetime") or "?"
            dt_short = dt[:10] if isinstance(dt, str) and len(dt) >= 10 else dt
            visit_services = visit.get("services") or []
            services_text = ", ".join(
                s.get("title", "?") for s in visit_services
            ) or "?"
            cost = sum((s.get("cost") or 0) for s in visit_services)
            lines.append(f"  {dt_short}: {services_text} — {cost} ₽")

    return "\n".join(lines)


# Ключевые слова услуг, которые часто появляются и могут быть в текущем
# заказе. Используются для пост-проверки: если AI предложил «моделирование»,
# а в заказе уже есть моделирование — это галлюцинация, выбрасываем совет.
_SERVICE_KEYWORDS = [
    ("моделирование бороды", ["моделирование", "моделировать", "оформ\\w* бород"]),
    ("окантовка бороды",     ["окантовк\\w*", "окантовать"]),
    ("тонирование",          ["тонирован\\w*", "тонировать"]),
    ("камуфляж",             ["камуфляж\\w*"]),
    ("гладкое бритье",       ["гладк\\w+ брить?", "побрить"]),
    ("бритье головы",        ["бритьё голов\\w*", "побрить голов"]),
    ("воск",                 ["воск\\w*", "восков\\w+"]),
    ("стрижка машинкой",     ["машинк\\w*"]),
    ("укладка",              ["уклад\\w*"]),
]


# Вложенные услуги: если в заказе ключ-услуга, то перечисленные «включённые»
# уже фактически делаются — отдельно предлагать их нельзя. Защёлка ловит
# попытки AI это нарушить.
_IMPLIED_BY_SERVICE = {
    # Если в заказе есть это (по паттерну) → нельзя предлагать эти услуги
    "стрижк":             ["окантовк", "мыть", "укладк", "уклад"],
    "фейд":               ["окантовк"],
    "машинк":             ["окантовк"],
    "моделирование бород": ["окантовк бород", "окантовк", "оформ\\w* контур", "оформ\\w* бород"],
}

_OFFER_VERBS = r"(предлож\w*|освеж\w*|попробу\w*|сделай|сделать|оформ\w+|можно\s+сделать|надо\s+сделать|можно\s+предложить|стоит\s+предложить|подровн\w*)"


def _detect_duplicate_recommendation(advice: str, current_services: list[dict]) -> str | None:
    """
    Проверяет, не предложил ли AI:
      • услугу, которая уже явно в текущем заказе
      • услугу, которая неявно включена в одну из заказанных
        (например, «окантовка» при заказанных «стрижке» или «моделировании»)
    Возвращает имя «провисшей» услуги или None.
    """
    if not advice or not current_services:
        return None
    advice_low = advice.lower()
    today_titles = " ".join((s.get("title") or "").lower() for s in current_services)

    # 1. Явные совпадения — услуга в сегодняшнем заказе И в совете
    for canonical, patterns in _SERVICE_KEYWORDS:
        in_today = any(_re.search(p, today_titles, _re.IGNORECASE) for p in patterns)
        if not in_today:
            continue
        for p in patterns:
            if _re.search(
                rf"{_OFFER_VERBS}\W{{1,30}}{p}",
                advice_low,
                _re.IGNORECASE,
            ):
                return canonical
            if _re.search(
                rf"{p}\W{{1,30}}(можно\s+предложить|стоит\s+предложить)",
                advice_low,
                _re.IGNORECASE,
            ):
                return canonical

    # 2. Неявные вложенные услуги — если в заказе ключ-услуга, проверяем,
    # не советует ли AI вложенные («стрижка» + «окантовка», «моделирование» + «окантовка»)
    for parent_key, implied_patterns in _IMPLIED_BY_SERVICE.items():
        if not _re.search(parent_key, today_titles, _re.IGNORECASE):
            continue
        for implied in implied_patterns:
            if _re.search(
                rf"{_OFFER_VERBS}\W{{1,30}}{implied}",
                advice_low,
                _re.IGNORECASE,
            ):
                return f"{implied} (уже входит в '{parent_key}')"

    return None


# ── Backend: Claude Haiku ─────────────────────────────────────────────

_claude_client: anthropic.AsyncAnthropic | None = None


def _get_claude_client() -> anthropic.AsyncAnthropic:
    global _claude_client
    if _claude_client is None:
        kwargs = {"api_key": CLAUDE_API_KEY}
        if PROXY_URL:
            kwargs["http_client"] = httpx.AsyncClient(proxy=PROXY_URL, timeout=30.0)
        _claude_client = anthropic.AsyncAnthropic(**kwargs)
    return _claude_client


async def _call_claude(prompt: str) -> str:
    """Возвращает текст совета от Claude Haiku."""
    client = _get_claude_client()
    response = await client.messages.create(
        model=MASTERS_CLAUDE_MODEL,
        max_tokens=200,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    ai_billing.log_anthropic_usage("masters_advice", MASTERS_CLAUDE_MODEL, response)
    for block in response.content:
        if getattr(block, "type", None) == "text":
            return block.text.strip()
    return ""


# ── Backend: OpenAI ───────────────────────────────────────────────────

async def _call_openai(prompt: str) -> str:
    """Возвращает текст совета от OpenAI. Используем raw HTTP — без openai-sdk."""
    body = {
        "model": MASTERS_OPENAI_MODEL,
        "max_completion_tokens": 200,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
    }
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    timeout_cfg = httpx.Timeout(30.0)
    kwargs = {"timeout": timeout_cfg}
    if PROXY_URL:
        kwargs["proxy"] = PROXY_URL

    async with httpx.AsyncClient(**kwargs) as client:
        r = await client.post(
            "https://api.openai.com/v1/chat/completions",
            json=body,
            headers=headers,
        )
        r.raise_for_status()
        data = r.json()
        ai_billing.log_openai_usage("masters_advice", MASTERS_OPENAI_MODEL, data)
        return (data["choices"][0]["message"]["content"] or "").strip()


# ── Публичный API ─────────────────────────────────────────────────────

# Защёлка от утечки имени клиента в советы AI.
# Если модель всё-таки решит обратиться по имени — поймаем шаблоны.
import re as _re

# Имена и обращения, с которых AI может начать ответ. Покрываем основные
# мужские имена + их популярные сокращения, плюс обращения вроде
# «клиент», «уважаемый клиент», «гость».
_NAME_TOKEN = (
    r"(?:"
    r"дима|димы|диму|димой|димон\w*|"
    r"дмитри[ийюя]|"
    r"иван\w*|ваня|ванек|"
    r"игор[ьею]|"
    r"серг[еи]й|серёг\w*|"
    r"александр\w*|сашок|сан[яья]|шурик|"
    r"антон\w*|тошик|"
    r"максим\w*|макс|максон|"
    r"иль[яюе]|илю\w+|"
    r"стас\w*|"
    r"павел|павла|павлу|паш[аеи]|"
    r"олег\w*|"
    r"кирилл\w*|"
    r"михаил\w*|миш[аеи]|"
    r"никола[йяе]\w*|колян|"
    r"роман\w*|ром[аеи]|"
    r"артём\w*|артем\w*|"
    r"андре[йя]\w*|андрюх\w*|"
    r"денис\w*|"
    r"вячеслав\w*|слав[аеи]|"
    r"владимир\w*|влад\w*|"
    r"константин\w*|кост[яеи]|"
    r"евгени[йя]\w*|жен[яеи]|"
    r"виктор\w*|вит[яеи]|"
    r"юри[йя]\w*|юр[аеи]|"
    r"георги[йя]\w*|жор[аеи]|"
    r"антон\w*|"
    r"матвей|"
    r"клиент\w*|гост[ьяеию]\w*|друг|дружище|"
    r"уважаем\w+(?:\s+(?:клиент\w*|гост[ьяеию]\w*))?"
    r")"
)

# 1. Обращение в начале строки: «Дима, ...» / «Уважаемый клиент, ...»
_OPENER_RE = _re.compile(
    rf"^{_NAME_TOKEN}\s*[,.:!]\s*",
    _re.IGNORECASE,
)

# 2. То же, но в середине после знака препинания: «..., Дима, освежи...»
_INLINE_RE = _re.compile(
    rf"([,.!?:]\s+){_NAME_TOKEN}\s*[,!]\s*",
    _re.IGNORECASE,
)


def _scrub_personal_data(text: str) -> str:
    """
    Постфильтр: убирает обращения по имени из совета AI.
    Многоуровневый — снимает имена в начале и внутри строки.
    """
    if not text:
        return text
    cleaned = _OPENER_RE.sub("", text).lstrip()
    cleaned = _INLINE_RE.sub(r"\1", cleaned)
    # Первая буква снова большая, если её зацепили
    if cleaned and cleaned[0].islower():
        cleaned = cleaned[0].upper() + cleaned[1:]
    return cleaned


async def generate_upsell_advice(
    history: list[dict],
    current_record: dict,
) -> tuple[str | None, str]:
    """
    Главная точка входа. Возвращает (advice_text, ai_provider).
    advice_text=None если AI лёг или вернул мусор.
    ai_provider = "claude" / "openai" / "fallback".
    """
    provider = get_current_provider()
    if provider not in SUPPORTED_PROVIDERS:
        return None, 'unavailable'
    prompt = _format_history_for_ai(history, current_record)

    try:
        if provider == "openai":
            advice = await asyncio.wait_for(
                _call_openai(prompt), timeout=MASTERS_AI_TIMEOUT
            )
        else:
            advice = await asyncio.wait_for(
                _call_claude(prompt), timeout=MASTERS_AI_TIMEOUT
            )
    except asyncio.TimeoutError:
        logger.warning(f"AI ({provider}) превысил таймаут {MASTERS_AI_TIMEOUT}s")
        return None, "fallback"
    except Exception as e:
        logger.error(f"AI ({provider}) ошибка: {e}")
        return None, "fallback"

    advice = (advice or "").strip()
    if not advice or len(advice) < 10:
        return None, "fallback"

    # Защёлка от утечки имени, на случай если промпт-инструкции не сработали
    before = advice
    advice = _scrub_personal_data(advice)
    if advice != before:
        logger.info(f"AI выдал имя клиента — почищено защёлкой. Было: {before[:80]!r}")

    # Защёлка от галлюцинации «предложи то, что уже в заказе»
    current_services = current_record.get("services") or []
    dup = _detect_duplicate_recommendation(advice, current_services)
    if dup:
        logger.warning(
            f"AI ({provider}) предложил услугу '{dup}', которая УЖЕ в заказе "
            f"— возвращаем fallback. Совет был: {advice[:120]!r}"
        )
        return None, "fallback"

    # На случай если модель нагенерила лишнего — подрезаем до 400 символов,
    # чтобы сообщение не выглядело простыней.
    if len(advice) > 400:
        advice = advice[:400].rsplit(" ", 1)[0] + "…"

    return advice, provider


# ─────────────────────────────────────────────────────────────────────────
# Денежная мотивация мастеру: КОНКРЕТНЫЕ цифры (обычно / можешь / в мес / в год).
# Считаем ДЕТЕРМИНИРОВАННО (не доверяем арифметику LLM — с деньгами это опасно).
# Идея (по ТЗ Стаса 2026-07-06): человек мотивируется цифрами и «жадностью» —
# покажи, сколько он берёт обычно и сколько мог бы, + проекция на месяц и год.
# ─────────────────────────────────────────────────────────────────────────

_MP_ADDON_KW = ("бород", "тонирован", "окантов", "гладкое бритье", "spa", "спа",
                "массаж", "патчи", "эпиляц", "скраб", "маск", "уход за кож",
                "камуфляж", "воск", "восков")
_MP_PRIO_KW = ("бород", "тонирован")
_MP_MAIN_KW = ("стрижка", "фейд", "бритье головы", "детск")


def _mp_visit_gross(visit: dict) -> int:
    return sum(int(s.get("cost") or 0)
               for s in (visit.get("services") or []) if isinstance(s, dict))


def _mp_parse_date(s):
    try:
        return datetime.strptime(str(s)[:10], "%Y-%m-%d").date()
    except Exception:
        return None


def _mp_service_key(title: str) -> str:
    return " ".join(str(title or "").strip().lower().replace("ё", "е").split())


def _mp_service_price(service: dict) -> int:
    for key in ("price_min", "cost", "price", "price_max", "first_cost"):
        try:
            value = round(float(service.get(key) or 0))
        except (TypeError, ValueError):
            value = 0
        if value > 0:
            return value
    return 0


def _mp_current_blocks_addon(addon_title: str, current_titles: set[str]) -> bool:
    """True, если услуга уже заказана или неявно входит в текущую услугу."""
    addon_key = _mp_service_key(addon_title)
    today = " ".join(sorted(_mp_service_key(title) for title in current_titles if title))
    if not addon_key:
        return True
    if addon_key in current_titles:
        return True
    if any(addon_key == title or addon_key in title or title in addon_key
           for title in current_titles if len(title) >= 5):
        return True

    # Одинаковая каноническая услуга с чуть разным названием.
    for _canonical, patterns in _SERVICE_KEYWORDS:
        if any(_re.search(pattern, addon_key, _re.IGNORECASE) for pattern in patterns):
            if any(_re.search(pattern, today, _re.IGNORECASE) for pattern in patterns):
                return True

    # Например, окантовка уже входит в заказанную стрижку.
    for parent_key, implied_patterns in _IMPLIED_BY_SERVICE.items():
        if not _re.search(parent_key, today, _re.IGNORECASE):
            continue
        if any(_re.search(pattern, addon_key, _re.IGNORECASE)
               for pattern in implied_patterns):
            return True
    return False


def historical_addon_opportunity(
    history: list[dict],
    current_record: dict,
    service_catalog: list[dict] | None = None,
) -> dict | None:
    """Лучшая допуслуга, которую этот клиент действительно покупал раньше.

    Каталог используется только для актуализации цены уже найденной исторической
    услуги. Выбрать из каталога услугу, которой нет в истории клиента, нельзя.
    """
    current_titles = {
        _mp_service_key(service.get("title"))
        for service in (current_record.get("services") or [])
        if isinstance(service, dict) and service.get("title")
    }
    catalog_prices = {}
    catalog_titles = {}
    for service in (service_catalog or []):
        if not isinstance(service, dict):
            continue
        title = str(service.get("title") or "").strip()
        key = _mp_service_key(title)
        if not key:
            continue
        price = _mp_service_price(service)
        if price > 0:
            catalog_prices[key] = price
        catalog_titles[key] = title

    grouped: dict[str, dict] = {}
    for visit in (history or []):
        if not isinstance(visit, dict):
            continue
        visit_date = str(visit.get("date") or visit.get("datetime") or "")[:10]
        for service in (visit.get("services") or []):
            if not isinstance(service, dict):
                continue
            title = str(service.get("title") or "").strip()
            key = _mp_service_key(title)
            if not key or any(main in key for main in _MP_MAIN_KW):
                continue
            if not any(addon in key for addon in _MP_ADDON_KW):
                continue
            if _mp_current_blocks_addon(key, current_titles):
                continue
            row = grouped.setdefault(key, {
                "key": key,
                "title": title,
                "times_bought": 0,
                "last_date": "",
                "last_price_rub": 0,
            })
            row["times_bought"] += 1
            if visit_date >= row["last_date"]:
                row["last_date"] = visit_date
                row["title"] = title
                row["last_price_rub"] = _mp_service_price(service)

    candidates = []
    for key, row in grouped.items():
        price = catalog_prices.get(key) or row.get("last_price_rub") or 0
        if price <= 0:
            continue
        candidates.append({
            **row,
            "title": catalog_titles.get(key) or row.get("title") or "Дополнительная услуга",
            "price_rub": price,
            "historical_only": True,
        })
    if not candidates:
        return None
    candidates.sort(
        key=lambda row: (
            int(row.get("times_bought") or 0),
            str(row.get("last_date") or ""),
            1 if any(key in _mp_service_key(row.get("title")) for key in _MP_PRIO_KW) else 0,
            int(row.get("price_rub") or 0),
        ),
        reverse=True,
    )
    return candidates[0]


def _mp_service_catalog(staff_id: int) -> list[dict]:
    try:
        from claude_ai import yclients as _yc
        return _yc.get_services(staff_id) or _yc.get_services() or []
    except Exception as e:
        logger.error(f"money_pitch catalog fetch: {e}")
        return []


def _mp_freq_word(vpm: float) -> str:
    n = round(vpm)
    if vpm < 0.85:
        return "примерно раз в 5–6 недель"
    if n <= 1:
        return "примерно раз в месяц"
    return f"~{n} раза в месяц"


def money_pitch(staff_id: int, history: list[dict], current_record: dict) -> tuple[str, str]:
    """C8: legacy scorer retired; no qualified canonical tenant evidence here."""
    return "", ""
