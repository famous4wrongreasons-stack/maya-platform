"""
Учёт расхода токенов на ИИ + контроль бюджета.

Каждый вызов Claude / OpenAI логируется в таблицу `ai_usage_log`. На основе
лога считается реальный $-расход за период — команда /ai_cost у админов.

Дополнительно: AI-стилист отдельно от Антона ограничивается месячным
бюджетом (настройка `ai_stylist_monthly_budget_usd`). Если в текущем
календарном месяце он превышен — handle_photo откажет с понятным
сообщением, а основная запись через Антона при этом продолжает работать.

Цены актуальны на 2026-05-27. Меняются — правим тут.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

import config
import database

logger = logging.getLogger(__name__)

# Цены $/1M токенов. cache_input — стоимость чтения из кеша (Anthropic):
# 90% дешевле обычного input. cache_write — на 25% дороже (записываем впрок).
MODEL_PRICES: dict[str, dict[str, float]] = {
    "claude-sonnet-4-5-20250929": {
        "input": 3.00,
        "cache_read": 0.30,
        "cache_write": 3.75,
        "output": 15.00,
    },
    "claude-haiku-4-5": {
        "input": 0.80,
        "cache_read": 0.08,
        "cache_write": 1.00,
        "output": 4.00,
    },
    "gpt-4o-mini": {
        # У OpenAI кэширование появилось, но в наших вызовах через raw HTTP
        # без `prompt_cache_key` оно не активируется — считаем как обычный input.
        "input": 0.15,
        "cache_read": 0.075,
        "cache_write": 0.15,
        "output": 0.60,
    },
    "gpt-5.1": {
        # CutMatch анализ лица (vision). $/1M токенов.
        "input": 1.25,
        "cache_read": 0.125,
        "cache_write": 1.25,
        "output": 10.00,
    },
    "gpt-5.5": {
        "input": 5.00,
        "cache_read": 0.50,
        "cache_write": 5.00,
        "output": 30.00,
    },
    "gpt-5.4": {
        "input": 2.50,
        "cache_read": 0.25,
        "cache_write": 2.50,
        "output": 15.00,
    },
    "gpt-5.4-mini": {
        "input": 0.75,
        "cache_read": 0.075,
        "cache_write": 0.75,
        "output": 4.50,
    },
    # ── Голос MAYA (realtime + STT + TTS). Ставки $/1M токенов ПРИБЛИЗИТЕЛЬНЫЕ —
    # точные числа сверь на platform.openai.com/pricing и поправь тут при необходимости.
    # Главное — реальные счётчики токенов берём из usage ответов (точные).
    "gpt-realtime": {
        "input": 4.00, "cache_read": 0.40, "output": 16.00,
        "audio_input": 32.00, "audio_output": 64.00,
    },
    "gpt-realtime-2": {
        "input": 4.00, "cache_read": 0.40, "output": 16.00,
        "audio_input": 32.00, "audio_output": 64.00,
    },
    "gpt-4o-transcribe": {          # STT (распознавание речи)
        "input": 2.50, "output": 10.00, "audio_input": 6.00,
    },
    "gpt-4o-mini-transcribe": {
        "input": 1.25, "output": 5.00, "audio_input": 3.00,
    },
    "gpt-4o-mini-tts": {            # TTS (озвучка): текст-вход + аудио-выход
        "input": 0.60, "audio_output": 12.00,
    },
}

# Курс рубль/$ для отображения в /ai_cost. Это просто индикатор —
# реальный курс Anthropic берёт по дню списания.
USD_TO_RUB_DISPLAY = 92.0


def server_cost_rub_for_period(days: int) -> tuple[int, dict]:
    """Стоимость серверов за период (пропорционально месяцу = 30 дней).
    Возвращает (итог_₽, разбивка {название: ₽})."""
    monthly = getattr(config, "SERVER_COSTS_RUB", {}) or {}
    factor = max(days, 0) / 30.0
    breakdown = {name: round(rub * factor) for name, rub in monthly.items()}
    return round(sum(breakdown.values())), breakdown


def log_fal_image(user_id: int | None = None):
    """Одна успешная генерация fal.ai (cutmatch) = 1 изображение по фикс. цене."""
    cost = float(getattr(config, "FAL_COST_PER_IMAGE_USD", 0.15))
    try:
        database.log_ai_usage(
            feature="cutmatch", model="fal-ai/image",
            input_tokens=0, output_tokens=0, cost_usd=cost, user_id=user_id,
        )
    except Exception as e:
        logger.warning("log_fal_image: %s", e)


def build_cost_data(days: int = 30) -> dict:
    """Структурированная сводка расхода за период — для веб-панели и /ai_cost.
    AI считается в $, серверы в ₽; итог сводим в ₽."""
    since = (datetime.now() - timedelta(days=days)).isoformat()
    ai_usd = database.sum_ai_usage(since=since)
    ai_rub = round(ai_usd * USD_TO_RUB_DISPLAY)
    # Серверы — фиксированная МЕСЯЧНАЯ плата (платим одинаково хоть на 2-й, хоть
    # на 30-й день месяца). Не дробим по дням периода — показываем за месяц.
    servers_rub, servers_breakdown = server_cost_rub_for_period(30)
    return {
        "days": days,
        "ai_usd": round(ai_usd, 2),
        "ai_rub": ai_rub,
        "by_feature": database.aggregate_ai_usage_by_feature(since=since),
        "servers_rub": servers_rub,
        "servers_breakdown": servers_breakdown,
        "total_rub": ai_rub + servers_rub,
    }


def calculate_cost_usd(model: str, input_tokens: int, output_tokens: int,
                       cache_read_tokens: int = 0, cache_write_tokens: int = 0,
                       audio_input_tokens: int = 0, audio_output_tokens: int = 0) -> float:
    """
    Считает примерную стоимость одного запроса в долларах.
    Поддерживает аудио-токены (realtime/STT/TTS) — отдельные ставки audio_input/
    audio_output. Если модель неизвестна — вернёт 0.0 (лучше недо-учёт).
    """
    prices = MODEL_PRICES.get(model)
    if not prices:
        logger.warning(f"ai_billing: неизвестная модель {model!r}, цену не считаем")
        return 0.0
    cost = (
        (input_tokens / 1_000_000) * prices.get("input", 0.0)
        + (cache_read_tokens / 1_000_000) * prices.get("cache_read", 0.0)
        + (cache_write_tokens / 1_000_000) * prices.get("cache_write", 0.0)
        + (output_tokens / 1_000_000) * prices.get("output", 0.0)
        + (audio_input_tokens / 1_000_000) * prices.get("audio_input", 0.0)
        + (audio_output_tokens / 1_000_000) * prices.get("audio_output", 0.0)
    )
    return round(cost, 6)


def log_anthropic_usage(feature: str, model: str, response, user_id: int | None = None):
    """
    Извлекает usage из Anthropic-response и логирует. Безопасно — никогда не
    кидает наружу: если что-то не считается, просто запишем нули.
    """
    try:
        u = response.usage
        input_tokens = getattr(u, "input_tokens", 0) or 0
        output_tokens = getattr(u, "output_tokens", 0) or 0
        cache_read = getattr(u, "cache_read_input_tokens", 0) or 0
        cache_write = getattr(u, "cache_creation_input_tokens", 0) or 0
        cost = calculate_cost_usd(
            model, input_tokens, output_tokens, cache_read, cache_write
        )
        database.log_ai_usage(
            feature=feature, model=model,
            input_tokens=input_tokens, output_tokens=output_tokens,
            cache_read_tokens=cache_read, cache_write_tokens=cache_write,
            cost_usd=cost, user_id=user_id,
        )
    except Exception as e:
        logger.error(f"ai_billing: не записал usage для {feature}/{model}: {e}")


def log_openai_usage(feature: str, model: str, response_json: dict, user_id: int | None = None):
    """То же самое для ответа OpenAI Chat Completions (JSON через httpx)."""
    try:
        u = response_json.get("usage") or {}
        input_tokens = int(u.get("prompt_tokens", u.get("input_tokens", 0)) or 0)
        output_tokens = int(u.get("completion_tokens", u.get("output_tokens", 0)) or 0)
        # У GPT-4o-mini в новых ответах есть prompt_tokens_details.cached_tokens
        cache_read = int(
            (u.get("prompt_tokens_details") or {}).get("cached_tokens", 0)
            or (u.get("input_token_details") or {}).get("cached_tokens", 0)
            or 0
        )
        cost = calculate_cost_usd(
            model, input_tokens - cache_read, output_tokens, cache_read, 0
        )
        database.log_ai_usage(
            feature=feature, model=model,
            input_tokens=input_tokens - cache_read, output_tokens=output_tokens,
            cache_read_tokens=cache_read, cache_write_tokens=0,
            cost_usd=cost, user_id=user_id,
        )
    except Exception as e:
        logger.error(f"ai_billing: не записал usage OpenAI для {feature}/{model}: {e}")


def log_audio_usage(feature: str, model: str, usage: dict, user_id: int | None = None):
    """Учёт realtime/STT-расхода из OpenAI-usage с РАЗБИВКОЙ текст/аудио-токены.
    Структура GA: {input_tokens, output_tokens, input_token_details:{text_tokens,
    audio_tokens, cached_tokens}, output_token_details:{text_tokens, audio_tokens}}."""
    try:
        u = usage or {}
        it = u.get("input_token_details") or {}
        ot = u.get("output_token_details") or {}
        in_text = int(it.get("text_tokens", 0) or 0)
        in_audio = int(it.get("audio_tokens", 0) or 0)
        cached = int(it.get("cached_tokens", 0) or 0)
        out_text = int(ot.get("text_tokens", 0) or 0)
        out_audio = int(ot.get("audio_tokens", 0) or 0)
        # если детализации нет — пусть весь input/output пойдёт как текст
        if not (in_text or in_audio):
            in_text = int(u.get("input_tokens", 0) or 0)
        if not (out_text or out_audio):
            out_text = int(u.get("output_tokens", 0) or 0)
        cost = calculate_cost_usd(
            model, max(0, in_text - cached), out_text,
            cache_read_tokens=cached, audio_input_tokens=in_audio, audio_output_tokens=out_audio,
        )
        database.log_ai_usage(
            feature=feature, model=model,
            input_tokens=in_text + in_audio, output_tokens=out_text + out_audio,
            cache_read_tokens=cached, cache_write_tokens=0,
            cost_usd=cost, user_id=user_id,
        )
    except Exception as e:
        logger.error(f"ai_billing: не записал audio-usage {feature}/{model}: {e}")


def log_tts_usage(model: str, char_count: int, audio_seconds: float = 0.0,
                  user_id: int | None = None):
    """Учёт TTS (озвучка) — usage в теле не приходит, оцениваем по символам входа
    (≈4 симв/токен) и длительности аудио (≈ строки → токены). Приблизительно."""
    try:
        in_text = max(0, int(char_count / 4))
        # грубая оценка аудио-выхода: ~ длительность речи; если неизвестна — по символам
        out_audio = int(audio_seconds * 50) if audio_seconds else int(char_count / 4)
        cost = calculate_cost_usd(model, in_text, 0, audio_output_tokens=out_audio)
        database.log_ai_usage(
            feature="maya_voice_tts", model=model,
            input_tokens=in_text, output_tokens=out_audio,
            cache_read_tokens=0, cache_write_tokens=0, cost_usd=cost, user_id=user_id,
        )
    except Exception as e:
        logger.error(f"ai_billing: не записал TTS-usage {model}: {e}")


def _month_start_iso() -> str:
    """ISO-строка начала текущего календарного месяца (00:00 1-го числа)."""
    now = datetime.now()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()


# ─── Сводка для /ai_cost ─────────────────────────────────────────────────

def build_cost_report() -> str:
    """
    Сводный отчёт по расходу за 7 дней, 30 дней, текущий месяц + по фичам.
    Возвращает готовый Markdown-текст для отправки админу.
    """
    now = datetime.now()
    since_7d = (now - timedelta(days=7)).isoformat()
    since_30d = (now - timedelta(days=30)).isoformat()
    month_start = _month_start_iso()

    total_7d = database.sum_ai_usage(since=since_7d)
    total_30d = database.sum_ai_usage(since=since_30d)
    total_month = database.sum_ai_usage(since=month_start)
    by_feature = database.aggregate_ai_usage_by_feature(since=since_30d)

    def _fmt(usd: float) -> str:
        rub = usd * USD_TO_RUB_DISPLAY
        return f"${usd:.2f} ≈ {rub:.0f}₽"

    lines = [
        "💰 *Расход (ИИ + серверы)*",
        "",
        "*ИИ за период:*",
        f"• За 7 дней: {_fmt(total_7d)}",
        f"• За 30 дней: {_fmt(total_30d)}",
        f"• С 1-го числа этого месяца: {_fmt(total_month)}",
        "",
    ]
    if by_feature:
        lines.append("*По функциям (30 дней):*")
        for row in by_feature:
            feat = row.get("feature") or "?"
            spent = row.get("cost_usd") or 0
            calls = row.get("calls") or 0
            label = {
                "anton_chat": "🧑‍💼 Антон (чат с клиентами)",
                "masters_advice": "📨 Советы мастерам",
                "ai_stylist": "🎨 AI-стилист (fal.ai)",
                "maya_voice": "🎙 Голос MAYA (realtime)",
                "maya_voice_stt": "🎤 Распознавание речи",
                "maya_voice_tts": "🔊 Озвучка (TTS)",
            }.get(feat, feat)
            lines.append(f"  • {label}: {_fmt(spent)} ({calls} вызов(а))")

    # Серверы (фиксированная месячная стоимость; за 30 дней ≈ месяц)
    srv_total, srv_breakdown = server_cost_rub_for_period(30)
    if srv_total:
        lines.append("")
        lines.append("🖥 *Серверы (30 дней):*")
        for name, rub in srv_breakdown.items():
            lines.append(f"  • {name}: {rub}₽")
        lines.append(f"  Итого серверы: *{srv_total}₽*")

    # Общий итог за 30 дней (ИИ в ₽ + серверы в ₽)
    ai_rub_30 = round(total_30d * USD_TO_RUB_DISPLAY)
    lines.append("")
    lines.append(f"💵 *ИТОГО за 30 дней: ≈ {ai_rub_30 + srv_total}₽*")
    lines.append(f"   _(ИИ {ai_rub_30}₽ + серверы {srv_total}₽)_")
    return "\n".join(lines)
