
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, ViewState, FoodAnalysisResult, MoodLog, MoodType, FoodLogEntry, WeightLogEntry, AppContext, DailyPlan, SleepSession, PlanItem, SavedMeal, ActivityLogEntry, DailyWrapUp, UserContextState } from './types';
import { Onboarding } from './components/Onboarding';
import { Dashboard } from './components/Dashboard';
import { FoodAnalyzer } from './components/FoodAnalyzer';
import { AICoach } from './components/AICoach';
import { Profile } from './components/Profile';
import { Settings } from './components/Settings';
import { Navigation } from './components/Navigation';
import { SleepTracker } from './components/SleepTracker';
import { SmartFridge } from './components/SmartFridge';
import { ActionModal } from './components/ActionModal';
import { Welcome } from './components/Welcome';
import { DailyWrapUpModal } from './components/DailyWrapUpModal';
import { AdOverlay } from './components/AdOverlay'; 
import { ContextStatus } from './components/ContextStatus'; // NEW
import { generateDailyPlan, summarizeHistory, calculateUserProfile, generateDailyWrapUp } from './services/geminiService';
import { sendNotification, requestNotificationPermission } from './services/notificationService';
import { fetchLocalWeather, fetchLocationName } from './services/weatherService';
import { startContextMonitoring } from './services/contextService'; // NEW
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { EnergyProvider, useEnergy } from './contexts/EnergyContext'; 
import { getLocalDateKey } from './utils/dateUtils';

