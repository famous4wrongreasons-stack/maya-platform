# AGENTS.md — MAYA_WORKSPACE

This is a local meta-repository for MAYA / Мужская Эстетика project organization.

## Purpose

- Keep a single local index of the platform repo, iOS repo, docs, deployment notes and design conventions.
- Do not store secrets here.
- Do not copy live `.env`, `config.py` secrets, SSH keys, databases with PII, logs with tokens, or payment credentials.

## Project Paths

- Platform repo: `/Users/stanislavmosin/Desktop/сайт и приложение`
- Platform guide: `/Users/stanislavmosin/Desktop/сайт и приложение/AGENTS.md`
- iOS repo: `/Users/stanislavmosin/Desktop/maya-ios`
- iOS guide: `/Users/stanislavmosin/Desktop/maya-ios/AGENTS.md`
- This metarepo: `/Users/stanislavmosin/Desktop/MAYA_WORKSPACE`

## Desktop Cleanup Policy

- Do not move existing project directories during ordinary development.
- Existing absolute paths are used by build/deploy commands and Xcode.
- If cleanup is requested, prepare a migration plan first and preserve compatibility through symlinks or updated scripts.

## Design Source Of Truth

- Brand typography and Aurora app conventions: platform `AGENTS.md`.
- Staff chat bubble SVG reference and current implementation: platform `AGENTS.md`, iOS `AGENTS.md`.
- Backend/AI/bot operational rules: platform `AGENTS.md`.

