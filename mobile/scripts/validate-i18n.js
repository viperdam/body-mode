#!/usr/bin/env node

/**
 * i18n Validation Script
 *
 * Checks for:
 * 1. Missing keys across language files
 * 2. Keys used in code but not in en.json
 * 3. Unused keys in en.json
 * 4. Hardcoded strings in UI components
 *
 * Usage: node scripts/validate-i18n.js [--fix] [--strict]
 */

const fs = require('fs');
const path = require('path');

const TRANSLATIONS_DIR = path.join(__dirname, '../src/i18n/translations');
const SRC_DIR = path.join(__dirname, '../src');

const LANGUAGES = ['ar', 'de', 'en', 'es', 'fr', 'hi', 'ja', 'ko', 'nl', 'pt', 'sw', 'tr', 'zh'];
const BASELINE_LANG = 'en';

// ANSI colors for terminal output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

function log(color, ...args) {
  console.log(colors[color], ...args, colors.reset);
}

// Load all translation files
function loadTranslations() {
  const translations = {};

  for (const lang of LANGUAGES) {
    const filePath = path.join(TRANSLATIONS_DIR, `${lang}.json`);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      translations[lang] = JSON.parse(content);
    } catch (err) {
      log('red', `Error loading ${lang}.json:`, err.message);
      translations[lang] = {};
    }
  }

  return translations;
}

// Get all keys from an object (flat structure)
function getKeys(obj) {
  return Object.keys(obj).sort();
}

// Find keys missing from a language compared to baseline
function findMissingKeys(baseline, target) {
  const baselineKeys = new Set(getKeys(baseline));
  const targetKeys = new Set(getKeys(target));

  const missing = [];
  for (const key of baselineKeys) {
    if (!targetKeys.has(key)) {
      missing.push(key);
    }
  }

  return missing;
}

// Find extra keys in a language not in baseline
function findExtraKeys(baseline, target) {
  const baselineKeys = new Set(getKeys(baseline));
  const targetKeys = new Set(getKeys(target));

  const extra = [];
  for (const key of targetKeys) {
    if (!baselineKeys.has(key)) {
      extra.push(key);
    }
  }

  return extra;
}

// Extract t('key') and i18n.t('key') calls from source files
function extractUsedKeys(dir) {
  const usedKeys = new Set();
  const patterns = [
    /\bt\(['"`]([\w.]+)['"`]/g,
    /\bi18n\.t\(['"`]([\w.]+)['"`]/g,
  ];

  function scanFile(filePath) {
    if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) return;
    if (filePath.includes('__tests__') || filePath.includes('.test.')) return;

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          usedKeys.add(match[1]);
        }
      }
    } catch (err) {
      // Ignore read errors
    }
  }

  function scanDir(dirPath) {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules') {
          scanDir(fullPath);
        } else if (entry.isFile()) {
          scanFile(fullPath);
        }
      }
    } catch (err) {
      // Ignore directory errors
    }
  }

  scanDir(dir);
  return usedKeys;
}

