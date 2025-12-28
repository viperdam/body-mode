
import React, { useEffect } from 'react';
import { UserProfile, MacroNutrients, AppContext, DailyPlan, ViewState, PlanItem, ENERGY_COSTS } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useLanguage } from '../contexts/LanguageContext';
import { useEnergy } from '../contexts/EnergyContext';
import { getLocalDateKey } from '../utils/dateUtils';
import { BatteryWidget } from './BatteryWidget';

interface DashboardProps {
  user: UserProfile;
  dailyLog: {
    consumed: MacroNutrients;
    burned: number; // NEW
    water: number; 
    sleep: number; 
  };
  appContext: AppContext;
  setAppContext: (ctx: AppContext) => void;
  dailyPlan: DailyPlan | null;
  onGeneratePlan: () => void;
  isLoadingPlan: boolean;
  onUpdateWater: (amount: number) => void;
  onUpdateSleep: (hours: number) => void;
  onTogglePlanItem: (itemId: string) => void;
  onNavigate: (view: ViewState) => void;
  onTriggerAction: (item: PlanItem) => void;
  onTriggerUnplannedActivity: () => void; // NEW Handler
  onEndDay?: () => void; // NEW: Trigger Wrap Up
  
  // Date Navigation Props
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

const getWeatherIcon = (code: number) => {
    if (code === 0) return '☀️';
    if (code <= 3) return '☁️';
    if (code <= 48) return '🌫️';
    if (code <= 55) return '🌦️';
    if (code <= 67) return '🌧️';
    if (code >= 77) return '❄️';
    if (code >= 95) return '⚡';
    return '🌤️';
};

const getAvatarIcon = (id?: string) => {
    switch(id) {
        case 'titan': return '🦾';
        case 'zen': return '🧘';
        case 'sprinter': return '⚡';
        case 'cyborg': return '🤖';
        default: return '🤖';
    }
};

const getAvatarGradient = (id?: string) => {
    switch(id) {
        case 'titan': return 'from-orange-500 to-red-500';
        case 'zen': return 'from-teal-400 to-emerald-500';
        case 'sprinter': return 'from-yellow-400 to-orange-500';
        case 'cyborg': return 'from-cyan-500 to-blue-600';
        default: return 'from-cyan-500 to-blue-500';
    }
};

export const Dashboard: React.FC<DashboardProps> = ({ 
    user, 
    dailyLog, 
    appContext, 
    setAppContext,
    dailyPlan,
    onGeneratePlan,
    isLoadingPlan,
    onUpdateWater,
    onUpdateSleep,
    onTogglePlanItem,
    onNavigate,
    onTriggerAction,
    onTriggerUnplannedActivity,
    onEndDay,
    selectedDate,
    onDateChange
}) => {
  const { t } = useLanguage();
  const { consumeEnergy, triggerAd } = useEnergy();
  
  // Safe defaults for Calorie Target
  const target = user.dailyCalorieTarget && user.dailyCalorieTarget > 0 ? user.dailyCalorieTarget : 2000;
  
  // NET Calculation: Consumed - Burned
  const netCalories = dailyLog.consumed.calories - dailyLog.burned;
  const remainingCalories = target - netCalories;
  
  const isOverBudget = remainingCalories < 0;
  
  // Progress Logic (Visual representation of "Used Budget")
  // We clamp it between 0 and 100 for the chart, but show real numbers
  const progress = Math.min(100, Math.max(0, (netCalories / target) * 100));

  const data = isOverBudget 
      ? [
          { name: 'Over', value: Math.abs(remainingCalories) }, // Red part
          { name: 'Base', value: target } // Rest
        ] 
      : [
          { name: 'Consumed', value: Math.max(0, netCalories) },
          { name: 'Remaining', value: Math.abs(remainingCalories) }
        ];
  
  const COLORS = isOverBudget 
      ? ['#ef4444', '#1f2937'] // Red if over
      : ['#06b6d4', '#1f2937']; // Cyan if under

  // STRICT DATE CHECKING to prevent infinite re-fetching
  const selectedDateKey = getLocalDateKey(selectedDate);
  const isToday = selectedDateKey === getLocalDateKey(new Date());
  
  // Plan Key Check (Handles missing plan or date mismatch)
  const planDateKey = dailyPlan?.date;
  
  // Initial Plan Fetch logic (Free or Paid?)
  // Let's make initial fetch FREE if there is NO plan, but Paid if user hits "Refine".
  // Actually, sticking to the user request: "BioSync is recalibrating... Watch Ad".
  // But for better UX on first load, we might handle it slightly differently.
  // We'll trust the parent App.tsx to call onGeneratePlan initially or we do it here.
  // The user said: "Morning Sync... Button says Sync Daily Plan (Watch Ad)".
  
  const handleRefinePlan = () => {
      // Gate the "Refine Plan" button
      if (consumeEnergy(ENERGY_COSTS.DAILY_PLAN)) {
          onGeneratePlan();
      } else {
          // Trigger Ad
          triggerAd(() => {
              // On success (Energy recharged)
              // We could auto-consume here or let user click again.
              // To make it "Input -> Ad -> Output", we auto-run.
              // Since recharge sets to 100, we can safely call generation now.
              onGeneratePlan();
          });
      }
  };

  const handlePlanItemClick = (item: PlanItem) => {
      // Only allow interactions if viewing today
      if (!isToday) return;

      if (item.completed) {
          onTogglePlanItem(item.id);
          return;
      }
      if (item.linkedAction === 'start_sleep') {
          onNavigate('sleep');
      } else {
          onTriggerAction(item);
      }
  };

  const changeDate = (days: number) => {
      const newDate = new Date(selectedDate);
      newDate.setDate(newDate.getDate() + days);
      onDateChange(newDate);
  };

  const avatarGradient = getAvatarGradient(user.avatarId);
  const avatarIcon = getAvatarIcon(user.avatarId);

  return (
    <div className="pb-32 pt-10 px-6 space-y-8 max-w-md mx-auto animate-fade-in relative">
        {/* Background Ambient Glow */}
        <div className="fixed top-0 left-0 w-full h-full bg-midnight-900 -z-20"></div>
        <div className="fixed top-[-100px] left-[-100px] w-[300px] h-[300px] bg-cyan-900/30 rounded-full blur-[100px] -z-10"></div>

      {/* Header & Date Navigation */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center space-x-2">
             <button onClick={() => changeDate(-1)} className="p-2 bg-white/5 rounded-full hover:bg-white/10">
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
             </button>
             <div>
                 <h1 className="text-xl font-black tracking-tight text-white text-center min-w-[120px]">
                    {isToday ? t('daily_plan') : selectedDate.toLocaleDateString([], {weekday: 'short', month: 'short', day: 'numeric'})}
                 </h1>
             </div>
             <button onClick={() => changeDate(1)} disabled={isToday} className={`p-2 bg-white/5 rounded-full hover:bg-white/10 ${isToday ? 'opacity-30 cursor-not-allowed' : ''}`}>
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
             </button>
          </div>
          
          <div className="flex items-center gap-3 mt-2">
             <div className="glass-panel px-3 py-1.5 rounded-full flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300">
                    {getWeatherIcon(appContext.weather.code)} {Math.round(appContext.weather.temp)}°C
                </span>
                <span className="text-[10px] text-slate-400 font-medium hidden xs:block border-l border-white/10 pl-2 ml-1">
                    {appContext.weather.condition}
                </span>
             </div>
             <BatteryWidget /> {/* Battery Widget Here */}
          </div>
        </div>
        <div 
            onClick={() => onNavigate('profile')}
            className={`h-14 w-14 rounded-2xl ring-2 ring-white/10 shadow-2xl flex items-center justify-center cursor-pointer bg-gradient-to-br ${avatarGradient}`}
        >
            <span className="text-3xl filter drop-shadow-md">{avatarIcon}</span>
        </div>
      </div>
      
      {/* AI Goals Summary (Weekly/Monthly) */}
      {isToday && user.weeklyGoalSummary && (
          <div className="bg-gradient-to-r from-cyan-900/40 to-teal-900/40 border border-cyan-500/20 p-4 rounded-2xl flex items-start space-x-3">
              <span className="text-xl mt-0.5">🎯</span>
              <div>
                  <h4 className="text-xs font-bold text-cyan-300 uppercase mb-1">Weekly Mission</h4>
                  <p className="text-sm text-white font-medium leading-tight">{user.weeklyGoalSummary}</p>
              </div>
          </div>
      )}

      {/* Hero Stats Card */}
      <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-cyan-900 to-slate-900 border border-white/5 p-6 shadow-2xl group">
        <div className="absolute top-0 right-0 w-40 h-40 bg-cyan-500/20 rounded-full blur-[60px] -mr-10 -mt-10 group-hover:bg-cyan-500/30 transition-colors duration-500"></div>
        
        <div className="flex justify-between items-center relative z-10">
            <div>
                <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${isOverBudget ? 'text-red-400' : 'text-cyan-200'}`}>
                    {isOverBudget ? 'Over Limit' : t('calories_left')}
                </p>
                <h2 className={`text-6xl font-black tracking-tighter text-glow ${isOverBudget ? 'text-red-500' : 'text-white'}`}>
                    {Math.round(Math.abs(remainingCalories))}
                </h2>
                
                {/* Burned / Net Context */}
                <div className="flex flex-col mt-3 space-y-1">
                     <span className="text-xs text-slate-400 font-bold">Goal: {target}</span>
                     {dailyLog.burned > 0 && (
                         <span className="text-xs text-emerald-400 font-bold">Bonus: +{dailyLog.burned} burned</span>
                     )}
                </div>
            </div>
            
            <div className="w-32 h-32 relative">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={42}
                        outerRadius={58}
                        startAngle={90}
                        endAngle={-270}
                        dataKey="value"
                        stroke="none"
                        paddingAngle={5}
                        cornerRadius={10}
                    >
                        {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? COLORS[0] : COLORS[1]} />
                        ))}
                    </Pie>
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center flex-col">
                    <span className={`text-xl font-black ${isOverBudget ? 'text-red-500' : 'text-white'}`}>
                        {Math.round(progress)}%
                    </span>
                </div>
            </div>
        </div>
      </div>

      {/* Feature Grid: Water, Sleep, Fridge + ACTIVITY */}
      <div className="grid grid-cols-2 gap-4">
        <div className={`glass-card p-5 rounded-[2rem] flex flex-col justify-between relative overflow-hidden group ${!isToday ? 'opacity-70 pointer-events-none' : ''}`}>
            <div className="absolute top-0 right-0 w-20 h-20 bg-sky-500/10 rounded-full blur-2xl group-hover:bg-sky-500/20 transition-all"></div>
            <div className="flex items-center space-x-2 mb-4 relative z-10">
                <span className="text-xl">💧</span>
                <span className="text-sm font-bold text-slate-300">{t('water')}</span>
            </div>
            <div className="flex justify-between items-end relative z-10">
                <p className="text-2xl font-black text-white">{dailyLog.water}<span className="text-xs text-slate-500 font-bold ml-1">ml</span></p>
                <div className="flex space-x-1">
                    <button onClick={() => onUpdateWater(-250)} className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center hover:bg-slate-700 active:scale-90 transition-all font-bold">-</button>
                    <button onClick={() => onUpdateWater(250)} className="w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center hover:bg-sky-400 active:scale-90 transition-all shadow-lg shadow-sky-500/30 font-bold">+</button>
                </div>
            </div>
        </div>
        
        <div className={`glass-card p-5 rounded-[2rem] flex flex-col justify-between cursor-pointer active:scale-95 transition-transform group relative overflow-hidden ${!isToday ? 'opacity-70 pointer-events-none' : ''}`} onClick={() => onNavigate('sleep')}>
             <div className="absolute top-0 right-0 w-20 h-20 bg-violet-500/10 rounded-full blur-2xl group-hover:bg-violet-500/20 transition-all"></div>
             <div className="flex items-center space-x-2 mb-4 relative z-10">
                <span className="text-xl">💤</span>
                <span className="text-sm font-bold text-slate-300">{t('sleep')}</span>
            </div>
            <div className="flex justify-between items-end relative z-10">
                <p className="text-2xl font-black text-white">{dailyLog.sleep}<span className="text-xs text-slate-500 font-bold ml-1">h</span></p>
                 <div className="w-8 h-8 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center">→</div>
            </div>
        </div>
        
        {/* Smart Fridge Card - Only show on Today */}
        {isToday && (
            <div className="col-span-1 bg-gradient-to-r from-emerald-900/40 to-emerald-800/40 border border-emerald-500/20 rounded-[2rem] p-5 flex flex-col justify-between cursor-pointer active:scale-98 transition-transform relative overflow-hidden group" onClick={() => onNavigate('smart-fridge')}>
                <div className="absolute right-0 top-0 w-40 h-40 bg-emerald-500/10 rounded-full -mr-10 -mt-10 blur-3xl group-hover:bg-emerald-500/20 transition-all"></div>
                <div className="flex items-center space-x-2 z-10 mb-2">
                     <span className="text-2xl">🥦</span>
                     <h4 className="font-bold text-white text-sm">{t('fridge')}</h4>
                </div>
                <div className="text-xs text-emerald-300 font-medium">Scan Ingredients</div>
            </div>
        )}

        {/* REALITY INJECTION BUTTON */}
        {isToday && (
             <div className="col-span-1 bg-gradient-to-r from-red-900/40 to-orange-800/40 border border-red-500/20 rounded-[2rem] p-5 flex flex-col justify-between cursor-pointer active:scale-98 transition-transform relative overflow-hidden group" onClick={onTriggerUnplannedActivity}>
                <div className="absolute right-0 top-0 w-40 h-40 bg-red-500/10 rounded-full -mr-10 -mt-10 blur-3xl group-hover:bg-red-500/20 transition-all"></div>
                <div className="flex items-center space-x-2 z-10 mb-2">
                     <span className="text-2xl">⚠️</span>
                     <h4 className="font-bold text-white text-sm">Reality Check</h4>
                </div>
                <div className="text-xs text-red-300 font-medium">Log Unplanned</div>
            </div>
        )}

      </div>
      
      {/* AI Daily Plan Timeline */}
      <div className="space-y-4">
        {isToday && (
            <div className="flex justify-between items-end px-1">
                <h3 className="text-xl font-bold text-white flex items-center">
                    <span className="mr-2 text-2xl">📅</span> {t('daily_plan')}
                </h3>
                <button 
                    onClick={handleRefinePlan} 
                    disabled={isLoadingPlan}
                    className="text-xs text-cyan-400 font-bold bg-cyan-500/10 px-3 py-1.5 rounded-lg hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
                >
                    {isLoadingPlan ? t('refining') : t('refine_plan')}
                </button>
            </div>
        )}

        {dailyPlan && dailyPlan.date === selectedDateKey ? (
            <div className="space-y-4">
                <div className="glass-card p-4 rounded-2xl border-l-4 border-l-cyan-500">
                    <p className="text-sm text-slate-300 italic leading-relaxed">"{dailyPlan.summary}"</p>
                </div>
                
                <div className="space-y-3">
                    {dailyPlan.items.map((item, idx) => (
                        <div 
                            key={idx} 
                            onClick={() => handlePlanItemClick(item)}
                            className={`glass-card p-4 rounded-2xl flex items-center gap-4 transition-all duration-200 active:scale-98 cursor-pointer border border-white/5 hover:border-white/10 ${item.completed ? 'opacity-40 grayscale' : ''}`}
                        >
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-lg ${
                                item.type === 'meal' ? 'bg-orange-500/20 text-orange-400' : 
                                item.type === 'workout' ? 'bg-red-500/20 text-red-400' :
                                item.type === 'hydration' ? 'bg-sky-500/20 text-sky-400' :
                                item.type === 'sleep' ? 'bg-violet-500/20 text-violet-400' : 'bg-emerald-500/20 text-emerald-400'
                            }`}>
                                {item.completed ? '✓' : (item.type === 'meal' ? '🍔' : item.type === 'workout' ? '💪' : item.type === 'hydration' ? '💧' : item.type === 'sleep' ? '😴' : '💼')}
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between items-center mb-1">
                                    <h4 className={`font-bold text-sm ${item.completed ? 'text-slate-500 line-through' : 'text-white'}`}>{item.title}</h4>
                                    <span className="text-[10px] font-bold text-slate-400 bg-white/5 px-2 py-0.5 rounded">{item.time}</span>
                                </div>
                                <p className="text-xs text-slate-400 line-clamp-1">{item.description}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* END DAY BUTTON - Only shows if on Today and logic passed from Parent allows it */}
                {isToday && onEndDay && (
                     <div className="pt-4 pb-2 animate-fade-in">
                         <button 
                            onClick={onEndDay}
                            className="w-full py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-cyan-500/30 text-cyan-300 font-bold tracking-widest uppercase text-xs transition-all active:scale-95"
                        >
                            End Day & Review
                         </button>
                     </div>
                )}

            </div>
        ) : (
            <div className="text-center py-12 text-slate-500 glass-card rounded-3xl border-dashed border-2 border-slate-700">
                {isToday ? (
                     isLoadingPlan ? (
                        <div className="flex justify-center space-x-2 animate-pulse">
                            <div className="w-2 h-2 bg-cyan-500 rounded-full"></div>
                            <div className="w-2 h-2 bg-cyan-500 rounded-full"></div>
                            <div className="w-2 h-2 bg-cyan-500 rounded-full"></div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-sm mb-4">Daily plan needs initialization.</p>
                            <button 
                                onClick={handleRefinePlan} 
                                className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 rounded-2xl text-white font-bold"
                            >
                                Generate Daily Plan
                            </button>
                        </div>
                    )
                ) : (
                    <p className="text-sm">No plan data for this date.</p>
                )}
            </div>
        )}
      </div>

    </div>
  );
};
