#!/usr/bin/env node

/**
 * Fix translation placeholders like __PH_0__ by restoring protected tokens
 * based on the English source string.
 */

const fs = require('fs');
const path = require('path');

const TRANSLATIONS_DIR = path.join(__dirname, '../src/i18n/translations');
const EN_PATH = path.join(TRANSLATIONS_DIR, 'en.json');

const PROTECTED_PHRASES = ['BioSync AI', 'Body Mode'];

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const writeJsonSorted = (filePath, obj) => {
  const sorted = {};
  Object.keys(obj)
    .sort()
    .forEach((key) => {
      sorted[key] = obj[key];
    });
  fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
};

const protectTokens = (text) => {
  let index = 0;
  const mapping = new Map();

  const reserve = (value) => {
    const token = `__PH_${index}__`;
    mapping.set(token, value);
    index += 1;
    return token;
  };

  let protectedText = text;

  for (const phrase of PROTECTED_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    protectedText = protectedText.replace(new RegExp(escaped, 'g'), reserve);
  }

  const patterns = [
    /%\{[^}]+\}/g,
    /EXPO_PUBLIC_[A-Z0-9_]+/g,
    /\b[A-Za-z0-9_.-]+\.(?:json|plist|js|ts)\b/g,
    /\b[A-Z0-9_]{2,}\b/g,
    /\bbodymode:\/\/\S+/gi,
    /\bhttps?:\/\/\S+/gi,
  ];

  for (const pattern of patterns) {
    protectedText = protectedText.replace(pattern, reserve);
  }

  return { protectedText, mapping };
};

const restoreTokens = (text, mapping) => {
  let restored = text;
  for (const [token, value] of mapping.entries()) {
    restored = restored.replace(new RegExp(token, 'g'), value);
  }
  return restored;
};

const en = readJson(EN_PATH);
const files = fs
  .readdirSync(TRANSLATIONS_DIR)
  .filter((file) => file.endsWith('.json') && file !== 'en.json');

let totalUpdated = 0;
let totalRemaining = 0;

for (const file of files) {
  const langPath = path.join(TRANSLATIONS_DIR, file);
  const translations = readJson(langPath);
  let updated = 0;
  let remaining = 0;

  for (const [key, enValue] of Object.entries(en)) {
    const value = translations[key];
    if (typeof enValue !== 'string' || typeof value !== 'string') continue;
    if (!value.includes('__PH_')) continue;

    const { mapping } = protectTokens(enValue);
    const restored = restoreTokens(value, mapping);

    if (restored !== value) {
      translations[key] = restored;
      updated += 1;
    }
    if (restored.includes('__PH_')) {
      remaining += 1;
    }
  }

  if (updated > 0) {
    writeJsonSorted(langPath, translations);
  }

  totalUpdated += updated;
  totalRemaining += remaining;
  console.log(`[placeholders] ${file.replace('.json', '')}: ${updated} fixed, ${remaining} remaining`);
}

console.log(`[placeholders] total fixed: ${totalUpdated}, remaining: ${totalRemaining}`);
