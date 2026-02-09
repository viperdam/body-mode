#!/usr/bin/env node

/**
 * Auto-translate English placeholders in i18n JSON files using the Netlify Gemini proxy.
 *
 * Usage:
 *   node scripts/auto-translate.js [--lang=es,fr] [--chunk=30] [--limit=100] [--prefix=auth.,dashboard.] [--keys-file=untranslated-keys.json] [--provider=gemini|google]
 *
 * Notes:
 * - Only replaces values that are still identical to en.json (English placeholders).
 * - Preserves %{placeholders}.
 * - Safe to re-run (idempotent for already translated keys).
 */

const fs = require('fs');
const path = require('path');

const TRANSLATIONS_DIR = path.join(__dirname, '../src/i18n/translations');
const ENDPOINT =
  process.env.TRANSLATE_ENDPOINT ||
  'https://bodymode.netlify.app/.netlify/functions/gemini-proxy';
const MODEL = process.env.TRANSLATE_MODEL || 'gemini-2.5-flash';
const CHUNK_SIZE = Number(process.env.TRANSLATE_CHUNK || 30);
const MAX_RETRIES = Number(process.env.TRANSLATE_RETRIES || 3);
const DELAY_MS = Number(process.env.TRANSLATE_DELAY_MS || 350);

const LANGUAGES = {
  ar: 'Arabic',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  hi: 'Hindi',
  ja: 'Japanese',
  ko: 'Korean',
  nl: 'Dutch',
  pt: 'Portuguese',
  sw: 'Swahili',
  tr: 'Turkish',
  zh: 'Chinese',
};

const args = process.argv.slice(2);
const argLang = args.find((arg) => arg.startsWith('--lang='));
const argChunk = args.find((arg) => arg.startsWith('--chunk='));
const argLimit = args.find((arg) => arg.startsWith('--limit='));
const argPrefix = args.find((arg) => arg.startsWith('--prefix='));
const argKeysFile = args.find((arg) => arg.startsWith('--keys-file='));
const argProvider = args.find((arg) => arg.startsWith('--provider='));

const targetLangs = argLang
  ? argLang.replace('--lang=', '').split(',').map((l) => l.trim()).filter(Boolean)
  : Object.keys(LANGUAGES);

const chunkSize = argChunk ? Number(argChunk.replace('--chunk=', '')) : CHUNK_SIZE;
const limit = argLimit ? Number(argLimit.replace('--limit=', '')) : null;
const prefixes = argPrefix
  ? argPrefix.replace('--prefix=', '').split(',').map((p) => p.trim()).filter(Boolean)
  : null;
const keysFilePath = argKeysFile ? argKeysFile.replace('--keys-file=', '').trim() : null;
const provider = (
  argProvider
    ? argProvider.replace('--provider=', '')
    : process.env.TRANSLATE_PROVIDER || 'gemini'
).toLowerCase();

let keysWhitelist = null;
if (keysFilePath) {
  try {
    const resolvedPath = path.resolve(process.cwd(), keysFilePath);
    const raw = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    if (Array.isArray(raw)) {
      keysWhitelist = new Set(raw);
    } else if (raw && typeof raw === 'object') {
      keysWhitelist = new Set(Object.keys(raw));
    }
  } catch (err) {
    console.warn(`[translate] Failed to read keys file: ${keysFilePath}`, err.message || err);
  }
}

const fetchFn = global.fetch || require('node-fetch');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const extractJsonFromText = (text) => {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced && fenced[1]) return fenced[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return null;
};

const buildPrompt = (languageName, entries) => {
  const payload = entries.reduce((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {});

  return `
You are a professional app translator. Translate the JSON values from English to ${languageName}.
Rules:
- Preserve placeholders like %{name} exactly.
- Keep punctuation and capitalization appropriate for UI.
- Return ONLY a JSON object mapping the same keys to translated strings.

INPUT JSON:
${JSON.stringify(payload, null, 2)}
`.trim();
};

const callGemini = async (prompt) => {
  const body = {
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      generationConfig: { temperature: 0.2 },
      responseMimeType: 'application/json',
    },
  };

  const response = await fetchFn(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://bodymode.netlify.app',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Translate request failed (${response.status}): ${text}`);
  }

  const result = await response.json();
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
};

const GOOGLE_LANG_OVERRIDES = { zh: 'zh-CN' };
const GOOGLE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const PROTECTED_PHRASES = ['BioSync AI', 'Body Mode'];

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

