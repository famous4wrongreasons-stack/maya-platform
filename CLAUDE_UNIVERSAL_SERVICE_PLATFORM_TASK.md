# Claude Frontend Task: Universal Service Platform

## Why this correction is required

The current presentation layer still reflects an earlier salon-only brief.
That brief has been superseded by the canonical Maya architecture assignment:
Maya is one multi-tenant white-label platform for any person or organization
that provides services.

Beauty salons and barbershops are only industry presets. They must not define
the platform's default language, navigation, onboarding or demo.

Examples of supported tenants include independent specialists, clinics,
dentists, psychologists, massage therapists, trainers, tutors, educational
centers, auto services, detailing centers, photographers, legal/consulting
businesses, salons and barbershops.

Do not create a new frontend, an industry fork or another application. Adapt
the existing frontend in the current Maya platform repository.

## Ownership boundary

Claude owns only the presentation-layer implementation in:

- `сайт и приложение/maya-site.html`;
- `сайт и приложение/maya-start.html`;
- `сайт и приложение/maya-admin.html`;
- `сайт и приложение/app.html`.

Codex owns backend contracts, Prisma, tenant isolation, CI, Git integration and
the later iOS mirror sync. Do not edit backend or Prisma files.

## Backend contract already prepared by Codex

Use these endpoints and fields instead of hardcoded industry assumptions:

### Industry catalog

`GET /api/industry-presets`

Response shape:

```json
{
  "default_id": "general_service",
  "items": [
    {
      "id": "general_service",
      "name": "Сервисный бизнес",
      "terminology": {
        "providerSingular": "Специалист",
        "providerPlural": "Специалисты",
        "customerSingular": "Клиент",
        "customerPlural": "Клиенты",
        "bookingSingular": "Запись",
        "bookingPlural": "Записи",
        "serviceSingular": "Услуга",
        "servicePlural": "Услуги",
        "locationSingular": "Локация",
        "locationPlural": "Локации"
      }
    }
  ]
}
```

Available IDs:

- `general_service`;
- `solo_specialist`;
- `beauty_salon`;
- `barbershop`;
- `dental_clinic`;
- `auto_detailing`;
- `education`.

### Self-serve onboarding

`POST /api/onboarding/trial` now accepts optional `industryPresetId`. If it is
omitted, the backend uses `general_service`.

### Tenant public config

`GET /api/mobile/config/:tenantSlug` now returns:

- `industry_preset` with complete terminology;
- `tenant.industry_preset_id`;
- branding, content, feature flags and booking mode as before.

### Demo tenants

- Neutral default demo: `demo-business` (`general_service`).
- Existing Maya tenant: `malesthetic` (`barbershop`).

The second tenant is a compatibility/customer example. It must not dictate the
platform-wide copy.

## Required frontend changes

### 1. Storefront

Update `maya-site.html` so the primary promise is for service providers in
general, not salons.

Required direction:

- explain that Maya is an application and operating layer for a service
  business under its own brand;
- show a representative set of industries, including solo specialists,
  healthcare, education, automotive, consulting and beauty;
- keep salon/barbershop only as examples among peers;
- replace salon-only feature copy with provider/customer/service/location
  language;
- change both live-demo links to `demo-business`;
- use canonical plan positioning from the architecture assignment:
  `Solo 990`, `Business 1 990`, `Business+ 2 990` rubles per month;
- do not hardcode plan checks into application logic.

### 2. Self-serve onboarding

Update `maya-start.html`:

- title and labels must say business/workspace, not salon;
- fetch `GET /api/industry-presets` when the page opens;
- add a required, accessible industry selector with `general_service` as the
  safe fallback;
- submit the selected `industryPresetId` to `/onboarding/trial`;
- use neutral fields such as business name and main location;
- success copy must say the workspace/business was created;
- keep the existing one-time secure handoff behavior unchanged.

If the catalog request fails, show the form with `general_service`; do not block
signup and do not invent a second local catalog.

### 3. Tenant admin

Update `maya-admin.html`:

- replace platform-wide salon wording with business/workspace wording;
- show the selected industry in overview;
- use preset terminology for provider, customer, booking, service and location
  labels where those concepts appear;
- platform-owner create/edit flows must send `industryPresetId`;
- tenant admin must never gain platform-owner permissions;
- preserve the current auth/session pipeline and tenant-state fence exactly.

### 4. Customer application

Update `app.html` without redesigning or forking it:

- default generic demo copy must not feature barbers, haircuts or salon-only
  promises;
- read terminology from `config.industry_preset.terminology`;
- use server-provided branding/content before preset defaults;
- use preset terminology only as a label/config layer, never as separate
  business logic;
- preserve the existing `malesthetic` branded experience when its tenant
  config/content is loaded;
- preserve tenant-scoped storage, auth refresh, OAuth state and offline fences.

### 5. Navigation and feature gates

- Build labels/navigation from role, feature flags, tenant config and industry
  preset.
- Do not create separate menus for industries or plans.
- Do not show modules that the backend feature set does not grant.

## Explicit non-goals

- Do not create a new app or repository.
- Do not duplicate HTML per industry.
- Do not edit backend, Prisma, migrations or CI.
- Do not connect real CRM, SMS, OAuth or payment credentials.
- Do not change production files or deploy anything.
- Do not weaken session security to persist tokens in localStorage.
- Do not remove the existing `malesthetic` tenant or its vertical content.

## Acceptance checks

1. Storefront reads as a universal service platform at first glance.
2. Signup requires an industry selection and sends `industryPresetId`.
3. `general_service`, `education`, `dental_clinic` and `auto_detailing` each
   display different terminology using the same files/code paths.
4. `demo-business` contains no salon/barber assumptions.
5. `malesthetic` still receives its barbershop branding/content.
6. Full local path works: storefront -> signup -> admin -> client preview.
7. No browser console errors.
8. All inline scripts parse.
9. Desktop and mobile screenshots are checked for each of the four surfaces.
10. No backend or production file is changed.

## Handoff back to Codex

Create `CLAUDE_UNIVERSAL_SERVICE_PLATFORM_RESULTS.md` with:

- exact files changed;
- screenshots/URLs checked;
- presets verified;
- inline-script parse result;
- remaining frontend limitations;
- confirmation that backend/Prisma/production were untouched.

Commit and push only the frontend branch. Codex will review the diff, run the
backend/frontend integration matrix and mirror the approved PWA into iOS.
