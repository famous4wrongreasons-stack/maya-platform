# Industry Presets

## Purpose

Industry presets provide terminology, initial configuration and recommended features. They never fork business logic or database schemas.

## Shape

```ts
type IndustryPreset = {
  id: string;
  name: string;
  terminology: {
    providerSingular: string;
    providerPlural: string;
    customerSingular: string;
    customerPlural: string;
    bookingSingular: string;
    serviceSingular: string;
    locationSingular: string;
  };
  defaultFeatures: string[];
  defaultBookingSettings: Record<string, unknown>;
  defaultAnalyticsWidgets: string[];
};
```

## Initial presets

| Preset | Provider | Customer | Location |
|---|---|---|---|
| general_service | Специалист | Клиент | Филиал |
| beauty_salon | Мастер | Клиент | Салон |
| barbershop | Барбер | Клиент | Барбершоп |
| dental_clinic | Врач | Пациент | Клиника |
| auto_detailing | Специалист | Клиент | Детейлинг-центр |
| education | Преподаватель | Ученик | Учебный центр |

## Application rules

- Core APIs and tables use neutral names.
- Preset values seed tenant configuration once; later tenant edits do not mutate the global preset.
- A preset may recommend modules but entitlement still comes from the plan/override engine.
- Reports retain canonical metric IDs while labels can change.
- Legal, consent and booking defaults are reviewed per industry before production use.

## Adding a preset

1. Add a unique ID and complete terminology.
2. Use only registered feature keys.
3. Validate booking/analytics defaults against schemas.
4. Add fixture and snapshot tests.
5. Seed a demo tenant; do not copy UI or backend modules.
