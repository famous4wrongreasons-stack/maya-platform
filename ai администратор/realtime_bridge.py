"""
realtime_bridge.py — голосовой мост «как у ChatGPT» для MAYA.

Архитектура (мозг = OpenAI tool-loop, голос = OpenAI realtime):
  Браузер(PWA) ──wss──> наш VPS ──proxy──> OpenAI realtime
  • realtime = уши (быстрый STT) + рот (живая потоковая озвучка без швов);
  • claude_ai.get_ai_response = совместимый OpenAI-backed мозг: инструменты, роли, память, 152-ФЗ.

Поток одного хода:
  1. клиент шлёт PCM16-чанки микрофона (binary) → realtime input_audio_buffer;
  2. server-VAD ловит конец речи → транскрипт (conversation.item.input_audio_transcription.completed);
  3. транскрипт → OpenAI tool-loop (в потоке-executor, чтобы не блокировать сокет);
  4. ответ мозга → realtime response.create «произнеси дословно» → output_audio.delta;
  5. аудио-чанки (binary PCM16) летят клиенту, тот играет без швов.

Barge-in сейчас выключен ради стабильности: когда MAYA говорит, входной звук и события
speech_started игнорируются, чтобы эхо динамика/шум не обрывали длинный ответ.

GA-схема событий проверена на VPS (session.type:"realtime", вложенный audio.*,
output_audio.delta, input_audio_transcription.completed; beta-заголовок НЕ слать).
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import re
import time

import aiohttp
from aiohttp import web

import ai_billing
import anonymizer
from memory import load_conversations, save_conversations
from voice_guard import (
    CLARIFY_REPEAT_TEXT,
    is_hard_noise,
    looks_like_self_echo,
    should_clarify_transcript,
)

try:
    import config as _cfg
except Exception:                       # pragma: no cover
    _cfg = None

logger = logging.getLogger(__name__)
_CHAT_LOCKS: dict[int, asyncio.Lock] = {}

OPENAI_API_KEY = getattr(_cfg, "OPENAI_API_KEY", "") if _cfg else ""
PROXY_URL = (getattr(_cfg, "PROXY_URL", "") if _cfg else "") or None
RT_MODEL = getattr(_cfg, "REALTIME_MODEL", "gpt-realtime-2") if _cfg else "gpt-realtime-2"
RT_VOICE = getattr(_cfg, "REALTIME_VOICE", "marin") if _cfg else "marin"
RT_STT_MODEL = getattr(_cfg, "REALTIME_STT_MODEL", "gpt-4o-transcribe") if _cfg else "gpt-4o-transcribe"
# «medium» быстрее схватывает конец реплики и заметно уменьшает паузу перед ответом,
# но ещё не режет естественные микропаузы так агрессивно, как high.
RT_VAD_EAGERNESS = getattr(_cfg, "REALTIME_VAD_EAGERNESS", "medium") if _cfg else "medium"
# near_field = телефон у лица: давит дальний фон (ТВ/разговоры), оставляет близкий голос.
RT_NOISE_REDUCTION = getattr(_cfg, "REALTIME_NOISE_REDUCTION", "near_field") if _cfg else "near_field"

def _is_noise_transcript(tr: str) -> bool:
    """True, если транскрипт похож на выдуманный моделью шум/эхо словаря, а не на речь.

    Единый источник правды по шуму — voice_guard.is_hard_noise (тот же список
    галлюцинаций, что и в текстовом голосовом гварде), плюс generic-правила
    (нет букв, один короткий токен повторён 3+ раз)."""
    return is_hard_noise(tr)

# Подсказка для распознавания (transcription.prompt). ВАЖНО: держим КОРОТКОЙ и без
# списков-с-ярлыками. Раньше сюда вываливались «Частые термины: …», «Названия услуг: …»,
# «Имена мастеров: …» на 1100 символов — и модель на тишине/шуме зачитывала эти же
# ярлыки обратно как галлюцинацию (отсюда и половина шума в блок-листе). Короткая
# естественная фраза + только имена мастеров биасит распознавание ничуть не хуже,
# но почти не эхоится.
_STT_CACHE = {"text": "", "ts": 0.0}
_MASTER_NAMES_CACHE = {"names": (), "ts": 0.0}
_STT_PROMPT_BASE = "Разговор с администратором мужского барбершопа: запись, стрижка, борода, бритьё."


def _stt_prompt() -> str:
    """Короткий контекст для STT: тема разговора + имена мастеров (кэш 1 час)."""
    now = time.time()
    if _STT_CACHE["text"] and now - _STT_CACHE["ts"] < 3600:
        return _STT_CACHE["text"]
    txt = _STT_PROMPT_BASE
    try:
        from claude_ai import yclients as _yc
        masters = _yc.get_masters() or []
        first_names = []
        for m in masters:
            parts = (m.get("name") or "").strip().split()
            if parts:
                first_names.append(parts[0])
        uniq = list(dict.fromkeys(first_names))       # уникальные, порядок сохранён
        if uniq:
            txt += " Мастера: " + ", ".join(uniq) + "."
    except Exception as e:
        logger.error(f"_stt_prompt: {e}")
    txt = txt[:300]
    _STT_CACHE.update(text=txt, ts=now)
    return txt


def _known_master_names() -> tuple[str, ...]:
    """Live master names for filtering STT name-hallucinations from background noise."""
    now = time.time()
    names = _MASTER_NAMES_CACHE.get("names") or ()
    if names and now - float(_MASTER_NAMES_CACHE.get("ts") or 0) < 3600:
        return tuple(names)
    try:
        from claude_ai import yclients as _yc
        masters = _yc.get_masters() or []
        names = tuple(m.get("name", "") for m in masters if isinstance(m, dict) and m.get("name"))
    except Exception as e:
        logger.error(f"_known_master_names: {e}")
        names = ()
    _MASTER_NAMES_CACHE.update(names=names, ts=now)
    return tuple(names)

_OPENAI_RT_URL = f"wss://api.openai.com/v1/realtime?model={RT_MODEL}"


async def _audio_to_pcm24(audio: bytes) -> bytes | None:
    """Convert TTS audio to the PCM16/24kHz stream consumed by the realtime client."""
    if not audio:
        return None
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
        "-ac", "1", "-ar", "24000", "-f", "s16le", "pipe:1",
    ]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        out, _ = await proc.communicate(audio)
        if proc.returncode == 0 and out and len(out) > 400:
            return out
    except Exception as e:
        logger.error(f"RT external TTS decode: {e}")
    return None


def _external_tts_enabled() -> bool:
    """True when voice.py is configured for a non-OpenAI TTS provider such as Yandex."""
    try:
        import voice
        return voice.is_enabled() and voice._tts_provider() != "openai"
    except Exception:
        return False


def _knowledge_images_for_chat(chat_id: int, message: str, limit: int = 3) -> list[dict]:
    """Attach barber-book visuals to staff technical questions in realtime chat."""
    try:
        import database
        is_staff = bool(chat_id and (
            database.get_master_by_chat_id(int(chat_id)) or database.is_admin(int(chat_id))
        ))
        if not is_staff:
            return []
        import barber_knowledge
        if not barber_knowledge.looks_like_technical_query(message):
            return []
        return barber_knowledge.images_for(message, limit=limit)
    except Exception as e:
        logger.error(f"RT knowledge images: {e}")
        return []


def _chat_lock(chat_id: int) -> asyncio.Lock:
    """One serialized brain turn per user, even if the client opens two realtime sessions."""
    key = int(chat_id)
    lock = _CHAT_LOCKS.get(key)
    if lock is None:
        lock = asyncio.Lock()
        _CHAT_LOCKS[key] = lock
    return lock


def _spoken_hours(hours: list[str]) -> str:
    nums = [str(int(h)) for h in hours if str(h).isdigit()]
    if not nums:
        return ""
    if len(nums) == 1:
        return f"{nums[0]} часов"
    if len(nums) == 2:
        return f"{nums[0]} и {nums[1]} часов"
    return f"{', '.join(nums[:-1])} и {nums[-1]} часов"


def _naturalize_voice_reply(text: str) -> str:
    """Make generated text safer and more natural before TTS reads it aloud."""
    cleaned = (text or "").strip()
    if not cleaned:
        return ""

    cleaned = cleaned.replace("**", "").replace("__", "").replace("`", "")
    cleaned = re.sub(
        r"\b([01]?\d|2[0-3])\s+час(?:а|ов)?\s+([0-5]?\d)\s+минут(?:а|ы)?\b",
        lambda m: f"{int(m.group(1))}:{int(m.group(2)):02d}",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\b[Рр]овно\s+(?=\d{1,2}(?::00)?\b)", "", cleaned)
    def repl_free_slot(match: re.Match) -> str:
        return "Свободное время" if match.group(0)[:1].isupper() else "свободное время"

    cleaned = re.sub(
        r"\b[Сс]вободн(?:ый|ые|ого|ому|ым|ом)\s+слот(?:ы|а|ов|у|ом)?\b",
        repl_free_slot,
        cleaned,
    )

    hour_list_re = re.compile(
        r"\b(?:[01]?\d|2[0-3]):00"
        r"(?:\s*,\s*(?:[01]?\d|2[0-3]):00)+"
        r"(?:\s*(?:и|или)\s*(?:[01]?\d|2[0-3]):00)?"
    )

    def repl_list(match: re.Match) -> str:
        hours = re.findall(r"\b([01]?\d|2[0-3]):00\b", match.group(0))
        return _spoken_hours(hours) or match.group(0)

    cleaned = hour_list_re.sub(repl_list, cleaned)
    cleaned = re.sub(
        r"\b([01]?\d|2[0-3]):00\b",
        lambda m: f"{int(m.group(1))} часов",
        cleaned,
    )
    return re.sub(r"[ \t]{2,}", " ", cleaned).strip()


# Подача под озвучку (как в текстовом голосе): живо, словами, без markdown.
# База — общая для клиента и сотрудника (манера речи, женский род, анти-шум).
# Клиентский/сотруднический «хвост» добавляется отдельно — это и есть изоляция
# режимов: одна и та же Майя, но на клиентской странице ведёт себя как консьерж,
# а на странице сотрудника — как коллега-наставник.
_VOICE_NUDGE_BASE = (
    "\n\n[Это голосовой разговор. Отвечай живой разговорной речью — по делу, без воды, "
    "без markdown и сокращений (говори «среда», «рублей», «телефон»). Длинные списки не "
    "зачитывай целиком — назови главное. "
    "Ты ЖЕНЩИНА — о себе ТОЛЬКО в женском роде: «записала», «сделала», «поняла», "
    "«посмотрела», «готова» (не «записал/сделал/готов»). "
    "Сразу отвечай по сути того, что сказал собеседник. НЕ начинай ответ с приветствия и "
    "НЕ переспрашивай «привет, как дела» вместо ответа: если задан вопрос — отвечай на него; "
    "если собеседник только поздоровался (без вопроса) — коротко поздоровайся в ответ и "
    "спроси, чем можешь помочь. "
    "Время записи называй по-человечески: не говори «свободный слот» и «ровно»; "
    "списки окон группируй коротко, например «15, 16 и 17 часов свободны», "
    "а занятое время — «18 часов занято». "
    "ВАЖНО про распознавание: оно может ошибаться из-за шума (телевизор, посторонние "
    "голоса). Если фраза собеседника бессвязна, обрывочна, не по теме салона или похожа на "
    "случайный набор слов — НЕ придумывай ответ и НЕ угадывай смысл, а мягко переспроси: "
    "«Извините, не расслышала из-за шума — повторите, пожалуйста?». Если собеседник говорит, "
    "что ты его не так поняла или что он такого не говорил — не спорь и не настаивай, "
    "сразу извинись и переспроси.]"
)
# Клиентский кабинет: консьерж салона, без базы знаний по технике.
_VOICE_NUDGE_CLIENT = (
    _VOICE_NUDGE_BASE[:-1]
    + " Это клиентский кабинет MAYA: не используй базу знаний по технике стрижек, "
      "учебник барбера и схемы из книги. Отвечай только как администратор салона: "
      "про запись, услуги, мастеров, адрес, скидки, абонементы и сертификаты.]"
)
# Рабочий кабинет сотрудника: коллега по работе, НЕ клиентский консьерж.
# База знаний по технике/схемам стрижек УБРАНА (решение Стаса 2026-07-06) —
# про «как стричь» и схемы Майя не рассуждает.
_VOICE_NUDGE_STAFF = (
    _VOICE_NUDGE_BASE[:-1]
    + " Это РАБОЧИЙ кабинет сотрудника — общайся как коллега по работе, а НЕ как "
      "администратор для клиента. Помогай по работе: график и записи этого мастера, "
      "досье и история его клиентов, заработок и советы по допродажам. Про ТЕХНИКУ "
      "стрижек, схемы, «как стричь» — НЕ рассуждай, этого у тебя нет. НЕ веди себя как "
      "клиентский консьерж: не делай клиентский апсейл, не оформляй сертификаты и "
      "абонементы и не записывай «на стрижку», если сотрудник явно не просит это как про себя.]"
)
# Обратная совместимость: прежнее имя = клиентский режим.
_VOICE_NUDGE = _VOICE_NUDGE_CLIENT
# Клиент в голосе: без техники стрижек. Сотрудник: без клиентских продаж-инструментов.
CLIENT_CHAT_DISABLED_TOOLS = {"barber_knowledge"}
STAFF_CHAT_DISABLED_TOOLS = {
    "suggest_upsell", "start_gift_cert_purchase",
    "show_subscription_plans", "check_birthday_promo",
}


def is_enabled() -> bool:
    return bool(OPENAI_API_KEY) and bool(getattr(_cfg, "REALTIME_ENABLED", False))


def _session_config() -> dict:
    """GA-конфиг сессии: STT вкл, server-VAD без авто-ответа (отвечает tool-loop)."""
    return {"type": "session.update", "session": {
        "type": "realtime",
        "output_modalities": ["audio"],
        "instructions": ("Ты — MAYA, голос администратора барбершопа. Говори по-русски "
                         "естественно и спокойно, светлым женским голосом чуть выше среднего. "
                         "Без иностранного акцента, без театральности и без чрезмерной "
                         "эмоции. Темп средний, дикция чёткая, интонация тёплая и уверенная. "
                         "Озвучивай переданный текст дословно и не добавляй ничего от себя."),
        "audio": {
            "input": {
                "format": {"type": "audio/pcm", "rate": 24000},
                "noise_reduction": {"type": RT_NOISE_REDUCTION},   # давим фон (ТВ/разговоры)
                "transcription": {"model": RT_STT_MODEL, "language": "ru",
                                  "prompt": _stt_prompt()},
                # semantic_vad: конец реплики определяется по СМЫСЛУ/ИНТОНАЦИИ (моделью),
                # а не просто по тишине → не обрывает на паузах внутри фразы.
                # eagerness=medium — быстрее даёт ответ после конца фразы, сохраняя
                # нормальную устойчивость к коротким паузам внутри мысли.
                "turn_detection": {
                    "type": "semantic_vad",
                    "eagerness": RT_VAD_EAGERNESS,
                    "create_response": False,     # отвечает tool-loop, не realtime сам
                    "interrupt_response": False,
                },
            },
            "output": {
                "format": {"type": "audio/pcm", "rate": 24000},
                "voice": RT_VOICE,
                "speed": 1.0,
            },
        },
    }}


_STAFF_ROLES = {"master", "manager", "owner", "founder"}


async def run_session(ws_client: web.WebSocketResponse, chat_id: int,
                      mode: str = "client") -> None:
    """Главный цикл моста для одного авторизованного пользователя.

    mode — «режим страницы», с которой запущен голос: 'client' (клиентский
    кабинет) или 'staff' (рабочий кабинет сотрудника). Сотруднический режим
    выдаётся ТОЛЬКО если серверная роль реально сотрудническая — клиент не может
    получить staff-Майю, даже если фронт пришлёт mode='staff' (RBAC на месте).
    Изоляция: staff — коллега-наставник (база знаний вкл, клиентские продажи выкл),
    client — консьерж (техника выкл), и одно не подменяет другое."""
    loop = asyncio.get_event_loop()
    try:
        from claude_ai import _resolve_role as _rr
        _role = _rr(chat_id)
    except Exception:
        _role = "client"
    # Гейт по РЕЖИМУ СТРАНИЦЫ (кабинет): staff-Майя (база знаний/схемы/наставник)
    # только в кабинете сотрудника (mode='staff'); в клиентском кабинете — клиентская
    # Майя даже у сотрудника (клиент схем НЕ видит). Роль — серверная проверка сверху:
    # клиент staff-режим не получит, даже если фронт пришлёт mode='staff'.
    staff_mode = (str(mode or "").lower() == "staff") and (_role in _STAFF_ROLES)
    logger.info(f"RT session chat={chat_id} role={_role} mode={mode} staff_mode={staff_mode}")
    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}"}
    # send_lock: сериализует отправку ответов — ровно один говорящий за раз (без гонок).
    # response_done: «нет активного ответа» (set) / «ответ звучит» (clear). Ставится в
    #   pump_openai на response.done|error; say() ждёт его перед новым response.create.
    # answer_active: сейчас звучит РЕАЛЬНЫЙ ответ Claude (нужно для speaking_done/barge-in).
    # turn_speaking: уже отправили speaking_start в этом ходе.
    state = {"speaking": False, "thinking": False, "claude_task": None,
             "answer_active": False, "turn_speaking": False,
             "last_clarification_at": 0.0, "pending_transcript": None}
    send_lock = asyncio.Lock()
    response_done = asyncio.Event()
    response_done.set()

    try:
        async with aiohttp.ClientSession() as oa_sess:
            async with oa_sess.ws_connect(
                _OPENAI_RT_URL, headers=headers, proxy=PROXY_URL,
                heartbeat=20, max_msg_size=0,
            ) as ws_oa:
                await ws_oa.send_json(_session_config())

                async def say(text: str) -> None:
                    """Озвучить готовый текст OpenAI tool-loop дословно.

                    Анти-задвоение: общий send_lock + ожидание response_done (предыдущий
                    ответ доиграл/отменён) ПЕРЕД отправкой, и response_done.clear() прямо
                    в момент отправки (а не по приходу response.created, который идёт с
                    сетевым round-trip’ом) — два response.create физически не уйдут в
                    OpenAI внахлёст, и голос не задвоится."""
                    safe = (text or "").strip()
                    if not safe:
                        return
                    async with send_lock:
                        if not response_done.is_set():     # предыдущий ответ ещё звучит?
                            try:
                                await asyncio.wait_for(response_done.wait(), timeout=60)
                            except asyncio.TimeoutError:
                                logger.warning("RT say: response.done не пришёл — освобождаю слот")
                        response_done.clear()              # слот занят до конца TTS/Realtime
                        state["answer_active"] = True
                        state["turn_speaking"] = False
                        if _external_tts_enabled():
                            try:
                                import voice
                                audio = await voice.synthesize(safe, fmt="mp3")
                                pcm = await _audio_to_pcm24(audio or b"")
                                if pcm:
                                    state["speaking"] = True
                                    state["turn_speaking"] = True
                                    await ws_client.send_json({"type": "speaking_start"})
                                    chunk = 4800  # 100 ms of 24kHz PCM16 mono
                                    for i in range(0, len(pcm), chunk):
                                        if ws_client.closed:
                                            break
                                        await ws_client.send_bytes(pcm[i:i + chunk])
                                    state["speaking"] = False
                                    state["answer_active"] = False
                                    state["turn_speaking"] = False
                                    response_done.set()
                                    if not ws_client.closed:
                                        await ws_client.send_json({"type": "speaking_done"})
                                    return
                                logger.warning("RT external TTS returned no playable PCM")
                                if not getattr(voice, "openai_fallback_enabled", lambda: False)():
                                    state["speaking"] = False
                                    state["answer_active"] = False
                                    state["turn_speaking"] = False
                                    response_done.set()
                                    if not ws_client.closed:
                                        await ws_client.send_json({"type": "speaking_done"})
                                    return
                                logger.warning("RT external TTS fallback to OpenAI realtime voice")
                            except Exception as e:
                                logger.error(f"RT external TTS: {e}")
                                if not getattr(voice, "openai_fallback_enabled", lambda: False)():
                                    state["speaking"] = False
                                    state["answer_active"] = False
                                    state["turn_speaking"] = False
                                    response_done.set()
                                    if not ws_client.closed:
                                        await ws_client.send_json({"type": "speaking_done"})
                                    return
                        logger.info("🟢 RT answer.create")
                        try:
                            await ws_oa.send_json({"type": "response.create", "response": {
                                "output_modalities": ["audio"],
                                "instructions": f"Произнеси дословно, ничего не добавляя и не меняя: «{safe}»",
                            }})
                        except Exception as _e:
                            state["answer_active"] = False
                            response_done.set()           # отправка не удалась — слот свободен
                            logger.error(f"RT answer send: {_e}")

                async def think_and_reply(transcript: str) -> None:
                    """Транскрипт → OpenAI tool-loop (мозг) → озвучка ответа. В отдельной задаче."""
                    state["thinking"] = True
                    state["turn_speaking"] = False
                    try:
                        await ws_client.send_json({"type": "transcript", "text": transcript})
                        async with _chat_lock(chat_id):
                            # История общая с текстовым чатом/Telegram (memory по chat_id)
                            conversations = await loop.run_in_executor(None, load_conversations)
                            history = conversations.get(chat_id) or []
                            history.append({"role": "user", "content": anonymizer.redact_pii(transcript)})
                            if len(history) > 30:
                                history = history[-30:]
                            # Изоляция режимов: сотруднику — наставнический хвост и
                            # доступ к базе знаний; клиенту — консьерж без техники.
                            nudge = _VOICE_NUDGE_STAFF if staff_mode else _VOICE_NUDGE_CLIENT
                            disabled = STAFF_CHAT_DISABLED_TOOLS if staff_mode else CLIENT_CHAT_DISABLED_TOOLS
                            llm_history = history[:-1] + [{
                                "role": "user",
                                "content": history[-1]["content"] + nudge,
                            }]
                            # Tool-loop синхронный, гоним в executor, чтобы не вешать сокет.
                            from claude_ai import VOICE_CLAUDE_MODEL, get_ai_response
                            voice_model = None if _role == "founder" else VOICE_CLAUDE_MODEL
                            reply, *_ = await loop.run_in_executor(
                                None,
                                lambda: get_ai_response(
                                    llm_history,
                                    user_id=chat_id,
                                    model=voice_model,
                                    disabled_tools=disabled,
                                ),
                            )
                            reply = _naturalize_voice_reply(
                                reply or "Секунду, повторите, пожалуйста."
                            )
                            # База знаний по технике/схемам убрана из мозга Майи
                            # (решение Стаса 2026-07-06) — схемы не прикрепляем.
                            images = []
                            history.append({"role": "assistant", "content": reply})
                            conversations[chat_id] = history
                            payload = {"type": "reply_text", "text": reply}
                            if images:
                                payload["images"] = images
                            await ws_client.send_json(payload)
                            save_task = loop.run_in_executor(None, save_conversations, conversations)
                            try:
                                await say(reply)
                            finally:
                                await save_task
                    except Exception as e:
                        logger.error(f"realtime think_and_reply: {e}")
                        try:
                            await ws_client.send_json({"type": "error", "message": "ai_error"})
                        except Exception:
                            pass
                    finally:
                        state["thinking"] = False
                        # Речь, сказанная пока MAYA думала/говорила, не потеряна:
                        # сразу обрабатываем самый свежий отложенный транскрипт.
                        pend = state.get("pending_transcript")
                        state["pending_transcript"] = None
                        if pend and not ws_client.closed:
                            state["thinking"] = True
                            state["claude_task"] = asyncio.create_task(think_and_reply(pend))

                async def ask_repeat_for_unclear(transcript: str) -> None:
                    """Human clarification for likely noise/STT hallucination; do not save it."""
                    now = time.time()
                    if now - float(state.get("last_clarification_at") or 0) < 8:
                        logger.info(f"RT: unclear transcript suppressed: {transcript[:60]!r}")
                        return
                    state["last_clarification_at"] = now
                    logger.info(f"RT: unclear transcript -> clarification: {transcript[:60]!r}")
                    try:
                        await ws_client.send_json({"type": "reply_text", "text": CLARIFY_REPEAT_TEXT})
                    except Exception:
                        pass
                    await say(CLARIFY_REPEAT_TEXT)

                async def pump_client() -> None:
                    """Клиент → OpenAI: микрофонные PCM16-чанки + управление."""
                    async for msg in ws_client:
                        if msg.type == aiohttp.WSMsgType.BINARY:
                            # Пока MAYA говорит — НЕ принимаем аудио (это её же голос из
                            # динамика клиента). Серверный полудуплекс закрывает эхо-петлю
                            # даже в окне, пока клиент не успел заглушить микрофон.
                            if state["speaking"]:
                                continue
                            await ws_oa.send_json({
                                "type": "input_audio_buffer.append",
                                "audio": base64.b64encode(msg.data).decode("ascii"),
                            })
                        elif msg.type == aiohttp.WSMsgType.TEXT:
                            try:
                                ctl = json.loads(msg.data)
                            except Exception:
                                continue
                            if ctl.get("type") == "bye":
                                break
                        elif msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSING,
                                          aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                            break
                    try:
                        await ws_oa.close()
                    except Exception:
                        pass

                async def pump_openai() -> None:
                    """OpenAI → клиент: транскрипт, аудио-чанки ответа, события."""
                    async for msg in ws_oa:
                        if msg.type != aiohttp.WSMsgType.TEXT:
                            if msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED,
                                            aiohttp.WSMsgType.ERROR):
                                break
                            continue
                        ev = json.loads(msg.data)
                        et = ev.get("type", "")
                        if et.endswith("input_audio_transcription.completed"):
                            tr = (ev.get("transcript") or "").strip()
                            # На шуме/тишине модель ВЫДУМЫВАЕТ текст («галлюцинация») или
                            # возвращает эхо словаря — это не речь, отбрасываем, иначе MAYA
                            # отвечает на бред (и потом «спорит», т.к. это в её истории).
                            if not tr or _is_noise_transcript(tr):
                                if tr:
                                    logger.info(f"RT: отброшен шум/галлюцинация в транскрипте: {tr[:60]!r}")
                                continue
                            conversations = await loop.run_in_executor(None, load_conversations)
                            history = conversations.get(chat_id) or []
                            # Микрофон мог расшифровать хвост речи самой MAYA → не отвечаем
                            # сами себе, тихо игнорируем (без переспроса).
                            if looks_like_self_echo(tr, history):
                                logger.info(f"RT: отброшено эхо собственного голоса MAYA: {tr[:60]!r}")
                                continue
                            if should_clarify_transcript(tr, history, _known_master_names()):
                                # Пока MAYA обрабатывает прошлую фразу — не переспрашиваем,
                                # чтобы не перебивать её ответ; просто игнорируем неясное.
                                if not state["thinking"]:
                                    await ask_repeat_for_unclear(tr)
                                else:
                                    logger.info(f"RT: неясный транскрипт во время обработки, игнор: {tr[:60]!r}")
                                continue
                            if state["thinking"]:
                                # Не теряем внятную речь, сказанную пока MAYA думает/говорит:
                                # держим самый свежий транскрипт и обработаем его сразу после.
                                state["pending_transcript"] = tr
                                logger.info(f"RT: захвачен pending-транскрипт во время обработки: {tr[:60]!r}")
                            else:
                                state["thinking"] = True
                                state["claude_task"] = asyncio.create_task(think_and_reply(tr))
                        elif et == "response.created":
                            logger.info("RT ← response.created")
                        elif et == "input_audio_buffer.speech_started":
                            # Пока MAYA отвечает, это чаще всего эхо её же голоса или шум.
                            # Раньше здесь был response.cancel, из-за чего длинные ответы
                            # обрывались на середине. Для записи важнее договорить фразу.
                            if state["speaking"] or state["answer_active"]:
                                logger.info("RT: ignored speech_started during active answer")
                                continue
                        elif et.endswith("output_audio.delta"):
                            d = ev.get("delta")
                            if d:
                                state["speaking"] = True
                                if not state["turn_speaking"]:
                                    state["turn_speaking"] = True
                                    await ws_client.send_json({"type": "speaking_start"})
                                await ws_client.send_bytes(base64.b64decode(d))
                        elif et == "response.done":
                            _st = (ev.get("response", {}) or {}).get("status")
                            logger.info(f"RT ← response.done status={_st} answer_active={state['answer_active']}")
                            # учёт стоимости MAYA (realtime: STT-аудио + озвучка) в ИИ-бюджет
                            try:
                                ai_billing.log_audio_usage(
                                    "maya_voice", RT_MODEL,
                                    (ev.get("response", {}) or {}).get("usage") or {}, chat_id)
                            except Exception:
                                pass
                            response_done.set()        # слот свободен — можно слать следующий ответ
                            state["speaking"] = False
                            if state["answer_active"]:
                                state["answer_active"] = False
                                state["turn_speaking"] = False
                                await ws_client.send_json({"type": "speaking_done"})
                        elif et == "error":
                            logger.error(f"realtime OA error: {json.dumps(ev.get('error', {}), ensure_ascii=False)[:300]}")
                            # ответ мог не родиться или повиснуть — ОБЯЗАТЕЛЬНО освобождаем
                            # слот, иначе следующий ход застрянет на ожидании response.done.
                            response_done.set()
                            state["speaking"] = False
                            if state["answer_active"]:
                                state["answer_active"] = False
                                state["turn_speaking"] = False
                                await ws_client.send_json({"type": "speaking_done"})
                    try:
                        if not ws_client.closed:
                            await ws_client.close()
                    except Exception:
                        pass

                await asyncio.gather(pump_client(), pump_openai())
    except Exception as e:
        logger.error(f"realtime run_session: {e}")
        try:
            if not ws_client.closed:
                await ws_client.send_json({"type": "error", "message": "bridge_error"})
        except Exception:
            pass