const callGoogleTranslate = async (text, languageCode) => {
  const target = GOOGLE_LANG_OVERRIDES[languageCode] || languageCode;
  const params = new URLSearchParams({
    client: 'gtx',
    sl: 'en',
    tl: target,
    dt: 't',
    q: text,
  });
  const response = await fetchFn(`${GOOGLE_ENDPOINT}?${params.toString()}`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google translate failed (${response.status}): ${errorText}`);
  }
  const data = await response.json();
  return (data[0] || []).map((part) => part[0]).join('');
};

const translateChunkGoogle = async (languageCode, entries) => {
  const protectedLines = [];
  const mappings = [];

  for (const [, value] of entries) {
    const { protectedText, mapping } = protectTokens(value);
    protectedLines.push(protectedText);
    mappings.push(mapping);
  }

  const joined = protectedLines.join('\n');
  let translatedJoined = await callGoogleTranslate(joined, languageCode);
  let translatedLines = translatedJoined.split('\n');

  if (translatedLines.length !== protectedLines.length) {
    translatedLines = [];
    for (const protectedLine of protectedLines) {
      const translatedLine = await callGoogleTranslate(protectedLine, languageCode);
      translatedLines.push(translatedLine);
      await sleep(Math.min(DELAY_MS, 600));
    }
  }

  const result = {};
  for (let i = 0; i < entries.length; i += 1) {
    const [key] = entries[i];
    const restored = restoreTokens(translatedLines[i] || '', mappings[i]);
    result[key] = restored;
  }

  return result;
};

const translateChunkGemini = async (languageCode, languageName, entries) => {
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    attempt += 1;
    try {
      const prompt = buildPrompt(languageName, entries);
      const text = await callGemini(prompt);
      const jsonText = extractJsonFromText(text);
      if (!jsonText) throw new Error('No JSON found in response');
      return JSON.parse(jsonText);
    } catch (err) {
      if (attempt >= MAX_RETRIES) throw err;
      console.warn(`[translate] ${languageCode} chunk failed (attempt ${attempt}):`, err.message || err);
      await sleep(600);
    }
  }
  return {};
};

const translateChunk = async (languageCode, languageName, entries) => {
  if (provider === 'google') {
    return translateChunkGoogle(languageCode, entries);
  }
  return translateChunkGemini(languageCode, languageName, entries);
};

const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

const main = async () => {
  const enPath = path.join(TRANSLATIONS_DIR, 'en.json');
  const en = readJson(enPath);
  const enKeys = Object.keys(en);
  const matchesPrefix = (key) => !prefixes || prefixes.some((prefix) => key.startsWith(prefix));
  const matchesWhitelist = (key) => !keysWhitelist || keysWhitelist.has(key);

  for (const lang of targetLangs) {
    if (!LANGUAGES[lang]) {
      console.warn(`[translate] Skipping unknown language: ${lang}`);
      continue;
    }

    const filePath = path.join(TRANSLATIONS_DIR, `${lang}.json`);
    if (!fs.existsSync(filePath)) {
      console.warn(`[translate] Missing file: ${filePath}`);
      continue;
    }

    const translations = readJson(filePath);
    const keysNeedingTranslation = enKeys.filter((key) => {
      if (!matchesPrefix(key) || !matchesWhitelist(key)) return false;
      const value = translations[key];
      return typeof value === 'string' && value === en[key];
    });

    const keysToTranslate = limit ? keysNeedingTranslation.slice(0, limit) : keysNeedingTranslation;

    if (!keysToTranslate.length) {
      console.log(`[translate] ${lang}: no keys to translate`);
      continue;
    }

    console.log(`[translate] ${lang}: ${keysToTranslate.length} keys to translate`);

    const chunks = chunkArray(
      keysToTranslate.map((key) => [key, en[key]]),
      chunkSize
    );

    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      const result = await translateChunk(lang, LANGUAGES[lang], chunk);

      let updated = 0;
      for (const [key, value] of Object.entries(result)) {
        if (typeof value === 'string' && translations[key] === en[key]) {
          translations[key] = value;
          updated += 1;
        }
      }

      console.log(`[translate] ${lang}: chunk ${i + 1}/${chunks.length} (${updated} updated)`);
      await sleep(DELAY_MS);
    }

    writeJsonSorted(filePath, translations);
    console.log(`[translate] ${lang}: done`);
  }

  console.log('[translate] complete');
};

main().catch((err) => {
  console.error('[translate] failed:', err);
  process.exit(1);
});
