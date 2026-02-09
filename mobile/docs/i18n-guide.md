# i18n Translation Guide

This guide covers how to work with internationalization (i18n) in the Body Mode mobile app.

## Quick Reference

### Supported Languages (13)

| Code | Language | Native Name | RTL |
|------|----------|-------------|-----|
| en | English | English | No |
| ar | Arabic | العربية | **Yes** |
| de | German | Deutsch | No |
| es | Spanish | Español | No |
| fr | French | Français | No |
| hi | Hindi | हिन्दी | No |
| ja | Japanese | 日本語 | No |
| ko | Korean | 한국어 | No |
| nl | Dutch | Nederlands | No |
| pt | Portuguese | Português | No |
| sw | Swahili | Kiswahili | No |
| tr | Turkish | Türkçe | No |
| zh | Chinese | 中文 | No |

### File Locations

- **Translation files**: `src/i18n/translations/*.json`
- **i18n config**: `src/i18n/index.ts`
- **Language context**: `src/contexts/LanguageContext.tsx`
- **Validation scripts**: `scripts/validate-i18n.js`, `scripts/i18n-ci-check.js`

---

## Adding New Translations

### Step 1: Add to en.json (Baseline)

Always add new keys to `en.json` first. Keys are alphabetically sorted.

```json
{
  "feature.new_key": "Your English text here",
  "feature.with_placeholder": "Hello, %{name}!"
}
```

### Step 2: Sync All Languages

Run the sync script to add the new key to all language files:

```bash
node scripts/validate-i18n.js --fix
```

This adds the English text as a placeholder in all other languages.

### Step 3: Add Translations

Either:
- Use the `scripts/add-translations.js` pattern for batch updates
- Manually edit each language file
- Use a translation service (recommended for production)

### Step 4: Validate

```bash
node scripts/i18n-ci-check.js
```

---

## Using Translations in Code

### In React Components

```typescript
import { useLanguage } from '../contexts/LanguageContext';

function MyComponent() {
  const { t } = useLanguage();

  return (
    <View>
      <Text>{t('feature.title')}</Text>
      <Text>{t('feature.greeting', { name: 'John' })}</Text>
    </View>
  );
}
```

### In Services (Non-React)

```typescript
import i18n from '../i18n';

function myServiceFunction() {
  const message = i18n.t('errors.generic');
  throw new Error(message);
}
```

### With Placeholders

```typescript
// Translation: "Hello, %{name}! You have %{count} messages."
t('greeting', { name: 'Alice', count: 5 });
```

---

## Key Naming Conventions

### Structure

Use dot notation for namespacing:

```
screen.section.element
feature.action.state
```

### Examples

```
dashboard.alert.title          ✓ Good
dashboard.alert.body           ✓ Good
dashboardAlertTitle            ✗ Bad - no namespace
```

### Namespaces

| Prefix | Usage |
|--------|-------|
| `alert.*` | Global alerts |
| `auth.*` | Authentication |
| `dashboard.*` | Dashboard screen |
| `errors.*` | Error messages |
| `notifications.*` | Push notifications |
| `overlay.*` | Floating overlays |
| `permissions.*` | Permission requests |
| `settings.*` | Settings screen |
| `sleep.*` | Sleep tracker |

---

## Glossary (Consistent Terms)

Maintain consistency across all languages for these terms:

| English | Context | Notes |
|---------|---------|-------|
| Energy | AI credits | Not "power" or "points" |
| Plan | Daily plan | Not "schedule" |
| Coach | AI Coach | Persona name |
| Excellent/Good/Fair/Poor | Quality ratings | Use `sleep.quality.*` |
| Hydration | Water intake | Not "drinking" |

---

## RTL Support (Arabic)

Arabic requires right-to-left (RTL) layout.

### Automatic Handling

- The `LanguageContext` automatically sets `I18nManager.forceRTL(true)` for Arabic
- Styles using `flexDirection: 'row'` automatically flip

### Manual Adjustments

For specific RTL overrides:

```typescript
const { isRTL } = useLanguage();

<View style={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
```

---

## Testing Translations

### Run CI Check

```bash
node scripts/i18n-ci-check.js
```

Checks:
- All languages have same key count
- No missing keys
- No empty values
- Placeholder consistency

### Run Unit Tests

```bash
npm test -- i18n.test.ts
```

### Manual QA Checklist

- [ ] Switch language in Settings
- [ ] Verify all screens update
- [ ] Test alerts and popups
- [ ] Test notifications
- [ ] Test Arabic (RTL) layout

---

## AI Prompt Language

AI prompts include language instructions. The `targetLanguage` parameter is passed to all Gemini calls.

Example from `geminiService.ts`:

```typescript
const prompt = `
  Target Language: ${targetLangName}
  ...
`;
```

The AI responds in the user's selected language.

---

## Troubleshooting

### "Missing key" Warning in Console

```
[i18n] Missing key: some.key.name
```

**Cause**: Key used in code but not in translation files.
**Fix**: Add the key to `en.json` and run sync.

### Key Shows Raw (Untranslated)

**Cause**: Key exists in code but not in translation files, or fallback failed.
**Fix**: Check `en.json` for the key, run sync.

### Placeholder Not Replaced

**Cause**: Placeholder syntax mismatch or missing parameter.
**Fix**: Ensure `%{name}` syntax and pass all parameters.

---

## Adding a New Language

1. Create `src/i18n/translations/XX.json` (copy from en.json)
2. Add to `LANGUAGES` array in `src/i18n/index.ts`
3. Add to `AVAILABLE_LANGUAGES` in `LanguageContext.tsx`
4. Add to language arrays in validation scripts
5. Translate all keys
6. Test RTL if applicable

---

## Maintenance Checklist

For every PR with UI changes:

- [ ] Added new strings to `en.json`?
- [ ] Ran `node scripts/validate-i18n.js --fix`?
- [ ] No hardcoded English strings in components?
- [ ] Alert.alert() uses t() for all text?
- [ ] Placeholders use `%{name}` syntax?
