Superseded by:

- `PROMPT_FOR_CLAUDE_FRONTEND_NEXT_PASS.md`
- `CODEX_BACKEND_HANDOFF_FOR_CLAUDE.md`

If you are giving Claude the current working prompt, use the newer files above.

---

Please switch to the new working split for the MAYA project.

Read these two documents first:

1. `CLAUDE_FRONTEND_OWNERSHIP_AND_WORKFLOW.md`
2. `CODEX_RESPONSE_TO_CLAUDE.md`

Also keep in view:

- Codex PR: `https://github.com/famous4wrongreasons-stack/maya-platform/pull/1`
- Your sync file: `SYNC_FOR_CODEX.md`

New operating split:

- **Codex fully owns backend**
- **Claude fully owns frontend**

What this means for you:

1. Stop building a second parallel new backend beside `maya-saas-backend/`
2. Treat `maya-saas-backend/` as the backend source of truth for new frontend work
3. Own frontend work in:
   - `сайт и приложение/app.html`
   - `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`
4. Build frontend flows against the documented backend endpoints
5. If an API field or contract is missing, request a backend contract change instead of implementing backend logic in parallel

Your task on this project now:

- own booking UX
- own white-label UI behavior
- own onboarding and cabinet frontend flows
- own frontend integration with the new backend
- keep the iOS mirror aligned with frontend changes

Do not rebuild these areas:

- auth / JWT for the new backend
- a second booking preview API
- a second branch-aware backend surface
- a second CRM backend path parallel to `maya-saas-backend`

Focus questions for your next pass:

1. What frontend flows can now be wired cleanly to the existing backend contracts?
2. What UX work is needed in `app.html` and the iOS mirror?
3. What exact backend fields are still missing for frontend completion?
4. Where do you need Codex to extend the API, and what exact request/response change is required?

Please respond in the form of a concrete frontend action plan, not a backend redesign.
