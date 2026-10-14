# Staging carrier / HTTPS transport — 14 октября 2026

Проверенный committed candidate:
`5b6b3b190a98fd5a8f97748d9408d50268b01087`.
Ветка: `codex/maya-local-crm-setup-20261010`.
Исходный checkpoint: `f991ac59c9064f5541c2d1ddd99ea3244c11a9d6`.
Это подготовка первого phone check, не release admission и не опубликованный сервер.

## Исправлено

Существующий `compose.staging.yml` монтировал старый сайт и отдельные старые
иконки, а Caddy возвращал `app.html`. Теперь единственный PWA payload —
`maya-carrier-react/dist/web`; он строится и проверяется существующим
`maya-carrier-react/tools/release.mjs`. Не создавался второй build/release engine.
Native payload, endpoint substitution и UIKit/Capacitor source не менялись.

Canonical OAuth callback принадлежит отдельно
`maya-saas-backend/deploy/platform/beget-edge/oauth-callback.html`.
Он **не входит** в восемь React-файлов. Подключён только этот файл, на точном
маршруте `/oauth-callback.html`, без публикации соседних PHP/source files.
Его исходные bytes неизменны:
`b10e89898aa74a39756d4f49e1537c8ee6c0066bc7a2666982b4052b0f99444f`.
Историческая копия из старого сайта имеет другой hash и не выбрана.

Перед Docker staging-up теперь проверяет фиксированный selector, строит React
и заново сверяет canonical bytes/parity. Старый shell, другой root, старый callback,
overlay, подмена command или изменённый Caddyfile отказываются.
Тот же тест добавлен как blocking step в release-packaging workflow.
Raw access log исключён; статические страницы/callback отдаются с no-store и
no-referrer. HTTP auth, Client, AR-1, booking, schema и UI не изменены.

## Свежие результаты на committed SHA

| Surface | Result | Boundary |
| --- | --- | --- |
| Staging selector/admission | 17/17 PASS | Включает actual staging-up subprocess: старый selector отказывает до build/Docker/DB |
| Existing release packaging | 18/18 PASS | Actual React reconstruction, PWA/Capacitor parity, stale/forged artifact refusal |
| Actual Caddy HTTPS transport | 23/23 PASS | Loopback only; synthetic upstream; TLS trust supplied only to individual proof requests |
| Existing Telegram popup/callback regression | 21/21 PASS | Synthetic callbacks; no live Telegram |
| Shell syntax / diff whitespace | PASS | Two changed shell scripts; no live launcher run |
| Source invariant | PASS | Clean at start/end; no source changes during final run |

`https-final.json` records exact payload hashes, callback hash, Caddy binary/version,
the finite topology substitutions, orderly process exit and closed listeners.
The temporary TLS private key was removed; no trust was installed in macOS/iPhone.
There was no wildcard/public listener, ACME request, database access or provider call.

The HTTPS proof executes Caddy v2.11.7 downloaded from its
[official release](https://github.com/caddyserver/caddy/releases/tag/v2.11.7).
GitHub asset SHA-256 and the release's published SHA-512 checksum were verified.
It adapts and validates the real Caddyfile, then substitutes only local topology:
loopback port, local payload/callback paths, synthetic upstream and ephemeral TLS.
See [Caddy's distinction between adaptation and validation](https://caddyserver.com/docs/command-line#caddy-adapt).
The Docker image was not run or certified by this proof.

The upstream deliberately returns a distinctive synthetic HTTP error. This proves
API route/status/body/header transport, including native Origin and Authorization
preservation, **not** real backend auth, tenant isolation or business execution.
No historical product receipt is counted as a fresh backend/device result.

## Failed attempts retained

- Initial downloader compared the published checksum list as SHA-256; it actually
  uses SHA-512. Refused before executing the binary. Corrected comparison and
  verified both independently published digests; details in download provenance.
- First HTTPS run passed 13 checkpoints and failed because the proof expected the
  separate callback in the eight-file React tree. Inspection confirmed a real
  omission in the first packaging edit: the route would fall through to React.
  Added the existing canonical callback file/route, without changing its contents.
  The initial FAIL is retained in `https-first-failure.json`.
- Pre-commit corrected transport PASS is retained but is not substituted for the
  fresh clean-commit run. Final receipt is `https-final.json`.

## Exact remaining boundary

- No reachable test HTTPS hostname is assigned or running for the iPhone.
- Mac has no Docker installation. Existing staging compose/bootstrap/seed was
  **not executed** and is not qualified as a ready first-phone backend by this unit.
  A real isolated backend with synthetic data, its exact auth/CORS configuration
  and lifecycle still require preparation/testing before network publication.
- Existing retained owner sessions are loopback-only; no tunnelling/exposure or
  reuse of salon data is authorized by this packaging change.
- Signing/install and device acceptance remain separate steps. Current native
  Debug payload must name the actual prepared HTTPS target explicitly.
- Real model/catalog/customer/booking effects require their own current bounded
  admission; no stored key was read or reused.
- Full CI, mutation corpus, current AR-1 certificate and production release were
  not performed. `CERTIFICATE=NOT_ISSUED`; HANDOFF remains STOP.

Native preflight/signing metadata from the preceding checkpoint remain historical
evidence only. No claim of iPhone install, live Telegram success or deploy is made.

## Receipt inventory

`RESULT.json` gives final runner stages and log hashes; `FILES.json` hashes the
ten preserved text receipts; `scope.json` proves zero diff in product/native/
canonical callback paths against the preceding checkpoint. Scratch source:
`/private/tmp/maya-staging-carrier-final-20261014-01` and
`/private/tmp/maya-staging-https-20261014-final`.

Public deployment, migrations, grants, real OTP/YCLIENTS/model, iPhone install,
system trust installation, keys read, Git push/merge: **0**.