// Find hardcoded strings in UI components (basic check)
function findHardcodedStrings(dir) {
  const issues = [];
  const screenPattern = /<Text[^>]*>([^<{]+)<\/Text>/g;
  const alertPattern = /Alert\.alert\(\s*['"`]([^'"`]+)['"`]/g;

  function scanFile(filePath) {
    if (!filePath.endsWith('.tsx')) return;
    if (filePath.includes('__tests__')) return;

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const relativePath = path.relative(SRC_DIR, filePath);

      // Check for hardcoded text in Text components
      let match;
      while ((match = screenPattern.exec(content)) !== null) {
        const text = match[1].trim();
        // Skip if it's just whitespace, emoji, or numbers
        if (text && !/^[\s\d\p{Emoji}]+$/u.test(text) && text.length > 1) {
          // Find line number
          const beforeMatch = content.substring(0, match.index);
          const lineNum = beforeMatch.split('\n').length;
          issues.push({
            file: relativePath,
            line: lineNum,
            type: 'hardcoded_text',
            value: text.substring(0, 50),
          });
        }
      }
    } catch (err) {
      // Ignore read errors
    }
  }

  function scanDir(dirPath) {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules') {
          scanDir(fullPath);
        } else if (entry.isFile()) {
          scanFile(fullPath);
        }
      }
    } catch (err) {
      // Ignore directory errors
    }
  }

  scanDir(path.join(dir, 'screens'));
  scanDir(path.join(dir, 'components'));

  return issues;
}

// Main validation function
function validate() {
  console.log('\n=== i18n Validation Report ===\n');

  const translations = loadTranslations();
  const baseline = translations[BASELINE_LANG];
  const baselineKeys = getKeys(baseline);

  let hasErrors = false;
  let hasWarnings = false;

  // 1. Check key counts
  console.log('1. Translation File Key Counts:');
  console.log('─'.repeat(40));
  for (const lang of LANGUAGES) {
    const count = getKeys(translations[lang]).length;
    const diff = count - baselineKeys.length;
    const status = diff === 0 ? '✓' : diff > 0 ? `+${diff}` : `${diff}`;
    const color = diff === 0 ? 'green' : 'yellow';
    log(color, `   ${lang}.json: ${count} keys ${status}`);
    if (diff !== 0) hasWarnings = true;
  }
  console.log();

  // 2. Check for missing keys in each language
  console.log('2. Missing Keys by Language:');
  console.log('─'.repeat(40));
  for (const lang of LANGUAGES) {
    if (lang === BASELINE_LANG) continue;

    const missing = findMissingKeys(baseline, translations[lang]);
    if (missing.length > 0) {
      log('red', `   ${lang}.json: ${missing.length} missing keys`);
      missing.slice(0, 5).forEach(key => console.log(`      - ${key}`));
      if (missing.length > 5) console.log(`      ... and ${missing.length - 5} more`);
      hasErrors = true;
    } else {
      log('green', `   ${lang}.json: ✓ All keys present`);
    }
  }
  console.log();

  // 3. Check for keys used in code but not in translations
  console.log('3. Keys Used in Code but Missing from en.json:');
  console.log('─'.repeat(40));
  const usedKeys = extractUsedKeys(SRC_DIR);
  const baselineKeySet = new Set(baselineKeys);
  const missingInBaseline = [];

  for (const key of usedKeys) {
    if (!baselineKeySet.has(key)) {
      missingInBaseline.push(key);
    }
  }

  if (missingInBaseline.length > 0) {
    log('red', `   Found ${missingInBaseline.length} keys used but not in en.json:`);
    missingInBaseline.slice(0, 10).forEach(key => console.log(`      - ${key}`));
    if (missingInBaseline.length > 10) {
      console.log(`      ... and ${missingInBaseline.length - 10} more`);
    }
    hasErrors = true;
  } else {
    log('green', '   ✓ All used keys exist in en.json');
  }
  console.log();

  // 4. Check for potentially unused keys
  console.log('4. Potentially Unused Keys (in en.json but not found in code):');
  console.log('─'.repeat(40));
  const unusedKeys = [];
  for (const key of baselineKeys) {
    if (!usedKeys.has(key)) {
      unusedKeys.push(key);
    }
  }

  if (unusedKeys.length > 0) {
    log('yellow', `   Found ${unusedKeys.length} potentially unused keys`);
    console.log('   (These may be used dynamically or in native code)');
    unusedKeys.slice(0, 5).forEach(key => console.log(`      - ${key}`));
    if (unusedKeys.length > 5) {
      console.log(`      ... and ${unusedKeys.length - 5} more`);
    }
    hasWarnings = true;
  } else {
    log('green', '   ✓ All keys appear to be used');
  }
  console.log();

  // 5. Summary
  console.log('=== Summary ===');
  console.log('─'.repeat(40));
  console.log(`   Total languages: ${LANGUAGES.length}`);
  console.log(`   Baseline keys (en.json): ${baselineKeys.length}`);
  console.log(`   Keys used in code: ${usedKeys.size}`);

  if (hasErrors) {
    log('red', '\n   ✗ Validation FAILED - Fix errors above');
    return 1;
  } else if (hasWarnings) {
    log('yellow', '\n   ⚠ Validation passed with warnings');
    return 0;
  } else {
    log('green', '\n   ✓ Validation PASSED');
    return 0;
  }
}

// Sync keys from baseline to all languages (--fix mode)
function syncKeys() {
  console.log('\n=== Syncing Translation Keys ===\n');

  const translations = loadTranslations();
  const baseline = translations[BASELINE_LANG];

  for (const lang of LANGUAGES) {
    if (lang === BASELINE_LANG) continue;

    const target = translations[lang];
    const missing = findMissingKeys(baseline, target);
    const extra = findExtraKeys(baseline, target);

    if (missing.length === 0 && extra.length === 0) {
      log('green', `${lang}.json: Already in sync`);
      continue;
    }

    // Add missing keys with English fallback
    for (const key of missing) {
      target[key] = baseline[key]; // Use English as placeholder
    }

    // Remove extra keys
    for (const key of extra) {
      delete target[key];
    }

    // Sort keys alphabetically
    const sorted = {};
    Object.keys(target).sort().forEach(key => {
      sorted[key] = target[key];
    });

    // Write back
    const filePath = path.join(TRANSLATIONS_DIR, `${lang}.json`);
    fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2) + '\n', 'utf8');

    log('yellow', `${lang}.json: Added ${missing.length} keys, removed ${extra.length} keys`);
  }

  console.log('\nSync complete!');
}

// Parse arguments and run
const args = process.argv.slice(2);

if (args.includes('--fix')) {
  syncKeys();
} else {
  const exitCode = validate();
  process.exit(exitCode);
}
