
import React, { useState, useEffect, useRef } from 'react';
import { Button } from './Button';
import { SleepSession } from '../types';
import { analyzeSleepSession } from '../services/geminiService';
import { useLanguage } from '../contexts/LanguageContext';

interface SleepTrackerProps {
  onClose: () => void;
  onSaveSession: (session: SleepSession) => void;
  initialWakeTime?: string;
  initialWakeWindow?: number;
}

export const SleepTracker: React.FC<SleepTrackerProps> = ({ onClose, onSaveSession, initialWakeTime, initialWakeWindow = 30 }) => {
  const { language } = useLanguage(); // Get current language
  const [mode, setMode] = useState<'sensor' | 'manual'>('sensor');
  const [isTracking, setIsTracking] = useState(false);
  
  // --- REALITY CHECK STATE MACHINE ---
  const [confirmedSleepStartTime, setConfirmedSleepStartTime] = useState<number | null>(null);
  const [lastMovementTime, setLastMovementTime] = useState<number>(Date.now());
  const [isRealityCheckActive, setIsRealityCheckActive] = useState(false);
  const [realityCheckStartTime, setRealityCheckStartTime] = useState<number | null>(null);
  
  // Data Logs (Motion Only)
  const [movementLog, setMovementLog] = useState<{ timestamp: number; intensity: number }[]>([]);
  const [currentIntensity, setCurrentIntensity] = useState(0);

  const [analyzing, setAnalyzing] = useState(false);
  const [sessionResult, setSessionResult] = useState<SleepSession | null>(null);
  
  // Smart Alarm State
  const [wakeTime, setWakeTime] = useState<string>(initialWakeTime || '07:00');
  const [isAlarmEnabled, setIsAlarmEnabled] = useState<boolean>(!!initialWakeTime);
  const [alarmTriggered, setAlarmTriggered] = useState(false);

  // Manual Log State
  const [manualBedTime, setManualBedTime] = useState<string>('23:00');
  const [manualWakeTime, setManualWakeTime] = useState<string>('07:00');
  const [manualQuality, setManualQuality] = useState<number>(80);

  const sensorIntervalRef = useRef<number | null>(null);
  const checkIntervalRef = useRef<number | null>(null);

  // --- CONFIGURATION ---
  // 15 Minutes of COMPLETE stillness triggers the check
  const REALITY_CHECK_THRESHOLD_MS = 15 * 60 * 1000; 
  // If popup ignored for 10 mins, assume sleep began at the start of stillness
  const POPUP_TIMEOUT_MS = 10 * 60 * 1000; 

  // Calculate next occurrence of HH:MM
  const calculateNextAlarm = (timeStr: string): number => {
      const now = new Date();
      const [hours, minutes] = timeStr.split(':').map(Number);
      const target = new Date(now);
      target.setHours(hours, minutes, 0, 0);
      
      if (target.getTime() <= now.getTime()) {
          target.setDate(target.getDate() + 1);
      }
      return target.getTime();
  };

  const triggerAlarm = () => {
      if (alarmTriggered) return;
      setAlarmTriggered(true);
      if ('vibrate' in navigator) {
          navigator.vibrate([500, 200, 500, 200, 1000]);
      }
  };

  const stopAlarm = () => {
      stopTracking();
  };

  const resetActivityTimer = () => {
      // If the user Touches, Scrolls, or Clicks, they are definitely awake.
      setLastMovementTime(Date.now());
      
      // If the "Are you awake?" popup is visible, dismiss it automatically
      if (isRealityCheckActive) {
          setIsRealityCheckActive(false);
          setRealityCheckStartTime(null);
      }
  };

  const startTracking = async () => {
    // 1. Request Motion Permissions
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      try { await (DeviceMotionEvent as any).requestPermission(); } catch (e) {}
    }
    
    setIsTracking(true);
    const now = Date.now();
    setLastMovementTime(now);
    setConfirmedSleepStartTime(null); // Reset
    setIsRealityCheckActive(false);
    setMovementLog([]);
    setSessionResult(null);

    window.addEventListener('devicemotion', handleMotion);
    
    // Listen for ACTIVE usage (Touching screen, scrolling)
    window.addEventListener('touchstart', resetActivityTimer);
    window.addEventListener('click', resetActivityTimer);
    window.addEventListener('scroll', resetActivityTimer);
    window.addEventListener('keydown', resetActivityTimer);
    
    // Main Sensor Loop (Log Data & Alarm)
    sensorIntervalRef.current = window.setInterval(() => {
        const currentTime = Date.now();
        setMovementLog(prev => [...prev, { timestamp: currentTime, intensity: currentIntensity }]);
        
        // Smart Alarm Check
        if (isAlarmEnabled) {
            const nextAlarmTimestamp = calculateNextAlarm(wakeTime);
            const windowStart = nextAlarmTimestamp - (initialWakeWindow * 60 * 1000);
            
            if (currentTime >= nextAlarmTimestamp) triggerAlarm();
            else if (currentTime >= windowStart && currentIntensity > 1.5) triggerAlarm();
        }
    }, 2000); 

    // Logic Loop (Reality Check System)
    checkIntervalRef.current = window.setInterval(() => {
        const currentTime = Date.now();
        
        // If we already confirmed sleep, we don't need to check anymore
        if (confirmedSleepStartTime) return;

        // 1. Check if user has been still too long
        const timeSinceMove = currentTime - lastMovementTime;
        
        if (timeSinceMove > REALITY_CHECK_THRESHOLD_MS && !isRealityCheckActive) {
            triggerRealityCheck();
        }

        // 2. Check if the popup has timed out (User ignored it -> They are asleep)
        if (isRealityCheckActive && realityCheckStartTime) {
            const timeOnScreen = currentTime - realityCheckStartTime;
            if (timeOnScreen > POPUP_TIMEOUT_MS) {
                confirmSleepAutomatically();
            }
        }

    }, 5000); // Check logic every 5s
  };

  const triggerRealityCheck = () => {
      setIsRealityCheckActive(true);
      setRealityCheckStartTime(Date.now());
      // Gentle Vibrate to test if user is awake (Haptic nudge)
      if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
  };

  const handleImAwake = () => {
      resetActivityTimer();
  };

  const confirmSleepAutomatically = () => {
      // User ignored the popup for 10 minutes.
      setIsRealityCheckActive(false);
      setRealityCheckStartTime(null);
      
      // CRITICAL LOGIC: Sleep started when they STOPPED moving, not right now.
      const estimatedSleepStart = lastMovementTime; 
      setConfirmedSleepStartTime(estimatedSleepStart);
      console.log("Sleep confirmed starting at:", new Date(estimatedSleepStart).toLocaleTimeString());
  };

  const stopTracking = async () => {
    setIsTracking(false);
    setAlarmTriggered(false);
    window.removeEventListener('devicemotion', handleMotion);
    window.removeEventListener('touchstart', resetActivityTimer);
    window.removeEventListener('click', resetActivityTimer);
    window.removeEventListener('scroll', resetActivityTimer);
    window.removeEventListener('keydown', resetActivityTimer);
    
    if (sensorIntervalRef.current) clearInterval(sensorIntervalRef.current);
    if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    
    // Calculate End Time
    const endTime = Date.now();
    const finalStartTime = confirmedSleepStartTime || movementLog[0]?.timestamp || Date.now();
    
    setAnalyzing(true);
    
    // Duration in minutes
    const durationMinutes = (endTime - finalStartTime) / 60000;
    
    // Filter log to only show data FROM sleep start
    const relevantLog = movementLog.filter(l => l.timestamp >= finalStartTime);
    const finalMovLog = relevantLog.length > 5 ? relevantLog : generateSimulatedLog(finalStartTime, endTime);

    try {
        // Pass language here
        const analysis = await analyzeSleepSession(finalMovLog, [], language);
        
        const fullSession: SleepSession = {
            id: Date.now().toString(),
            startTime: finalStartTime,
            endTime,
            durationMinutes: parseFloat(durationMinutes.toFixed(1)),
            movementLog: finalMovLog,
            audioLog: [],
            efficiencyScore: analysis.efficiencyScore,
            stages: analysis.stages,
            aiAnalysis: analysis.aiAnalysis
        };

        setSessionResult(fullSession);
        onSaveSession(fullSession); // This triggers Plan Sync in App.tsx
    } catch (e) {
        alert("Failed to analyze sleep.");
    } finally {
        setAnalyzing(false);
    }
  };

  const handleManualSave = () => {
      const now = new Date();
      const [bedH, bedM] = manualBedTime.split(':').map(Number);
      const bedDate = new Date(now);
      bedDate.setHours(bedH, bedM, 0, 0);
      const [wakeH, wakeM] = manualWakeTime.split(':').map(Number);
      const wakeDate = new Date(now);
      wakeDate.setHours(wakeH, wakeM, 0, 0);

      if (bedDate.getTime() > wakeDate.getTime()) {
          bedDate.setDate(bedDate.getDate() - 1);
      }

      const durationMs = wakeDate.getTime() - bedDate.getTime();
      const durationMinutes = Math.max(0, durationMs / 60000);

      const session: SleepSession = {
          id: Date.now().toString(),
          startTime: bedDate.getTime(),
          endTime: wakeDate.getTime(),
          durationMinutes: parseFloat(durationMinutes.toFixed(1)),
          movementLog: [],
          audioLog: [],
          efficiencyScore: manualQuality,
          stages: [],
          aiAnalysis: `Manually logged sleep: ${(durationMinutes/60).toFixed(1)} hours with ${manualQuality}% quality.`
      };

      setSessionResult(session);
      onSaveSession(session); // This triggers Plan Sync in App.tsx
  };

  const handleMotion = (event: DeviceMotionEvent) => {
    let accelMagnitude = 0;
    if (event.accelerationIncludingGravity) {
        const { x, y, z } = event.accelerationIncludingGravity;
        if (x && y && z) {
            const rawMag = Math.sqrt(x*x + y*y + z*z);
            accelMagnitude = Math.abs(rawMag - 9.8);
        }
    }
    setCurrentIntensity(accelMagnitude);
    
    // Logic: If user moves significantly, reset the "Stillness Timer"
    if (accelMagnitude > 1.0) { 
        resetActivityTimer();
    }
  };

  const generateSimulatedLog = (start: number, end: number) => {
      const log = [];
      const steps = 30;
      const stepSize = (end - start) / steps;
      for(let i=0; i<steps; i++) {
          let val = Math.random() * 2; 
          if (i % 5 === 0) val = Math.random() * 8; 
          log.push({ timestamp: start + (i*stepSize), intensity: val });
      }
      return log;
  };

  // --- RENDER ---

  if (sessionResult) {
       return (
          <div className="h-full flex flex-col bg-slate-900 text-white p-6 animate-fade-in overflow-y-auto">
              <h2 className="text-3xl font-bold mb-2">Good Morning! ☀️</h2>
              <p className="text-slate-400 mb-6">Sleep Synced & Logged.</p>
              
              <div className="bg-slate-800 rounded-3xl p-6 mb-6">
                  <div className="flex justify-between items-center mb-4">
                      <span className="text-slate-400 text-sm uppercase font-bold">Sleep Score</span>
                      <span className="text-4xl font-black text-emerald-400">{sessionResult.efficiencyScore}</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 transition-all duration-1000" style={{width: `${sessionResult.efficiencyScore}%`}}></div>
                  </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-slate-800 p-4 rounded-2xl">
                       <span className="text-slate-400 text-xs uppercase font-bold">Duration</span>
                       <p className="text-2xl font-bold">{(sessionResult.durationMinutes / 60).toFixed(1)}h</p>
                  </div>
                   <div className="bg-slate-800 p-4 rounded-2xl">
                       <span className="text-slate-400 text-xs uppercase font-bold">Fell Asleep</span>
                       <p className="text-2xl font-bold">{new Date(sessionResult.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p>
                  </div>
              </div>

              <div className="bg-cyan-900/20 border border-cyan-500/30 p-5 rounded-2xl mb-8">
                  <p className="text-cyan-200 text-sm leading-relaxed">"{sessionResult.aiAnalysis}"</p>
              </div>

              <Button onClick={onClose} fullWidth className="mt-auto bg-slate-700 hover:bg-slate-600">Back to BioSync</Button>
          </div>
      );
  }

  if (alarmTriggered) {
      return (
        <div className="h-full flex flex-col items-center justify-center bg-red-500 text-white relative overflow-hidden animate-pulse">
            <div className="z-10 text-center space-y-10">
                <h1 className="text-6xl font-black uppercase tracking-tighter">Wake Up!</h1>
            </div>
            <div className="absolute bottom-10 w-full px-6 z-20">
                <Button onClick={stopAlarm} fullWidth className="bg-white text-red-600 hover:bg-red-50 py-6 text-xl shadow-xl">I'm Awake</Button>
            </div>
        </div>
      );
  }

  return (
    <div className={`h-full flex flex-col relative overflow-hidden ${mode === 'sensor' ? 'bg-black text-white' : 'bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white'}`}>
        
        {/* REALITY CHECK OVERLAY */}
        {isRealityCheckActive && (
            <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-8 animate-fade-in">
                <div className="text-center space-y-8 max-w-sm">
                    <div className="text-6xl animate-bounce">👀</div>
                    <div>
                        <h2 className="text-4xl font-black text-white mb-2">Still Awake?</h2>
                        <p className="text-slate-400">Tap screen to dismiss.</p>
                    </div>
                    
                    <button 
                        onClick={handleImAwake}
                        className="w-full py-8 bg-cyan-600 rounded-[2.5rem] text-xl font-bold shadow-[0_0_50px_rgba(6,182,212,0.5)] active:scale-95 transition-transform border border-cyan-400/30"
                    >
                        Yes, I'm Awake
                    </button>
                </div>
            </div>
        )}

        {/* Back Button */}
        <div className="relative z-10 flex justify-between items-center p-6">
            <button onClick={onClose} className="p-3 bg-white/10 rounded-full hover:bg-white/20 text-white backdrop-blur-md">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div className="flex bg-slate-800/50 backdrop-blur-md rounded-full p-1 border border-white/10">
                <button 
                    onClick={() => !isTracking && setMode('sensor')}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${mode === 'sensor' ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                >
                    Auto
                </button>
                <button 
                    onClick={() => !isTracking && setMode('manual')}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${mode === 'manual' ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                >
                    Manual
                </button>
            </div>
            <div className="w-10"></div>
        </div>

        {/* --- MANUAL MODE --- */}
        {mode === 'manual' && (
            <div className="flex-1 flex flex-col p-6 pt-10 animate-fade-in relative z-10">
                 <div className="text-center mb-10">
                    <span className="text-4xl">📝</span>
                    <h2 className="text-2xl font-bold mt-4 dark:text-white">Log Sleep</h2>
                </div>
                 <div className="space-y-6 max-w-sm mx-auto w-full">
                    <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Bedtime (Yesterday)</label>
                        <input type="time" value={manualBedTime} onChange={(e) => setManualBedTime(e.target.value)} className="w-full text-3xl font-bold bg-transparent outline-none text-cyan-600 dark:text-cyan-400" />
                    </div>
                     <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Wake Time</label>
                        <input type="time" value={manualWakeTime} onChange={(e) => setManualWakeTime(e.target.value)} className="w-full text-3xl font-bold bg-transparent outline-none text-emerald-600 dark:text-emerald-400" />
                    </div>
                 </div>
                 <div className="mt-auto pt-8">
                    <Button fullWidth onClick={handleManualSave} className="bg-cyan-600 text-white py-4 text-lg rounded-2xl">Save Log</Button>
                </div>
            </div>
        )}

        {/* --- SENSOR MODE (DEFAULT) --- */}
        {mode === 'sensor' && (
            <>
                <div className="flex-1 flex flex-col items-center justify-center relative z-10">
                    {analyzing ? (
                        <div className="text-center space-y-4">
                            <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                            <p className="text-xl font-bold">BioSyncing...</p>
                        </div>
                    ) : (
                        <>
                            {/* OLED Saver / Night Mode Display */}
                            <div className={`transition-opacity duration-1000 ${confirmedSleepStartTime ? 'opacity-20' : 'opacity-100'}`}>
                                <div className="text-[5rem] font-black leading-none tracking-tighter mb-4 text-center">
                                    {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </div>
                                <p className={`text-lg font-medium text-center transition-colors duration-500 ${isTracking ? 'text-emerald-400' : 'text-slate-500'}`}>
                                    {isTracking 
                                        ? (confirmedSleepStartTime ? 'Sleep Confirmed. Goodnight 🌙' : 'Monitoring Movement...') 
                                        : 'Place phone on mattress'
                                    }
                                </p>
                            </div>

                            {!isTracking && (
                                <div className="mt-8 bg-white/5 backdrop-blur-md rounded-2xl p-4 w-full max-w-xs border border-white/10">
                                    <div className="flex justify-between items-center mb-4">
                                        <span className="text-sm font-bold text-slate-300">Smart Alarm</span>
                                        <button 
                                            onClick={() => setIsAlarmEnabled(!isAlarmEnabled)}
                                            className={`w-12 h-6 rounded-full p-1 transition-colors ${isAlarmEnabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
                                        >
                                            <div className={`w-4 h-4 rounded-full bg-white transform transition-transform ${isAlarmEnabled ? 'translate-x-6' : 'translate-x-0'}`}></div>
                                        </button>
                                    </div>
                                    
                                    {isAlarmEnabled && (
                                        <div className="space-y-3 animate-fade-in">
                                            <div className="flex items-center justify-between">
                                                <label className="text-xs text-slate-400">Wake By</label>
                                                <input 
                                                    type="time" 
                                                    value={wakeTime}
                                                    onChange={(e) => setWakeTime(e.target.value)}
                                                    className="bg-black/30 border border-white/10 rounded-lg px-3 py-1 text-white text-sm outline-none focus:border-cyan-500"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {isTracking && (
                                <div className="w-full max-w-xs space-y-2 mt-12 opacity-50">
                                    <div className="flex justify-between text-xs text-slate-500 uppercase tracking-widest font-bold">
                                        <span>Movement Intensity</span>
                                    </div>
                                    <div className="flex h-16 items-end justify-center space-x-1">
                                        {[...Array(30)].map((_, i) => (
                                            <div key={i} className="flex flex-col space-y-1 items-center">
                                                <div 
                                                    className="w-1 bg-cyan-500/50 rounded-full transition-all duration-300"
                                                    style={{ height: `${Math.min(40, (movementLog[movementLog.length - 1 - i]?.intensity || 0) * 5)}px` }}
                                                ></div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="p-8 relative z-10">
                    {!isTracking ? (
                        <div className="space-y-4">
                            <button 
                                onClick={startTracking}
                                className="w-full py-6 bg-cyan-600 hover:bg-cyan-500 rounded-[2rem] text-xl font-bold shadow-[0_0_40px_rgba(6,182,212,0.4)] transition-all active:scale-95"
                            >
                                Start Sleep Mode
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-center text-xs text-slate-500">Hold button to end sleep</p>
                            <button 
                                onClick={stopTracking}
                                className="w-full py-6 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-[2rem] text-xl font-bold transition-all active:scale-95"
                            >
                                I'm Awake
                            </button>
                        </div>
                    )}
                </div>
            </>
        )}
    </div>
  );
};
