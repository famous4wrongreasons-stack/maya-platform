"""Guards for MAYA voice transcripts before they reach the AI brain."""
from __future__ import annotations

import difflib
import re


CLARIFY_REPEAT_TEXT = "Извините, я не расслышала. Повторите, пожалуйста?"

_PUNCT_RE = re.compile(r"[^\w\s]+", re.UNICODE)
_SPACE_RE = re.compile(r"\s+")
# Типовые «галлюцинации» русскоязычного STT (Whisper/gpt-4o-transcribe) на тишине
# и шуме + эхо нашего же словаря-подсказки. Это НЕ речь — отбрасываем до мозга,
# иначе MAYA отвечает на выдуманный текст (и потом «спорит», т.к. он в её истории).
# Сверяется по нормализованному тексту (без ё/пунктуации), поэтому «спасибо, что
# смотрели» и «спасибо что смотрели» ловятся одной записью.
_HARD_NOISE_PARTS = (
    "частые термины",
    "имена мастеров",
    "названия услуг",
    "барбершоп мужская",
    "продолжение следует",
    "продолжение в следующей",
    "спасибо за просмотр",
    "спасибо за внимание",
    "спасибо что смотрели",
    "редактор субтитров",
    "субтитры",
    "подписывайтесь",
    "подпишись",
    "ставьте лайк",
    "не забудьте подписаться",
    "приятного просмотра",
    "до новых встреч",
    "всем пока",
    "dimatorzok",
)
_LETTER_RE = re.compile(r"[а-яёa-z]", re.IGNORECASE)
_WORD_RE = re.compile(r"[а-яёa-z]+", re.IGNORECASE)


def is_hard_noise(text: str) -> bool:
    """True для явного мусора/эха словаря/типовых STT-галлюцинаций и «пустой» речи."""
    low = normalize_voice_text(text)
    if not low:
        return True
    if not _LETTER_RE.search(low):          # только цифры/символы/ноты — не речь
        return True
    if any(part in low for part in _HARD_NOISE_PARTS):
        return True
    # Один и тот же короткий токен, повторённый 3+ раз («так так так так»,
    # «а а а а») — почти всегда артефакт распознавания, а не осмысленная реплика.
    words = _WORD_RE.findall(low)
    if len(words) >= 3 and len(set(words)) == 1 and len(words[0]) <= 4:
        return True
    return False


def _last_assistant_text(history: list[dict] | None) -> str:
    if not history:
        return ""
    for item in reversed(history):
        if isinstance(item, dict) and item.get("role") == "assistant":
            content = item.get("content") or ""
            if isinstance(content, list):
                content = " ".join(str(x.get("text") or "") for x in content if isinstance(x, dict))
            return str(content)
    return ""


def looks_like_self_echo(transcript: str, history: list[dict] | None) -> bool:
    """True, если транскрипт — это распознанный микрофоном хвост речи самой MAYA.

    Динамик клиента может «просочиться» в микрофон даже при эхоподавлении, и STT
    расшифрует голос ассистентки как входящую реплику — тогда MAYA отвечает сама
    себе. Такие эхо-транскрипты длинные и почти дословно повторяют её последнюю
    реплику, поэтому пороги подобраны консервативно: короткие ответы клиента
    («да», «оформляем», имя мастера) под них НЕ попадают.
    """
    asst = normalize_voice_text(_last_assistant_text(history))
    tr = normalize_voice_text(transcript)
    if not tr or not asst or len(tr) < 12:
        return False
    if tr in asst and len(asst) >= len(tr) + 6:      # дословный фрагмент её фразы
        return True
    if difflib.SequenceMatcher(None, tr, asst).ratio() >= 0.72:
        return True
    match = difflib.SequenceMatcher(None, tr, asst).find_longest_match(0, len(tr), 0, len(asst))
    if match.size >= max(16, int(len(tr) * 0.85)):
        return True
    return False
