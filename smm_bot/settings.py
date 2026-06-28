"""Сохранение и чтение настроек бота которые меняются на лету."""
import json
import os
import logging

import config

log = logging.getLogger(__name__)

DEFAULT_FEATURES = {
    "smart_distribution":         True,   # умное распределение по лимитам соцсетей
    "queue_health_alerts":        True,   # уведомления когда очередь заканчивается
    "holiday_posts":              True,   # подсказки по праздникам
    "platform_specific_captions": False,  # разные тексты для разных платформ
}


def _load() -> dict:
    if not os.path.exists(config.SETTINGS_FILE):
        return {}
    try:
        with open(config.SETTINGS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        log.error(f"settings load error: {e}")
        return {}


def _save(data: dict):
    try:
        with open(config.SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        log.error(f"settings save error: {e}")


def get_active_model() -> str:
    return _load().get("active_model", config.DEFAULT_AI_MODEL)


def set_active_model(model: str):
    data = _load()
    data["active_model"] = model
    _save(data)


def get_features() -> dict:
    data = _load()
    features = data.get("features", {})
    # Заполняем дефолтами для новых ключей
    for k, v in DEFAULT_FEATURES.items():
        if k not in features:
            features[k] = v
    return features


def is_feature_enabled(name: str) -> bool:
    return get_features().get(name, False)


def toggle_feature(name: str) -> bool:
    """Переключает фичу и возвращает новое состояние."""
    data = _load()
    features = data.get("features", DEFAULT_FEATURES.copy())
    features[name] = not features.get(name, DEFAULT_FEATURES.get(name, False))
    data["features"] = features
    _save(data)
    return features[name]


def get_meta(key: str, default=None):
    """Произвольные метаданные (например last_notified_at)."""
    return _load().get(f"meta_{key}", default)


def set_meta(key: str, value):
    data = _load()
    data[f"meta_{key}"] = value
    _save(data)


AVAILABLE_MODELS = {
    "claude": "🟣 Claude Sonnet 4.5",
    "gpt4o":  "🟢 GPT-4o (OpenAI)",
}

FEATURES_LIST = [
    ("smart_distribution",         "🤖 Умное распределение по лимитам соцсетей"),
    ("queue_health_alerts",        "📊 Уведомления о пустой очереди"),
    ("holiday_posts",              "📅 Праздничные посты"),
    ("platform_specific_captions", "📱 Разные тексты для платформ"),
]
