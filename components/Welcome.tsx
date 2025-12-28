
import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Language } from '../types';
import { Button } from './Button';

interface WelcomeProps {
    onStart: () => void;
}

export const Welcome: React.FC<WelcomeProps> = ({ onStart }) => {
    const { setLanguage, t, language } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);

    const languages: { code: Language; label: string; native: string; flag: string }[] = [
        { code: 'en', label: 'English', native: 'English', flag: '🇬🇧' },
        { code: 'es', label: 'Spanish', native: 'Español', flag: '🇪🇸' },
        { code: 'fr', label: 'French', native: 'Français', flag: '🇫🇷' },
        { code: 'de', label: 'German', native: 'Deutsch', flag: '🇩🇪' },
        { code: 'pt', label: 'Portuguese', native: 'Português', flag: '🇵🇹' },
        { code: 'nl', label: 'Dutch', native: 'Nederlands', flag: '🇳🇱' },
        { code: 'tr', label: 'Turkish', native: 'Türkçe', flag: '🇹🇷' },
        { code: 'zh', label: 'Chinese', native: '中文', flag: '🇨🇳' },
        { code: 'ja', label: 'Japanese', native: '日本語', flag: '🇯🇵' },
        { code: 'ko', label: 'Korean', native: '한국어', flag: '🇰🇷' },
        { code: 'hi', label: 'Hindi', native: 'हिन्दी', flag: '🇮🇳' },
        { code: 'ar', label: 'Arabic', native: 'العربية', flag: '🇸🇦' },
        { code: 'sw', label: 'Swahili', native: 'Kiswahili', flag: '🇰🇪' }
    ];

    const currentLang = languages.find(l => l.code === language) || languages[0];

    const handleSelect = (code: Language) => {
        setLanguage(code);
        setIsOpen(false);
    };

    return (
        <div className="min-h-screen bg-midnight-900 flex flex-col items-center justify-center p-6 relative overflow-hidden text-slate-900 dark:text-white">
            {/* Ambient Background Glows */}
            <div className="absolute top-[-20%] left-[-20%] w-[600px] h-[600px] bg-cyan-600/20 rounded-full blur-[120px] animate-float"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-teal-600/10 rounded-full blur-[100px] animate-pulse"></div>
            
            <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
                {/* Logo Section */}
                <div className="mb-12 text-center animate-fade-in">
                    <div className="w-24 h-24 mx-auto bg-gradient-to-tr from-cyan-500 to-teal-500 rounded-[2rem] flex items-center justify-center shadow-[0_0_50px_rgba(6,182,212,0.5)] mb-6 transform rotate-3 hover:scale-105 transition-transform duration-500">
                        <span className="text-5xl">🧬</span>
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white via-cyan-200 to-cyan-400">
                        BioSync AI
                    </h1>
                    <p className="text-cyan-200/60 font-medium text-lg tracking-wide">
                        {t('welcome_subtitle')}
                    </p>
                </div>

                {/* Continue Button */}
                <div className="w-full mb-8 animate-fade-in" style={{ animationDelay: '0.2s' }}>
                     <Button 
                        fullWidth 
                        onClick={onStart}
                        className="bg-gradient-to-r from-cyan-500 to-teal-600 text-white font-bold py-4 text-lg rounded-2xl shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 transform transition-all hover:-translate-y-1 active:translate-y-0"
                     >
                         {t('continue')}
                     </Button>
                     <p className="mt-6 text-[10px] text-slate-600 text-center max-w-[200px] mx-auto leading-relaxed">
                        {t('terms_agree')}
                    </p>
                </div>

                {/* Language Dropdown */}
                <div className="w-full relative animate-fade-in" style={{ animationDelay: '0.4s' }}>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 pl-1">
                        {t('select_language')}
                    </label>
                    
                    <button 
                        onClick={() => setIsOpen(!isOpen)}
                        className={`w-full p-4 rounded-2xl flex items-center justify-between border transition-all duration-300 ${isOpen ? 'bg-slate-800 border-cyan-500 ring-2 ring-cyan-500/20' : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:border-slate-600'}`}
                    >
                        <div className="flex items-center space-x-4 rtl:space-x-reverse">
                            <span className="text-3xl">{currentLang.flag}</span>
                            <div className="text-left rtl:text-right">
                                <span className="block font-bold text-white text-lg leading-tight">{currentLang.native}</span>
                                <span className="text-xs text-slate-400">{currentLang.label}</span>
                            </div>
                        </div>
                        <svg 
                            xmlns="http://www.w3.org/2000/svg" 
                            width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" 
                            className={`text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180 text-cyan-500' : ''}`}
                        >
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                    </button>

                    {/* Dropdown Menu */}
                    {isOpen && (
                        <div className="absolute bottom-full left-0 right-0 mb-3 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden z-50 animate-fade-in origin-bottom max-h-[300px] overflow-y-auto no-scrollbar">
                            <div>
                                {languages.map((lang) => (
                                    <button
                                        key={lang.code}
                                        onClick={() => handleSelect(lang.code)}
                                        className={`w-full p-4 flex items-center space-x-4 rtl:space-x-reverse hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 ${language === lang.code ? 'bg-cyan-500/10' : ''}`}
                                    >
                                        <span className="text-2xl">{lang.flag}</span>
                                        <span className={`flex-1 text-left rtl:text-right font-bold ${language === lang.code ? 'text-cyan-400' : 'text-slate-300'}`}>
                                            {lang.native}
                                        </span>
                                        {language === lang.code && (
                                            <span className="text-cyan-500">✓</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
