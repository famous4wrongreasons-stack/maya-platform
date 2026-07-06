"""
voice.py — голосовой ОТВЕТ MAYA («дешёвый голос», Фаза 4, шаг 1).

Озвучивает текст ответа через OpenAI TTS по тому же прокси (PROXY_URL), что и
остальные вызовы OpenAI/Anthropic — никаких новых счетов/аккаунтов, ключ уже есть.
STT (распознавание входящего голоса) уже работает в bot.transcribe_voice (Google).

⚠️ ВЫКЛЮЧЕНО ПО УМОЛЧАНИЮ. Включается флагом в config.py:
    VOICE_REPLIES_ENABLED = True
    VOICE_TTS_VOICE = "marin"     # alloy/ash/ballad/coral/.../marin/cedar (необязательно)
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
import base64
import json
import logging
import os
import re
from pathlib import Path

import httpx

def _load_env_fallback(path: Path) -> None:
    """Минимальная загрузка .env без внешней зависимости python-dotenv."""
    if not path.exists():
        return
    try:
        for raw in path.read_text(errors="ignore").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and value and key not in os.environ:
                os.environ[key] = value
    except Exception:
        pass


try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).with_name(".env"))
except Exception:                       # pragma: no cover
    _load_env_fallback(Path(__file__).with_name(".env"))

try:
    from config import OPENAI_API_KEY, PROXY_URL
except Exception:                       # pragma: no cover
    OPENAI_API_KEY, PROXY_URL = "", ""

try:
    import config as _cfg
except Exception:                       # pragma: no cover
    _cfg = None

logger = logging.getLogger(__name__)

_MAX_CHARS = 1400                       # не обрываем длинные ответы на середине мысли
_YANDEX_DEFAULT_MAX_CHARS = 240          # SpeechKit v3 плохо принимает длинные utterance
_EMOJI_RE = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF←-⇿⬀-⯿]"
)


def is_enabled() -> bool:
    """Голосовые ответы включены только если в config задан флаг и есть ключ."""
    if not _cfg_bool("VOICE_REPLIES_ENABLED", False):
        return False
    provider = _tts_provider()
    if provider == "yandex":
        return bool(_cfg_str("YANDEX_SPEECHKIT_API_KEY") or _cfg_str("YANDEX_SPEECHKIT_IAM_TOKEN"))
    return bool(_cfg_str("OPENAI_API_KEY", OPENAI_API_KEY))


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
        dot = max(cut.rfind("."), cut.rfind("!"), cut.rfind("?"), cut.rfind("\n"))
        t = cut[: dot + 1] if dot > 280 else cut.rstrip() + "."
    return t


_QUESTION_PREFIXES = (
    "как ", "когда ", "куда ", "где ", "зачем ", "почему ", "сколько ",
    "какой ", "какая ", "какое ", "какие ", "какую ", "какого ", "что ",
    "кто ", "чем ", "можно ли ", "подскажите, ",
)
_QUESTION_TAIL_RE = re.compile(
    r"\b("
    r"оформляем|подходит|подтверждаете|подтверждаем|записываем|переносим|"
    r"оставляем|добавляем|берём|берем|выбираем|удобно|верно|правильно"
    r")\s*$",
    re.IGNORECASE,
)
_SOFT_PAUSE_BEFORE_QUESTION_RE = re.compile(
    r"([.!])\s+("
    r"Оформляем|Подходит|Подтверждаете|Подтверждаем|Записываем|Переносим|"
    r"Оставляем|Добавляем|Берём|Берем|Выбираем|Удобно|Верно|Правильно"
    r"\?)"
)
_CLOCK_TIME_RE = re.compile(r"\b([01]?\d|2[0-3]):([0-5]\d)\b")
_VERBAL_TIME_RE = re.compile(
    r"\b([01]?\d|2[0-3])\s+час(?:а|ов)?\s+([0-5]?\d)\s+минут(?:а|ы)?\b",
    re.IGNORECASE,
)


def _clock_time_for_speech(match: re.Match) -> str:
    hour = int(match.group(1))
    minute = match.group(2)
    if minute == "00":
        return f"{hour} часов"
    if minute == "30":
        return f"{hour} тридцать"
    if minute.startswith("0"):
        return f"{hour} ноль {int(minute)}"
    return f"{hour} {int(minute)}"


def _looks_like_question(sentence: str) -> bool:
    low = (sentence or "").strip().lower()
    if not low:
        return False
    return low.startswith(_QUESTION_PREFIXES) or bool(_QUESTION_TAIL_RE.search(low))


def _sentence_chunks(text: str) -> list[str]:
    return re.findall(r"\s+|[^.!?\n]+[.!?]?|\n+", text or "")


def _polish_tts_prosody(text: str) -> str:
    """Small TTS-only rewrite: punctuation and pauses for more human intonation.

    We do not change booking facts here. The goal is to give SpeechKit clearer
    punctuation, especially for short confirmation questions.
    """
    t = (text or "").strip()
    if not t:
        return ""

    # SpeechKit often sounds more natural with commas than with long dashes.
    t = re.sub(r"\s+[—–-]\s+", ", ", t)
    t = re.sub(r"\bMAYA\b", "Майя", t)
    t = _VERBAL_TIME_RE.sub(lambda m: f"{int(m.group(1))}:{int(m.group(2)):02d}", t)
    t = _CLOCK_TIME_RE.sub(_clock_time_for_speech, t)

    out: list[str] = []
    for chunk in _sentence_chunks(t):
        if not chunk or chunk.isspace() or chunk == "\n":
            out.append(chunk)
            continue
        raw = chunk.strip()
        if not raw:
            out.append(chunk)
            continue
        end = raw[-1] if raw[-1] in ".!?" else ""
        body = raw[:-1].strip() if end else raw
        if end != "?" and _looks_like_question(body):
            raw = body + "?"
        elif not end:
            raw = body + "."
        out.append(raw)

    t = "".join(out)
    t = _SOFT_PAUSE_BEFORE_QUESTION_RE.sub(r"\1\n\2", t)
    t = re.sub(r",\s*,+", ", ", t)
    t = re.sub(r"[ \t]{2,}", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def _cfg_float(name: str, default: float) -> float:
    try:
        value = os.environ.get(name)
        if value is not None and str(value).strip() == "":
            value = None
        if value is None and _cfg:
            value = getattr(_cfg, name, default)
        if value is None or value == "":
            return default
        return float(value)
    except Exception:
        return default


def _cfg_str(name: str, default: str = "") -> str:
    try:
        value = os.environ.get(name)
        if value is not None and str(value).strip() == "":
            value = None
        if value is None and _cfg:
            value = getattr(_cfg, name, default)
        if value is None:
            return default
        return str(value).strip()
    except Exception:
        return default


def _cfg_bool(name: str, default: bool = False) -> bool:
    value = _cfg_str(name, "")
    if not value:
        if _cfg and hasattr(_cfg, name):
            try:
                return bool(getattr(_cfg, name))
            except Exception:
                return default
        return default
    return value.lower() in ("1", "true", "yes", "on", "y", "да")


def _tts_provider() -> str:
    provider = _cfg_str("VOICE_TTS_PROVIDER", "openai").lower()
    if provider == "yandex" and not (
        _cfg_str("YANDEX_SPEECHKIT_API_KEY") or _cfg_str("YANDEX_SPEECHKIT_IAM_TOKEN")
    ):
        # Не гасим голосовые ответы, если .env уже переключили на Yandex,
        # но ключ ещё не внесён или не доступен сервису.
        if _cfg_str("OPENAI_API_KEY", OPENAI_API_KEY):
            return "openai"
    return provider


def openai_fallback_enabled() -> bool:
    """True only when we may replace the selected external voice with OpenAI TTS."""
    return _cfg_bool("VOICE_TTS_FALLBACK_OPENAI", False)


def _split_for_tts(text: str, max_chars: int) -> list[str]:
    """Split TTS text into small natural chunks without changing the words."""
    text = re.sub(r"[ \t]+", " ", (text or "").strip())
    if not text:
        return []
    max_chars = max(120, int(max_chars or _YANDEX_DEFAULT_MAX_CHARS))
    pieces = re.findall(r"[^.!?\n]+[.!?]?|\n+", text)
    chunks: list[str] = []
    cur = ""

    def flush() -> None:
        nonlocal cur
        if cur.strip():
            chunks.append(cur.strip())
        cur = ""

    def split_long(piece: str) -> None:
        piece = piece.strip()
        while len(piece) > max_chars:
            cut = max(piece.rfind(",", 0, max_chars), piece.rfind(" ", 0, max_chars))
            if cut < 80:
                cut = max_chars
            chunks.append(piece[:cut].strip())
            piece = piece[cut:].strip()
        if piece:
            chunks.append(piece)

    for raw in pieces:
        piece = raw.strip()
        if not piece:
            continue
        if len(piece) > max_chars:
            flush()
            split_long(piece)
            continue
        candidate = f"{cur} {piece}".strip() if cur else piece
        if len(candidate) <= max_chars:
            cur = candidate
        else:
            flush()
            cur = piece
    flush()
    return chunks


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


async def _convert_mp3_to_ogg_opus(audio: bytes) -> bytes | None:
    if not audio:
        return None
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
        "-c:a", "libopus", "-f", "ogg", "pipe:1",
    ]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL)
        out, _ = await proc.communicate(audio)
        if proc.returncode == 0 and out and len(out) > 200:
            return out
    except Exception as e:
        logger.error(f"voice mp3->opus convert: {e}")
    return None


async def _synthesize_openai(speech: str, fmt: str = "opus") -> bytes | None:
    openai_key = _cfg_str("OPENAI_API_KEY", OPENAI_API_KEY)
    if not openai_key:
        return None
    body = {
        "model": getattr(_cfg, "VOICE_TTS_MODEL", "gpt-4o-mini-tts"),
        "voice": getattr(_cfg, "VOICE_TTS_VOICE", "marin"),
        "input": speech,
        "response_format": "mp3" if fmt == "mp3" else "opus",
        "speed": _cfg_float("VOICE_TTS_SPEED", 1.0),
    }
    # Интонация (поддерживает gpt-4o-mini-tts): живая, человечная, разговорная речь.
    _instr = getattr(_cfg, "VOICE_TTS_INSTRUCTIONS",
                     "Говори по-русски естественно и спокойно, светлым женским голосом чуть выше "
                     "среднего. Без иностранного акцента, без театральности, без чрезмерной "
                     "эмоции. Темп средний, дикция чёткая, интонация тёплая и уверенная.")
    if _instr:
        body["instructions"] = _instr
    headers = {
        "Authorization": f"Bearer {openai_key}",
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
            pitch = _cfg_float("VOICE_TTS_PITCH", 1.0)
            if audio and abs(pitch - 1.0) > 0.01:
                audio = await _pitch_shift(audio, fmt, pitch)
            return audio
    except Exception as e:
        logger.error(f"voice.synthesize error: {e}")
        return None


async def _synthesize_yandex_once(speech: str, fmt: str = "opus") -> bytes | None:
    """One Yandex SpeechKit API v3 request. Caller handles chunking."""
    api_key = _cfg_str("YANDEX_SPEECHKIT_API_KEY")
    iam_token = _cfg_str("YANDEX_SPEECHKIT_IAM_TOKEN")
    folder_id = _cfg_str("YANDEX_CLOUD_FOLDER_ID") or _cfg_str("YANDEX_SPEECHKIT_FOLDER_ID")
    if not (api_key or iam_token):
        return None
    headers = {
        "Authorization": ("Api-Key " + api_key) if api_key else ("Bearer " + iam_token),
        "Content-Type": "application/json",
    }
    if folder_id:
        headers["x-folder-id"] = folder_id
    voice_name = _cfg_str("YANDEX_SPEECHKIT_VOICE", "lera")
    role = _cfg_str("YANDEX_SPEECHKIT_ROLE", "friendly")
    speed = _cfg_float("YANDEX_SPEECHKIT_SPEED", _cfg_float("VOICE_TTS_SPEED", 1.0))
    pitch_shift = _cfg_float("YANDEX_SPEECHKIT_PITCH_SHIFT", 0.0)
    audio_type = "MP3" if fmt == "mp3" else "OGG_OPUS"
    hints = [{"voice": voice_name}, {"role": role}, {"speed": speed}]
    if abs(pitch_shift) > 0.001:
        hints.append({"pitchShift": pitch_shift})
    body = {
        "text": speech,
        "hints": hints,
        "outputAudioSpec": {
            "containerAudio": {"containerAudioType": audio_type}
        },
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(35.0)) as client:
            r = await client.post(
                "https://tts.api.cloud.yandex.net:443/tts/v3/utteranceSynthesis",
                headers=headers,
                json=body,
            )
            if r.status_code >= 400:
                logger.error("voice.yandex synthesize status=%s body=%s",
                             r.status_code, (r.text or "")[:400])
                return None
            chunks: list[bytes] = []
            payload = r.text.strip()
            rows = [payload] if payload.startswith("{") and "\n" not in payload else payload.splitlines()
            for row in rows:
                row = row.strip()
                if not row:
                    continue
                try:
                    data = json.loads(row)
                except Exception:
                    continue
                b64 = (((data.get("result") or {}).get("audioChunk") or {}).get("data") or
                       ((data.get("audioChunk") or {}).get("data")))
                if b64:
                    chunks.append(base64.b64decode(b64))
            audio = b"".join(chunks)
            if not audio:
                logger.error("voice.yandex: пустой audioChunk")
                return None
            try:
                import ai_billing
                ai_billing.log_tts_usage("yandex-speechkit-v3", len(speech))
            except Exception:
                pass
            return audio
    except Exception as e:
        logger.error(f"voice.yandex synthesize error: {e}")
        return None


async def _synthesize_yandex(speech: str, fmt: str = "opus") -> bytes | None:
    """Yandex SpeechKit API v3 with short chunks so MAYA keeps the Lera voice."""
    max_chars = int(_cfg_float("YANDEX_SPEECHKIT_MAX_CHARS", _YANDEX_DEFAULT_MAX_CHARS))
    chunks = _split_for_tts(speech, max_chars)
    if not chunks:
        return None

    # MP3 chunks concatenate and decode reliably in Safari/ffmpeg. For opus output
    # synthesize MP3 chunks first, then transcode the joined stream once.
    request_fmt = "mp3" if (fmt == "mp3" or len(chunks) > 1) else fmt
    audio_parts: list[bytes] = []
    for chunk in chunks:
        part = await _synthesize_yandex_once(chunk, request_fmt)
        if not part:
            return None
        audio_parts.append(part)
    audio = b"".join(audio_parts)
    if request_fmt == "mp3" and fmt != "mp3":
        audio = await _convert_mp3_to_ogg_opus(audio) or b""
    return audio or None


async def synthesize(text: str, fmt: str = "opus") -> bytes | None:
    """Озвучивает текст. fmt='opus' — Ogg/Opus для голосовых Telegram (reply_voice);
    fmt='mp3' — для веба/iOS-PWA (Safari не играет Opus в <audio>, MP3 — играет).
    None — если выключено, пусто или ошибка (вызывающий код шлёт обычный текст)."""
    if not is_enabled():
        return None
    speech = _clean_for_speech(text)
    speech = _polish_tts_prosody(speech)
    if not speech:
        return None
    if _tts_provider() == "yandex":
        audio = await _synthesize_yandex(speech, fmt)
        if audio:
            return audio
        # Фолбэк включается только явно: для MAYA неправильный голос хуже, чем пауза.
        if openai_fallback_enabled() and _cfg_str("OPENAI_API_KEY", OPENAI_API_KEY):
            return await _synthesize_openai(speech, fmt)
        return None
    return await _synthesize_openai(speech, fmt)
