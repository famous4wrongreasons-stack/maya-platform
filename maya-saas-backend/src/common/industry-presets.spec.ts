import {
  DEFAULT_INDUSTRY_PRESET_ID,
  INDUSTRY_PRESET_IDS,
  getIndustryPreset,
  listIndustryPresets,
} from './industry-presets';

describe('industry preset registry', () => {
  it('publishes unique complete presets', () => {
    const presets = listIndustryPresets();

    expect(presets).toHaveLength(INDUSTRY_PRESET_IDS.length);
    expect(new Set(presets.map((preset) => preset.id)).size).toBe(
      presets.length,
    );

    for (const preset of presets) {
      expect(preset.name).toBeTruthy();
      expect(preset.terminology.providerSingular).toBeTruthy();
      expect(preset.terminology.customerSingular).toBeTruthy();
      expect(preset.terminology.bookingSingular).toBeTruthy();
      expect(preset.terminology.serviceSingular).toBeTruthy();
      expect(preset.terminology.locationSingular).toBeTruthy();
      expect(preset.defaultFeatures.length).toBeGreaterThan(0);
      expect(preset.defaultAnalyticsWidgets.length).toBeGreaterThan(0);
    }
  });

  it('falls back to general service terminology for unknown legacy values', () => {
    expect(getIndustryPreset('unknown').id).toBe(DEFAULT_INDUSTRY_PRESET_ID);
    expect(getIndustryPreset(null).terminology.providerSingular).toBe(
      'Специалист',
    );
  });
});
