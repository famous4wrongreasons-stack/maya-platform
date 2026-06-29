# MAYA Project Index

## Active

| Project | Path | Git | Purpose |
|---|---|---|---|
| Platform | `/Users/stanislavmosin/Desktop/сайт и приложение` | yes | Website, PWA, Telegram bot backend, docs |
| iOS | `/Users/stanislavmosin/Desktop/maya-ios` | yes | Capacitor iOS wrapper |

## Platform Components

- Website root: `сайт и приложение/index.html`
- PWA: `сайт и приложение/app.html`
- PWA Beget deploy target: `~/muzhskayaestetika.rf/public_html/app/index.html`
- Telegram bot: `ai администратор/bot.py`
- REST/webhook server: `ai администратор/webhook_server.py`
- AI model routing: `ai администратор/claude_ai.py`
- Voice realtime bridge: `ai администратор/realtime_bridge.py`
- AI cost accounting: `ai администратор/ai_billing.py`

## iOS Components

- Web source: `www/index.html`
- Native project: `ios/App/App.xcodeproj`
- Generated public copy after sync: `ios/App/App/public/index.html`

## Current High-Risk Notes

- Do not expose secrets from backend config/logs.
- Do not move project folders without updating build/deploy paths.
- Platform repo can have unrelated dirty files; stage only task files.
- iOS repo should not commit build outputs.

