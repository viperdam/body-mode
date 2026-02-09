import { getLocales } from 'expo-localization';
import { I18n } from 'i18n-js';
import en from './translations/en.json';
import es from './translations/es.json';
import fr from './translations/fr.json';
import de from './translations/de.json';
import ar from './translations/ar.json';
import hi from './translations/hi.json';
import nl from './translations/nl.json';
import zh from './translations/zh.json';
import ja from './translations/ja.json';
import ko from './translations/ko.json';
import tr from './translations/tr.json';
import sw from './translations/sw.json';
import pt from './translations/pt.json';

// Set up i18n with all available languages
const i18n = new I18n({
    en,
    es, // Spanish
    fr, // French
    de, // German
    ar, // Arabic (RTL)
    hi, // Hindi
    nl, // Dutch
    zh, // Chinese
    ja, // Japanese
    ko, // Korean
    tr, // Turkish
    sw, // Swahili
    pt, // Portuguese
});

// Treat dotted keys as literal (translations are flat, not nested objects).
i18n.defaultSeparator = '::';

// Use language code without region suffix (e.g. "en" from "en-US").
i18n.locale = getLocales()[0]?.languageCode?.split('-')[0]?.toLowerCase() ?? 'en';

// Enable fallback if translation doesn't exist in current locale
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

export default i18n;

