
import React, { useState, useEffect } from 'react';
import { UserProfile, MoodLog, MoodType, WeightLogEntry } from '../types';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Button } from './Button';
import { calculateUserProfile } from '../services/geminiService';
import { useLanguage } from '../contexts/LanguageContext';

interface ProfileProps {
  user: UserProfile;
  moodLogs: MoodLog[];
  weightLogs: WeightLogEntry[];
  onLogMood: (mood: MoodType, score: number) => void;
  onUpdateWeight: (newWeight: number) => void;
  onUpdateProfile: (updatedUser: UserProfile) => void;
  onBack?: () => void;
}

const MOODS: { type: MoodType; label: string; icon: string; score: number; color: string; darkColor: string }[] = [
  { type: 'energetic', label: 'Energetic', icon: '⚡', score: 5, color: 'bg-yellow-100 border-yellow-200 text-yellow-700 hover:bg-yellow-200', darkColor: 'dark:bg-yellow-900/30 dark:border-yellow-700/50 dark:text-yellow-400' },
  { type: 'happy', label: 'Happy', icon: '😄', score: 4, color: 'bg-emerald-100 border-emerald-200 text-emerald-700 hover:bg-emerald-200', darkColor: 'dark:bg-emerald-900/30 dark:border-emerald-700/50 dark:text-emerald-400' },
  { type: 'neutral', label: 'Neutral', icon: '😐', score: 3, color: 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200', darkColor: 'dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300' },
  { type: 'stressed', label: 'Stressed', icon: '😓', score: 2, color: 'bg-orange-100 border-orange-200 text-orange-700 hover:bg-orange-200', darkColor: 'dark:bg-orange-900/30 dark:border-orange-700/50 dark:text-orange-400' },
  { type: 'sad', label: 'Sad', icon: '😔', score: 1, color: 'bg-indigo-100 border-indigo-200 text-indigo-700 hover:bg-indigo-200', darkColor: 'dark:bg-indigo-900/30 dark:border-indigo-700/50 dark:text-indigo-400' },
];

export const Profile: React.FC<ProfileProps> = ({ user, moodLogs, weightLogs, onLogMood, onUpdateWeight, onUpdateProfile, onBack }) => {
  const { t } = useLanguage();
  const [isEditing, setIsEditing] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [formData, setFormData] = useState<UserProfile>(user);
  const [todayMoodLogged, setTodayMoodLogged] = useState(false);
  
  // Temporary string state for array fields
  const [conditionsStr, setConditionsStr] = useState('');
  const [medsStr, setMedsStr] = useState('');
  const [injuriesStr, setInjuriesStr] = useState('');

  useEffect(() => {
      setFormData(user);
      setConditionsStr(user.medicalProfile.conditions.join(', '));
      setMedsStr(user.medicalProfile.medications.join(', '));
      setInjuriesStr(user.medicalProfile.injuries.join(', '));
      
      // Check if mood logged today
      const today = new Date().toDateString();
      const hasLog = moodLogs.some(l => new Date(l.timestamp).toDateString() === today);
      setTodayMoodLogged(hasLog);
  }, [user, moodLogs]);

  const handleSaveProfile = async () => {
    setIsRecalculating(true);
    
    // Parse strings back to arrays
    const updatedMedical = {
        ...formData.medicalProfile,
        conditions: conditionsStr.split(',').map(s => s.trim()).filter(Boolean),
        medications: medsStr.split(',').map(s => s.trim()).filter(Boolean),
        injuries: injuriesStr.split(',').map(s => s.trim()).filter(Boolean),
    };

    const userToCalc = { ...formData, medicalProfile: updatedMedical };

    try {
        // CALL AI TO RECALCULATE TARGETS based on new Health Data
        const newMetrics = await calculateUserProfile(userToCalc);
        const finalUser = { ...userToCalc, ...newMetrics };
        
        onUpdateProfile(finalUser as UserProfile);
        setIsEditing(false);
    } catch (e) {
        alert("Failed to update profile with AI. Saving locally.");
        onUpdateProfile(userToCalc as UserProfile);
        setIsEditing(false);
    } finally {
        setIsRecalculating(false);
    }
  };

  const handleMoodClick = (mood: typeof MOODS[0]) => {
      onLogMood(mood.type, mood.score);
      setTodayMoodLogged(true);
  };

  const moodChartData = moodLogs.slice(-7).map(log => ({
      date: new Date(log.timestamp).toLocaleDateString('en-US', { weekday: 'short' }),
      score: log.score
  }));

  const weightChartData = weightLogs.slice(-10).map(log => ({
      date: new Date(log.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      weight: log.weight
  }));

  if (isEditing) {
      return (
          <div className="pb-28 pt-8 px-6 space-y-6 max-w-md mx-auto animate-fade-in text-slate-900 dark:text-white">
              <div className="flex justify-between items-center">
                  <h1 className="text-2xl font-bold">{t('edit_profile')}</h1>
                  <button onClick={() => setIsEditing(false)} className="text-slate-500 hover:text-white transition-colors">{t('cancel')}</button>
              </div>
              <div className="space-y-5 h-[75vh] overflow-y-auto no-scrollbar pb-10">
                  
                  {/* BASIC INFO */}
                  <section className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                      <h3 className="text-sm font-bold text-slate-400 uppercase mb-3">{t('basics')}</h3>
                      <div className="space-y-3">
                        <div>
                            <label className="text-xs font-bold text-slate-500">{t('name')}</label>
                            <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-3 bg-slate-50 dark:bg-slate-900 rounded-xl mt-1 outline-none focus:ring-2 ring-indigo-500" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500">{t('label_weight')}</label>
                                <input type="number" value={formData.weight} onChange={e => setFormData({...formData, weight: parseFloat(e.target.value)})} className="w-full p-3 bg-slate-50 dark:bg-slate-900 rounded-xl mt-1 outline-none focus:ring-2 ring-indigo-500" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500">{t('label_height')}</label>
                                <input type="number" value={formData.height} onChange={e => setFormData({...formData, height: parseFloat(e.target.value)})} className="w-full p-3 bg-slate-50 dark:bg-slate-900 rounded-xl mt-1 outline-none focus:ring-2 ring-indigo-500" />
                            </div>
                        </div>
                      </div>
                  </section>

                  {/* NEW: IDENTITY EDIT */}
                  <section className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                      <h3 className="text-sm font-bold text-slate-400 uppercase mb-3">{t('identity_title')}</h3>
                      <div className="space-y-3">
                          <div>
                              <label className="text-xs font-bold text-slate-500">{t('origin_label')}</label>
                              <input 
                                type="text" 
                                value={formData.culinaryIdentity?.origin || ''} 
                                onChange={e => setFormData({...formData, culinaryIdentity: { ...formData.culinaryIdentity!, origin: e.target.value }})} 
                                className="w-full p-3 bg-slate-50 dark:bg-slate-900 rounded-xl mt-1 outline-none focus:ring-2 ring-orange-500" 
                              />
                          </div>
                          <div>
                              <label className="text-xs font-bold text-slate-500">{t('residence_label')}</label>
                              <input 
                                type="text" 
                                value={formData.culinaryIdentity?.residence || ''} 
                                onChange={e => setFormData({...formData, culinaryIdentity: { ...formData.culinaryIdentity!, residence: e.target.value }})} 
                                className="w-full p-3 bg-slate-50 dark:bg-slate-900 rounded-xl mt-1 outline-none focus:ring-2 ring-cyan-500" 
                              />
                          </div>
                      </div>
                  </section>

                  {/* MEDICAL & HEALTH CONTEXT */}
                  <section className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 border-l-4 border-l-red-500">
                      <h3 className="text-sm font-bold text-red-500 uppercase mb-3">{t('health_context')}</h3>
                      
                      <div className="mb-4">
                        <label className="text-xs font-bold text-slate-500 mb-2 block">{t('current_status')}</label>
                        <div className="grid grid-cols-3 gap-2">
                             {[
                                { id: 'healthy', label: t('status_healthy'), icon: '💪' },
                                { id: 'sick_flu', label: t('status_sick'), icon: '🤒' },
                                { id: 'recovering', label: t('status_recovering'), icon: '🩹' }
                            ].map(st => (
                                <button
                                    key={st.id}
                                    onClick={() => setFormData({...formData, medicalProfile: {...formData.medicalProfile, currentStatus: st.id as any}})}
                                    className={`p-2 rounded-xl text-center border transition-all ${formData.medicalProfile.currentStatus === st.id ? 'bg-red-500/20 border-red-500 text-white' : 'border-slate-700 text-slate-500'}`}
                                >
                                    <div className="text-xl">{st.icon}</div>
                                    <div className="text-[10px] font-bold">{st.label}</div>
                                </button>
                            ))}
                        </div>
                      </div>
                      
                      {/* Dynamic Sickness Question */}
                      {formData.medicalProfile.currentStatus !== 'healthy' && (
                          <div className="mb-4 animate-fade-in">
                              <label className="text-xs font-bold text-red-400 mb-1 block">{t('symptoms_question')}</label>
                              <textarea 
                                value={conditionsStr}
                                onChange={e => setConditionsStr(e.target.value)}
                                className="w-full p-3 bg-red-900/10 border border-red-500/30 rounded-xl outline-none text-white placeholder-red-200/50"
                                placeholder={t('symptoms_placeholder')}
                                rows={2}
                              />
                          </div>
                      )}

                      {/* General Conditions */}
                      {formData.medicalProfile.currentStatus === 'healthy' && (
                        <div className="mb-3">
                            <label className="text-xs font-bold text-slate-500">{t('chronic_conditions')}</label>
                            <input 
                                type="text" 
                                value={conditionsStr} 
                                onChange={e => setConditionsStr(e.target.value)} 
                                className="w-full p-3 bg-slate-50 dark:bg-slate-900 rounded-xl mt-1 outline-none" 
                                placeholder={t('conditions_injuries')}
                            />
                        </div>
                      )}

                      <div className="mb-3">
                          <label className="text-xs font-bold text-slate-500">{t('medications')}</label>
                          <input 
                            type="text" 
                            value={medsStr} 
                            onChange={e => setMedsStr(e.target.value)} 
                            className="w-full p-3 bg-slate-50 dark:bg-slate-900 rounded-xl mt-1 outline-none" 
                            placeholder={t('meds_placeholder')}
                        />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-500">{t('conditions_injuries')}</label>
                          <input 
                            type="text" 
                            value={injuriesStr} 
                            onChange={e => setInjuriesStr(e.target.value)} 
                            className="w-full p-3 bg-slate-50 dark:bg-slate-900 rounded-xl mt-1 outline-none" 
                            placeholder={t('injuries_placeholder')}
                        />
                      </div>
                  </section>

                  {/* GOALS */}
                  <section className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                      <h3 className="text-sm font-bold text-slate-400 uppercase mb-3">{t('goal_title')}</h3>
                      <div className="mb-4">
                          <label className="text-xs font-bold text-slate-500 mb-2 block">{t('goal_title')}</label>
                          <div className="grid grid-cols-3 gap-2">
                            {['lose', 'maintain', 'gain'].map((g) => (
                                <button
                                    key={g}
                                    onClick={() => setFormData({...formData, goal: g as any})}
                                    className={`py-3 px-1 rounded-xl text-xs font-bold capitalize transition-all ${formData.goal === g ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                                >
                                    {t(g === 'lose' ? 'lose_weight' : g === 'maintain' ? 'maintain' : 'build_muscle')}
                                </button>
                            ))}
                          </div>
                      </div>

                      {/* NEW: Specific Targets */}
                      {formData.goal !== 'maintain' && (
                          <div className="grid grid-cols-2 gap-3 mb-4">
                              <div>
                                  <label className="text-xs font-bold text-slate-500">{t('target_weight')}</label>
                                  <input 
                                      type="number" 
                                      value={formData.goalWeight || ''} 
                                      onChange={e => setFormData({...formData, goalWeight: parseFloat(e.target.value)})} 
                                      className="w-full p-3 bg-slate-50 dark:bg-slate-900 rounded-xl mt-1 outline-none focus:ring-2 ring-indigo-500" 
                                      placeholder="kg"
                                  />
                              </div>
                              <div>
                                  <label className="text-xs font-bold text-slate-500">{t('target_date')}</label>
                                  <input 
                                      type="date" 
                                      value={formData.targetDate || ''} 
                                      onChange={e => setFormData({...formData, targetDate: e.target.value})} 
                                      className="w-full p-3 bg-slate-50 dark:bg-slate-900 rounded-xl mt-1 outline-none focus:ring-2 ring-indigo-500" 
                                  />
                              </div>
                          </div>
                      )}

                      <div>
                          <label className="text-xs font-bold text-slate-500 mb-2 block">{t('plan_pace')}</label>
                          <div className="grid grid-cols-3 gap-2">
                              {[
                                  { id: 'slow', label: 'Turtle 🐢', desc: 'Easy' },
                                  { id: 'normal', label: 'Rabbit 🐇', desc: 'Steady' },
                                  { id: 'aggressive', label: 'Cheetah 🐆', desc: 'Fast' }
                              ].map(pace => (
                                  <button 
                                      key={pace.id}
                                      onClick={() => setFormData({...formData, planIntensity: pace.id as any})}
                                      className={`p-2 rounded-xl flex flex-col items-center justify-center transition-all ${
                                          formData.planIntensity === pace.id 
                                          ? 'bg-indigo-600 text-white' 
                                          : 'bg-slate-800 text-slate-400'
                                      }`}
                                  >
                                      <span className="font-bold text-xs">{pace.label}</span>
                                      <span className="text-xs opacity-70">{pace.desc}</span>
                                  </button>
                              ))}
                          </div>
                      </div>
                  </section>

                  <Button fullWidth onClick={handleSaveProfile} disabled={isRecalculating} className="mt-4">
                      {isRecalculating ? t('refining') : t('save_update')}
                  </Button>
                  <p className="text-center text-[10px] text-slate-500 mt-2">
                      {t('recalc_note')}
                  </p>
              </div>
          </div>
      );
  }

  return (
    <div className="pb-28 pt-6 px-6 space-y-8 max-w-md mx-auto animate-fade-in text-slate-900 dark:text-white">
      {/* Header with Back Button */}
      <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
              {onBack && (
                <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-slate-800 transition-colors">
                     <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </button>
              )}
              <h1 className="text-3xl font-extrabold">{t('nav.profile')}</h1>
          </div>
          <button onClick={() => setIsEditing(true)} className="text-sm font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 px-4 py-2 rounded-full">
            {t('edit')}
          </button>
      </div>
      
      {/* Profile Card */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700 flex items-center space-x-5 relative overflow-hidden">
           <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 dark:bg-indigo-900/10 rounded-full -mr-8 -mt-8"></div>
          <div className="h-20 w-20 rounded-full p-1 bg-gradient-to-tr from-indigo-500 to-violet-500 shadow-md">
             <div className="h-full w-full rounded-full bg-slate-900 flex items-center justify-center text-4xl select-none">
                 {/* Fallback avatar if no image */}
                 {user.avatarId === 'titan' ? '🦾' : user.avatarId === 'zen' ? '🧘' : user.avatarId === 'sprinter' ? '⚡' : '🤖'}
             </div>
          </div>
          <div className="relative z-10 w-full">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">{user.name}</h2>
            <div className="flex items-center space-x-2 mt-1 mb-2 text-sm text-slate-500 dark:text-slate-400">
                <span>{user.age}y</span>
                <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                <span>{user.height}cm</span>
                <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                <span className="capitalize">{user.gender}</span>
            </div>
            <div className="flex flex-wrap gap-2">
                 <span className="text-[10px] uppercase tracking-wide px-2 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg font-bold">{t(user.goal === 'lose' ? 'lose_weight' : user.goal === 'maintain' ? 'maintain' : 'build_muscle')}</span>
                 {user.medicalProfile.currentStatus !== 'healthy' && (
                     <span className="text-[10px] uppercase tracking-wide px-2 py-1 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg font-bold">
                         {user.medicalProfile.currentStatus === 'sick_flu' ? t('status_sick') : t('status_recovering')}
                     </span>
                 )}
                 {user.goalWeight && (
                     <span className="text-[10px] uppercase tracking-wide px-2 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg font-bold">
                         {t('goal_label')}: {user.goalWeight}kg
                     </span>
                 )}
                 {user.culinaryIdentity?.origin && (
                     <span className="text-[10px] uppercase tracking-wide px-2 py-1 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-lg font-bold">
                         {user.culinaryIdentity.origin}
                     </span>
                 )}
            </div>
          </div>
      </div>
      
      {/* --- MOOD TRACKER SECTION --- */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-800 dark:text-white">{t('how_feeling')}</h3>
              {todayMoodLogged && <span className="text-xs text-emerald-500 font-bold">{t('logged_today')}</span>}
          </div>
          <div className="flex justify-between gap-2 overflow-x-auto pb-2 no-scrollbar">
              {MOODS.map((m) => (
                  <button
                    key={m.type}
                    onClick={() => handleMoodClick(m)}
                    className={`flex flex-col items-center p-3 rounded-2xl border min-w-[70px] transition-all duration-200 active:scale-95 ${m.darkColor} border-transparent bg-opacity-10`}
                  >
                      <span className="text-2xl mb-1">{m.icon}</span>
                      <span className="text-[10px] font-bold">{m.label}</span>
                  </button>
              ))}
          </div>
          
          {/* Mood History Chart */}
          {moodLogs.length > 0 && (
            <div className="h-32 w-full mt-6">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={moodChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={document.documentElement.classList.contains('dark') ? '#334155' : '#f1f5f9'} />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8', fontWeight: 500}} dy={10} interval="preserveStartEnd" />
                        <YAxis hide domain={[0, 6]} />
                        <Tooltip contentStyle={{borderRadius: '16px', border: 'none', background: '#1e293b', color: '#fff'}} />
                        <Line type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={3} dot={{fill: '#6366f1', strokeWidth: 2, r: 3, stroke: '#fff'}} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
          )}
      </div>

      {/* Weight Chart (with estimated Ideal) */}
      {weightLogs.length > 0 && (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700">
           <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-slate-800 dark:text-white">{t('weight_progress')}</h3>
              <div className="flex flex-col items-end">
                   <span className="text-xs text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded-lg font-bold mb-1">
                    Current: {weightLogs[weightLogs.length - 1].weight} kg
                  </span>
                  {user.goalWeight ? (
                      <span className="text-[10px] text-slate-500">Goal: {user.goalWeight} kg {user.targetDate ? `by ${user.targetDate}` : ''}</span>
                  ) : user.calculatedIdealWeight ? (
                      <span className="text-[10px] text-slate-500">AI Target: ~{user.calculatedIdealWeight} kg</span>
                  ) : null}
              </div>
           </div>
           <div className="h-48 w-full">
               <ResponsiveContainer width="100%" height="100%">
                   <LineChart data={weightChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                       <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={document.documentElement.classList.contains('dark') ? '#334155' : '#f1f5f9'} />
                       <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} dy={10} interval="preserveStartEnd" />
                       <YAxis domain={['dataMin - 2', 'dataMax + 2']} hide />
                       <Tooltip contentStyle={{borderRadius: '16px', border: 'none', background: '#1e293b', color: '#fff'}} />
                       <Line type="monotone" dataKey="weight" stroke="#10b981" strokeWidth={3} dot={{fill: '#10b981', strokeWidth: 2, r: 4, stroke: '#fff'}} />
                   </LineChart>
               </ResponsiveContainer>
           </div>
        </div>
      )}
    </div>
  );
};
