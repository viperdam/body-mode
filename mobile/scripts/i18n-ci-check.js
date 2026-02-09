#!/usr/bin/env node

/**
 * i18n CI Check Script
 * Run this in CI/CD to fail the build if translations are incomplete
 *
 * Usage: node scripts/i18n-ci-check.js
 * Exit code 0 = success, 1 = failure
 */

const fs = require('fs');
const path = require('path');

const TRANSLATIONS_DIR = path.join(__dirname, '../src/i18n/translations');
const LANGUAGES = ['ar', 'de', 'en', 'es', 'fr', 'hi', 'ja', 'ko', 'nl', 'pt', 'sw', 'tr', 'zh'];
const BASELINE_LANG = 'en';
const FALLBACK_WARNING_THRESHOLD = 0.08;
const FALLBACK_ERROR_THRESHOLD = 0.15;

// Colors for terminal
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function log(color, ...args) {
  console.log(color, ...args, RESET);
}

function isMostlyFormatString(value) {
  if (typeof value !== 'string') return true;
  if (!value.trim()) return true;
  const hasPlaceholder = /%\{[^}]+\}/.test(value);
  if (hasPlaceholder && /^[\s%{}\w:./\-+~→()|•🔥💧💪]+$/u.test(value)) return true;
  if (/^\s*[0-9]+\s*([a-zA-Z%]+)?\s*$/u.test(value)) return true;
  return false;
}

function isAcronymLike(value) {
  if (typeof value !== 'string') return true;
  const clean = value.replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  if (!clean) return true;
  if (clean.length <= 3) return true;
  if (/^[A-Z0-9\s]+$/.test(clean) && clean.length <= 12) return true;
  return false;
}

function isBrandLike(value) {
  if (typeof value !== 'string') return false;
  const lower = value.toLowerCase();
  return (
    lower.includes('body mode') ||
    lower.includes('biosync ai') ||
    lower.includes('google') ||
    lower.includes('apple health') ||
    lower.includes('health connect')
  );
}

function isComparableForFallback(value) {
  if (typeof value !== 'string') return false;
  if (!/[A-Za-z]/.test(value)) return false;
  if (isBrandLike(value)) return false;
  if (isAcronymLike(value)) return false;
  if (isMostlyFormatString(value)) return false;
  return true;
}

function loadTranslations() {
  const translations = {};
  for (const lang of LANGUAGES) {
    const filePath = path.join(TRANSLATIONS_DIR, `${lang}.json`);
    try {
      translations[lang] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      log(RED, `Failed to load ${lang}.json:`, err.message);
      return null;
    }
  }
  return translations;
}

