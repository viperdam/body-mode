import fs from 'fs';
import path from 'path';

const translationsDir = path.join('src', 'i18n', 'translations');
const basePath = path.join(translationsDir, 'en.json');

const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
const files = fs.readdirSync(translationsDir).filter((file) => file.endsWith('.json'));

const sortKeys = (obj) =>
  Object.keys(obj)
    .sort()
    .reduce((acc, key) => {
      acc[key] = obj[key];
      return acc;
    }, {});

for (const file of files) {
  if (file === 'en.json') continue;
  const targetPath = path.join(translationsDir, file);
  const current = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
  const merged = { ...current };

  for (const [key, value] of Object.entries(base)) {
    if (merged[key] === undefined) {
      merged[key] = value;
    }
  }

  fs.writeFileSync(targetPath, JSON.stringify(sortKeys(merged), null, 2), 'utf8');
}

console.log('Synced missing i18n keys with English fallbacks.');
