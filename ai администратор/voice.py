"""
voice.py — голосовой ОТВЕТ MAYA («дешёвый голос», Фаза 4, шаг 1).

Озвучивает текст ответа через OpenAI TTS по тому же прокси (PROXY_URL), что и
остальные вызовы OpenAI/Anthropic — никаких новых счетов/аккаунтов, ключ уже есть.
STT (распознавание входящего голоса) уже работает в bot.transcribe_voice (Google).

⚠️ ВЫКЛЮЧЕНО ПО УМОЛЧАНИЮ. Включается флагом в config.py:
    VOICE_REPLIES_ENABLED = True
    VOICE_TTS_VOICE = "shimmer"   # alloy/echo/fable/onyx/nova/shimmer (необязательно)
Пока флага нет — synthesize() возвращает None, и вызывающий код просто шлёт текст.

Это НЕ телефония. Реальные звонки (приём входящих) — отдельный стек:
Voximplant (SIP, номер) + Yandex SpeechKit (STT/TTS реалтайм). Требует аккаунтов
и оплаты — см. Документация/VISION_AI_NATIVE.md, Фаза 4.

Подключение в bot.handle_voice (когда Стас даст добро) — ответить голосом, если
пришёл голос и фича включена:
    if voice.is_enabled() and update.message.voice:
        audio = await voice.synthesize(answer_text)
        if audio:
            await update.message.reply_voice(voice=io.BytesIO(audio))
        else:
            await update.message.reply_text(answer_text)
"""
from __future__ import annotations

import asyncio
import logging
import re

import httpx

try:
    from config import OPENAI_API_KEY, PROXY_URL
except Exception:                       # pragma: no cover
    OPENAI_API_KEY, PROXY_URL = "", ""

try:
    import config as _cfg
except Exception:                       # pragma: no cover
    _cfg = None

logger = logging.getLogger(__name__)

_MAX_CHARS = 420                        # короче = быстрее озвучка; длинное — лекция
_EMOJI_RE = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF←-⇿⬀-⯿]"
)


def is_enabled() -> bool:
    """Голосовые ответы включены только если в config задан флаг и есть ключ."""
    return bool(OPENAI_API_KEY) and bool(getattr(_cfg, "VOICE_REPLIES_ENABLED", False))


_WEEKDAYS_SPEAK = {"пн": "понедельник", "вт": "вторник", "ср": "среда",
                   "чт": "четверг", "пт": "пятница", "сб": "суббота", "вс": "воскресенье"}


def _expand_for_speech(t: str) -> str:
    """Раскрывает сокращения/символы словами, чтобы TTS произносил их правильно
    (страховка к промпту): ₽ → рублей, Ср/Чт/Пт → среда/четверг/пятница и т.п."""
    t = t.replace("₽", " рублей").replace("руб.", " рублей")
    t = re.sub(r"\bтел\.", "телефон", t, flags=re.IGNORECASE)
    t = re.sub(r"\b(пн|вт|ср|чт|пт|сб|вс)\b\.?",
               lambda m: _WEEKDAYS_SPEAK[m.group(1).lower()], t, flags=re.IGNORECASE)
    return t


def _clean_for_speech(text: str) -> str:
    """Готовит текст к озвучке: убирает markdown/эмодзи/ссылки, раскрывает
    сокращения, режет по длине."""
    t = text or ""
    t = re.sub(r"```.*?```", " ", t, flags=re.DOTALL)      # код-блоки
    t = re.sub(r"https?://\S+", " ", t)                     # ссылки не зачитываем
    t = re.sub(r"[*_#`>|]+", " ", t)                        # markdown-разметка
    t = _expand_for_speech(t)                               # сокращения/символы → словами
    t = _EMOJI_RE.sub("", t)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{2,}", "\n", t).strip()
    if len(t) > _MAX_CHARS:
        cut = t[:_MAX_CHARS]
        dot = max(cut.rfind("."), cut.rfind("!"), cut.rfind("?"))
        t = cut[: dot + 1] if dot > 200 else cut
    return t


async def _pitch_shift(audio: bytes, fmt: str, pitch: float) -> bytes:
    """Поднимает высоту голоса через ffmpeg rubberband (тон без смены темпа).
    Фолбэк: при любой ошибке возвращает исходное аудио — голос не пропадёт."""
    out_args = ["-f", "mp3"] if fmt == "mp3" else ["-c:a", "libopus", "-f", "ogg"]
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
           "-af", f"rubberband=pitch={pitch:.4f}", *out_args, "pipe:1"]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL)
        out, _ = await proc.communicate(audio)
        if proc.returncode == 0 and out and len(out) > 200:
            return out
    except Exception as e:
        logger.error(f"voice pitch-shift: {e}")
    return audio


async def synthesize(text: str, fmt: str = "opus") -> bytes | None:
    """Озвучивает текст. fmt='opus' — Ogg/Opus для голосовых Telegram (reply_voice);
    fmt='mp3' — для веба/iOS-PWA (Safari не играет Opus в <audio>, MP3 — играет).
    None — если выключено, пусто или ошибка (вызывающий код шлёт обычный текст)."""
    if not is_enabled():
        return None
    speech = _clean_for_speech(text)
    if not speech:
        return None
    body = {
        "model": getattr(_cfg, "VOICE_TTS_MODEL", "gpt-4o-mini-tts"),
        "voice": getattr(_cfg, "VOICE_TTS_VOICE", "coral"),
        "input": speech,
        "response_format": "mp3" if fmt == "mp3" else "opus",
        "speed": float(getattr(_cfg, "VOICE_TTS_SPEED", 1.15)),  # чуть быстрее обычного
    }
    # Интонация (поддерживает gpt-4o-mini-tts): живая, человечная, разговорная речь.
    _instr = getattr(_cfg, "VOICE_TTS_INSTRUCTIONS",
                     "Говори по-русски как живая молодая девушка-администратор — естественно, "
                     "тепло и ВЫРАЗИТЕЛЬНО. Живая интонация: выделяй ключевые слова, делай "
                     "натуральные паузы, меняй мелодику фразы, добавляй лёгкую эмоцию. Голос "
                     "светлый, молодой, чуть выше среднего, приятный. НЕ монотонно, НЕ по-дикторски, "
                     "НЕ как робот — звучи по-настоящему человечно, с лёгкой улыбкой.")
    if _instr:
        body["instructions"] = _instr
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    kwargs = {"timeout": httpx.Timeout(30.0)}
    if PROXY_URL:
        kwargs["proxy"] = PROXY_URL
    try:
        async with httpx.AsyncClient(**kwargs) as client:
            r = await client.post(
                "https://api.openai.com/v1/audio/speech",
                json=body, headers=headers,
            )
            r.raise_for_status()
            audio = r.content
            try:                            # учёт TTS-расхода в ИИ-бюджет (по символам)
                import ai_billing
                ai_billing.log_tts_usage(body["model"], len(speech))
            except Exception:
                pass
            pitch = float(getattr(_cfg, "VOICE_TTS_PITCH", 1.0) or 1.0)
            if audio and abs(pitch - 1.0) > 0.01:
                audio = await _pitch_shift(audio, fmt, pitch)
            return audio
    except Exception as e:
        logger.error(f"voice.synthesize error: {e}")
        return None
