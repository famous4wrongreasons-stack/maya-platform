# B38/R01 — authenticated Beget control-plane inventory

2026-09-12, incoming HEAD `9ff45e6a12ab69027bc995ff71e2533ce0a4134d`.
Isolated worktree `contour/c7-recovery-cd157b66`; canonical remote branch
`codex/maya-brain-systemic-release-20260815`. Fetch/preflight confirmed a clean
worktree and HEAD = origin. This step changes documentation/evidence only.

## Verdict

**Authenticated panel inventory obtained. Effective public relay coverage still
NOT certified.** The earlier missing login/site-list evidence is resolved.
There is **exactly one remaining evidence type**:

> The account-scoped **effective Beget Nginx/Apache virtual-host routing and PHP
> handler configuration**, including all includes, ServerAlias/default/wildcard
> bindings, Alias/ScriptAlias, rewrite/proxy targets and handler/extension
> overrides — or an authoritative Beget attestation of that complete mapping.

This must establish whether anything can serve/execute a PHP artifact outside
those three bound `public_html` roots, including the known outside-root recovery
copies. It must also settle server-level overrides for the unbound fourth site.
A screenshot of the same Sites list is no longer the missing evidence.

The panel exposes domain bindings and per-domain PHP settings, but not that
complete effective configuration. The shared-host SSH account receives
`PermissionError` on `/etc/nginx`, `/etc/apache2/virtdom` and
`/etc/apache2/conf-available`; normal alternate config paths are absent. No
permission bypass, config change or diagnostic PHP upload was attempted.
The existing support-ticket list is empty; no configuration attestation was
available and no message was sent. Generic hosting documentation is not proof
of this account's absence of server-level overrides.

Per the owner's completeness prerequisite: **STOP before R01 production
remediation or Wave 3 cutover**. Do not report `UNACCOUNTED PUBLIC RELAYS: 0`.
This remains the existing R01 coverage issue; no new C7 Q23/Bxx/owner decision.

## Authenticated control-plane observations

Read the existing Chrome session of `mocine3388` using native browser UI only:
Sites, Domains/subdomains, all four complete DNS-zone views, per-domain settings
and PHP-directive editors, IP management, account/server information, and the
existing support-ticket list. No checkbox, PHP version, domain linkage, record
or form was changed/submitted. [Transcribed UI evidence](evidence/r01-beget-control-plane-readonly/control-plane-observations.json)
records its provenance explicitly; it is not presented as a server config export.

Both Sites and account statistics show **4 sites**. Domains and account statistics
show **4 domain objects**. Unfiltered lists and all four site mappings were read.

All paths below have the absolute prefix `/home/m/mocine3388/`:

| Domain binding in Sites | Site / exact document root suffix | PHP | CGI | Panel HTTP→HTTPS | Custom PHP directives |
|---|---|---|---|---|---|
| `mayaos.ru` | `mayaos.ru/public_html` | 5.6 | OFF | OFF | 0 |
| `mocine3388.beget.tech` | `mocine3388.beget.tech/public_html` | 5.6 | OFF | Control not offered | 0 |
| none | `muzhskayaestetik.rf/public_html` | No bound-domain setting | — | — | — |
| `мужскаяэстетика.рф` | `muzhskayaestetika.rf/public_html` | 8.2 | OFF | OFF | 0 |
| `malesthetic.pro` | same `muzhskayaestetika.rf/public_html` | 8.2 | OFF | ON | 0 |

The similar names are distinct: **`muzhskayaestetik.rf` has no final `a`**.
Its site directory is empty and its `public_html` does not exist on disk.
The other three roots exist, are not symlinks, and were traversed recursively.
No filesystem read errors or nested symlinks were observed.
The fourth entry is accounted as unbound/missing, not silently discarded and
not counted as a fourth demonstrated public PHP root.

All PHP-directive editors contained no rows and a disabled Apply button.
Redis sessions are OFF for all four domains. Server information lists
`prime.beget.com`, Apache 2.4.63 and Nginx 1.21.1. Shared-version phpinfo links
are available; these do not export this account's effective virtual hosts.
IP statistics show one dedicated IP, while `/sites/ip` presented the order form;
no additional routing export was available there. No IP was ordered or changed.

## Domains, DNS names, aliases and redirects

All four complete panel zones contain **17 named hosts** in total:

