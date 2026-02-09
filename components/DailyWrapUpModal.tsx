
import React, { useState } from 'react';
import { DailyWrapUp } from '../types';
import { Button } from './Button';
import { useLanguage } from '../contexts/LanguageContext';

interface DailyWrapUpModalProps {
    data: DailyWrapUp;
    onClose: (rating: number) => void;
}

export const DailyWrapUpModal: React.FC<DailyWrapUpModalProps> = ({ data, onClose }) => {
    const { t } = useLanguage();
    const [step, setStep] = useState(0);
    const [userRating, setUserRating] = useState(0);

    const handleRating = (stars: number) => {
        setUserRating(stars);
        // Delay close for effect
        setTimeout(() => {
            onClose(stars);
        }, 800);
    };

    // SLIDE 1: Score & Celebration
    if (step === 0) {
        return (
            <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-6 animate-fade-in text-white">
                <div className="text-center space-y-6">
                    <div className="inline-block relative">
                         <div className="absolute inset-0 bg-yellow-400 blur-3xl opacity-20 rounded-full animate-pulse"></div>
                         <h1 className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-tr from-yellow-300 to-amber-500 transform scale-110">
                            {data.aiScore}
                            <span className="text-3xl text-white ml-2">/10</span>
                        </h1>
                    </div>
                    
                    <h2 className="text-3xl font-bold tracking-tight">{t('day_complete')}</h2>
                    <p className="text-slate-400 max-w-xs mx-auto text-lg leading-relaxed">
                        "{data.summary}"
                    </p>

                    <Button onClick={() => setStep(1)} className="bg-white text-black hover:bg-slate-200 mt-8 px-10 py-4 text-xl rounded-full">
                        {t('see_details')} →
                    </Button>
                </div>
            </div>
        );
    }

    // SLIDE 2: Plan vs Reality Comparison
    if (step === 1) {
        return (
             <div className="fixed inset-0 z-[60] bg-slate-950 flex flex-col p-6 animate-fade-in text-white overflow-hidden">
                <div className="mt-10 mb-6">
                    <h2 className="text-3xl font-bold mb-2">{t('plan_vs_reality')}</h2>
                    <p className="text-slate-400">{t('how_you_did')}</p>
                </div>

                <div className="flex-1 overflow-y-auto space-y-4 pr-2 no-scrollbar">
                    {data.comparison.map((item, i) => (
                        <div key={i} className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
                            <div className="flex-1">
                                <h4 className="font-bold text-slate-300 uppercase text-xs mb-1">{item.category}</h4>
                                <div className="flex flex-col">
                                    <span className="text-slate-500 text-sm line-through decoration-slate-600">{item.planned}</span>
                                    <span className="text-white font-bold text-lg">→ {item.actual}</span>
                                </div>
                            </div>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${
                                item.status === 'hit' ? 'bg-emerald-500/20 text-emerald-400' : 
                                item.status === 'partial' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'
                            }`}>
                                {item.status === 'hit' ? '✓' : item.status === 'partial' ? '⚠️' : '✕'}
                            </div>
                        </div>
                    ))}
                </div>
                
                <div className="mt-4 bg-indigo-900/30 border border-indigo-500/30 p-5 rounded-2xl">
                    <span className="text-xs font-bold text-indigo-300 uppercase">{t('tomorrow_focus')}</span>
                    <p className="font-bold text-white text-lg mt-1">{data.tomorrowFocus}</p>
                </div>

                <div className="mt-6">
                    <Button fullWidth onClick={() => setStep(2)} className="bg-indigo-600 text-white">
                        {t('next')}
                    </Button>
                </div>
             </div>
        );
    }

    // SLIDE 3: User Rating
    return (
        <div className="fixed inset-0 z-[60] bg-slate-900 flex flex-col items-center justify-center p-6 animate-fade-in text-white">
             <div className="text-center space-y-8">
                 <h2 className="text-3xl font-bold">{t('how_feel')}</h2>
                 <p className="text-slate-400">{t('rate_day')}</p>
                 
                 <div className="flex space-x-2 justify-center">
                     {[1, 2, 3, 4, 5].map(star => (
                         <button 
                            key={star}
                            onClick={() => handleRating(star)}
                            className={`text-5xl transition-transform hover:scale-125 duration-200 ${userRating >= star ? 'text-yellow-400' : 'text-slate-700'}`}
                         >
                             ★
                         </button>
                     ))}
                 </div>
                 
                 {userRating > 0 && (
                     <p className="text-emerald-400 font-bold animate-fade-in">{t('saved')}</p>
                 )}
             </div>
        </div>
    );
};
