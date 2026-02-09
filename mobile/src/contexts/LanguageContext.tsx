// Language Context for React Native - Multi-language support with RTL
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { InteractionManager } from 'react-native';
import { Language } from '../types';
import { sleepService } from '../services/sleepService';
import { settingsEffectsService } from '../services/settingsEffectsService';
import { QuickActionsService } from '../services/quickActionsService';
import i18n from '../i18n';

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string, options?: Record<string, any>) => string;
    isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType>({
    language: getLocales()[0]?.languageCode?.split('-')[0] as Language || 'en',
    setLanguage: () => { },
    t: (key) => key,
    isRTL: false
});

const STORAGE_KEY = '@biosync_language';

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const systemLang = getLocales()[0]?.languageCode?.split('-')[0] as Language;
    const initialLang = AVAILABLE_LANGUAGES.some(l => l.code === systemLang) ? systemLang : 'en';

    const [language, setLanguageState] = useState<Language>(initialLang);
    const [isRTL, setIsRTL] = useState(initialLang === 'ar');
    const userHasExplicitlySetLanguageRef = useRef(false);
    const missingKeysRef = useRef(new Set<string>());
    const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const interactionTaskRef = useRef<{ cancel?: () => void } | null>(null);

    const clearPendingLanguageRefresh = () => {
        if (refreshTimerRef.current) {
            clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = null;
        }
        if (interactionTaskRef.current?.cancel) {
            interactionTaskRef.current.cancel();
        }
        interactionTaskRef.current = null;
    };

    const queueLanguageRefresh = () => {
        clearPendingLanguageRefresh();
        refreshTimerRef.current = setTimeout(() => {
            refreshTimerRef.current = null;
            interactionTaskRef.current = InteractionManager.runAfterInteractions(() => {
                interactionTaskRef.current = null;
                try {
                    QuickActionsService.refreshLocalizedItems();
                } catch (e) {
                    console.error('Failed to refresh quick actions for language:', e);
                }
                void settingsEffectsService.refreshForLanguage({ regeneratePlan: false }).catch((e) => {
                    console.error('Failed to refresh language settings:', e);
                });
            });
        }, 250);
    };

    useEffect(() => {
        loadSavedLanguage();
        return () => {
            clearPendingLanguageRefresh();
        };
    }, []);

    const loadSavedLanguage = async () => {
        try {
            const saved = await AsyncStorage.getItem(STORAGE_KEY);
            // Avoid race where a user selects a language before the async load finishes.
            // If they explicitly picked a language, don't overwrite it with stale storage.
            if (userHasExplicitlySetLanguageRef.current) return;
            if (saved && AVAILABLE_LANGUAGES.some(l => l.code === (saved as Language))) {
                const nextLang = saved as Language;
                setLanguageState(nextLang);
                i18n.locale = nextLang;
                const rtl = nextLang === 'ar';
                setIsRTL(rtl);
                // Sync to native for overlay translations
                void sleepService.syncCurrentLanguage(nextLang);
                queueLanguageRefresh();
            } else {
                i18n.locale = language;
                // Sync initial language to native
                void sleepService.syncCurrentLanguage(language);
                queueLanguageRefresh();
            }
        } catch (e) {
            console.error('Failed to load language:', e);
        }
    };

    const setLanguage = (lang: Language) => {
        try {
            if (lang === language) return;
            userHasExplicitlySetLanguageRef.current = true;
            setLanguageState(lang);
            i18n.locale = lang;
            const rtl = lang === 'ar';
            setIsRTL(rtl);

            // Sync to native for overlay translations
            void sleepService.syncCurrentLanguage(lang);

            void AsyncStorage.setItem(STORAGE_KEY, lang).catch((e) => {
                console.error('Failed to save language:', e);
            });
            queueLanguageRefresh();
        } catch (e) {
            console.error('Failed to save language:', e);
        }
    };

    const t = (key: string, options?: Record<string, any>): string => {
        const value = i18n.t(key, options) as string;
        if (value === key && !missingKeysRef.current.has(key)) {
            missingKeysRef.current.add(key);
            console.warn(`[i18n] Missing key: ${key}`);
        }
        return value;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t, isRTL }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => useContext(LanguageContext);

// Available languages for UI picker
export const AVAILABLE_LANGUAGES: { code: Language; name: string; nativeName: string; flag: string }[] = [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
    { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
    { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
    { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
    { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
    { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
    { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
    { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
    { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱' },
    { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', flag: '🇰🇪' },
];