| Zone | Apex and `www` A destination | Other names |
|---|---|---|
| `mayaos.ru` | `45.130.41.193` | `autoconfig`, `autodiscover` → `autoconfig.beget.com` |
| `malesthetic.pro` | `45.130.41.193` | same two mail names; `rt` → `111.88.148.206` |
| `xn--80aaocmjdk0cclbf8l3a.xn--p1ai` | `45.130.41.193` | same two mail names |
| `mocine3388.beget.tech` | `5.101.153.111` | same two mail names |

No wildcard or AAAA routing records appear in those complete zone views.
The eight mail CNAME names are accounted as Beget mail-service routing, not Maya
PHP roots. The four `www` names are separately accounted; Cyrillic/Punycode are
one domain identity. The IDN and `malesthetic.pro` explicitly share one site.
DNS membership/destination is not treated as proof of an unshown ServerAlias.

[30 read-only HEAD checks](evidence/r01-beget-control-plane-readonly/http-alias-check.json)
used HTTP and HTTPS with no action/query/body/auth and did not follow redirects:

- `www.mayaos.ru` → `https://mayaos.ru/...` (301).
- IDN apex and IDN `www` → `https://malesthetic.pro/...` (301).
- `http://www.malesthetic.pro/...` → HTTPS `www`, then the separately checked
  HTTPS URL → `https://malesthetic.pro/...` (301 each).
- `malesthetic.pro` HTTP→HTTPS matches the enabled panel setting (301).
- MayaOS `/app/` → `/app/?booking_tenant=maya-os` (302); maintenance preserved.
- Both technical-domain names return HTTP 500 for `/api-proxy.php`; both HTTPS
  attempts fail connection. This is not HTTP denial/security retirement.
- `rt.malesthetic.pro` HTTP→HTTPS (301); HTTPS `/` returns 403.

Observed `.htaccess` contains five redirect rules and two internal rewrites:
MayaOS `www`, `app.html`, and queryless `/app`; salon IDN and salon `www` redirects;
MayaOS `/api[/...]` → `maya-platform-api.php/...`; salon `/g/...` → `g-landing.html`.
The panel HTTPS redirect is an additional server-controlled redirect. Eight
nested `.htaccess` files and ancestor configuration existence were rechecked.
No user-level Alias/ScriptAlias/handler change or escape beyond a root is shown
in those files. [Full rule evidence](evidence/r01-beget-control-plane-readonly/host-refresh.json)
and [boundary/config check](evidence/r01-beget-control-plane-readonly/server-boundary.json).
This accounts for observed rules, **not all inaccessible server-level rules**.