function runChecks() {
  console.log('\n🔍 i18n CI Check\n');
  console.log('='.repeat(50));

  const translations = loadTranslations();
  if (!translations) {
    log(RED, '\n❌ Failed to load translation files');
    return 1;
  }

  const baseline = translations[BASELINE_LANG];
  const baselineKeys = new Set(Object.keys(baseline));
  let hasErrors = false;
  let hasWarnings = false;

  // Check 1: All languages have same key count
  console.log('\n📊 Key Count Check:');
  for (const lang of LANGUAGES) {
    const langKeys = Object.keys(translations[lang]);
    const diff = langKeys.length - baselineKeys.size;

    if (diff !== 0) {
      log(RED, `   ❌ ${lang}.json: ${langKeys.length} keys (${diff > 0 ? '+' : ''}${diff} vs baseline)`);
      hasErrors = true;
    } else {
      log(GREEN, `   ✓ ${lang}.json: ${langKeys.length} keys`);
    }
  }

  // Check 2: No missing keys in any language
  console.log('\n🔑 Missing Keys Check:');
  for (const lang of LANGUAGES) {
    if (lang === BASELINE_LANG) continue;

    const missing = [];
    for (const key of baselineKeys) {
      if (!(key in translations[lang])) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      log(RED, `   ❌ ${lang}.json: ${missing.length} missing keys`);
      missing.slice(0, 3).forEach(k => console.log(`      - ${k}`));
      if (missing.length > 3) console.log(`      ... and ${missing.length - 3} more`);
      hasErrors = true;
    } else {
      log(GREEN, `   ✓ ${lang}.json: All keys present`);
    }
  }

  // Check 3: No empty values
  console.log('\n📝 Empty Values Check:');
  for (const lang of LANGUAGES) {
    const empty = [];
    for (const [key, value] of Object.entries(translations[lang])) {
      if (typeof value === 'string' && value.trim() === '') {
        empty.push(key);
      }
    }

    if (empty.length > 0) {
      log(YELLOW, `   ⚠ ${lang}.json: ${empty.length} empty values`);
      empty.slice(0, 3).forEach(k => console.log(`      - ${k}`));
      hasWarnings = true;
    } else {
      log(GREEN, `   ✓ ${lang}.json: No empty values`);
    }
  }

  // Check 4: No placeholder mismatch (e.g., %{name} in en but missing in other)
  console.log('\n🔄 Placeholder Check:');
  const placeholderRegex = /%\{(\w+)\}/g;

  for (const lang of LANGUAGES) {
    if (lang === BASELINE_LANG) continue;

    let mismatches = 0;
    for (const key of baselineKeys) {
      const enValue = baseline[key] || '';
      const langValue = translations[lang][key] || '';

      const enPlaceholders = [...enValue.matchAll(placeholderRegex)].map(m => m[1]).sort();
      const langPlaceholders = [...langValue.matchAll(placeholderRegex)].map(m => m[1]).sort();

      if (enPlaceholders.join(',') !== langPlaceholders.join(',')) {
        mismatches++;
      }
    }

    if (mismatches > 0) {
      log(YELLOW, `   ⚠ ${lang}.json: ${mismatches} placeholder mismatches`);
      hasWarnings = true;
    } else {
      log(GREEN, `   ✓ ${lang}.json: Placeholders match`);
    }
  }

  // Check 5: No translation token artifacts
  console.log('\n🧩 Token Artifact Check:');
  const artifactRegex = /__PH_\d+__/;
  for (const lang of LANGUAGES) {
    if (lang === BASELINE_LANG) continue;
    const artifactKeys = [];
    for (const [key, value] of Object.entries(translations[lang])) {
      if (typeof value === 'string' && artifactRegex.test(value)) {
        artifactKeys.push(key);
      }
    }
    if (artifactKeys.length > 0) {
      log(RED, `   ❌ ${lang}.json: ${artifactKeys.length} token artifacts`);
      artifactKeys.slice(0, 3).forEach(k => console.log(`      - ${k}`));
      if (artifactKeys.length > 3) console.log(`      ... and ${artifactKeys.length - 3} more`);
      hasErrors = true;
    } else {
      log(GREEN, `   ✓ ${lang}.json: No token artifacts`);
    }
  }

  // Check 6: Excessive English fallback parity on user-facing strings
  console.log('\n🌐 Fallback Parity Check:');
  const comparableKeys = [...baselineKeys].filter((key) => isComparableForFallback(baseline[key]));
  for (const lang of LANGUAGES) {
    if (lang === BASELINE_LANG) continue;
    let sameCount = 0;
    for (const key of comparableKeys) {
      if ((translations[lang][key] || '').trim() === (baseline[key] || '').trim()) {
        sameCount += 1;
      }
    }
    const ratio = comparableKeys.length ? sameCount / comparableKeys.length : 0;
    const pct = (ratio * 100).toFixed(2);

    if (ratio > FALLBACK_ERROR_THRESHOLD) {
      log(RED, `   ❌ ${lang}.json: ${sameCount}/${comparableKeys.length} (${pct}%) still English`);
      hasErrors = true;
    } else if (ratio > FALLBACK_WARNING_THRESHOLD) {
      log(YELLOW, `   ⚠ ${lang}.json: ${sameCount}/${comparableKeys.length} (${pct}%) still English`);
      hasWarnings = true;
    } else {
      log(GREEN, `   ✓ ${lang}.json: ${sameCount}/${comparableKeys.length} (${pct}%) English parity`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  if (hasErrors) {
    log(RED, '\n❌ CI Check FAILED - Fix errors above');
    return 1;
  } else if (hasWarnings) {
    log(YELLOW, '\n⚠ CI Check PASSED with warnings');
    return 0;
  } else {
    log(GREEN, '\n✓ CI Check PASSED');
    return 0;
  }
}

process.exit(runChecks());
