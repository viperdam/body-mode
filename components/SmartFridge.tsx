
import React, { useState, useRef } from 'react';
import { Button } from './Button';
import { detectFridgeIngredients, generateFridgeRecipes } from '../services/geminiService';
import { UserProfile, Recipe, CookingMood } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

interface SmartFridgeProps {
  user: UserProfile;
  onClose: () => void;
}

type FridgeState = 'initial' | 'analyzing_ingredients' | 'select_mood' | 'generating_recipes' | 'results';

export const SmartFridge: React.FC<SmartFridgeProps> = ({ user, onClose }) => {
  const { t, language } = useLanguage();
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [fridgeState, setFridgeState] = useState<FridgeState>('initial');
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      setMediaPreview(objectUrl);
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        runIngredientsDetection(base64, file.type);
      };
      reader.readAsDataURL(file);
    }
  };

  const runIngredientsDetection = async (base64: string, mimeType: string) => {
    setFridgeState('analyzing_ingredients');
    try {
        const base64Data = base64.split(',')[1];
        const detected = await detectFridgeIngredients({ data: base64Data, mimeType });
        setIngredients(detected);
        setFridgeState('select_mood');
    } catch (e) {
        alert("Chef Gemini is having trouble seeing. Try again.");
        setMediaPreview(null);
        setFridgeState('initial');
    }
  };

  const handleMoodSelect = async (mood: CookingMood) => {
      setFridgeState('generating_recipes');
      try {
          const generatedRecipes = await generateFridgeRecipes(ingredients, mood, user, language);
          setRecipes(generatedRecipes);
          setFridgeState('results');
      } catch (e) {
          alert("Chef Gemini burned the recipes. Try again.");
          setFridgeState('select_mood');
      }
  };

  // 1. INITIAL STATE
  if (!mediaPreview) {
    return (
      <div className="h-full flex flex-col bg-emerald-950 text-white relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute top-0 left-0 w-full h-full opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-800 to-slate-950"></div>
        
        <div className="relative z-10 flex justify-end p-6 pt-8">
            <button onClick={onClose} className="p-3 bg-white/10 rounded-full hover:bg-white/20 transition-colors backdrop-blur-sm">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center space-y-10 p-8 relative z-10">
            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <div className="absolute -inset-4 bg-emerald-500 rounded-full blur-2xl opacity-20 group-hover:opacity-40 transition-opacity animate-pulse"></div>
                <div className="w-32 h-32 rounded-full border-2 border-dashed border-emerald-400/50 flex items-center justify-center bg-emerald-900/50 backdrop-blur-sm group-hover:border-emerald-400 transition-colors">
                    <span className="text-4xl">🥦</span>
                </div>
            </div>
            
            <div className="text-center max-w-xs">
                <h2 className="text-3xl font-bold mb-3 tracking-tight">{t('fridge_scan')}</h2>
                <p className="text-emerald-200/70 text-lg leading-relaxed">{t('fridge_desc')}</p>
            </div>
            
            <input 
                type="file" 
                accept="image/*" 
                capture="environment"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileChange}
            />
            
            <button 
                onClick={() => fileInputRef.current?.click()} 
                className="w-full max-w-xs bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-2xl font-bold text-lg shadow-xl shadow-emerald-900/40 transition-all active:scale-95"
            >
                {t('open_camera')}
            </button>
        </div>
      </div>
    );
  }

  // WRAPPER FOR ALL OTHER STATES
  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 pb-safe">
      <div className="relative h-1/3 bg-black">
        <img src={mediaPreview} alt="Fridge" className="w-full h-full object-cover opacity-80" />
        <button onClick={onClose} className="absolute top-6 right-6 p-3 bg-black/40 text-white rounded-full backdrop-blur-md z-20 hover:bg-black/60 transition-colors border border-white/10">
             <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        {(fridgeState === 'analyzing_ingredients' || fridgeState === 'generating_recipes') && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm z-10 transition-all">
                <div className="w-16 h-16 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
                <p className="text-white font-bold text-lg tracking-wide">
                    {fridgeState === 'analyzing_ingredients' ? t('analyzing_fridge') : t('chef_thinking')}
                </p>
            </div>
        )}
      </div>

      <div className="flex-1 bg-white dark:bg-slate-900 rounded-t-[2.5rem] -mt-10 relative z-10 p-6 overflow-y-auto shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
        
        {/* STATE: SELECT MOOD */}
        {fridgeState === 'select_mood' && (
            <div className="animate-fade-in space-y-6">
                <div className="text-center">
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">{t('cooking_mood')}</h3>
                    <p className="text-slate-500 text-sm">{t('found_ingredients').replace('{n}', String(ingredients.length))}</p>
                </div>

                <div className="flex flex-wrap gap-2 justify-center mb-6">
                    {ingredients.map((ing, i) => (
                        <span key={i} className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs rounded-md">
                            {ing}
                        </span>
                    ))}
                </div>

                <div className="space-y-4">
                    <button onClick={() => handleMoodSelect('quick')} className="w-full p-5 bg-gradient-to-r from-orange-400 to-orange-500 rounded-2xl text-white shadow-lg shadow-orange-500/20 active:scale-98 transition-transform text-left">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-2xl">⚡</span>
                            <span className="text-xs font-bold bg-white/20 px-2 py-1 rounded">15m</span>
                        </div>
                        <h4 className="font-bold text-lg">{t('mood_quick')}</h4>
                        <p className="text-white/80 text-xs">{t('mood_quick_desc')}</p>
                    </button>

                    <button onClick={() => handleMoodSelect('balanced')} className="w-full p-5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl text-white shadow-lg shadow-emerald-500/20 active:scale-98 transition-transform text-left">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-2xl">🍳</span>
                            <span className="text-xs font-bold bg-white/20 px-2 py-1 rounded">45m</span>
                        </div>
                        <h4 className="font-bold text-lg">{t('mood_balanced')}</h4>
                        <p className="text-white/80 text-xs">{t('mood_balanced_desc')}</p>
                    </button>

                    <button onClick={() => handleMoodSelect('gourmet')} className="w-full p-5 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-2xl text-white shadow-lg shadow-purple-500/20 active:scale-98 transition-transform text-left">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-2xl">👨‍🍳</span>
                            <span className="text-xs font-bold bg-white/20 px-2 py-1 rounded">60m+</span>
                        </div>
                        <h4 className="font-bold text-lg">{t('mood_gourmet')}</h4>
                        <p className="text-white/80 text-xs">{t('mood_gourmet_desc')}</p>
                    </button>
                </div>
            </div>
        )}

        {/* STATE: RESULTS */}
        {fridgeState === 'results' && (
            <div className="space-y-8 animate-fade-in pb-20">
                <div>
                     <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-4">{t('suggested_recipes')}</h3>
                     <div className="space-y-6">
                        {recipes.map((recipe, idx) => (
                            <div key={idx} className="bg-slate-50 dark:bg-slate-800 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 relative overflow-hidden">
                                {recipe.chefNote && (
                                    <div className="mb-4 bg-indigo-50 dark:bg-indigo-900/30 p-3 rounded-xl border border-indigo-100 dark:border-indigo-800/50">
                                        <p className="text-xs text-indigo-800 dark:text-indigo-200 italic">" {recipe.chefNote} "</p>
                                    </div>
                                )}
                                
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-bold text-lg text-slate-900 dark:text-white leading-tight">{recipe.name}</h4>
                                    <span className="text-xs font-bold bg-white dark:bg-slate-900 border dark:border-slate-600 px-2 py-1 rounded shadow-sm">
                                        {recipe.calories} {t('cal')}
                                    </span>
                                </div>
                                <div className="flex space-x-3 text-xs text-slate-500 dark:text-slate-400 mb-4 font-medium">
                                    <span className="flex items-center gap-1">⏱️ {recipe.prepTime}</span>
                                    <span className="flex items-center gap-1">💪 {recipe.protein}g {t('prot')}</span>
                                </div>
                                
                                {recipe.missingIngredients.length > 0 && (
                                    <div className="mb-4">
                                        <span className="text-xs text-red-500 font-bold mr-1 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded">{t('missing')}:</span>
                                        <span className="text-xs text-slate-600 dark:text-slate-400">{recipe.missingIngredients.join(', ')}</span>
                                    </div>
                                )}

                                <div className="bg-white dark:bg-slate-900/80 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50">
                                    <ol className="list-decimal list-inside space-y-2">
                                        {recipe.instructions.map((step, i) => (
                                            <li key={i} className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed pl-1 marker:font-bold marker:text-indigo-500">{step}</li>
                                        ))}
                                    </ol>
                                </div>
                            </div>
                        ))}
                     </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};
