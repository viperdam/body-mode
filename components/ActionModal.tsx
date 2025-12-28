
import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { PlanItem, FoodAnalysisResult, UserProfile, SavedMeal, ActivityLogEntry } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { analyzeTextFood } from '../services/geminiService';

interface ActionModalProps {
    type: 'plan_reminder' | 'weight_check' | 'unplanned_activity';
    item?: PlanItem;
    userProfile?: UserProfile;
    currentWeight?: number;
    savedMeals?: SavedMeal[]; 
    onComplete: (reactionTime?: number) => void;
    onSnooze: (minutes: number) => void;
    onSkip?: () => void;
    onUpdateWeight?: (weight: number) => void;
    // New handlers
    onLogFoodText?: (food: FoodAnalysisResult) => void;
    onNavigateToCamera?: () => void;
    onUpdateWater?: (amount: number) => void;
    onLogActivity?: (entry: ActivityLogEntry) => void;
    onClose?: () => void;
}

export const ActionModal: React.FC<ActionModalProps> = ({ 
    type, item, userProfile, currentWeight, savedMeals, onComplete, onSnooze, onSkip, onUpdateWeight,
    onLogFoodText, onNavigateToCamera, onUpdateWater, onLogActivity, onClose
}) => {
    const { t, language } = useLanguage();
    
    // Track start time for "reaction time" metrics
    const [mountTime] = useState(Date.now());

    // Generic states
    const [snoozeTime, setSnoozeTime] = useState(30);
    const [mode, setMode] = useState<'main' | 'snooze_select' | 'log_food_select' | 'log_food_text' | 'log_water_input' | 'log_favorites' | 'log_activity_input' | 'unplanned_fork'>('main');
    
    // Weight State
    const [customWeight, setCustomWeight] = useState(currentWeight?.toString() || '');
    
    // Food Text State
    const [foodDescription, setFoodDescription] = useState('');
    const [foodQuantity, setFoodQuantity] = useState('');
    const [isAnalyzingFood, setIsAnalyzingFood] = useState(false);

    // Activity State
    const [activityName, setActivityName] = useState(item?.title || 'Workout');
    const [activityDuration, setActivityDuration] = useState(60);
    const [activityIntensity, setActivityIntensity] = useState<'low' | 'moderate' | 'high'>('moderate');

    // Water State
    const [waterAmount, setWaterAmount] = useState(250);

    // Initial Mode Setup based on Type
    useEffect(() => {
        if (type === 'unplanned_activity') {
            setMode('unplanned_fork'); // Show the fork choice first
            setActivityName('');
            setActivityDuration(30);
        }
    }, [type]);

    // Helper to calculate reaction time
    const getReactionTime = () => {
        return Math.round((Date.now() - mountTime) / 1000); // seconds
    };

    const handleCompleteWithTracking = () => {
        onComplete(getReactionTime());
    };

    // Weight Check Logic
    if (type === 'weight_check') {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-fade-in">
                <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 w-full max-w-sm shadow-2xl border border-slate-100 dark:border-slate-800">
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
                            ⚖️
                        </div>
                        <h2 className="text-2xl font-bold dark:text-white">{t('weekly_check')}</h2>
                        <p className="text-slate-500 dark:text-slate-400 mt-2">
                            {t('weight_msg')}
                        </p>
                    </div>

                    <div className="mb-6">
                        <input 
                            type="number" 
                            value={customWeight}
                            onChange={e => setCustomWeight(e.target.value)}
                            className="w-full text-center text-4xl font-bold bg-transparent border-b-2 border-slate-200 dark:border-slate-700 focus:border-cyan-500 outline-none py-2 dark:text-white"
                            placeholder="kg"
                            autoFocus
                        />
                    </div>

                    <Button fullWidth onClick={() => onUpdateWeight && onUpdateWeight(parseFloat(customWeight))}>
                        {t('update_weight')}
                    </Button>
                </div>
            </div>
        );
    }

    const handleMainAction = () => {
        if (item?.linkedAction === 'log_food') {
            setMode('log_food_select');
        } else if (item?.linkedAction === 'log_water') {
            setMode('log_water_input');
        } else if (item?.type === 'workout') {
            handleCompleteWithTracking(); // Simple complete, can add logic later
        } else {
            handleCompleteWithTracking();
        }
    };

    const handleModifyAction = () => {
        if (item?.type === 'meal') {
            setMode('log_food_select'); // Eat something else
        } else if (item?.type === 'workout') {
            setMode('log_activity_input'); // Do something else / more
        }
    };

    const submitFoodText = async () => {
        if (!foodDescription || !userProfile) return;
        setIsAnalyzingFood(true);
        try {
            const fullText = foodQuantity ? `${foodDescription}, quantity: ${foodQuantity}` : foodDescription;
            const result = await analyzeTextFood(fullText, userProfile, language);
            if (onLogFoodText) onLogFoodText(result);
        } catch (e) {
            console.error(e);
            alert("Failed to analyze food. Try again.");
            setIsAnalyzingFood(false);
        }
    };

    const submitActivity = () => {
        if (!onLogActivity) return;
        
        // Simple Estimate Logic (METs)
        let met = 4;
        if (activityIntensity === 'low') met = 3;
        if (activityIntensity === 'moderate') met = 6;
        if (activityIntensity === 'high') met = 9;
        
        const weight = userProfile?.weight || 70;
        const durationHours = activityDuration / 60;
        const calories = Math.round(met * weight * durationHours);

        const entry: ActivityLogEntry = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            name: activityName || 'Workout',
            durationMinutes: activityDuration,
            intensity: activityIntensity,
            caloriesBurned: calories
        };
        onLogActivity(entry);
    };

    const handleLogFavorite = (saved: SavedMeal) => {
        if (onLogFoodText) {
            const result: FoodAnalysisResult = {
                foodName: saved.name,
                description: 'Logged from favorites',
                ingredients: [],
                macros: saved.macros,
                healthGrade: saved.healthGrade,
                confidence: 'High',
                advice: 'Logged from favorites.'
            };
            onLogFoodText(result);
        }
    };

    const submitWater = () => {
        if (onUpdateWater) {
            onUpdateWater(waterAmount);
            handleCompleteWithTracking();
        }
    };

    // Plan Item Reminder - UPDATED FOR CENTER POPUP
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-fade-in">
             <div className={`bg-white dark:bg-slate-900 rounded-[2rem] p-6 w-full max-w-sm shadow-2xl border border-slate-100 dark:border-slate-800 transform transition-transform overflow-y-auto max-h-[90vh] no-scrollbar ${type === 'plan_reminder' ? 'ring-2 ring-cyan-500/50 shadow-cyan-500/20' : ''}`}>
                
                {/* MODE: MAIN */}
                {mode === 'main' && (
                    <>
                        <div className="flex items-start justify-between mb-6">
                            <div>
                                {type === 'plan_reminder' && (
                                    <div className="flex items-center space-x-2 mb-1">
                                        <span className="relative flex h-2 w-2">
                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                                          <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                                        </span>
                                        <span className="text-xs font-bold text-cyan-500 uppercase tracking-wider">{t('reminder')}</span>
                                    </div>
                                )}
                                <h2 className="text-2xl font-bold dark:text-white mt-1">{item?.title}</h2>
                                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{item?.description}</p>
                            </div>
                            <div className="text-3xl">
                                {item?.type === 'meal' ? '🍔' : item?.type === 'workout' ? '💪' : item?.type === 'hydration' ? '💧' : '⏰'}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Button fullWidth onClick={handleMainAction} className="bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200 dark:shadow-none">
                                {t('yes_did_it')}
                            </Button>
                            
                            {(item?.type === 'meal' || item?.type === 'workout') && (
                                <Button variant="outline" onClick={handleModifyAction} className="border-cyan-200 text-cyan-600 dark:border-cyan-800 dark:text-cyan-400">
                                    {item.type === 'meal' ? 'I ate something else...' : 'I did something else...'}
                                </Button>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <Button variant="outline" onClick={() => setMode('snooze_select')}>
                                    {t('snooze')}
                                </Button>
                                <Button variant="ghost" onClick={onSkip} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                                    {t('skip')}
                                </Button>
                            </div>
                        </div>
                    </>
                )}

                {/* MODE: UNPLANNED FORK (Reality Check) */}
                {mode === 'unplanned_fork' && (
                    <>
                        <div className="text-center mb-6">
                            <h3 className="font-bold text-lg dark:text-white">Reality Check</h3>
                            <p className="text-slate-500 text-sm">What just happened?</p>
                        </div>
                        <div className="space-y-4">
                            <button 
                                onClick={() => setMode('log_food_select')}
                                className="w-full p-6 bg-orange-50 dark:bg-orange-900/20 rounded-2xl flex items-center space-x-4 border border-orange-100 dark:border-orange-800/50 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors"
                            >
                                <span className="text-3xl">🍫</span>
                                <div className="text-left rtl:text-right">
                                    <span className="block font-bold text-orange-900 dark:text-orange-100">I Ate Something</span>
                                    <span className="text-xs text-orange-700/60 dark:text-orange-300/60">Snickers, Snack, Extra Meal...</span>
                                </div>
                            </button>

                            <button 
                                onClick={() => setMode('log_activity_input')}
                                className="w-full p-6 bg-cyan-50 dark:bg-cyan-900/20 rounded-2xl flex items-center space-x-4 border border-cyan-100 dark:border-cyan-800/50 hover:bg-cyan-100 dark:hover:bg-cyan-900/40 transition-colors"
                            >
                                <span className="text-3xl">🏃‍♂️</span>
                                <div className="text-left rtl:text-right">
                                    <span className="block font-bold text-cyan-900 dark:text-cyan-100">I Moved</span>
                                    <span className="text-xs text-cyan-700/60 dark:text-cyan-300/60">Walk, Gym, Cleaning...</span>
                                </div>
                            </button>
                        </div>
                        <Button variant="ghost" fullWidth onClick={() => onClose && onClose()} className="mt-4">{t('cancel')}</Button>
                    </>
                )}

                {/* MODE: SNOOZE */}
                {mode === 'snooze_select' && (
                    <>
                         <div className="text-center mb-6">
                            <h3 className="font-bold text-lg dark:text-white">{t('remind_in')}</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            {[15, 30, 45, 60].map(mins => (
                                <button
                                    key={mins}
                                    onClick={() => onSnooze(mins)}
                                    className="p-4 rounded-xl border-2 border-slate-100 dark:border-slate-700 font-bold hover:border-cyan-500 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 dark:text-white transition-all"
                                >
                                    {mins} min
                                </button>
                            ))}
                        </div>
                        <Button variant="ghost" fullWidth onClick={() => setMode('main')}>{t('cancel')}</Button>
                    </>
                )}

                {/* MODE: ACTIVITY INPUT (LOG OR MODIFY) */}
                {mode === 'log_activity_input' && (
                     <>
                        <div className="text-center mb-6">
                            <h3 className="font-bold text-lg dark:text-white">Log Activity</h3>
                        </div>
                        
                        <div className="space-y-4 mb-6">
                             <div>
                                <label className="text-xs font-bold text-slate-400 mb-1 block">Activity Name</label>
                                <input 
                                    type="text" 
                                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 rounded-xl outline-none border border-transparent focus:border-cyan-500 dark:text-white"
                                    value={activityName}
                                    onChange={e => setActivityName(e.target.value)}
                                    placeholder="e.g. Running, Yoga, Gym"
                                />
                             </div>

                             <div>
                                <label className="text-xs font-bold text-slate-400 mb-1 block">Duration (Minutes)</label>
                                <div className="flex items-center space-x-2">
                                    <button onClick={() => setActivityDuration(Math.max(10, activityDuration - 10))} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">-</button>
                                    <input 
                                        type="number" 
                                        className="flex-1 text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-xl font-bold outline-none dark:text-white"
                                        value={activityDuration}
                                        onChange={e => setActivityDuration(Number(e.target.value))}
                                    />
                                    <button onClick={() => setActivityDuration(activityDuration + 10)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">+</button>
                                </div>
                             </div>

                             <div>
                                <label className="text-xs font-bold text-slate-400 mb-2 block">Intensity</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['low', 'moderate', 'high'].map(lvl => (
                                        <button 
                                            key={lvl}
                                            onClick={() => setActivityIntensity(lvl as any)}
                                            className={`p-3 rounded-xl capitalize font-bold text-sm transition-all ${activityIntensity === lvl ? 'bg-cyan-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}
                                        >
                                            {lvl}
                                        </button>
                                    ))}
                                </div>
                             </div>
                        </div>

                        <Button fullWidth onClick={submitActivity} className="bg-cyan-600 hover:bg-cyan-500 text-white">
                            Save Activity
                        </Button>
                        <Button variant="ghost" fullWidth onClick={() => onClose ? onClose() : setMode('main')} className="mt-2">{t('cancel')}</Button>
                     </>
                )}

                {/* MODE: LOG FOOD SELECT */}
                {mode === 'log_food_select' && (
                    <>
                        <div className="text-center mb-6">
                            <h3 className="font-bold text-lg dark:text-white">{t('how_log_food')}</h3>
                        </div>
                        <div className="space-y-3 mb-4">
                            <button 
                                onClick={onNavigateToCamera}
                                className="w-full p-4 bg-cyan-50 dark:bg-cyan-900/20 rounded-2xl flex items-center space-x-4 border border-cyan-100 dark:border-cyan-800"
                            >
                                <span className="text-3xl">📸</span>
                                <div className="text-left rtl:text-right">
                                    <span className="block font-bold text-cyan-900 dark:text-cyan-100">{t('camera')}</span>
                                </div>
                            </button>
                            <button 
                                onClick={() => setMode('log_food_text')}
                                className="w-full p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl flex items-center space-x-4 border border-emerald-100 dark:border-emerald-800"
                            >
                                <span className="text-3xl">📝</span>
                                <div className="text-left rtl:text-right">
                                    <span className="block font-bold text-emerald-900 dark:text-emerald-100">{t('text')}</span>
                                </div>
                            </button>
                            <button 
                                onClick={() => setMode('log_favorites')}
                                className="w-full p-4 bg-orange-50 dark:bg-orange-900/20 rounded-2xl flex items-center space-x-4 border border-orange-100 dark:border-orange-800"
                            >
                                <span className="text-3xl">⭐</span>
                                <div className="text-left rtl:text-right">
                                    <span className="block font-bold text-orange-900 dark:text-orange-100">{t('favorites')}</span>
                                    <span className="text-xs text-orange-800/60 dark:text-orange-200/60">{savedMeals?.length || 0} {t('saved_meals')}</span>
                                </div>
                            </button>
                        </div>
                        <Button variant="ghost" fullWidth onClick={() => type === 'plan_reminder' ? setMode('main') : onClose && onClose()}>{t('cancel')}</Button>
                    </>
                )}

                {/* MODE: FAVORITES LIST */}
                {mode === 'log_favorites' && (
                    <>
                        <div className="text-center mb-4">
                            <h3 className="font-bold text-lg dark:text-white">{t('saved_meals')}</h3>
                        </div>
                        <div className="max-h-64 overflow-y-auto no-scrollbar space-y-2 mb-4">
                            {savedMeals && savedMeals.length > 0 ? (
                                savedMeals.map(meal => (
                                    <button 
                                        key={meal.id}
                                        onClick={() => handleLogFavorite(meal)}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 rounded-xl flex justify-between items-center text-left"
                                    >
                                        <div>
                                            <p className="font-bold text-sm text-slate-800 dark:text-white">{meal.name}</p>
                                            <p className="text-xs text-slate-500">{meal.macros.calories} kcal</p>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${meal.healthGrade === 'A' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
                                                {meal.healthGrade}
                                            </span>
                                            <span className="text-xl text-cyan-500">→</span>
                                        </div>
                                    </button>
                                ))
                            ) : (
                                <div className="text-center py-8 text-slate-400">
                                    {t('no_saved')}
                                </div>
                            )}
                        </div>
                        <Button variant="ghost" fullWidth onClick={() => setMode('log_food_select')}>{t('cancel')}</Button>
                    </>
                )}

                {/* MODE: FOOD TEXT INPUT */}
                {mode === 'log_food_text' && (
                    <>
                         <div className="mb-6">
                            <h3 className="font-bold text-lg dark:text-white mb-4">{t('what_did_eat')}</h3>
                            <textarea 
                                className="w-full p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border-none outline-none focus:ring-2 ring-cyan-500 mb-3 text-slate-900 dark:text-white"
                                placeholder={t('food_placeholder')}
                                rows={2}
                                value={foodDescription}
                                onChange={e => setFoodDescription(e.target.value)}
                                disabled={isAnalyzingFood}
                            />
                            <label className="text-xs font-bold text-slate-400 mb-1 block">{t('weight_opt')}</label>
                            <input 
                                type="text"
                                className="w-full p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border-none outline-none focus:ring-2 ring-cyan-500 text-slate-900 dark:text-white"
                                placeholder={t('weight_placeholder')}
                                value={foodQuantity}
                                onChange={e => setFoodQuantity(e.target.value)}
                                disabled={isAnalyzingFood}
                            />
                        </div>
                        <Button 
                            fullWidth 
                            onClick={submitFoodText} 
                            disabled={!foodDescription || isAnalyzingFood}
                            className="bg-cyan-600 text-white"
                        >
                            {isAnalyzingFood ? t('analyzing') : t('log_meal')}
                        </Button>
                        <Button variant="ghost" fullWidth onClick={() => setMode('main')} disabled={isAnalyzingFood} className="mt-2">{t('cancel')}</Button>
                    </>
                )}

                {/* MODE: WATER INPUT */}
                {mode === 'log_water_input' && (
                    <>
                        <div className="text-center mb-6">
                            <h3 className="font-bold text-lg dark:text-white">{t('how_much')}</h3>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 mb-6">
                             <button onClick={() => setWaterAmount(250)} className={`p-4 rounded-xl border-2 font-bold transition-all ${waterAmount === 250 ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/30' : 'border-slate-200 dark:border-slate-700'}`}>
                                250 ml
                             </button>
                             <button onClick={() => setWaterAmount(500)} className={`p-4 rounded-xl border-2 font-bold transition-all ${waterAmount === 500 ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/30' : 'border-slate-200 dark:border-slate-700'}`}>
                                500 ml
                             </button>
                        </div>
                        
                        <div className="mb-6">
                            <label className="text-xs font-bold text-slate-400 mb-2 block">{t('custom_amount')}</label>
                            <input 
                                type="number"
                                className="w-full text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-xl font-bold outline-none border border-transparent focus:border-sky-500 dark:text-white"
                                value={waterAmount}
                                onChange={e => setWaterAmount(Number(e.target.value))}
                            />
                            <input 
                                type="range" 
                                min="100" max="1000" step="50"
                                value={waterAmount}
                                onChange={e => setWaterAmount(Number(e.target.value))}
                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 accent-sky-500 mt-4"
                            />
                        </div>

                        <Button fullWidth onClick={submitWater} className="bg-sky-500 hover:bg-sky-600 text-white">
                            {t('log_water')}
                        </Button>
                        <Button variant="ghost" fullWidth onClick={() => setMode('main')} className="mt-2">{t('cancel')}</Button>
                    </>
                )}

             </div>
        </div>
    );
};
