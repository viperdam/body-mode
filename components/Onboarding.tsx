
import React, { useState } from 'react';
import { UserProfile } from '../types';
import { Button } from './Button';
import { useLanguage } from '../contexts/LanguageContext';
import { requestNotificationPermission } from '../services/notificationService';
import { calculateUserProfile } from '../services/geminiService';

interface OnboardingProps {
  onComplete: (profile: UserProfile) => void;
}

const AVATARS = [
    { id: 'titan', icon: '🦾', label: 'The Titan', gradient: 'from-orange-500 to-red-500' },
    { id: 'zen', icon: '🧘', label: 'The Zen', gradient: 'from-teal-400 to-emerald-500' },
    { id: 'cyborg', icon: '🤖', label: 'The Cyborg', gradient: 'from-blue-500 to-indigo-600' },
    { id: 'sprinter', icon: '⚡', label: 'The Sprinter', gradient: 'from-yellow-400 to-orange-500' }
];

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const { t } = useLanguage();
  const [step, setStep] = useState(0); // 0 = Permissions
  const [isCalculating, setIsCalculating] = useState(false);
  const [formData, setFormData] = useState<Partial<UserProfile>>({
    avatarId: 'cyborg',
    goal: 'lose',
    planIntensity: 'normal',
    maritalStatus: 'single',
    childrenCount: 0,
    activityLevel: 'moderate',
    gender: 'male', 
    culinaryIdentity: {
        origin: '',
        residence: ''
    },
    workProfile: {
        type: 'fixed_9_5',
        intensity: 'desk',
        hours: { start: '09:00', end: '17:00' },
        durationHours: 8
    },
    sleepRoutine: {
        isConsistent: true,
        targetWakeTime: '07:00',
        targetBedTime: '23:00',
        targetDurationHours: 8,
        wakeWindowMinutes: 30
    },
    medicalProfile: {
        conditions: [],
        medications: [],
        injuries: [],
        currentStatus: 'healthy'
    }
  });

  const [tempConditions, setTempConditions] = useState('');
  const [tempMeds, setTempMeds] = useState('');

  const totalSteps = 8; // Increased for Identity

  const requestPermissions = async () => {
      await requestNotificationPermission();
      if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
          try { await (DeviceMotionEvent as any).requestPermission(); } catch (e) { console.warn("Motion permission skipped"); }
      }
      setStep(1);
  };

  const handleNext = async () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
        // AI Calculation Step
        setIsCalculating(true);
        try {
            // Commit medical strings to arrays
            const finalMedical = {
                ...formData.medicalProfile!,
                conditions: tempConditions.split(',').map(s => s.trim()).filter(Boolean),
                medications: tempMeds.split(',').map(s => s.trim()).filter(Boolean)
            };
            
            const profileToCalc = { ...formData, medicalProfile: finalMedical };
            
            // Call Gemini
            const aiResults = await calculateUserProfile(profileToCalc);
            
            onComplete({
                ...profileToCalc as UserProfile,
                ...aiResults
            });
        } catch (e) {
            console.error(e);
            alert("AI Setup Failed. Retrying...");
            setIsCalculating(false);
        }
    }
  };

  const isConsistentSleep = formData.sleepRoutine?.isConsistent;

  const renderStep = () => {
    switch (step) {
      case 0: // PERMISSIONS
        return (
           <div className="space-y-8 animate-fade-in text-center">
                <div className="w-24 h-24 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-5xl">🔐</span>
                </div>
                <h2 className="text-3xl font-black text-white">Enable Access</h2>
                <p className="text-indigo-200/60 font-medium">To be your best AI Coach, LifeSync needs access to:</p>
                <div className="space-y-4 text-left glass-card p-6 rounded-2xl">
                    <div className="flex items-center space-x-3">
                        <span className="text-2xl">🔔</span>
                        <div>
                            <h4 className="font-bold text-white">Notifications</h4>
                            <p className="text-xs text-slate-400">Smart reminders for meals & sleep.</p>
                        </div>
                    </div>
                     <div className="flex items-center space-x-3">
                        <span className="text-2xl">📱</span>
                        <div>
                            <h4 className="font-bold text-white">Motion Sensors</h4>
                            <p className="text-xs text-slate-400">Track sleep cycles via mattress movement.</p>
                        </div>
                    </div>
                </div>
                <Button fullWidth onClick={requestPermissions} className="py-4 text-lg bg-emerald-500 hover:bg-emerald-600">Grant Permissions</Button>
           </div>
        );

      case 1: // BASICS
        return (
          <div className="space-y-8 animate-fade-in">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-black text-white">{t('basics_title')}</h2>
              <p className="text-indigo-200/60 font-medium">{t('basics_subtitle')}</p>
            </div>
            
            <div className="space-y-5">
              <div className="glass-card p-1 rounded-2xl">
                <input 
                  type="text" 
                  className="w-full p-4 bg-transparent border-none rounded-xl focus:ring-0 outline-none text-lg font-semibold text-white placeholder:text-slate-600 transition-all text-center"
                  value={formData.name || ''}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder={t('placeholder_name')}
                />
              </div>

              <div className="flex justify-center space-x-4">
                  {['male', 'female'].map(g => (
                      <button 
                        key={g} 
                        onClick={() => setFormData({...formData, gender: g as any})}
                        className={`px-4 py-2 rounded-xl text-sm font-bold capitalize ${formData.gender === g ? 'bg-indigo-600 text-white' : 'glass-card text-slate-400'}`}
                      >
                          {g}
                      </button>
                  ))}
              </div>

              <div className="grid grid-cols-2 gap-5">
                 <div className="glass-card p-4 rounded-2xl">
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">{t('label_age')}</label>
                    <input 
                      type="number" 
                      className="w-full bg-transparent border-none p-0 text-3xl font-bold text-white focus:ring-0"
                      value={formData.age || ''}
                      onChange={e => setFormData({...formData, age: Number(e.target.value)})}
                      placeholder="00"
                    />
                 </div>
                 <div className="glass-card p-4 rounded-2xl">
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">{t('label_weight')}</label>
                    <input 
                      type="number" 
                      className="w-full bg-transparent border-none p-0 text-3xl font-bold text-emerald-400 focus:ring-0"
                      value={formData.weight || ''}
                      onChange={e => setFormData({...formData, weight: Number(e.target.value)})}
                      placeholder="00"
                    />
                 </div>
              </div>
              <div className="glass-card p-4 rounded-2xl">
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">{t('label_height')}</label>
                <input 
                  type="number" 
                  className="w-full bg-transparent border-none p-0 text-3xl font-bold text-indigo-400 focus:ring-0"
                  value={formData.height || ''}
                  onChange={e => setFormData({...formData, height: Number(e.target.value)})}
                  placeholder="000"
                />
              </div>
            </div>
          </div>
        );
      
      case 2: // CULINARY IDENTITY (NEW STEP)
        return (
            <div className="space-y-8 animate-fade-in">
                <div className="text-center space-y-2">
                    <h2 className="text-3xl font-black text-white">{t('identity_title')}</h2>
                    <p className="text-indigo-200/60 font-medium">{t('identity_subtitle')}</p>
                </div>

                <div className="space-y-6">
                    <div className="glass-card p-5 rounded-2xl border-l-4 border-l-orange-500">
                        <label className="block text-xs font-bold text-orange-400 uppercase mb-2">{t('origin_label')}</label>
                        <input 
                            type="text" 
                            className="w-full bg-transparent border-b border-orange-500/30 p-2 text-xl font-bold text-white outline-none focus:border-orange-500"
                            value={formData.culinaryIdentity?.origin || ''}
                            onChange={e => setFormData({...formData, culinaryIdentity: { ...formData.culinaryIdentity!, origin: e.target.value }})}
                            placeholder={t('origin_placeholder')}
                        />
                        <p className="text-[10px] text-slate-500 mt-2">Determines spice levels and comfort foods.</p>
                    </div>

                    <div className="glass-card p-5 rounded-2xl border-l-4 border-l-cyan-500">
                        <label className="block text-xs font-bold text-cyan-400 uppercase mb-2">{t('residence_label')}</label>
                        <input 
                            type="text" 
                            className="w-full bg-transparent border-b border-cyan-500/30 p-2 text-xl font-bold text-white outline-none focus:border-cyan-500"
                            value={formData.culinaryIdentity?.residence || ''}
                            onChange={e => setFormData({...formData, culinaryIdentity: { ...formData.culinaryIdentity!, residence: e.target.value }})}
                            placeholder={t('residence_placeholder')}
                        />
                        <p className="text-[10px] text-slate-500 mt-2">Ensures suggested ingredients are available nearby.</p>
                    </div>
                </div>
            </div>
        );

      case 3: // PERSONAL LIFE (Family)
        return (
            <div className="space-y-8 animate-fade-in">
                 <div className="text-center space-y-2">
                    <h2 className="text-3xl font-black text-white">Life & Family</h2>
                    <p className="text-indigo-200/60 font-medium">To balance your plan effectively.</p>
                </div>

                <div className="space-y-6">
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-3">Status</label>
                        <div className="grid grid-cols-3 gap-3">
                             {['single', 'married', 'partner'].map(status => (
                                <button 
                                    key={status}
                                    onClick={() => setFormData({...formData, maritalStatus: status as any})}
                                    className={`p-3 rounded-xl text-sm font-bold capitalize transition-all ${formData.maritalStatus === status ? 'bg-indigo-600 text-white' : 'glass-card text-slate-400'}`}
                                >
                                    {status}
                                </button>
                             ))}
                        </div>
                    </div>

                    <div className="glass-card p-5 rounded-2xl flex items-center justify-between">
                         <div>
                             <h4 className="font-bold text-white text-lg">Children</h4>
                             <p className="text-xs text-slate-500">Affects meal prep time</p>
                         </div>
                         <div className="flex items-center space-x-4">
                             <button onClick={() => setFormData({...formData, childrenCount: Math.max(0, (formData.childrenCount || 0) - 1)})} className="w-10 h-10 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xl">-</button>
                             <span className="text-2xl font-bold text-white w-6 text-center">{formData.childrenCount || 0}</span>
                             <button onClick={() => setFormData({...formData, childrenCount: (formData.childrenCount || 0) + 1})} className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xl">+</button>
                         </div>
                    </div>
                </div>
            </div>
        );

      case 4: // MEDICAL & HEALTH
        return (
            <div className="space-y-8 animate-fade-in">
                <div className="text-center space-y-2">
                    <h2 className="text-3xl font-black text-white">{t('health_context')}</h2>
                    <p className="text-indigo-200/60 font-medium">{t('health_subtitle')}</p>
                </div>
                
                <div className="space-y-4">
                     <div className="glass-card p-4 rounded-2xl">
                         <label className="block text-xs font-bold text-slate-400 uppercase mb-2">{t('conditions_injuries')}</label>
                         <textarea 
                            value={tempConditions}
                            onChange={(e) => setTempConditions(e.target.value)}
                            className="w-full bg-transparent border-b border-slate-700 p-2 text-white outline-none focus:border-indigo-500"
                            placeholder={t('chronic_conditions')}
                            rows={2}
                         />
                         <p className="text-[10px] text-slate-500 mt-2">Separate with commas.</p>
                     </div>

                     <div className="glass-card p-4 rounded-2xl">
                         <label className="block text-xs font-bold text-slate-400 uppercase mb-2">{t('medications')}</label>
                         <textarea 
                            value={tempMeds}
                            onChange={(e) => setTempMeds(e.target.value)}
                            className="w-full bg-transparent border-b border-slate-700 p-2 text-white outline-none focus:border-indigo-500"
                            placeholder={t('meds_placeholder')}
                            rows={2}
                         />
                     </div>

                     <div className="glass-card p-4 rounded-2xl">
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-3">{t('current_status')}</label>
                        <div className="flex space-x-3">
                            {[
                                { id: 'healthy', label: t('status_healthy'), icon: '💪' },
                                { id: 'sick_flu', label: t('status_sick'), icon: '🤒' },
                                { id: 'recovering', label: t('status_recovering'), icon: '🩹' }
                            ].map(st => (
                                <button
                                    key={st.id}
                                    onClick={() => setFormData({...formData, medicalProfile: {...formData.medicalProfile!, currentStatus: st.id as any}})}
                                    className={`flex-1 p-3 rounded-xl text-center border transition-all ${formData.medicalProfile?.currentStatus === st.id ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'border-slate-700 text-slate-500'}`}
                                >
                                    <div className="text-2xl mb-1">{st.icon}</div>
                                    <div className="text-[10px] font-bold">{st.label}</div>
                                </button>
                            ))}
                        </div>
                     </div>
                </div>
            </div>
        );

      case 5: // AVATAR
        return (
            <div className="space-y-8 animate-fade-in">
                <div className="text-center space-y-2">
                    <h2 className="text-3xl font-black text-white">{t('avatar_title')}</h2>
                    <p className="text-indigo-200/60 font-medium">{t('avatar_subtitle')}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    {AVATARS.map(avatar => (
                        <button 
                            key={avatar.id}
                            onClick={() => setFormData({...formData, avatarId: avatar.id})}
                            className={`p-4 rounded-3xl border-2 transition-all duration-300 relative overflow-hidden group ${
                                formData.avatarId === avatar.id 
                                ? 'border-white/50 bg-white/10 scale-105 shadow-xl' 
                                : 'border-transparent glass-card hover:bg-white/5'
                            }`}
                        >
                             <div className={`absolute inset-0 opacity-20 bg-gradient-to-br ${avatar.gradient}`}></div>
                             <div className="relative z-10 flex flex-col items-center">
                                 <span className="text-5xl mb-3 filter drop-shadow-lg transform group-hover:scale-110 transition-transform">{avatar.icon}</span>
                                 <span className="font-bold text-sm text-white">{t(`avatar_${avatar.id}`)}</span>
                             </div>
                        </button>
                    ))}
                </div>
            </div>
        );

      case 6: // ACTIVITY & ROUTINE
        return (
          <div className="space-y-6 animate-fade-in h-[60vh] overflow-y-auto no-scrollbar pb-10">
             <div className="text-center space-y-2">
              <h2 className="text-3xl font-black text-white">{t('routine_title')}</h2>
              <p className="text-indigo-200/60 font-medium">{t('routine_subtitle')}</p>
            </div>
            
            <div className="glass-card p-4 rounded-2xl mb-4">
                 <label className="block text-xs font-bold text-slate-400 uppercase mb-2">{t('activity_title')}</label>
                 <select 
                    value={formData.activityLevel} 
                    onChange={e => setFormData({...formData, activityLevel: e.target.value as any})}
                    className="w-full bg-slate-800 text-white p-3 rounded-xl border-none outline-none"
                >
                    <option value="sedentary">Sedentary (Office job)</option>
                    <option value="light">Light Activity</option>
                    <option value="moderate">Moderate Exercise</option>
                    <option value="active">Very Active</option>
                 </select>
            </div>

            {/* Work Type */}
            <div className="space-y-3">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-2 rtl:pr-2">{t('work_schedule')}</label>
                <div className="grid grid-cols-2 gap-3">
                    {[
                        { id: 'fixed_9_5', label: 'fixed_9_5', icon: '🏢' },
                        { id: 'night_shift', label: 'night_shift', icon: '🌙' },
                        { id: 'rotating', label: 'rotating', icon: '🔄' },
                        { id: 'unemployed', label: 'Unemployed', icon: '🏠' }
                    ].map(type => (
                        <button key={type.id} 
                            onClick={() => setFormData({...formData, workProfile: {...formData.workProfile!, type: type.id as any}})}
                            className={`p-4 rounded-2xl flex flex-col items-center transition-all ${formData.workProfile?.type === type.id ? 'bg-indigo-600 text-white shadow-lg' : 'glass-card text-slate-400 hover:text-white'}`}
                        >
                            <span className="text-2xl mb-2">{type.icon}</span>
                            <span className="text-xs font-bold">{type.label === 'Unemployed' ? 'Home/Unempl.' : t(type.label)}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="pt-4">
                 <div className="flex justify-between items-center mb-4 pl-2 pr-2 rtl:pl-2 rtl:pr-2">
                     <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('sleep')}</label>
                     <button 
                        onClick={() => setFormData({...formData, sleepRoutine: {...formData.sleepRoutine!, isConsistent: !formData.sleepRoutine?.isConsistent}})}
                        className={`text-[10px] px-3 py-1 rounded-full font-bold border transition-colors ${formData.sleepRoutine?.isConsistent ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-slate-800 border-slate-600 text-slate-400'}`}
                     >
                        {formData.sleepRoutine?.isConsistent ? t('sleep_consistent') : t('sleep_irregular')}
                     </button>
                 </div>

                 {isConsistentSleep ? (
                    <div className="glass-card p-5 rounded-2xl flex items-center space-x-4 rtl:space-x-reverse">
                        <div className="flex-1">
                            <label className="block text-[10px] text-slate-500 uppercase mb-1 text-center">{t('wake_time')}</label>
                            <input type="time" className="w-full bg-slate-800/50 rounded-xl p-3 text-center text-white border border-slate-700 outline-none" 
                                value={formData.sleepRoutine?.targetWakeTime || '07:00'} 
                                onChange={e => setFormData({...formData, sleepRoutine: {...formData.sleepRoutine!, targetWakeTime: e.target.value}})}
                            />
                        </div>
                        <div className="flex-1">
                            <label className="block text-[10px] text-slate-500 uppercase mb-1 text-center">{t('bed_time')}</label>
                            <input type="time" className="w-full bg-slate-800/50 rounded-xl p-3 text-center text-white border border-slate-700 outline-none" 
                                value={formData.sleepRoutine?.targetBedTime || '23:00'} 
                                onChange={e => setFormData({...formData, sleepRoutine: {...formData.sleepRoutine!, targetBedTime: e.target.value}})}
                            />
                        </div>
                    </div>
                 ) : (
                    <div className="glass-card p-5 rounded-2xl space-y-4">
                        <div className="flex justify-between mb-2">
                            <span className="text-xs font-bold text-slate-300">{t('target_sleep')}</span>
                            <span className="text-xs font-bold text-indigo-400">{formData.sleepRoutine?.targetDurationHours || 8}h</span>
                        </div>
                        <input 
                            type="range" 
                            min="4" max="12" step="0.5"
                            value={formData.sleepRoutine?.targetDurationHours || 8}
                            onChange={(e) => setFormData({...formData, sleepRoutine: {...formData.sleepRoutine!, targetDurationHours: parseFloat(e.target.value)}})}
                            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                    </div>
                 )}
            </div>
          </div>
        );
      
      case 7: // GOAL & INTENSITY
        return (
          <div className="space-y-8 animate-fade-in pb-10">
             <div className="text-center space-y-2">
              <h2 className="text-3xl font-black text-white">{t('goal_title')}</h2>
              <p className="text-indigo-200/60 font-medium">{t('goal_subtitle')}</p>
            </div>
             <div className="grid grid-cols-1 gap-4">
              {[
                { id: 'lose', label: 'lose_weight', icon: '🔥', desc: 'desc_lose' },
                { id: 'maintain', label: 'maintain', icon: '⚖️', desc: 'desc_maintain' },
                { id: 'gain', label: 'build_muscle', icon: '💪', desc: 'desc_build' }
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setFormData({...formData, goal: item.id as any})}
                  className={`p-6 rounded-2xl flex items-center space-x-5 rtl:space-x-reverse transition-all duration-200 relative overflow-hidden ${
                    formData.goal === item.id 
                      ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 border border-emerald-400 shadow-lg' 
                      : 'glass-card hover:bg-white/5'
                  }`}
                >
                  <span className="text-4xl filter drop-shadow-md">{item.icon}</span>
                  <div className="text-left rtl:text-right relative z-10">
                    <span className="block text-xl font-bold text-white">{t(item.label)}</span>
                    <span className={`text-sm font-medium ${formData.goal === item.id ? 'text-emerald-100' : 'text-slate-500'}`}>{t(item.desc)}</span>
                  </div>
                </button>
              ))}
            </div>
            
            {/* SPECIFIC TARGETS (Weight & Date) - Only if not maintaining */}
            {formData.goal !== 'maintain' && (
                <div className="grid grid-cols-2 gap-4 animate-fade-in">
                    <div className="glass-card p-4 rounded-2xl">
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Target Weight (kg)</label>
                        <input 
                            type="number" 
                            className="w-full bg-transparent border-none p-0 text-2xl font-bold text-white focus:ring-0 placeholder:text-slate-700"
                            value={formData.goalWeight || ''}
                            onChange={e => setFormData({...formData, goalWeight: Number(e.target.value)})}
                            placeholder="00"
                        />
                    </div>
                    <div className="glass-card p-4 rounded-2xl">
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Target Date</label>
                        <input 
                            type="date" 
                            className="w-full bg-transparent border-none p-0 text-lg font-bold text-white focus:ring-0 placeholder:text-slate-700"
                            value={formData.targetDate || ''}
                            onChange={e => setFormData({...formData, targetDate: e.target.value})}
                        />
                    </div>
                </div>
            )}
            
            {/* INTENSITY SELECTOR */}
            <div>
                 <label className="block text-xs font-bold text-slate-400 uppercase mb-3 text-center">Plan Pace</label>
                 <div className="grid grid-cols-3 gap-2">
                    {[
                        { id: 'slow', label: 'Turtle 🐢', desc: 'Easy' },
                        { id: 'normal', label: 'Rabbit 🐇', desc: 'Steady' },
                        { id: 'aggressive', label: 'Cheetah 🐆', desc: 'Fast' }
                    ].map(pace => (
                        <button 
                            key={pace.id}
                            onClick={() => setFormData({...formData, planIntensity: pace.id as any})}
                            className={`p-3 rounded-2xl border flex flex-col items-center justify-center transition-all ${
                                formData.planIntensity === pace.id 
                                ? 'bg-indigo-600 border-indigo-500 text-white' 
                                : 'glass-card border-transparent text-slate-400'
                            }`}
                        >
                            <span className="font-bold text-sm">{pace.label}</span>
                            <span className="text-[10px] opacity-70">{pace.desc}</span>
                        </button>
                    ))}
                 </div>
            </div>
          </div>
        );
        
      case 8: // CALCULATING / FINAL
        return (
            <div className="space-y-8 animate-fade-in text-center flex flex-col items-center justify-center h-[50vh]">
                 <div className="w-24 h-24 bg-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-spin-slow shadow-[0_0_50px_rgba(99,102,241,0.5)]">
                    <span className="text-5xl animate-pulse">🧠</span>
                </div>
                <h2 className="text-3xl font-black text-white">Gemini is Thinking...</h2>
                <p className="text-indigo-200/70 font-medium">
                    Analyzing metabolism... <br/>
                    Adjusting for {tempConditions ? 'medical conditions' : 'lifestyle'}... <br/>
                    Matching heritage to location...
                </p>
            </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-midnight-900 flex items-center justify-center p-6 relative overflow-hidden">
       {/* Background Effects */}
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-indigo-900/20 rounded-full blur-[80px]"></div>
      <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-violet-900/20 rounded-full blur-[80px]"></div>

      <div className="w-full max-w-md relative z-10">
        {step > 0 && !isCalculating && (
            <div className="mb-8 flex justify-center">
                <div className="flex space-x-1.5 rtl:space-x-reverse">
                    {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
                        <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i <= step ? 'w-6 bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'w-2 bg-slate-800'}`} />
                    ))}
                </div>
            </div>
        )}
        
        {renderStep()}

        {step > 0 && !isCalculating && (
            <div className="mt-10">
            <Button fullWidth onClick={handleNext} disabled={!formData.name && step === 1} className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white py-4 rounded-2xl text-lg font-bold shadow-[0_0_30px_rgba(79,70,229,0.3)] transition-all transform active:scale-95">
                {step === totalSteps - 1 ? t('generate_plan') : t('continue')}
            </Button>
            </div>
        )}
      </div>
    </div>
  );
};