_ACTION_RE = re.compile(
    r"\b("
    r"запиш|запис|хочу|можно|надо|нужно|нужна|сделай|скажи|покажи|подскаж|"
    r"пожел|поздрав|оформ|перенес|перенеси|отмен|проверь|сколько|когда|где|"
    r"какой|какая|какие|во\s+сколько|да|нет|ок|хорошо|только|без|стриж|"
    r"бород|абонемент|сертификат|адрес|цена|стоим"
    r")\b",
    re.IGNORECASE,
)
_ALLOW_SHORT_RE = re.compile(
    r"\b("
    r"привет|здравств|доброе\s+утро|добрый\s+день|добрый\s+вечер|"
    r"спокойной\s+ночи|доброй\s+ночи|спасибо|благодар"
    r")\b",
    re.IGNORECASE,
)
_EXPECT_SHORT_RE = re.compile(
    r"(подскаж|уточн|какому\s+мастер|к\s+какому|мастер|услуг|день|дат|"
    r"время|во\s+сколько|оформляем|подтвержда|добавляем|что-то|только\s+стриж|"
    r"кому|кого|какой|какая|какие)",
    re.IGNORECASE,
)
_THIRD_PERSON_BOOKING_RE = re.compile(
    r"\b(он|она|они|клиент|клиентка|абонент|абонентка|человек|посетитель|девушка|мужчина|женщина)\b"
    r".{0,45}\b(желает|хочет|хотят|просит|просят|собирается|собираются|будет|будут)\b"
    r".{0,55}\b(запис\w*|стриж\w*|машинк\w*|услуг\w*|мастер\w*)\b",
    re.IGNORECASE,
)
_CLEAR_USER_INTENT_RE = re.compile(
    r"\b("
    r"я\s+хочу|хочу\s+запис|можно\s+запис|нужно\s+запис|надо\s+запис|"
    r"запиши|запишите|записаться|оформляем|подтверждаю|да\s+оформляем|"
    r"перенеси|перенести|отмени|отменить|только\s+стриж|без\s+доп|"
    r"пожел|поздрав|расскаж|подскаж|сколько|где|цена|цены|адрес"
    r")\b",
    re.IGNORECASE,
)
_EXPECTED_SHORT_VALUE_RE = re.compile(
    r"\b("
    r"да|нет|ок|окей|хорошо|можно|подтверждаю|согласен|согласна|"
    r"сегодня|завтра|послезавтра|утром|днем|днём|вечером|"
    r"понедельник|вторник|среду|среда|четверг|пятницу|пятница|субботу|суббота|воскресенье|"
    r"стрижк\w*|машинк\w*|бород\w*|брить\w*|укладк\w*|тонир\w*|камуфляж\w*|"
    r"фейд\w*|кроп\w*|сайд\w*|абонемент\w*|сертификат\w*|балл\w*"
    r")\b|\b\d{1,2}(?::\d{2})?\b",
    re.IGNORECASE,
)
_SERVICE_ONLY_RE = re.compile(
    r"^(?:на\s+)?(?:стрижк\w*(?:\s+машинк\w*)?|машинк\w*|бород\w*|брить\w*)$",
    re.IGNORECASE,
)


def normalize_voice_text(text: str) -> str:
    low = (text or "").replace("ё", "е").lower().strip()
    low = _PUNCT_RE.sub(" ", low)
    return _SPACE_RE.sub(" ", low).strip()


def assistant_expects_short_answer(history: list[dict] | None) -> bool:
    """True if the last assistant turn likely asked for a short slot/service/master answer."""
    if not history:
        return False
    for item in reversed(history[-4:]):
        if not isinstance(item, dict) or item.get("role") != "assistant":
            continue
        text = item.get("content") or ""
        if isinstance(text, list):
            text = " ".join(str(x.get("text") or "") for x in text if isinstance(x, dict))
        text = str(text)
        return bool("?" in text and _EXPECT_SHORT_RE.search(text))
    return False


def _looks_like_known_name_fragment(low: str, known_names: list[str] | tuple[str, ...] | None) -> bool:
    if not known_names:
        return False
    words = low.split()
    if not words or len(words) > 4:
        return False
    for raw_name in known_names:
        name = normalize_voice_text(raw_name)
        if not name:
            continue
        ratio = difflib.SequenceMatcher(None, low, name).ratio()
        if ratio >= 0.76:
            return True
        name_words = name.split()
        if len(words) <= 2 and name_words:
            # First-name-only noise: "Стас", "Антон", "Александру".
            for nw in name_words:
                if len(nw) >= 4 and difflib.SequenceMatcher(None, words[0], nw).ratio() >= 0.76:
                    return True
    return False


def should_clarify_transcript(
    transcript: str,
    history: list[dict] | None = None,
    known_names: list[str] | tuple[str, ...] | None = None,
) -> bool:
    """Detect likely STT hallucinations/noise before sending them to MAYA's AI.

    We are deliberately conservative only when the assistant did not ask a
    short follow-up question. If the last assistant message asks for a master,
    service, date, time, or confirmation, short phrases like "к Стасу" remain
    valid user answers.
    """
    low = normalize_voice_text(transcript)
    if not low:
        return True
    if any(part in low for part in _HARD_NOISE_PARTS):
        return True
    if _THIRD_PERSON_BOOKING_RE.search(low):
        return True
    words = low.split()
    if assistant_expects_short_answer(history):
        if (
            _ALLOW_SHORT_RE.search(low)
            or _EXPECTED_SHORT_VALUE_RE.search(low)
            or _CLEAR_USER_INTENT_RE.search(low)
            or _ACTION_RE.search(low)
            or _looks_like_known_name_fragment(low, known_names)
        ):
            return False
        if len(words) <= 2 and len(low) <= 24:
            return True
        return False
    if _ALLOW_SHORT_RE.search(low):
        return False
    if _CLEAR_USER_INTENT_RE.search(low):
        return False
    if _SERVICE_ONLY_RE.match(low):
        return True
    if _ACTION_RE.search(low):
        return False
    if _looks_like_known_name_fragment(low, known_names):
        return True
    if len(words) <= 2 and len(low) <= 24:
        return True
    return False
