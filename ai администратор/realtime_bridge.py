"""
realtime_bridge.py — голосовой мост «как у ChatGPT» для MAYA.

Архитектура (мозг = Claude, голос = OpenAI gpt-realtime):
  Браузер(PWA) ──wss──> наш VPS ──proxy──> OpenAI realtime
  • realtime = уши (быстрый STT) + рот (живая потоковая озвучка без швов);
  • Claude (claude_ai.get_ai_response) = мозг: инструменты, роли, память, 152-ФЗ.

Поток одного хода:
  1. клиент шлёт PCM16-чанки микрофона (binary) → realtime input_audio_buffer;
  2. server-VAD ловит конец речи → транскрипт (conversation.item.input_audio_transcription.completed);
  3. транскрипт → Claude (в потоке-executor, чтобы не блокировать сокет);
  4. ответ Claude → realtime response.create «произнеси дословно» → output_audio.delta;
  5. аудио-чанки (binary PCM16) летят клиенту, тот играет без швов.

Barge-in: заговорил во время ответа → realtime шлёт speech_started → шлём response.cancel
и {type:"interrupted"} клиенту (тот глушит воспроизведение).

GA-схема событий проверена на VPS (session.type:"realtime", вложенный audio.*,
output_audio.delta, input_audio_transcription.completed; beta-заголовок НЕ слать).
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import time

import aiohttp
from aiohttp import web

import ai_billing
import anonymizer
from memory import load_conversations, save_conversations

try:
    import config as _cfg
except Exception:                       # pragma: no cover
    _cfg = None

logger = logging.getLogger(__name__)

OPENAI_API_KEY = getattr(_cfg, "OPENAI_API_KEY", "") if _cfg else ""
PROXY_URL = (getattr(_cfg, "PROXY_URL", "") if _cfg else "") or None
RT_MODEL = getattr(_cfg, "REALTIME_MODEL", "gpt-realtime") if _cfg else "gpt-realtime"
RT_VOICE = getattr(_cfg, "REALTIME_VOICE", "marin") if _cfg else "marin"
RT_STT_MODEL = getattr(_cfg, "REALTIME_STT_MODEL", "gpt-4o-transcribe") if _cfg else "gpt-4o-transcribe"
# «low» = терпеливый: ждёт конец фразы по смыслу/интонации, не обрывает на паузах.
RT_VAD_EAGERNESS = getattr(_cfg, "REALTIME_VAD_EAGERNESS", "low") if _cfg else "low"
# near_field = телефон у лица: давит дальний фон (ТВ/разговоры), оставляет близкий голос.
RT_NOISE_REDUCTION = getattr(_cfg, "REALTIME_NOISE_REDUCTION", "near_field") if _cfg else "near_field"

# Частые «галлюцинации» распознавания на шуме/тишине + эхо нашего словаря — это НЕ речь.
_NOISE_TRANSCRIPTS = (
    "частые термины", "имена мастеров", "названия услуг", "барбершоп «мужская",
    "продолжение следует", "спасибо за просмотр", "субтитры", "подписывайтесь на канал",
    "редактор субтитров", "подпишись", "продолжение в следующей",
)


def _is_noise_transcript(tr: str) -> bool:
    """True, если транскрипт похож на выдуманный моделью шум/эхо словаря, а не на речь."""
    low = (tr or "").lower().strip()
    if not low:
        return True
    return any(s in low for s in _NOISE_TRANSCRIPTS)

# Словарь-подсказка для распознавания (transcription.prompt): барбер-термины +
# живые имена мастеров и названия услуг → STT меньше путает слова (напр. «Илье»→«е»).
_STT_CACHE = {"text": "", "ts": 0.0}
_BARBER_TERMS = (
    "фейд, тейпер, андеркат, кроп, канадка, помпадур, квифф, цезарь, бокс, полубокс, "
    "окантовка, бритьё опасной бритвой, моделирование бороды, камуфляж седины, "
    "тонирование, патчи, чёрная маска, скраб, восковая депиляция, машинка, насадка, "
    "мужская стрижка, детская стрижка, стрижка под насадку, баллы, абонемент, сертификат"
)


def _stt_prompt() -> str:
    """Контекст-словарь для STT: барбер-термины + имена мастеров + услуги (кэш 1 час)."""
    now = time.time()
    if _STT_CACHE["text"] and now - _STT_CACHE["ts"] < 3600:
        return _STT_CACHE["text"]
    parts = [f"Барбершоп «Мужская Эстетика». Частые термины: {_BARBER_TERMS}."]
    try:
        from claude_ai import yclients as _yc
        masters = _yc.get_masters() or []
        names = ", ".join(m.get("name", "") for m in masters if m.get("name"))
        if names:
            parts.append(f"Имена мастеров: {names}.")
        svcs = _yc.get_services() or []
        titles = ", ".join(s.get("title", "") for s in svcs
                           if isinstance(s, dict) and s.get("title"))
        if titles:
            parts.append(f"Названия услуг: {titles}.")
    except Exception as e:
        logger.error(f"_stt_prompt: {e}")
    txt = " ".join(parts)[:1100]
    _STT_CACHE.update(text=txt, ts=now)
    return txt

_OPENAI_RT_URL = f"wss://api.openai.com/v1/realtime?model={RT_MODEL}"

# Подача под озвучку (как в текстовом голосе): живо, словами, без markdown.
_VOICE_NUDGE = (
    "\n\n[Это голосовой разговор. Отвечай живой разговорной речью — по делу, без воды, "
    "без markdown и сокращений (говори «среда», «рублей», «телефон»). Длинные списки не "
    "зачитывай целиком — назови главное. "
    "Ты ЖЕНЩИНА — о себе ТОЛЬКО в женском роде: «записала», «сделала», «поняла», "
    "«посмотрела», «готова» (не «записал/сделал/готов»). "
    "Сразу отвечай по сути того, что сказал собеседник. НЕ начинай ответ с приветствия и "
    "НЕ переспрашивай «привет, как дела» вместо ответа: если задан вопрос — отвечай на него; "
    "если собеседник только поздоровался (без вопроса) — коротко поздоровайся в ответ и "
    "спроси, чем можешь помочь. "
    "ВАЖНО про распознавание: оно может ошибаться из-за шума (телевизор, посторонние "
    "голоса). Если фраза собеседника бессвязна, обрывочна, не по теме салона или похожа на "
    "случайный набор слов — НЕ придумывай ответ и НЕ угадывай смысл, а мягко переспроси: "
    "«Извините, не расслышала из-за шума — повторите, пожалуйста?». Если собеседник говорит, "
    "что ты его не так поняла или что он такого не говорил — не спорь и не настаивай, "
    "сразу извинись и переспроси.]"
)


def is_enabled() -> bool:
    return bool(OPENAI_API_KEY) and bool(getattr(_cfg, "REALTIME_ENABLED", False))


def _session_config() -> dict:
    """GA-конфиг сессии: STT вкл, server-VAD без авто-ответа (отвечает Claude)."""
    return {"type": "session.update", "session": {
        "type": "realtime",
        "output_modalities": ["audio"],
        "instructions": ("Ты — MAYA, голос администратора барбершопа. Озвучивай переданный "
                         "текст тёпло, живо и естественно, как приятная девушка-администратор. "
                         "Не добавляй ничего от себя."),
        "audio": {
            "input": {
                "format": {"type": "audio/pcm", "rate": 24000},
                "noise_reduction": {"type": RT_NOISE_REDUCTION},   # давим фон (ТВ/разговоры)
                "transcription": {"model": RT_STT_MODEL, "language": "ru",
                                  "prompt": _stt_prompt()},
                # semantic_vad: конец реплики определяется по СМЫСЛУ/ИНТОНАЦИИ (моделью),
                # а не просто по тишине → не обрывает на паузах внутри фразы.
                # eagerness=low — самый терпеливый (дослушивает до конца мысли).
                "turn_detection": {
                    "type": "semantic_vad",
                    "eagerness": RT_VAD_EAGERNESS,
                    "create_response": False,     # отвечает Claude, не realtime сам
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


async def run_session(ws_client: web.WebSocketResponse, chat_id: int) -> None:
    """Главный цикл моста для одного авторизованного клиента."""
    loop = asyncio.get_event_loop()
    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}"}
    # send_lock: сериализует отправку ответов — ровно один говорящий за раз (без гонок).
    # response_done: «нет активного ответа» (set) / «ответ звучит» (clear). Ставится в
    #   pump_openai на response.done|error; say() ждёт его перед новым response.create.
    # answer_active: сейчас звучит РЕАЛЬНЫЙ ответ Claude (нужно для speaking_done/barge-in).
    # turn_speaking: уже отправили speaking_start в этом ходе.
    state = {"speaking": False, "thinking": False, "claude_task": None,
             "answer_active": False, "turn_speaking": False}
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
                    """Озвучить готовый текст Claude дословно.

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
                        response_done.clear()              # слот занят (синхронно, без гонки)
                        state["answer_active"] = True
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
                    """Транскрипт → Claude (мозг) → озвучка ответа. В отдельной задаче."""
                    state["thinking"] = True
                    state["turn_speaking"] = False
                    try:
                        await ws_client.send_json({"type": "transcript", "text": transcript})
                        # История общая с текстовым чатом/Telegram (memory по chat_id)
                        conversations = await loop.run_in_executor(None, load_conversations)
                        history = conversations.get(chat_id) or []
                        history.append({"role": "user", "content": anonymizer.redact_pii(transcript)})
                        if len(history) > 30:
                            history = history[-30:]
                        llm_history = history[:-1] + [{
                            "role": "user",
                            "content": history[-1]["content"] + _VOICE_NUDGE,
                        }]
                        # Claude — синхронный, гоним в executor, чтобы не вешать сокет
                        from claude_ai import get_ai_response
                        reply, *_ = await loop.run_in_executor(
                            None, get_ai_response, llm_history, chat_id, None)
                        reply = (reply or "Секунду, повторите, пожалуйста.").strip()
                        history.append({"role": "assistant", "content": reply})
                        conversations[chat_id] = history
                        await loop.run_in_executor(None, save_conversations, conversations)
                        await ws_client.send_json({"type": "reply_text", "text": reply})
                        await say(reply)
                    except Exception as e:
                        logger.error(f"realtime think_and_reply: {e}")
                        try:
                            await ws_client.send_json({"type": "error", "message": "ai_error"})
                        except Exception:
                            pass
                    finally:
                        state["thinking"] = False

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
                            if tr and not _is_noise_transcript(tr) and not state["thinking"]:
                                state["claude_task"] = asyncio.create_task(think_and_reply(tr))
                            elif tr:
                                logger.info(f"RT: отброшен шум/галлюцинация в транскрипте: {tr[:60]!r}")
                        elif et == "response.created":
                            logger.info("RT ← response.created")
                        elif et == "input_audio_buffer.speech_started":
                            # barge-in: юзер заговорил → глушим текущий ответ
                            if state["speaking"] or state["answer_active"]:
                                try:
                                    await ws_oa.send_json({"type": "response.cancel"})
                                except Exception:
                                    pass
                                await ws_client.send_json({"type": "interrupted"})
                                state["speaking"] = False
                                state["turn_speaking"] = False
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
