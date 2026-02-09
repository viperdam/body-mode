import AsyncStorage from '@react-native-async-storage/async-storage';
import { Language } from '../types';

const LANGUAGE_STORAGE_KEY = '@biosync_language';

const SUPPORTED_LANGUAGES: Language[] = [
    'en', 'ar', 'fr', 'es', 'hi', 'de', 'nl', 'zh', 'ja', 'ko', 'tr', 'sw', 'pt',
];

const isSupportedLanguage = (value: string | null): value is Language => {
    return !!value && SUPPORTED_LANGUAGES.includes(value as Language);
};

export const getStoredLanguage = async (): Promise<Language | null> => {
    try {
        const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        return isSupportedLanguage(stored) ? stored : null;
    } catch {
        return null;
    }
};

export const resolveLanguage = async (preferred?: Language): Promise<Language> => {
    if (preferred && SUPPORTED_LANGUAGES.includes(preferred)) {
        return preferred;
    }
    const stored = await getStoredLanguage();
    return stored || 'en';
};
