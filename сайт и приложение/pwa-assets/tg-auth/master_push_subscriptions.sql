CREATE TABLE IF NOT EXISTS master_push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER,
    telegram_chat_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    subscription_json TEXT NOT NULL,
    user_agent TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_master_push_staff
ON master_push_subscriptions(staff_id);

CREATE INDEX IF NOT EXISTS idx_master_push_chat
ON master_push_subscriptions(telegram_chat_id);
