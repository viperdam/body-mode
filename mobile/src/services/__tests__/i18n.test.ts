/**
 * i18n Translation Coverage Tests
 *
 * These tests ensure all translations are complete and consistent.
 * Run with: npm test -- i18n.test.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const TRANSLATIONS_DIR = path.join(__dirname, '../../i18n/translations');
const LANGUAGES = ['ar', 'de', 'en', 'es', 'fr', 'hi', 'ja', 'ko', 'nl', 'pt', 'sw', 'tr', 'zh'];
const BASELINE_LANG = 'en';

// Load all translation files
function loadTranslations(): Record<string, Record<string, string>> {
  const translations: Record<string, Record<string, string>> = {};
  for (const lang of LANGUAGES) {
    const filePath = path.join(TRANSLATIONS_DIR, `${lang}.json`);
    const content = fs.readFileSync(filePath, 'utf8');
    translations[lang] = JSON.parse(content);
  }
  return translations;
}

describe('i18n Translation Coverage', () => {
  let translations: Record<string, Record<string, string>>;
  let baselineKeys: Set<string>;

  beforeAll(() => {
    translations = loadTranslations();
    baselineKeys = new Set(Object.keys(translations[BASELINE_LANG]));
  });

  test('all 13 language files exist and load successfully', () => {
    expect(Object.keys(translations)).toHaveLength(13);
    for (const lang of LANGUAGES) {
      expect(translations[lang]).toBeDefined();
      expect(typeof translations[lang]).toBe('object');
    }
  });

  test('all languages have the same number of keys as baseline (en)', () => {
    const baselineCount = baselineKeys.size;

    for (const lang of LANGUAGES) {
      const langCount = Object.keys(translations[lang]).length;
      expect(langCount).toBe(baselineCount);
    }
  });

  test('no missing keys in any language', () => {
    for (const lang of LANGUAGES) {
      if (lang === BASELINE_LANG) continue;

      const langKeys = new Set(Object.keys(translations[lang]));
      const missing: string[] = [];

      for (const key of baselineKeys) {
        if (!langKeys.has(key)) {
          missing.push(key);
        }
      }

      expect(missing).toHaveLength(0);
    }
  });

  test('no empty translation values', () => {
    for (const lang of LANGUAGES) {
      const empty: string[] = [];

      for (const [key, value] of Object.entries(translations[lang])) {
        if (typeof value === 'string' && value.trim() === '') {
          empty.push(key);
        }
      }

      expect(empty).toHaveLength(0);
    }
  });

  test('placeholders are preserved in all translations', () => {
    const placeholderRegex = /%\{(\w+)\}/g;

    for (const lang of LANGUAGES) {
      if (lang === BASELINE_LANG) continue;

      for (const key of baselineKeys) {
        const enValue = translations[BASELINE_LANG][key] || '';
        const langValue = translations[lang][key] || '';

        const enPlaceholders = [...enValue.matchAll(placeholderRegex)]
          .map(m => m[1])
          .sort();
        const langPlaceholders = [...langValue.matchAll(placeholderRegex)]
          .map(m => m[1])
          .sort();

        // Same placeholders should exist in both
        expect(langPlaceholders).toEqual(enPlaceholders);
      }
    }
  });

  test('sleep quality keys exist and are translated', () => {
    const qualityKeys = [
      'sleep.quality.excellent',
      'sleep.quality.good',
      'sleep.quality.fair',
      'sleep.quality.poor'
    ];

    for (const lang of LANGUAGES) {
      let sameAsEnglishCount = 0;
      for (const key of qualityKeys) {
        expect(translations[lang][key]).toBeDefined();
        expect(translations[lang][key].length).toBeGreaterThan(0);

        if (
          lang !== BASELINE_LANG &&
          translations[lang][key] === translations[BASELINE_LANG][key]
        ) {
          sameAsEnglishCount += 1;
        }
      }

      // Allow occasional identical terms (e.g., cognates), but not all four.
      if (lang !== BASELINE_LANG) {
        expect(sameAsEnglishCount).toBeLessThan(qualityKeys.length);
      }
    }
  });

  test('overlay description keys exist and are translated', () => {
    const overlayKeys = [
      'overlay.description.meal',
      'overlay.description.hydration',
      'overlay.description.workout',
      'overlay.description.sleep',
      'overlay.description.work_break',
      'overlay.description.default'
    ];

    for (const lang of LANGUAGES) {
      for (const key of overlayKeys) {
        expect(translations[lang][key]).toBeDefined();
        expect(translations[lang][key].length).toBeGreaterThan(0);
      }
    }
  });

  test('error keys exist and are translated', () => {
    const errorKeys = [
      'errors.llm.timeout',
      'errors.video.not_found',
      'errors.video.too_large',
      'errors.cloud.offline'
    ];

    for (const lang of LANGUAGES) {
      for (const key of errorKeys) {
        expect(translations[lang][key]).toBeDefined();
        expect(translations[lang][key].length).toBeGreaterThan(0);
      }
    }
  });

  test('RTL language (Arabic) is present and translated', () => {
    const arTranslations = translations['ar'];
    expect(arTranslations).toBeDefined();

    // Check a few key translations are in Arabic script
    const sampleKey = 'sleep.quality.excellent';
    const arValue = arTranslations[sampleKey];

    // Arabic text contains Arabic Unicode characters (U+0600 to U+06FF)
    const hasArabicChars = /[\u0600-\u06FF]/.test(arValue);
    expect(hasArabicChars).toBe(true);
  });

  test('Arabic is not mostly English placeholders', () => {
    const enTranslations = translations[BASELINE_LANG];
    const arTranslations = translations['ar'];
    const keys = Object.keys(enTranslations);

    const sameAsEnglish = keys.filter((key) => arTranslations[key] === enTranslations[key]);
    const sameRatio = sameAsEnglish.length / keys.length;

    // Allow a small set of intentionally shared values/acronyms, but prevent placeholder-English files.
    expect(sameRatio).toBeLessThan(0.1);

    const criticalArabicKeys = [
      'select_language',
      'welcome_title',
      'dashboard.action.scan_food',
      'settings.context_correction.outside',
      'weather.clear',
      'onboarding.goals.title',
    ];

    for (const key of criticalArabicKeys) {
      expect(arTranslations[key]).toBeDefined();
      expect(arTranslations[key]).not.toBe(enTranslations[key]);
    }
  });

  test('translations do not contain placeholder token artifacts', () => {
    const tokenArtifactRegex = /__PH_\d+__/;

    for (const lang of LANGUAGES) {
      const artifactKeys: string[] = [];
      for (const [key, value] of Object.entries(translations[lang])) {
        if (typeof value === 'string' && tokenArtifactRegex.test(value)) {
          artifactKeys.push(key);
        }
      }
      expect(artifactKeys).toHaveLength(0);
    }
  });
});

describe('i18n Key Naming Conventions', () => {
  let translations: Record<string, Record<string, string>>;

  beforeAll(() => {
    translations = loadTranslations();
  });

  test('keys follow dot notation for namespacing', () => {
    const keys = Object.keys(translations[BASELINE_LANG]);
    const namespacedKeys = keys.filter(k => k.includes('.'));

    // Most keys should be namespaced (allow some top-level keys)
    const ratio = namespacedKeys.length / keys.length;
    expect(ratio).toBeGreaterThan(0.7); // At least 70% should be namespaced
  });

  test('no duplicate keys with different cases', () => {
    const keys = Object.keys(translations[BASELINE_LANG]);
    const lowerKeys = keys.map(k => k.toLowerCase());
    const uniqueLower = new Set(lowerKeys);

    // All lowercase versions should be unique
    expect(uniqueLower.size).toBe(keys.length);
  });
});