The [official Beget PHP documentation](https://beget.com/ru/kb/faq/hosting/php)
lists the normal PHP extensions and permits additional extension handling through
`.htaccess`. The finite filename check therefore also included `.phtm`, `.phtml`,
`.phpN` and `.phar`: no additional files with those extensions exist in the three
roots. This documentation is used for candidate coverage, not as an account
configuration attestation.

## Separately accounted VPS destinations

Because `rt.malesthetic.pro` points to the existing backend VPS, its effective
Nginx configuration was read using `sudo -n nginx -T`; no reload or configuration
write occurred. [Sanitized routing lines and full-output hash](evidence/r01-beget-control-plane-readonly/vps-routing-readonly.json).
The PHP mention in the unfiltered dump is commented template text; the follow-up
[active-directive/root check](evidence/r01-beget-control-plane-readonly/vps-root-check.json)
finds **0 active PHP/FastCGI directives** and **0 PHP-extension artifacts** in
three configured static roots, with no symlinks/read errors:

| Existing VPS route | Target / filesystem role |
|---|---|
| `rt.malesthetic.pro` | Existing Python/realtime upstream `127.0.0.1:8080` |
| `api.111.88.148.206.nip.io` | Backend upstream `127.0.0.1:3107`; HTTP ACME root `/var/www/maya-saas-acme` |
| `maya.111.88.148.206.nip.io` | Static `/var/www/maya-platform`; `/api/` → `127.0.0.1:3107` |
| VPS `mayaos.ru` HTTP vhost | `/var/www/maya-platform` ACME/static root and HTTPS redirect; public panel DNS points to Beget instead |
| VPS default HTTP vhost | `/var/www/html` |

The two `nip.io` names are additional existing documented Maya hosts outside
Beget's four zone lists, not newly invented domains or new mutation owners:
see `maya-saas-backend/deploy/platform/README.md`, platform Nginx files, and
`deploy/live-widgets/api.111.88.148.206.nip.io.*.conf`. Thus 17 Beget-zone names
plus two already-documented VPS names are accounted separately. The VPS
configuration proof does not substitute for the shared Beget configuration.
No unrestricted inventory or Chapter 7 scope expansion was started.

## Relay artifact state and preservation

Fresh source hashes match all **26 previously inventoried PHP artifacts**.
The existing [artifact table](evidence/r01-public-relay-coverage/artifact-inventory.md)
remains valid; no source content/secrets were copied into the new evidence.
The prior 12 observed application artifacts are still an **observed count**, not
an account-wide completeness claim. Current targeted HEAD checks reaffirm:

| Artifact | Current evidence | Disposition in this step |
|---|---|---|
| salon `/app/api-proxy.php` | SHA `d5eeaa82…`; HTTPS HEAD 200; known direct booking regression | unchanged |
| salon `/app/backups/api-proxy-before-loyalty-20260721-2035.php` | SHA `8cc22eaf…`; HTTPS HEAD 200; all three salon alias paths redirect to it | unchanged |
| technical `/api-proxy.php` | SHA `5904e859…`; direct `/records` writer; both HTTP hostnames return 500 | unchanged |

No booking action was called; these observations do not assert successful
provider effects. All 23 pinned artifacts retain their prior actual hashes,
including both maintenance pages, both PWA backup copies and the already-known
unsafe main relay hash. The 67 outside-root recovery copies from the prior
bounded inventory cannot be certified unreachable without the one missing
server-configuration evidence type.

## Status and continuation

```text
BEGET AUTHENTICATED READ-ONLY INVENTORY: PERFORMED
CONFIGURED SITE MAPPINGS ACCOUNTED: 4/4
BOUND EXISTING BEGET WEB ROOTS SCANNED: 3/3
UNBOUND SITE CLASSIFIED: 1/1
BEGET DOMAIN OBJECTS ACCOUNTED: 4/4
NAMED HOSTS IN FOUR BEGET DNS ZONES ACCOUNTED: 17/17
ADDITIONAL DOCUMENTED VPS HOSTS ACCOUNTED: 2/2
VISIBLE DOMAIN PHP SETTINGS ACCOUNTED: 4/4
ADDITIONAL VPS STATIC ROOTS CHECKED: 3/3 — NO PHP HANDLER/ARTIFACT
PUBLIC WEB ROOTS INVENTORIED: OBSERVED ROOTS ABOVE; EFFECTIVE TOTAL UNPROVEN
ALIASES/MIRRORS ACCOUNTED: VISIBLE BINDINGS/DNS/HTTP CHECKS; SERVER TOTAL UNPROVEN
REWRITE TARGETS ACCOUNTED: USER-LEVEL RULES AND VPS; BEGET SERVER TOTAL UNPROVEN
PHP EXECUTION SURFACES ACCOUNTED: 26 OBSERVED PHP ARTIFACTS; EFFECTIVE TOTAL UNPROVEN
HTTP-REACHABLE RELAY ARTIFACTS: 12 PREVIOUSLY OBSERVED; COMPLETE TOTAL UNPROVEN
UNACCOUNTED PUBLIC RELAYS: UNKNOWN — NOT 0
MISSING EVIDENCE TYPES: 1
R01 COVERAGE MANIFEST COMPLETE: NO
R01 PRODUCTION REMEDIATION: NOT PERFORMED
WAVE 3 CUTOVER: NO
RUNTIME/SCHEMA/MIGRATION/DEPLOYMENT CHANGES: 0
PRODUCTION CONFIGURATION/BUSINESS/PROVIDER/MESSAGE MUTATIONS: 0
MAIN DIRTY WORKTREE TOUCHED: NO
PRE-EXISTING DATABASES TOUCHED: 0
OWNED TEMP PROCESSES/WATCHERS/BROWSERS/DATABASES: 0
PROCESS HYGIENE: 0
```

[Status receipt](evidence/r01-beget-control-plane-readonly/coverage-status.json),
[preservation](evidence/r01-beget-control-plane-readonly/preservation-readonly.json),
[hygiene](evidence/r01-beget-control-plane-readonly/hygiene.json).
Main original 24 dirty entries plus the previously documented external 25th entry
remain byte/hash unchanged. No old DB was opened. All owned read probes exited;
no browser/tab was created, and the existing Chrome tab was left on Sites.

No full regression rerun is needed for this documentation-only inventory. The
prior 430 suites / 3607 tests and lint/types/build/Prisma PASS are preserved as
historical receipts; they do not authorize a cutover while live coverage is
uncertified. Once the single evidence gap is closed, use the already approved
R01 remediation/gates, then backend-only P03/P04 and P06. Preserve maintenance
pages and PWA backups. No additional C7 architecture approval is required.
