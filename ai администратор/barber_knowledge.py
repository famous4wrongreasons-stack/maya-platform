"""
barber_knowledge.py — база знаний по стрижкам/технике для роли MAYA-«наставник».

Зачем: LLM из коробки уверенно выдумывает детали стрижек. Чтобы наставник
давал ФАКТЫ, а не галлюцинации, MAYA отвечает мастеру по технике ТОЛЬКО из
курируемой базы (файл barber_knowledge.md) — простой retrieval по секциям.
Если в базе нет ответа — честно говорит «в базе салона этого нет, уточни у Стаса».

Контент в barber_knowledge.md — ЧЕРНОВИК (общая барбер-практика). Стас правит и
дополняет его стандартами салона; код трогать не нужно — он читает .md как есть.

Зависимостей нет (без эмбеддингов): база маленькая, хватает overlap по словам.
Если база сильно вырастет — заменить retrieve() на векторный поиск.
"""
from __future__ import annotations

import os
import re

KB_PATH = os.path.join(os.path.dirname(__file__), "barber_knowledge.md")

_STOP = {
    "и", "в", "во", "не", "что", "он", "на", "я", "с", "со", "как", "а", "то",
    "все", "она", "так", "его", "но", "да", "ты", "к", "у", "же", "вы", "за",
    "бы", "по", "только", "ее", "мне", "было", "вот", "от", "меня", "о", "из",
    "ему", "теперь", "для", "ли", "если", "или", "ну", "под", "при", "до",
    "это", "этот", "эта", "как", "какой", "какая", "какие", "чем", "про",
}


def _tokenize(text: str) -> list[str]:
    # Лёгкий стемминг: режем слово до префикса в 5 символов, чтобы падежи
    # совпадали («борода»/«бороду»/«бороды»→«бород»; «насадка»/«насадку»→
    # «насад»). Грубо, но для русской морфологии заметно поднимает recall
    # без внешних либ. Если база вырастет — заменить на векторный поиск.
    out = []
    for w in re.findall(r"[а-яёa-z0-9]+", (text or "").lower()):
        if len(w) > 2 and w not in _STOP:
            out.append(w[:5])
    return out


def _load_sections() -> list[dict]:
    """Читает .md и режет на секции по заголовкам '## '. Возвращает
    [{title, body, tokens}]. Пустой список, если файла нет."""
    try:
        with open(KB_PATH, "r", encoding="utf-8") as f:
            raw = f.read()
    except Exception:
        return []
    sections = []
    cur_title, cur_lines = None, []

    def _flush():
        if cur_title is not None:
            body = "\n".join(cur_lines).strip()
            sections.append({
                "title": cur_title,
                "body": body,
                "tokens": set(_tokenize(cur_title + " " + body)),
            })

    for line in raw.splitlines():
        if line.startswith("## "):
            _flush()
            cur_title, cur_lines = line[3:].strip(), []
        elif cur_title is not None:
            cur_lines.append(line)
    _flush()
    return sections


def retrieve(query: str, top_k: int = 2) -> list[dict]:
    """Топ-секций по совпадению слов запроса. [{title, body, score}]."""
    q = set(_tokenize(query))
    if not q:
        return []
    scored = []
    for s in _load_sections():
        score = len(q & s["tokens"])
        if score:
            scored.append({"title": s["title"], "body": s["body"], "score": score})
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_k]


def answer(query: str) -> dict:
    """Готовый ответ для инструмента. Возвращает найденные секции либо
    флаг not_found, чтобы MAYA честно сказала «в базе нет»."""
    hits = retrieve(query, top_k=2)
    if not hits:
        return {
            "found": False,
            "note": ("В базе знаний салона нет ответа на этот вопрос. Не выдумывай "
                     "технику — честно скажи мастеру, что этого пока нет в базе, и "
                     "предложи уточнить у Стаса (база дополняется)."),
        }
    return {
        "found": True,
        "sections": [{"title": h["title"], "text": h["body"]} for h in hits],
        "note": ("Отвечай мастеру ТОЛЬКО на основе этих разделов базы салона. "
                 "Если деталей не хватает — скажи прямо, не домысливай."),
    }