const AppContent: React.FC = () => {
  const { t, language } = useLanguage();
  
  // --- Persistent State Initialization ---
  
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('ls_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [foodLogs, setFoodLogs] = useState<FoodLogEntry[]>(() => {
    const saved = localStorage.getItem('ls_food');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>(() => {
    const saved = localStorage.getItem('ls_activity');
    return saved ? JSON.parse(saved) : [];
  });

  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>(() => {
    const saved = localStorage.getItem('ls_saved_meals');
    return saved ? JSON.parse(saved) : [];
  });

  const [moodLogs, setMoodLogs] = useState<MoodLog[]>(() => {
    const saved = localStorage.getItem('ls_mood');
    return saved ? JSON.parse(saved) : [];
  });

  const [weightLogs, setWeightLogs] = useState<WeightLogEntry[]>(() => {
    const saved = localStorage.getItem('ls_weight');
    return saved ? JSON.parse(saved) : [];
  });

  const [waterLog, setWaterLog] = useState<{date: string, amount: number}>(() => {
     const saved = localStorage.getItem('ls_water');
     const parsed = saved ? JSON.parse(saved) : {date: new Date().toDateString(), amount: 0};
     if (parsed.date !== new Date().toDateString()) return {date: new Date().toDateString(), amount: 0};
     return parsed;
  });

  // Keep a history of sleep for bio-engine
  const [sleepHistory, setSleepHistory] = useState<{date: string, hours: number}[]>(() => {
      const saved = localStorage.getItem('ls_sleep_history');
      return saved ? JSON.parse(saved) : [];
  });

  const [sleepLog, setSleepLog] = useState<{date: string, hours: number}>(() => {
     // Current day sleep
     const today = new Date().toDateString();
     const found = sleepHistory.find(s => s.date === today);
     return found || {date: today, hours: 0};
  });

  const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(() => {
      const saved = localStorage.getItem('ls_daily_plan');
      return saved ? JSON.parse(saved) : null;
  });

  const [dailyWrapUps, setDailyWrapUps] = useState<DailyWrapUp[]>(() => {
      const saved = localStorage.getItem('ls_daily_wrapups');
      return saved ? JSON.parse(saved) : [];
  });

  // --- Volatile State ---
  const [appContext, setAppContext] = useState<AppContext>({
      weather: { temp: 20, condition: 'Clear', code: 0 },
      currentLocation: 'Determining...'
  });
  const [isLoadingPlan, setIsLoadingPlan] = useState(false);
  const [activeModal, setActiveModal] = useState<{type: 'plan_reminder' | 'weight_check' | 'unplanned_activity', item?: PlanItem} | null>(null);
  const [showWrapUp, setShowWrapUp] = useState<DailyWrapUp | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  // NEW: Context State
  const [userContext, setUserContext] = useState<UserContextState>('idle');

  const sentNotificationsRef = useRef<Set<string>>(new Set());
  const [currentView, setCurrentView] = useState<ViewState>(user ? 'dashboard' : 'welcome');
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    document.documentElement.classList.add('dark');
    
    // Start Context Monitoring
    const stopMonitor = startContextMonitoring((newState) => {
        console.log("Context Changed:", newState);
        setUserContext(newState);
    });

    // Fetch Location & Weather
    if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const { latitude, longitude } = pos.coords;
            try {
                const [weather, locationName] = await Promise.all([
                    fetchLocalWeather(latitude, longitude),
                    fetchLocationName(latitude, longitude)
                ]);
                
                setAppContext({
                    weather,
                    currentLocation: locationName
                });
            } catch (e) {
                console.error("Weather/Location fetch failed", e);
            }
        }, async (err) => {
            console.warn("Geolocation access denied:", err.message);
            // Fallback
            try {
                const weather = await fetchLocalWeather(37.77, -122.41);
                setAppContext({
                    weather,
                    currentLocation: 'San Francisco (Default)'
                });
            } catch (e) {
                setAppContext(prev => ({ ...prev, currentLocation: 'Location unavailable' }));
            }
        }, {
            timeout: 10000,
            maximumAge: 60000,
            enableHighAccuracy: false
        });
    }

    return () => {
        if(stopMonitor) stopMonitor();
    };
  }, []);

  // --- Persistence Effects ---
  useEffect(() => localStorage.setItem('ls_user', JSON.stringify(user)), [user]);
  useEffect(() => localStorage.setItem('ls_food', JSON.stringify(foodLogs)), [foodLogs]);
  useEffect(() => localStorage.setItem('ls_activity', JSON.stringify(activityLogs)), [activityLogs]);
  useEffect(() => localStorage.setItem('ls_saved_meals', JSON.stringify(savedMeals)), [savedMeals]);
  useEffect(() => localStorage.setItem('ls_mood', JSON.stringify(moodLogs)), [moodLogs]);
  useEffect(() => localStorage.setItem('ls_weight', JSON.stringify(weightLogs)), [weightLogs]);
  useEffect(() => localStorage.setItem('ls_water', JSON.stringify(waterLog)), [waterLog]);
  useEffect(() => localStorage.setItem('ls_sleep_history', JSON.stringify(sleepHistory)), [sleepHistory]); // Save History
  useEffect(() => localStorage.setItem('ls_daily_plan', JSON.stringify(dailyPlan)), [dailyPlan]);
  useEffect(() => localStorage.setItem('ls_daily_wrapups', JSON.stringify(dailyWrapUps)), [dailyWrapUps]);


  // --- Weekly Weight Check Logic ---
  useEffect(() => {
      if (!user) return;
      const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      
      if (!user.lastWeightCheck || (now - user.lastWeightCheck > ONE_WEEK_MS)) {
          setActiveModal({ type: 'weight_check' });
      }
  }, [user]);

  // --- Notification & Reminder Logic (CONTEXT AWARE GATEKEEPER) ---
  useEffect(() => {
    if (!dailyPlan) return;

    const checkNotifications = async () => {
        const now = new Date();
        const todayKey = getLocalDateKey(now);
        if (dailyPlan.date !== todayKey) {
             sentNotificationsRef.current.clear();
             return; 
        }

        let planChanged = false;
        const updatedItems = dailyPlan.items.map(item => {
            const [h, m] = item.time.split(':').map(Number);
            const itemDate = new Date();
            itemDate.setHours(h, m, 0, 0);
            
            const diffMinutes = (now.getTime() - itemDate.getTime()) / 60000;
            
            // Auto-Skip
            if (!item.completed && !item.skipped && diffMinutes > 60) {
                planChanged = true;
                return { ...item, skipped: true };
            }

            const isPending = !item.completed && !item.skipped;
            const isNotSnoozed = !item.snoozedUntil || item.snoozedUntil <= now.getTime();
            const isDueWindow = diffMinutes >= 0 && diffMinutes < 60;

            // --- THE GATEKEEPER LOGIC ---
            // If user is Driving or Sleeping, SUPPRESS notification unless priority is HIGH
            const isSafeContext = userContext !== 'driving' && userContext !== 'sleeping';
            const isUrgent = item.priority === 'high';

            if (isDueWindow && isPending && isNotSnoozed && !sentNotificationsRef.current.has(item.id)) {
                if (isSafeContext || isUrgent) {
                    sendNotification(`BioSync: ${item.title}`, t('reminder'));
                    setActiveModal({ type: 'plan_reminder', item });
                    sentNotificationsRef.current.add(item.id);
                } else {
                    console.log(`Suppressed notification for ${item.title} due to context: ${userContext}`);
                }
            }
            return item;
        });

        if (planChanged) {
            setDailyPlan({ ...dailyPlan, items: updatedItems });
        }
    };

    checkNotifications();
    const interval = setInterval(checkNotifications, 10000); 
    return () => clearInterval(interval);
  }, [dailyPlan, userContext]); // Dependency on userContext!


  const toggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  const getStatsForDate = (date: Date) => {
    const dateStr = getLocalDateKey(date);
    const foodForDate = foodLogs.filter(log => getLocalDateKey(new Date(log.timestamp)) === dateStr);
    const activityForDate = activityLogs.filter(log => getLocalDateKey(new Date(log.timestamp)) === dateStr);

    const isToday = date.toDateString() === new Date().toDateString();
    
    // Find sleep for this specific date
    const sleepForDate = sleepHistory.find(s => s.date === date.toDateString())?.hours || 0;

    const consumed = foodForDate.reduce((acc, log) => ({
        calories: acc.calories + log.food.macros.calories,
        protein: acc.protein + log.food.macros.protein,
        carbs: acc.carbs + log.food.macros.carbs,
        fat: acc.fat + log.food.macros.fat,
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

    const burned = activityForDate.reduce((acc, log) => acc + log.caloriesBurned, 0);

    return {
        consumed,
        burned,
        water: isToday ? waterLog.amount : 0, 
        sleep: sleepForDate
    };
  };

  const generatePlanWrapper = async (updatedFoodLogs?: FoodLogEntry[], updatedActivityLogs?: ActivityLogEntry[], currentPlanState?: DailyPlan | null) => {
      if (!user || isLoadingPlan) return; 
      
      setIsLoadingPlan(true);
      try {
          const planToUse = currentPlanState !== undefined ? currentPlanState : dailyPlan;

          // Pass sleepHistory to Gemini for Bio-Engine calculation
          const plan = await generateDailyPlan(
              user, 
              updatedFoodLogs || foodLogs, 
              updatedActivityLogs || activityLogs, 
              moodLogs, 
              weightLogs,
              waterLog,
              sleepHistory, // NEW
              appContext,
              language,
              planToUse 
          );
          setDailyPlan(plan);
          sentNotificationsRef.current.clear();
      } catch (e) {
          console.error("Plan generation failed", e);
          alert("Could not generate plan. Please try again.");
      } finally {
          setIsLoadingPlan(false);
      }
  };

  const handleGeneratePlan = () => generatePlanWrapper();
  
  const handleWelcomeComplete = () => {
      setCurrentView('onboarding');
  };

  const handleOnboardingComplete = (profile: UserProfile) => {
    setUser(profile);
    setWeightLogs([{ id: Date.now().toString(), timestamp: Date.now(), weight: profile.weight }]);
    requestNotificationPermission();
    setCurrentView('dashboard');
  };

  const handleSaveMeal = (meal: FoodAnalysisResult) => {
      const newSavedMeal: SavedMeal = {
          id: Date.now().toString(),
          name: meal.foodName,
          macros: meal.macros,
          healthGrade: meal.healthGrade
      };
      setSavedMeals(prev => [newSavedMeal, ...prev]);
  };

  const handleLogFood = async (result: FoodAnalysisResult) => {
    const newLog: FoodLogEntry = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        food: result
    };
    const updatedLogs = [...foodLogs, newLog];
    setFoodLogs(updatedLogs);
    
    let updatedPlan = dailyPlan;

    if (dailyPlan && dailyPlan.date === getLocalDateKey(new Date())) {
        const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        const toMins = (tStr: string) => {
            const [h, m] = tStr.split(':').map(Number);
            return h * 60 + m;
        }
        const currentMins = toMins(nowTime);

        const pendingMeals = dailyPlan.items.filter(i => i.type === 'meal' && !i.completed);
        
        if (pendingMeals.length > 0) {
            const closestMeal = pendingMeals.sort((a, b) => Math.abs(currentMins - toMins(a.time)) - Math.abs(currentMins - toMins(b.time)))[0];
            const newItems = dailyPlan.items.map(item => {
                if (item.id === closestMeal.id) {
                    return { ...item, completed: true };
                }
                return item;
            });

            updatedPlan = { ...dailyPlan, items: newItems };
            setDailyPlan(updatedPlan); 
        }
    }

    setCurrentView('dashboard');
    await generatePlanWrapper(updatedLogs, undefined, updatedPlan);
  };

  const handleLogActivity = async (entry: ActivityLogEntry) => {
      const updatedActivity = [...activityLogs, entry];
      setActivityLogs(updatedActivity);

      let updatedPlan = dailyPlan;
      
      if (dailyPlan && dailyPlan.date === getLocalDateKey(new Date())) {
          if (activeModal?.item) {
             const newItems = dailyPlan.items.map(item => {
                  if (item.id === activeModal.item?.id) {
                      return { ...item, completed: true };
                  }
                  return item;
             });
             updatedPlan = { ...dailyPlan, items: newItems };
             setDailyPlan(updatedPlan);
          }
      }

      setActiveModal(null);
      await generatePlanWrapper(undefined, updatedActivity, updatedPlan);
  };

  const handleLogMood = (mood: MoodType, score: number) => {
    const newLog: MoodLog = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        mood,
        score
    };
    setMoodLogs(prev => [...prev, newLog]);
  };

  const handleUpdateWeight = (newWeight: number) => {
      const newLog: WeightLogEntry = {
          id: Date.now().toString(),
          timestamp: Date.now(),
          weight: newWeight
      };
      setWeightLogs(prev => [...prev, newLog]);
      if (user) {
          setUser({ ...user, weight: newWeight, lastWeightCheck: Date.now() });
      }
      setActiveModal(null);
  };
  
  const handleUpdateProfile = async (updatedUser: UserProfile) => {
      setUser(updatedUser);
  };

  const handleUpdateWater = (amount: number) => {
      setWaterLog(prev => ({
          ...prev,
          amount: Math.max(0, prev.amount + amount)
      }));

      if (dailyPlan && dailyPlan.date === getLocalDateKey(new Date())) {
          const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
          const toMins = (tStr: string) => {
              const [h, m] = tStr.split(':').map(Number);
              return h * 60 + m;
          }
          const currentMins = toMins(nowTime);

          const pendingHydration = dailyPlan.items.filter(i => i.type === 'hydration' && !i.completed);
          
          if (pendingHydration.length > 0) {
              const closest = pendingHydration.sort((a, b) => Math.abs(currentMins - toMins(a.time)) - Math.abs(currentMins - toMins(b.time)))[0];
              const newItems = dailyPlan.items.map(item => {
                  if (item.id === closest.id) {
                      return { ...item, completed: true };
                  }
                  return item;
              });
              setDailyPlan({ ...dailyPlan, items: newItems });
          }
      }
  };

  // Update Sleep History Logic
  const handleUpdateSleep = (hours: number) => {
      const today = new Date().toDateString();
      setSleepHistory(prev => {
          const existing = prev.findIndex(p => p.date === today);
          if (existing >= 0) {
              const copy = [...prev];
              copy[existing].hours = hours;
              return copy;
          }
          return [...prev, {date: today, hours}];
      });
      setSleepLog({date: today, hours});
  };
  
  const handleSaveSleepSession = async (session: SleepSession) => {
      const hours = parseFloat((session.durationMinutes / 60).toFixed(1));
      handleUpdateSleep(hours);
      
      if (dailyPlan && dailyPlan.date === getLocalDateKey(new Date())) {
          const updatedItems = dailyPlan.items.map(item => {
              if (item.type === 'sleep') return { ...item, completed: true };
              return item;
          });
      }
      await generatePlanWrapper();
  };

  const handleTogglePlanItem = (itemId: string) => {
      if (!dailyPlan) return;
      const updatedItems = dailyPlan.items.map(item => {
          if (item.id === itemId) return { ...item, completed: !item.completed };
          return item;
      });
      setDailyPlan({ ...dailyPlan, items: updatedItems });
  };

  // ... Modal Handlers ...
  const handleModalComplete = (reactionTime?: number) => {
      if (!activeModal?.item || !dailyPlan) return;
      const updatedItems = dailyPlan.items.map(i => i.id === activeModal.item!.id ? { ...i, completed: true, reactionTimeSeconds: reactionTime } : i);
      setDailyPlan({ ...dailyPlan, items: updatedItems });
      setActiveModal(null);
      setTimeout(generatePlanWrapper, 1000); 
  };

  const handleModalSkip = () => {
      if (!activeModal?.item || !dailyPlan) return;
      const updatedItems = dailyPlan.items.map(i => i.id === activeModal.item!.id ? { ...i, skipped: true } : i);
      setDailyPlan({ ...dailyPlan, items: updatedItems });
      setActiveModal(null);
      setTimeout(generatePlanWrapper, 1000); 
  };

  const handleModalSnooze = (minutes: number) => {
      if (!activeModal?.item || !dailyPlan) return;
      const now = new Date();
      now.setMinutes(now.getMinutes() + minutes);
      const updatedItems = dailyPlan.items.map(i => i.id === activeModal.item!.id ? { ...i, snoozedUntil: now.getTime() } : i);
      setDailyPlan({ ...dailyPlan, items: updatedItems });
      setActiveModal(null);
  };

  const handleLogFoodTextFromModal = async (result: FoodAnalysisResult) => {
      await handleLogFood(result);
      setActiveModal(null);
  };

  const handleUpdateWaterFromModal = (amount: number) => {
      handleUpdateWater(amount);
      if (activeModal?.item && dailyPlan) {
          const updatedItems = dailyPlan.items.map(i => i.id === activeModal.item!.id ? { ...i, completed: true } : i);
          setDailyPlan({ ...dailyPlan, items: updatedItems });
      }
  };

  const handleNavigateToCamera = () => {
      setActiveModal(null);
      setCurrentView('camera');
  };

  const handleTriggerWrapUp = async () => {
      if (!dailyPlan) return;
      setIsLoadingPlan(true); 
      try {
          const todayStr = getLocalDateKey(new Date());
          const todayFood = foodLogs.filter(f => getLocalDateKey(new Date(f.timestamp)) === todayStr);
          const todayActivity = activityLogs.filter(a => getLocalDateKey(new Date(a.timestamp)) === todayStr);
          
          const summary = await generateDailyWrapUp(
              dailyPlan, 
              todayFood, 
              todayActivity, 
              waterLog.amount, 
              sleepLog.hours,
              language
          );
          
          setShowWrapUp(summary);
      } catch (e) {
          alert("Failed to generate wrap up. Try again.");
      } finally {
          setIsLoadingPlan(false);
      }
  };

  const handleWrapUpComplete = (rating: number) => {
      if (showWrapUp) {
          const completedWrapUp: DailyWrapUp = { ...showWrapUp, userRating: rating };
          setDailyWrapUps(prev => [...prev, completedWrapUp]);
          setShowWrapUp(null);
      }
  };

  const handleExportData = () => {
    const data = { user, foodLogs, activityLogs, moodLogs, weightLogs, waterLog, sleepLog, dailyPlan };
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `lifesync_backup.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportData = (json: string) => {
      try {
          const data = JSON.parse(json);
          if (!data.user) throw new Error("Invalid format");
          if(confirm("Overwrite current data?")) {
            setUser(data.user);
            setFoodLogs(data.foodLogs || []);
            setActivityLogs(data.activityLogs || []);
            setMoodLogs(data.moodLogs || []);
            setWeightLogs(data.weightLogs || []);
            setDailyPlan(data.dailyPlan || null);
            setCurrentView('dashboard');
          }
      } catch (e) {
          alert("Import failed.");
      }
  };

  const handleLogout = () => {
    localStorage.clear();
    setUser(null);
    setCurrentView('welcome');
  };

  const renderView = () => {
    if (!user) {
        if (currentView === 'welcome') return <Welcome onStart={handleWelcomeComplete} />;
        return <Onboarding onComplete={handleOnboardingComplete} />;
    }

    switch (currentView) {
      case 'dashboard':
        return <Dashboard 
            user={user} 
            dailyLog={getStatsForDate(selectedDate)}
            appContext={appContext}
            setAppContext={setAppContext}
            dailyPlan={dailyPlan}
            onGeneratePlan={handleGeneratePlan}
            isLoadingPlan={isLoadingPlan}
            onUpdateWater={handleUpdateWater}
            onUpdateSleep={handleUpdateSleep} // Now updates history
            onTogglePlanItem={handleTogglePlanItem}
            onNavigate={setCurrentView}
            onTriggerAction={(item) => setActiveModal({ type: 'plan_reminder', item })}
            onTriggerUnplannedActivity={() => setActiveModal({ type: 'unplanned_activity' })}
            onEndDay={handleTriggerWrapUp}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
        />;
      case 'camera':
        return <FoodAnalyzer 
            user={user} 
            onLogFood={handleLogFood} 
            onSaveMeal={handleSaveMeal}
            onCancel={() => setCurrentView('dashboard')} 
        />;
      case 'smart-fridge':
        return <SmartFridge user={user} onClose={() => setCurrentView('dashboard')} />;
      case 'coach':
        return <AICoach 
            user={user} 
            foodHistory={foodLogs} 
            moodHistory={moodLogs} 
            weightHistory={weightLogs} 
            appContext={appContext}
            dailyPlan={dailyPlan}
            onBack={() => setCurrentView('dashboard')}
        />;
      case 'profile':
        return <Profile 
            user={user} 
            moodLogs={moodLogs} 
            weightLogs={weightLogs}
            onLogMood={handleLogMood} 
            onUpdateWeight={handleUpdateWeight}
            onUpdateProfile={handleUpdateProfile}
            onBack={() => setCurrentView('dashboard')}
        />;
      case 'settings':
        return <Settings 
            user={user} 
            isDarkMode={isDarkMode} 
            toggleTheme={toggleTheme} 
            onLogout={handleLogout} 
            onExportData={handleExportData}
            onImportData={handleImportData}
            onBack={() => setCurrentView('dashboard')}
        />;
      case 'sleep':
        return <SleepTracker 
            onClose={() => setCurrentView('dashboard')}
            onSaveSession={handleSaveSleepSession}
            initialWakeTime={user.sleepRoutine.targetWakeTime}
            initialWakeWindow={user.sleepRoutine.wakeWindowMinutes}
        />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-midnight-900 text-white relative overflow-hidden font-sans transition-colors duration-300">
      <AdOverlay />
      
      {/* SHOW DETECTED CONTEXT IF NOT IDLE */}
      {userContext !== 'idle' && (
          <ContextStatus context={userContext} />
      )}

      {renderView()}
      
      {activeModal && (
          <ActionModal 
              type={activeModal.type as any}
              item={activeModal.item}
              userProfile={user || undefined}
              currentWeight={user?.weight}
              savedMeals={savedMeals}
              onComplete={handleModalComplete}
              onSkip={handleModalSkip}
              onSnooze={handleModalSnooze}
              onUpdateWeight={handleUpdateWeight}
              onLogFoodText={handleLogFoodTextFromModal}
              onNavigateToCamera={handleNavigateToCamera}
              onUpdateWater={handleUpdateWaterFromModal}
              onLogActivity={handleLogActivity}
              onClose={() => setActiveModal(null)}
          />
      )}

      {showWrapUp && (
          <DailyWrapUpModal 
            data={showWrapUp} 
            onClose={handleWrapUpComplete} 
          />
      )}

      {user && currentView !== 'camera' && currentView !== 'sleep' && currentView !== 'smart-fridge' && (
        <Navigation 
          currentView={currentView} 
          onNavigate={setCurrentView} 
        />
      )}
    </div>
  );
};

// Wrap App with EnergyProvider
const App: React.FC = () => {
    return (
        <LanguageProvider>
          <EnergyProvider>
            <AppContent />
          </EnergyProvider>
        </LanguageProvider>
    );
};

export default App;
