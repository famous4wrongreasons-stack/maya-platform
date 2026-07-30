"""Deterministic identity guard for MAYA's Russian self-references."""

from __future__ import annotations

import re


_MASCULINE_TO_FEMININE = {
    "понял": "поняла",
    "сделал": "сделала",
    "записал": "записала",
    "нашёл": "нашла",
    "нашел": "нашла",
    "посмотрел": "посмотрела",
    "проверил": "проверила",
    "уточнил": "уточнила",
    "запустил": "запустила",
    "отправил": "отправила",
    "подготовил": "подготовила",
    "расслышал": "расслышала",
    "разобрался": "разобралась",
    "согласен": "согласна",
    "готов": "готова",
    "рад": "рада",
    "уверен": "уверена",
    "должен": "должна",
    "решил": "решила",
    "выяснил": "выяснила",
    "смог": "смогла",
    "был": "была",
    "сам": "сама",
    "ответил": "ответила",
    "посчитал": "посчитала",
    "рассчитал": "рассчитала",
    "добавил": "добавила",
    "сохранил": "сохранила",
    "изменил": "изменила",
    "исправил": "исправила",
    "обновил": "обновила",
    "поставил": "поставила",
    "создал": "создала",
    "получил": "получила",
    "увидел": "увидела",
    "заметил": "заметила",
    "предложил": "предложила",
    "выполнил": "выполнила",
    "закончил": "закончила",
    "начал": "начала",
    "помог": "помогла",
    "принял": "приняла",
    "попробовал": "попробовала",
    "забыл": "забыла",
    "вспомнил": "вспомнила",
    "учёл": "учла",
    "учел": "учла",
    "подтвердил": "подтвердила",
    "перенёс": "перенесла",
    "перенес": "перенесла",
    "отменил": "отменила",
    "закрыл": "закрыла",
    "открыл": "открыла",
    "выбрал": "выбрала",
    "собрал": "собрала",
    "проанализировал": "проанализировала",
}

_AMBIGUOUS_WITHOUT_EXPLICIT_I = {"был", "должен", "сам"}
_FORMS = sorted(_MASCULINE_TO_FEMININE, key=len, reverse=True)
_FORM_PATTERN = "|".join(re.escape(form) for form in _FORMS)
_BARE_PATTERN = "|".join(
    re.escape(form) for form in _FORMS if form not in _AMBIGUOUS_WITHOUT_EXPLICIT_I
)

_EXPLICIT_SELF_RE = re.compile(
    rf"(?P<prefix>\bя\s+(?:(?:пока|уже|точно|тоже|сейчас|всё|все)\s+){{0,2}}(?:не\s+)?)(?P<form>{_FORM_PATTERN})\b",
    re.IGNORECASE,
)
_SENTENCE_SELF_RE = re.compile(
    rf"(?P<prefix>^|[.!?]\s+|\n\s*)(?P<negative>не\s+)?(?P<form>{_BARE_PATTERN})\b",
    re.IGNORECASE,
)
_CUE_SELF_RE = re.compile(
    rf"(?P<prefix>\b(?:хорошо|ладно|да|понятно|верно|точно|спасибо)[,!]?\s+)(?P<negative>не\s+)?(?P<form>{_BARE_PATTERN})\b",
    re.IGNORECASE,
)
_ANY_FORM_RE = re.compile(rf"\b(?P<form>{_FORM_PATTERN})\b", re.IGNORECASE)
_THIRD_PERSON_BEFORE_RE = re.compile(
    r"\b(?:он|она|они|клиент|мастер|сотрудник|владелец|человек|пользователь)"
    r"(?:\s+[\wёЁ-]+){0,3}\s*$",
    re.IGNORECASE,
)
_SENTENCE_CHUNK_RE = re.compile(r"[^.!?\n]+")


def _match_case(source: str, replacement: str) -> str:
    if source.isupper():
        return replacement.upper()
    if source[:1].isupper():
        return replacement[:1].upper() + replacement[1:]
    return replacement


def _replace_form(match: re.Match) -> str:
    source = match.group("form")
    replacement = _MASCULINE_TO_FEMININE.get(source.lower(), source)
    return (
        (match.groupdict().get("prefix") or "")
        + (match.groupdict().get("negative") or "")
        + _match_case(source, replacement)
    )


def _replace_identity(match: re.Match, replacement: str) -> str:
    source = match.group(0)
    value = replacement
    if source[:1].isupper():
        value = value[:1].upper() + value[1:]
    return value


def _rewrite_explicit_self_sentence(match: re.Match) -> str:
    sentence = match.group(0)
    if not re.search(r"\bя\b", sentence, re.IGNORECASE):
        return sentence

    def replace(match_form: re.Match) -> str:
        left = sentence[:match_form.start()]
        if _THIRD_PERSON_BEFORE_RE.search(left):
            return match_form.group(0)
        source = match_form.group("form")
        replacement = _MASCULINE_TO_FEMININE.get(source.lower(), source)
        return _match_case(source, replacement)

    return _ANY_FORM_RE.sub(replace, sentence)


def enforce_maya_feminine(text: str | None) -> str:
    """Correct only MAYA's clear first-person masculine Russian forms.

    Third-person phrases such as ``мастер сделал`` remain untouched.
    """
    value = str(text or "")
    if not value:
        return value
    value = re.sub(
        r"\bя\s+мужчина\b",
        lambda match: _replace_identity(match, "я женщина"),
        value,
        flags=re.IGNORECASE,
    )
    value = re.sub(
        r"\bя\s+парень\b",
        lambda match: _replace_identity(match, "я девушка"),
        value,
        flags=re.IGNORECASE,
    )
    value = re.sub(
        r"\bя\s+мужского\s+рода\b",
        lambda match: _replace_identity(match, "я женского рода"),
        value,
        flags=re.IGNORECASE,
    )
    value = re.sub(
        r"(\bя\b[^.!?\n]{0,120}\bо\s+себе\s+в\s+)мужском\s+роде\b",
        r"\1женском роде",
        value,
        flags=re.IGNORECASE,
    )
    value = _SENTENCE_CHUNK_RE.sub(_rewrite_explicit_self_sentence, value)
    value = _EXPLICIT_SELF_RE.sub(_replace_form, value)
    value = _SENTENCE_SELF_RE.sub(_replace_form, value)
    value = _CUE_SELF_RE.sub(_replace_form, value)
    return value
