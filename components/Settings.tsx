
import React, { useRef, useState, useEffect } from 'react';
import { UserProfile, Language } from '../types';
import { Button } from './Button';
import { requestNotificationPermission } from '../services/notificationService';
import { useLanguage } from '../contexts/LanguageContext';

interface SettingsProps {
  user: UserProfile;
  isDarkMode: boolean;
  toggleTheme: () => void;
  onLogout: () => void;
  onExportData: () => void;
  onImportData: (data: string) => void;
  onBack?: () => void; // New Prop
}

export const Settings: React.FC<SettingsProps> = ({ user, isDarkMode, toggleTheme, onLogout, onExportData, onImportData, onBack }) => {
  const { language, setLanguage, t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [notifPermission, setNotifPermission] = useState(Notification.permission);

  useEffect(() => {
      if ('Notification' in window) {
          setNotifPermission(Notification.permission);
      }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target?.result) {
                try {
                    onImportData(event.target.result as string);
                } catch (error) {
                    alert("Invalid backup file.");
                }
            }
        };
        reader.readAsText(file);
    }
  };

  const enableNotifications = async () => {
      const granted = await requestNotificationPermission();
      setNotifPermission(granted ? 'granted' : 'denied');
  };

  const languages: { code: Language; label: string; flag: string }[] = [
      { code: 'en', label: 'English', flag: '🇬🇧' },
      { code: 'es', label: 'Español', flag: '🇪🇸' },
      { code: 'fr', label: 'Français', flag: '🇫🇷' },
      { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
      { code: 'pt', label: 'Português', flag: '🇵🇹' },
      { code: 'nl', label: 'Nederlands', flag: '🇳🇱' },
      { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
      { code: 'zh', label: '中文', flag: '🇨🇳' },
      { code: 'ja', label: '日本語', flag: '🇯🇵' },
      { code: 'ko', label: '한국어', flag: '🇰🇷' },
      { code: 'hi', label: 'हिन्दी', flag: '🇮🇳' },
      { code: 'ar', label: 'العربية', flag: '🇸🇦' },
      { code: 'sw', label: 'Kiswahili', flag: '🇰🇪' }
  ];

  return (
    <div className="pb-24 pt-6 px-6 space-y-8 max-w-md mx-auto animate-fade-in text-slate-900 dark:text-white">
      <div className="flex items-center space-x-4">
          {onBack && (
            <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-slate-800 transition-colors">
                 <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold">{t('settings')}</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">{t('pref_account')}</p>
          </div>
      </div>

      <div className="space-y-4">
         {/* Language Section */}
         <section className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">{t('language')}</h3>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto no-scrollbar">
                {languages.map((lang) => (
                    <button 
                        key={lang.code}
                        onClick={() => setLanguage(lang.code)}
                        className={`p-3 rounded-xl border text-sm font-bold flex items-center space-x-2 rtl:space-x-reverse ${language === lang.code ? 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'border-slate-200 dark:border-slate-700'}`}
                    >
                        <span className="text-lg">{lang.flag}</span>
                        <span>{lang.label}</span>
                    </button>
                ))}
            </div>
         </section>

        {/* Notifications Section */}
        <section className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">{t('notifications')}</h3>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${notifPermission === 'granted' ? 'bg-emerald-50 text-emerald-500 dark:bg-emerald-900/30' : 'bg-slate-100 text-slate-400 dark:bg-slate-700'}`}>
                 <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
              </div>
              <div>
                  <span className="font-medium block">{t('smart_reminders')}</span>
                  <span className="text-xs text-slate-400">{notifPermission === 'granted' ? 'Active' : 'Permisson required'}</span>
              </div>
            </div>
            {notifPermission !== 'granted' && (
                <button 
                    onClick={enableNotifications}
                    className="text-xs font-bold bg-indigo-600 text-white px-3 py-2 rounded-xl shadow-lg shadow-indigo-200 dark:shadow-none"
                >
                    {t('enable')}
                </button>
            )}
          </div>
        </section>

         {/* Data Management Section */}
         <section className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">{t('data_mgmt')}</h3>
          <div className="grid grid-cols-2 gap-4">
             <button onClick={onExportData} className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-700/50 rounded-2xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span className="text-xs font-bold">{t('backup')}</span>
             </button>
             <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-700/50 rounded-2xl hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <span className="text-xs font-bold">{t('import')}</span>
             </button>
             <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json" />
          </div>
        </section>

        <div className="pt-4">
            <Button variant="outline" fullWidth onClick={onLogout} className="border-red-200 text-red-500 hover:bg-red-50 dark:border-red-900/30 dark:text-red-400 dark:hover:bg-red-900/20">
                {t('sign_out')}
            </Button>
            <p className="text-center text-xs text-slate-400 mt-4">Version 2.8.1 (Global Edition)</p>
        </div>
      </div>
    </div>
  );
};
